"""Kiosk print service: finds the USB receipt printer by itself and prints the tickets the kiosk page sends.

The page builds each ticket as ESC/POS bytes (src/printing/escpos.js) and POSTs them here, so the
ticket layout lives in one place. Nothing has to be picked or approved in the browser.

Run it on the computer the printer is plugged into, and leave it running:
    pip install -r src/printing/script/requirements.txt
    python src/printing/script/printService.py           (add --list to just show what it finds)

It looks for the printer two ways, so either Windows driver setup works:
  - a receipt printer installed in Windows on a USB port (the maker's driver, or "Generic / Text Only")
  - a printer on the WinUSB/libusb driver (e.g. switched with Zadig), reached directly over USB
"""

import argparse
import json
import logging
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

import usb.core
import usb.util
from escpos.printer import Usb, Win32Raw

try:
    import libusb_package  # ships the libusb DLL pyusb needs on Windows
except ImportError:
    libusb_package = None

try:
    import win32print
except ImportError:
    win32print = None

PORT = 9123
MAX_BYTES = 1024 * 1024
USB_TIMEOUT_MS = 5000

PRINTER_CLASS = 0x07

# many cheap thermal printers don't report the USB printer class, so also match the usual makers
# (same list as src/printing/usbPrinter.js)
PRINTER_VENDORS = {
    0x04B8,  # Epson
    0x0519,  # Star Micronics
    0x1D90,  # Citizen
    0x1504,  # Bixolon
    0x154F,  # SNBC
    0x0FE6,  # generic POS-58 / POS-80
    0x0416,  # generic (Winbond chip)
    0x0483,  # generic (STM chip, Xprinter and others)
    0x28E9,  # generic (GD32 chip)
}

# Windows printer queues on a USB port count as receipt printers when the name or driver looks like one,
# so an office printer on USB never gets ESC/POS garbage
RECEIPT_WORDS = re.compile(r"pos|receipt|thermal|tm-|xp-|xprinter|tsp|ct-s|srp-|rongta|gprinter|text only", re.I)

# Windows keeps a queue for an unplugged USB printer but marks it offline
PRINTER_ATTRIBUTE_WORK_OFFLINE = 0x400
PRINTER_STATUS_OFFLINE = 0x80

# pages served from this computer may print; add others with --origin
LOCAL_ORIGIN = re.compile(r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?")

log = logging.getLogger("print-service")
options = argparse.Namespace(printer=None, origins=[])


def usb_backend():
    # None lets pyusb look for a libusb installed on the system
    return libusb_package.get_libusb1_backend() if libusb_package else None


def is_bulk(direction):
    return lambda e: (
        usb.util.endpoint_type(e.bmAttributes) == usb.util.ENDPOINT_TYPE_BULK
        and usb.util.endpoint_direction(e.bEndpointAddress) == direction
    )


def bulk_endpoints(dev):
    """(out, in) endpoint addresses to talk to the printer on, preferring the printer-class interface.
    Reads the cached descriptors, so it works without opening the device."""
    candidates = []
    for cfg in dev:
        for intf in cfg:
            out_ep = usb.util.find_descriptor(intf, custom_match=is_bulk(usb.util.ENDPOINT_OUT))
            if out_ep is None:
                continue
            in_ep = usb.util.find_descriptor(intf, custom_match=is_bulk(usb.util.ENDPOINT_IN))
            candidates.append((intf.bInterfaceClass == PRINTER_CLASS, out_ep.bEndpointAddress,
                               in_ep.bEndpointAddress if in_ep is not None else 0x82))
    candidates.sort(key=lambda c: not c[0])
    return candidates[0] if candidates else None


def usb_name(dev):
    """maker and product name, or None when the device can't be opened to read them
    (on Windows, a printer that isn't on the WinUSB driver)"""
    try:
        return " ".join(filter(None, [usb.util.get_string(dev, dev.iManufacturer),
                                      usb.util.get_string(dev, dev.iProduct)])) or None
    except (usb.core.USBError, ValueError, NotImplementedError):
        return None


def find_usb_printers():
    try:
        devices = list(usb.core.find(find_all=True, backend=usb_backend()))
    except usb.core.NoBackendError:
        return []
    found = []
    for dev in devices:
        try:
            endpoints = bulk_endpoints(dev)
        except usb.core.USBError:
            continue
        if not endpoints:
            continue
        is_printer_class, out_ep, in_ep = endpoints
        if not is_printer_class and dev.idVendor not in PRINTER_VENDORS:
            continue
        found.append({
            "connection": "usb",
            "name": usb_name(dev) or f"USB printer {dev.idVendor:04x}:{dev.idProduct:04x}",
            "detail": f"USB {dev.idVendor:04x}:{dev.idProduct:04x}",
            "bus": dev.bus,
            "address": dev.address,
            "out_ep": out_ep,
            "in_ep": in_ep,
        })
    return found


def find_windows_printers():
    if win32print is None:
        return []
    found = []
    for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL, None, 2):
        name, port, driver = p["pPrinterName"], p["pPortName"] or "", p["pDriverName"] or ""
        if options.printer:
            if name.lower() != options.printer.lower():
                continue
        elif not port.upper().startswith("USB") or not RECEIPT_WORDS.search(f"{name} {driver}"):
            continue
        if p["Attributes"] & PRINTER_ATTRIBUTE_WORK_OFFLINE or p["Status"] & PRINTER_STATUS_OFFLINE:
            continue
        found.append({"connection": "windows", "name": name, "detail": f"Windows printer on {port}"})
    return found


