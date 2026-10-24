import { colorLabel } from '../../data/roofingColors.js';
import { formatPickup } from '../../data/pickupDate.js';
import checkerColumns, { CHECKER_ROUNDS } from '../../data/checkers.js';

// ESC/POS: the command language almost every thermal receipt printer understands
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const ALIGN = { left: 0, center: 1, right: 2 };

// printers use a single-byte code page, so stick to plain ASCII ("Gutiérrez" prints as "Gutierrez")
const toAscii = (text) =>
    String(text ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^\x20-\x7e]/g, "?");

// break text into lines no wider than the paper, splitting long words if needed
const wrap = (text, width) => {
    const lines = [];
    let current = "";
    for (const word of toAscii(text).split(/\s+/).filter(Boolean)) {
        for (let piece = word; piece; piece = piece.slice(width)) {
            const chunk = piece.slice(0, width);
            if (!current) current = chunk;
            else if (current.length + 1 + chunk.length <= width) current += ` ${chunk}`;
            else {
                lines.push(current);
                current = chunk;
            }
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
};

const formatIssued = (issuedAt) => {
    const date = issuedAt ? new Date(issuedAt) : new Date();
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

// ticket: { queueNumber, name, purpose, orders: [{ qty, item, color? }], concern?, invoices: [{ invoiceNo, type }],
//   paymentStatus?, salesman?, team?, pickupDate?, checkers?: { Roofing: ["Pedro", ""] }, issuedAt }
// the sales details from Customer order are printed once they're set, except the runner, receiver and sales times,
// which are for staff only; orders are the items on a ticket taken before invoices, and concern a Customer Report's
// concern, printed in place of them; the checkers are always printed, a line to write each one left out on
// columns: characters per line, 32 for 58mm paper and 48 for 80mm
export function buildReceipt(
    {
        queueNumber, name, purpose, orders = [], concern, invoices = [], paymentStatus, salesman, team, pickupDate,
        checkers = {}, issuedAt,
    },
    { columns = 48 } = {},
) {
    const bytes = [];
    const raw = (...b) => bytes.push(...b);
    const line = (text = "") => {
        for (const ch of toAscii(text)) bytes.push(ch.charCodeAt(0));
        bytes.push(LF);
    };
    const align = (where) => raw(ESC, 0x61, ALIGN[where]);
    const bold = (on) => raw(ESC, 0x45, on ? 1 : 0);
    // width/height multipliers, 1-8
    const size = (w, h = w) => raw(GS, 0x21, ((w - 1) << 4) | (h - 1));
    const rule = (ch = "-") => line(ch.repeat(columns));

    raw(ESC, 0x40); // reset to defaults

    align("center");
    bold(true);
    size(2);
    line("SHEEHAN INC.");
    size(1);
    bold(false);
    line("QUEUE TICKET");
    rule("=");

    line("QUEUE NUMBER");
    bold(true);
    size(3);
    line(queueNumber);
    size(1);
    bold(false);
    rule();

    line("CUSTOMER NAME");
    bold(true);
    size(1, 2);
    wrap(name, columns).forEach(line);
    size(1);
    bold(false);
    rule();

    line("TYPE OF ORDER");
    bold(true);
    wrap(purpose, columns).forEach(line);
    bold(false);
    rule();

    align("left");
    // one line each: the number, and the type of order it's for
    if (invoices.length) {
        line(invoices.length > 1 ? "INVOICE NOS" : "INVOICE NO");
        bold(true);
        invoices.forEach(({ invoiceNo, type }) => wrap(type ? `${invoiceNo} - ${type}` : invoiceNo, columns).forEach(line));
        bold(false);
        rule();
    }
    const details = [
        ["PAYMENT", paymentStatus],
        ["SALESMAN", salesman],
        ["TEAM", team],
        ["PICK-UP", pickupDate && formatPickup(pickupDate)],
    ].filter(([, value]) => value);
    if (details.length) {
        details.forEach(([label, value]) => wrap(`${label}: ${value}`, columns).forEach(line));
        rule();
    }

    if (concern || orders.length) {
        bold(true);
        line(concern ? "CONCERN" : "ORDER");
        bold(false);
        if (concern) wrap(concern, columns).forEach(line);
        for (const o of orders) {
            const color = o.color ? ` (${colorLabel(o.color)})` : "";
            wrap(`${o.qty}x ${o.item}${color}`, columns).forEach(line);
        }
        rule();
    }

    // each column's 1st and 2nd checker, one under the other since three columns don't fit on 58mm paper; a Customer
    // Report's ticket isn't checked out
    if (!concern) {
        line("CHECKERS");
        for (const { name: column } of checkerColumns) {
            bold(true);
            wrap(column.toUpperCase(), columns).forEach(line);
            bold(false);
            CHECKER_ROUNDS.forEach(({ short }, i) => {
                const label = `${short.toUpperCase()}: `;
                const checker = checkers[column]?.[i];
                if (checker) wrap(`${label}${checker}`, columns).forEach(line);
                else line(label + "_".repeat(columns - label.length));
            });
        }
        rule();
    }

    align("center");
    line(formatIssued(issuedAt));
    wrap("Please hand this ticket to the sales counter.", columns).forEach(line);

    raw(ESC, 0x64, 4); // feed so the cut lands below the text
    raw(GS, 0x56, 0x42, 0x00); // cut (ignored by printers without a cutter)

    return Uint8Array.from(bytes);
}
