// talks to a USB receipt printer straight from the browser with WebUSB (Chrome/Edge, https or localhost)
// a printer has to be approved once with searchPrinter(); after that the browser remembers it,
// so printing never shows a prompt again on this machine

const PRINTER_CLASS = 0x07;

// many cheap thermal printers don't report the USB printer class, so also match the usual makers
const PRINTER_VENDORS = [
    0x04b8, // Epson
    0x0519, // Star Micronics
    0x1d90, // Citizen
    0x1504, // Bixolon
    0x154f, // SNBC
    0x0fe6, // generic POS-58 / POS-80
    0x0416, // generic (Winbond chip)
    0x0483, // generic (STM chip, Xprinter and others)
    0x28e9, // generic (GD32 chip)
];

const SEARCH_FILTERS = [{ classCode: PRINTER_CLASS }, ...PRINTER_VENDORS.map((vendorId) => ({ vendorId }))];

const CHUNK_BYTES = 4096;

export const isUsbSupported = () => typeof navigator !== "undefined" && "usb" in navigator;

const hasPrinterInterface = (device) =>
    device.configurations?.some((config) =>
        config.interfaces.some((iface) => iface.alternates.some((alt) => alt.interfaceClass === PRINTER_CLASS)));

const isLikelyPrinter = (device) => hasPrinterInterface(device) || PRINTER_VENDORS.includes(device.vendorId);

const hex = (n) => n.toString(16).padStart(4, "0");

export const printerKey = (device) => `${hex(device.vendorId)}:${hex(device.productId)}:${device.serialNumber ?? ""}`;

export const printerName = (device) =>
    [device.manufacturerName, device.productName].filter(Boolean).join(" ") ||
    `USB device ${hex(device.vendorId)}:${hex(device.productId)}`;

// printers this browser has already been allowed to use; never prompts
export async function listPrinters() {
    if (!isUsbSupported()) return [];
    return navigator.usb.getDevices();
}

// the approved printer to print on, or null if none is plugged in
export async function getSavedPrinter() {
    const devices = await listPrinters();
    return devices.find(isLikelyPrinter) ?? devices[0] ?? null;
}

// opens the browser's USB chooser filtered to printers; must run from a click
// rejects with NotFoundError if the person closes the chooser without picking one
export function searchPrinter() {
    return navigator.usb.requestDevice({ filters: SEARCH_FILTERS });
}

export async function forgetPrinter(device) {
    // forget() is newer; older browsers keep the permission until it's removed in site settings
    if (device.forget) await device.forget();
}

// the interface and endpoint to send print data to, preferring the printer-class interface
const findBulkOut = (device) => {
    const candidates = device.configuration.interfaces
        .map((iface) => ({ iface, alt: iface.alternate }))
        .sort((a, b) => (b.alt.interfaceClass === PRINTER_CLASS) - (a.alt.interfaceClass === PRINTER_CLASS));
    for (const { iface, alt } of candidates) {
        const endpoint = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
        if (endpoint) return { iface, endpoint };
    }
    throw new Error("This USB device has no way to receive print data. Is it a receipt printer?");
};

export async function sendToPrinter(device, bytes) {
    await device.open();
    try {
        if (device.configuration === null) await device.selectConfiguration(1);
        const { iface, endpoint } = findBulkOut(device);
        await device.claimInterface(iface.interfaceNumber);
        try {
            for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
                await device.transferOut(endpoint.endpointNumber, bytes.slice(i, i + CHUNK_BYTES));
            }
        } finally {
            await device.releaseInterface(iface.interfaceNumber).catch(() => {});
        }
    } finally {
        await device.close().catch(() => {});
    }
}

// turns WebUSB errors into something staff can act on
export function describeUsbError(err) {
    if (err?.name === "SecurityError" || /access denied/i.test(err?.message ?? "")) {
        return "The browser isn't allowed to use this printer. On Windows, switch the printer's driver to WinUSB " +
            "(for example with the free Zadig tool), unplug it, plug it back in and try again.";
    }
    if (err?.name === "NetworkError") {
        return "The printer stopped responding. Check that it's switched on, has paper and the USB cable is plugged in.";
    }
    return err?.message || "The printer couldn't be reached.";
}