def find_printers():
    # Windows queues first: with the maker's driver installed, libusb can see the device but not use it
    return find_windows_printers() + ([] if options.printer else find_usb_printers())


def print_on(printer, data):
    if printer["connection"] == "windows":
        device = Win32Raw(printer["name"])
        device.open(job_name="Queue ticket")
    else:
        device = Usb(
            usb_args={"backend": usb_backend(), "bus": printer["bus"], "address": printer["address"]},
            in_ep=printer["in_ep"],
            out_ep=printer["out_ep"],
            timeout=USB_TIMEOUT_MS,
        )
        device.open()
    try:
        device._raw(data)
    finally:
        device.close()


def public(printer):
    return {key: printer[key] for key in ("name", "connection", "detail")}


class Handler(BaseHTTPRequestHandler):
    server_version = "KioskPrintService/1"

    def origin_allowed(self):
        origin = self.headers.get("Origin")
        # no Origin: a local tool like curl, not a web page
        return origin is None or LOCAL_ORIGIN.fullmatch(origin) or origin in options.origins

    def send_cors(self):
        origin = self.headers.get("Origin")
        if origin and self.origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if not self.origin_allowed():
            return self.send_json(403, {"error": "This page isn't allowed to print here."})
        self.send_response(204)
        self.send_cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome asks before a page from another address may reach this computer
        if self.headers.get("Access-Control-Request-Private-Network"):
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    # GET /printer -> { printer: { name, connection, detail } | null }
    def do_GET(self):
        if self.path.split("?")[0] != "/printer":
            return self.send_json(404, {"error": "Unknown address."})
        printers = find_printers()
        self.send_json(200, {"printer": public(printers[0]) if printers else None})

    # POST /print with the ESC/POS bytes -> { printer } | 404 no printer | 500 it wouldn't print
    def do_POST(self):
        if self.path.split("?")[0] != "/print":
            return self.send_json(404, {"error": "Unknown address."})
        if not self.origin_allowed():
            return self.send_json(403, {"error": "This page isn't allowed to print here."})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BYTES:
            return self.send_json(400, {"error": "Send the ticket as ESC/POS bytes, up to 1 MB."})
        data = self.rfile.read(length)

        printers = find_printers()
        if not printers:
            log.warning("Print failed: no receipt printer found")
            return self.send_json(404, {"error": "Printer not found"})
        # try the next one if a printer is listed but won't take the job
        error = None
        for printer in printers:
            try:
                print_on(printer, data)
                log.info("Printed a ticket on %s (%s)", printer["name"], printer["detail"])
                return self.send_json(200, {"printer": printer["name"]})
            except Exception as err:
                error = f"{printer['name']}: {err}"
                log.warning("Couldn't print on %s", error)
        self.send_json(500, {"error": error})

    def log_message(self, format, *args):
        log.debug(format, *args)


def list_devices():
    printers = find_printers()
    print("Receipt printers found:" if printers else "No receipt printer found.")
    for p in printers:
        print(f"  {p['name']}  ({p['detail']})")
    try:
        devices = list(usb.core.find(find_all=True, backend=usb_backend()))
    except usb.core.NoBackendError:
        print("\nCan't list USB devices: libusb is missing (pip install libusb-package).")
        return
    print("\nAll USB devices:")
    for dev in devices:
        print(f"  {dev.idVendor:04x}:{dev.idProduct:04x}  {usb_name(dev) or '(name not readable)'}")


def main():
    parser = argparse.ArgumentParser(description="Prints kiosk tickets on the USB receipt printer it finds.")
    parser.add_argument("--port", type=int, default=PORT, help=f"port to listen on (default {PORT})")
    parser.add_argument("--printer", help="Windows printer name to use instead of searching")
    parser.add_argument("--origin", dest="origins", action="append", default=[],
                        help="another page address allowed to print, e.g. https://kiosk.example.com")
    parser.add_argument("--list", action="store_true", help="show the printers and USB devices found, then exit")
    parser.parse_args(namespace=options)
    # force: importing escpos already set up logging with the default format
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S", force=True)

    if options.list:
        return list_devices()

    try:
        usb.core.find(backend=usb_backend())
    except usb.core.NoBackendError:
        log.warning("libusb is missing, so printers on the WinUSB driver won't be found (pip install libusb-package)")
    if sys.platform == "win32" and win32print is None:
        log.warning("pywin32 is missing, so printers installed in Windows won't be found (pip install pywin32)")

    printers = find_printers()
    if printers:
        log.info("Using %s (%s)", printers[0]["name"], printers[0]["detail"])
    else:
        log.info("No receipt printer found yet; it's looked for again on every print")

    # this computer only, so nobody else on the network can print
    server = HTTPServer(("127.0.0.1", options.port), Handler)
    log.info("Print service ready on http://127.0.0.1:%d", options.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
