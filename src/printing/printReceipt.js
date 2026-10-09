import { buildReceipt } from './escpos.js';
import { describeUsbError, getSavedPrinter, isUsbSupported, printerName, sendToPrinter } from './usbPrinter.js';

const COLUMNS_KEY = "printer.columns";

export const PAPER_SIZES = [
    { columns: 32, label: "58 mm" },
    { columns: 48, label: "80 mm" },
];

export function getPaperColumns() {
    try {
        const saved = Number(localStorage.getItem(COLUMNS_KEY));
        return PAPER_SIZES.some((p) => p.columns === saved) ? saved : 48;
    } catch {
        return 48;
    }
}

export function setPaperColumns(columns) {
    try {
        localStorage.setItem(COLUMNS_KEY, String(columns));
    } catch {
        // storage blocked; falls back to 80 mm
    }
}

// sends the ticket to the approved USB receipt printer; with none set up (or if it fails),
// opens the browser's print dialog, which prints just the on-screen ticket
// resolves to { method: "usb", printer } or { method: "browser", error? }
export async function printReceipt(ticket) {
    let error;
    if (isUsbSupported()) {
        try {
            const device = await getSavedPrinter();
            if (device) {
                await sendToPrinter(device, buildReceipt(ticket, { columns: getPaperColumns() }));
                return { method: "usb", printer: printerName(device) };
            }
        } catch (err) {
            error = describeUsbError(err);
            console.error("USB print failed, using the browser print dialog instead", err);
        }
    }
    window.print();
    return { method: "browser", error };
}
