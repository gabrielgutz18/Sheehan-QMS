import { useCallback, useEffect, useState } from 'react';

import { buildReceipt } from '../../printing/escpos.js';
import { PAPER_SIZES, getPaperColumns, setPaperColumns } from '../../printing/printReceipt.js';
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
            await sendToPrinter(device, buildReceipt({ ...SAMPLE_TICKET, issuedAt: new Date() }, { columns }));
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

            {!supported ? (
                <div className="admin-panel">
                    <h2>USB printing isn't available here</h2>
                    <p className="printer-text">
                        Open this page in Chrome or Edge, from <code>localhost</code> or an <code>https://</code> address,
                        on the kiosk computer the printer is plugged into. Until then, the Print button opens the
                        normal print dialog.
                    </p>
                </div>
            ) : (
                <>
                    {error && <p className="field-error" role="alert">{error}</p>}
                    {notice && <p className="admin-notice" role="status">{notice}</p>}

                    <div className="admin-panel">
                        <div className="printer-head">
                            <div>
                                <h2>Printers</h2>
                                <p className="printer-text">
                                    Plug the receipt printer into this computer by USB, then search for it. Do this
                                    once on the kiosk itself; after that, pressing Print prints the ticket straight away.
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
                                On Windows, the printer's own driver can block the browser. Switch it to the WinUSB
                                driver with the free Zadig tool, then unplug and replug the printer.
                            </li>
                            <li>
                                With no printer set up, the Print button falls back to the normal print dialog. Start
                                Chrome with <code>--kiosk-printing</code> to skip the dialog and print to the default printer.
                            </li>
                        </ul>
                    </div>
                </>
            )}
        </section>
    );
}
