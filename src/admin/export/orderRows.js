import formatQueueNum from '../../data/queueNum.js';
import { checkerSummary } from '../../data/checkers.js';
import { splitList } from '../../data/list.js';
import orderStatus from '../data/orderStatus.js';

// the Customer orders export: one row per ticket with what Customer order took for it (invoices, salesman, runner,
// receiver, sales team, ...) and who served it at sales, for the tickets of a range of days
// plain data, so the workbook (ordersWorkbook.js) and the tests share it

// the export's columns, left to right; numFmt is Excel's format for a date or time column
export const ORDER_COLUMNS = [
    { key: "date", header: "Date", width: 13, numFmt: "d mmm yyyy" },
    { key: "ticket", header: "Ticket", width: 10 },
    { key: "name", header: "Customer", width: 24 },
    { key: "purpose", header: "Type of order", width: 22 },
    { key: "invoices", header: "Invoice no.", width: 28 },
    { key: "salesman", header: "Salesman", width: 18 },
    // the sales staff member who served the customer at their counter, whether or not they handed them over to loading
    { key: "servedBy", header: "Served by", width: 18 },
    { key: "team", header: "Sales team", width: 14 },
    { key: "runner", header: "Runner", width: 18 },
    { key: "receiver", header: "Receiver", width: 18 },
    { key: "paymentStatus", header: "Payment", width: 11 },
    { key: "salesTimeIn", header: "Time in (sales)", width: 14, numFmt: "h:mm AM/PM" },
    { key: "salesTimeOut", header: "Time out (sales)", width: 14, numFmt: "h:mm AM/PM" },
    { key: "checkers", header: "Checkers", width: 34 },
    { key: "pickupDate", header: "Pick-up date", width: 13, numFmt: "d mmm yyyy" },
    { key: "status", header: "Status", width: 20 },
];

// the most days one export takes: History is asked for each day in turn
export const MAX_EXPORT_DAYS = 92;

// History answers with at most this many tickets a day (HISTORY_LIMIT in server/api.js); a day with that many may
// have more
export const DAY_LIMIT = 200;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad2 = (n) => String(n).padStart(2, "0");

// "2026-10-24" as Excel takes a date: midnight UTC, so it's that day on any computer; null for none
export const excelDate = (day) => {
    const match = day?.match(DAY);
    return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
};

// a sales time, "13:05", as Excel takes a time: the part of the day gone by; null for none
export const excelTime = (time) => {
    const match = time?.match(/^(\d{2}):(\d{2})$/);
    return match ? (Number(match[1]) * 60 + Number(match[2])) / (24 * 60) : null;
};

// every day from "2026-10-01" to "2026-10-03", both included: ["2026-10-01", "2026-10-02", "2026-10-03"]
export function daysBetween(from, to) {
    const days = [];
    const last = excelDate(to);
    for (let d = excelDate(from); d && last && d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
        days.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
    }
    return days;
}

const statusLabel = (value) => orderStatus.find((s) => s.value === value)?.label ?? value;

// once sales hands the customer over, the loading crew is who serves them next, but the order stays the sales
// counter's
const servedAtSales = (order) => order.handedOver?.by?.name ?? order.servedBy?.name ?? "";

// a customer handed over to loading and not done yet is waiting for loading or at it
const statusText = (order) =>
    !order.handedOver || order.status === "done" || order.status === "returning" ? statusLabel(order.status)
    : order.status === "serving" && order.atLoading ? "At loading"
    : order.status === "serving" ? "Back at sales"
    : "Waiting for loading";

// "43355521 (Roofings), 5566 (Steel)"; a ticket for one type of order needs no type beside each number
const invoiceText = (order) => {
    const several = splitList(order.purpose).length > 1;
    return (order.invoices ?? [])
        .map(({ invoiceNo, type }) => (several && type ? `${invoiceNo} (${type})` : invoiceNo))
        .join(", ");
};

// History's tickets (listHistory) as the export's rows, oldest first, each { [column key]: value }; deleted
// tickets are left out
export const orderExportRows = (orders) =>
    orders
        .filter((order) => !order.deletedAt)
        .toSorted((a, b) => a.date.localeCompare(b.date) || a.queueNum - b.queueNum)
        .map((order) => ({
            date: excelDate(order.date),
            ticket: formatQueueNum(order.queueNum, order.purpose, order),
            name: order.name,
            purpose: order.purpose,
            invoices: invoiceText(order),
            salesman: order.salesman ?? "",
            servedBy: servedAtSales(order),
            team: order.team ?? "",
            runner: order.runner ?? "",
            receiver: order.receiver ?? "",
            paymentStatus: order.paymentStatus ?? "",
            salesTimeIn: excelTime(order.salesTimeIn),
            salesTimeOut: excelTime(order.salesTimeOut),
            checkers: checkerSummary(order.checkers),
            pickupDate: excelDate(order.pickupDate),
            status: statusText(order),
        }));
