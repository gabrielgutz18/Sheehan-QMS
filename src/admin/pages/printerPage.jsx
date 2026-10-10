import { useCallback, useEffect, useState } from 'react';

import { buildReceipt } from '../../printing/escpos.js';
import { PAPER_SIZES, getPaperColumns, setPaperColumns } from '../../printing/printReceipt.js';
import { checkPrintService, printWithService } from '../../printing/printService.js';
import {
    describeUsbError,
    forgetPrinter,
    isUsbSupported,
    listPrinters,
    printerKey,
    printerName,
    searchPrinter,
    sendToPrinter,
} from '../../printing/usbPrinter.js';

const SAMPLE_TICKET = {
    queueNumber: "TEST 00",
    name: "Test Print",
    purpose: "Printer check",
    orders: [{ qty: 1, item: "Sample item" }, { qty: 2, item: "Long Span", color: "red" }],
};

const hex = (n) => n.toString(16).padStart(4, "0");

export default function PrinterPage() {
    const supported = isUsbSupported();
    const [printers, setPrinters] = useState([]);
    const [columns, setColumns] = useState(getPaperColumns);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    // null while checking, then { running, printer }
    const [service, setService] = useState(null);

    const checkService = useCallback(() => checkPrintService().then(setService), []);

    useEffect(() => {
        checkService().catch((err) => setError(err.message));
    }, [checkService]);

    const refresh = useCallback(() => listPrinters().then(setPrinters), []);

    // keep the list right when a printer is plugged in or unplugged
    useEffect(() => {
        if (!supported) return;
        refresh();
        navigator.usb.addEventListener("connect", refresh);
        navigator.usb.addEventListener("disconnect", refresh);
        return () => {
            navigator.usb.removeEventListener("connect", refresh);
            navigator.usb.removeEventListener("disconnect", refresh);
        };
    }, [supported, refresh]);

    const run = async (key, action) => {
        setBusy(key);
        setError("");
        setNotice("");
        try {
            await action();
        } catch (err) {
            setError(describeUsbError(err));
        } finally {
            setBusy("");
        }
    };

    const sampleReceipt = () => buildReceipt({ ...SAMPLE_TICKET, issuedAt: new Date() }, { columns });

    const searchService = () => run("service", checkService);

    const serviceTestPrint = () =>
        run("service-test", async () => {
            const result = await printWithService(sampleReceipt());
            if (!result) throw new Error("The print service isn't running.");
            setNotice(`Test ticket sent to ${result.printer}.`);
        });

    const search = () =>
        run("search", async () => {
            try {
                const device = await searchPrinter();
                await refresh();
                setNotice(`${printerName(device)} is ready. Customers' tickets will print on it automatically.`);
            } catch (err) {
                // closing the chooser without picking a printer isn't an error
                if (err.name !== "NotFoundError") throw err;
            }
        });

    const testPrint = (device) =>
        run(printerKey(device), async () => {
            await sendToPrinter(device, sampleReceipt());
            setNotice(`Test ticket sent to ${printerName(device)}.`);
        });

    const forget = (device) =>
        run(printerKey(device), async () => {
            await forgetPrinter(device);
            await refresh();
            setNotice(`${printerName(device)} removed.`);
        });

    const changeColumns = (value) => {
        setColumns(value);
        setPaperColumns(value);
    };

    return (
        <section className="admin-page">
            <h1 className="admin-title">Receipt printer</h1>

            {error && <p className="field-error" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <div className="admin-panel">
                <div className="printer-head">
                    <div>
                        <h2>Print service</h2>
                        <p className="printer-text">
                            A small Python program on the kiosk computer that finds the USB receipt printer by itself.
                            While it's running, each ticket prints on it as soon as it's submitted, and nothing below
                            needs setting up.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="admin-btn admin-btn-call"
                        onClick={searchService}
                        disabled={busy === "service"}
                    >
                        {busy === "service" ? "Searching..." : "Search again"}
                    </button>
                </div>

                {service === null ? (
                    <p className="admin-empty">Looking for the print service...</p>
                ) : !service.running ? (
                    <p className="admin-empty">
                        Not running on this computer. Start it with{" "}
                        <code>python src/printing/script/printService.py</code> and leave it open.
                    </p>
                ) : !service.printer ? (
                    <p className="admin-empty">
                        Running, but no receipt printer found. Check that it's plugged in and switched on.
                    </p>
                ) : (
                    <ul className="printer-list">
                        <li className="printer-item">
                            <div className="printer-info">
                                <strong>{service.printer.name}</strong>
                                <span className="printer-meta">Used for tickets · {service.printer.detail}</span>
                            </div>
                            <div className="row-actions">
                                <button
                                    type="button"
                                    className="admin-btn"
                                    onClick={serviceTestPrint}
                                    disabled={busy === "service-test"}
                                >
                                    {busy === "service-test" ? "Printing..." : "Test print"}
                                </button>
                            </div>
                        </li>
                    </ul>
                )}
            </div>

            {!supported ? (
                <div className="admin-panel">
                    <h2>Browser USB printing isn't available here</h2>
                    <p className="printer-text">
                        Use the print service above, or open this page in Chrome or Edge, from <code>localhost</code> or
                        an <code>https://</code> address, on the kiosk computer the printer is plugged into.
                    </p>
                </div>
            ) : (
                <div className="admin-panel">
                    <div className="printer-head">
                        <div>
                            <h2>Browser USB printers</h2>
                            <p className="printer-text">
                                Only needed when the print service isn't running. Plug the receipt printer into this
                                computer by USB, then search for it once on the kiosk itself.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="admin-btn admin-btn-call"
                            onClick={search}
                            disabled={busy === "search"}
                        >
                            {busy === "search" ? "Searching..." : "Search for USB printer"}
                        </button>
                    </div>

                    {printers.length === 0 ? (
                        <p className="admin-empty">No printer connected yet.</p>
                    ) : (
                        <ul className="printer-list">
                            {printers.map((device, i) => (
                                <li key={printerKey(device)} className="printer-item">
                                    <div className="printer-info">
                                        <strong>{printerName(device)}</strong>
                                        <span className="printer-meta">
                                            {i === 0 ? "Used for tickets · " : ""}
                                            USB {hex(device.vendorId)}:{hex(device.productId)}
                                        </span>
                                    </div>
                                    <div className="row-actions">
                                        <button
                                            type="button"
                                            className="admin-btn"
                                            onClick={() => testPrint(device)}
                                            disabled={busy === printerKey(device)}
                                        >
                                            {busy === printerKey(device) ? "Printing..." : "Test print"}
                                        </button>
                                        <button
                                            type="button"
                                            className="admin-btn admin-btn-danger"
                                            onClick={() => forget(device)}
                                            disabled={busy === printerKey(device)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className="admin-panel">
                <h2>Paper width</h2>
                <div className="video-tabs" role="radiogroup" aria-label="Paper width">
                    {PAPER_SIZES.map((p) => (
                        <button
                            key={p.columns}
                            type="button"
                            role="radio"
                            aria-checked={columns === p.columns}
                            className="video-tab"
                            onClick={() => changeColumns(p.columns)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <p className="printer-text">
                    Saved on this computer. Pick the width of the paper roll in the printer.
                </p>
            </div>

            <div className="admin-panel">
                <h2>If the printer won't print</h2>
                <ul className="printer-tips">
                    <li>Use a printer that supports ESC/POS (most thermal receipt printers do).</li>
                    <li>
                        Set up the print service once with{" "}
                        <code>pip install -r src/printing/script/requirements.txt</code>. To start it with Windows, put
                        a shortcut that runs it with <code>pythonw</code> (no console window) in the Startup folder
                        (Win+R, <code>shell:startup</code>).
                    </li>
                    <li>
                        If the service doesn't find the printer, run it with <code>--list</code> to see what it finds.
                        A printer installed in Windows is only picked when its name or driver looks like a receipt
                        printer; otherwise start the service with <code>--printer "Exact printer name"</code>.
                    </li>
                    <li>
                        On Windows, the printer's own driver blocks browser USB printing. Switch it to the WinUSB driver
                        with the free Zadig tool, then unplug and replug the printer. The print service works with
                        either driver.
                    </li>
                    <li>
                        Customers see "Printer not found ERR_404" whenever no printer can be reached: the print service
                        isn't running and no browser USB printer is set up, or the printer is unplugged, switched off or
                        won't print. The browser console has the exact reason.
                    </li>
                </ul>
            </div>
        </section>
    );
}
