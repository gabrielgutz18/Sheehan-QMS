import { buildReceipt } from './escpos.js';
import { printWithService } from './printService.js';
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

// prints the ticket on the first of these that's available:
//  1. the Python print service on this computer, which finds the USB printer by itself
//  2. the USB printer approved in admin through the browser
// rejects when the ticket can't be printed: no printer found, or it's unplugged, switched off or refuses the data
// resolves to { method: "service" | "usb", printer }
export async function printReceipt(ticket) {
    const bytes = buildReceipt(ticket, { columns: getPaperColumns() });

    const viaService = await printWithService(bytes);
    if (viaService) return { method: "service", printer: viaService.printer };

    const device = isUsbSupported() ? await getSavedPrinter() : null;
    if (!device) {
        throw new Error("No printer found: the print service isn't running and no USB printer is approved in the browser.");
    }
    try {
        await sendToPrinter(device, bytes);
    } catch (err) {
        throw new Error(describeUsbError(err), { cause: err });
    }
    return { method: "usb", printer: printerName(device) };
}
