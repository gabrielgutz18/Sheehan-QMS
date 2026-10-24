import { splitList } from '../../data/list.js';

// the Order sheet laid out like the loading schedule sales keeps in Google Sheets: the invoice numbers go under their
// department's column, one above the other when there are several; a type of order not listed here, or an older
// ticket's invoice with no type, goes under Others
export const INVOICE_COLUMNS = [
    { key: "roofing", header: "Roofing", types: ["Roofings", "Roofings Accessories"] },
    { key: "construction", header: "Construction & hardware", types: ["Steel", "Hardwares"] },
    // tires, batteries and accessories
    { key: "tba", header: "TBA", types: ["Tire", "Battery"] },
    { key: "chassis", header: "Chassis", types: ["Chassis"] },
    { key: "others", header: "Others", types: [] },
];

const OTHERS = INVOICE_COLUMNS.at(-1).key;
const columnOf = (type) => INVOICE_COLUMNS.find((column) => column.types.includes(type))?.key ?? OTHERS;

// an order's invoice numbers by column, every column there: { roofing: ["449765", "449767"], construction: [], ... }
// an invoice with no type goes with the order's type of order when it has only one
export const invoicesByColumn = (order) => {
    const columns = Object.fromEntries(INVOICE_COLUMNS.map((column) => [column.key, []]));
    const types = splitList(order.purpose);
    for (const { invoiceNo, type } of order.invoices ?? []) {
        columns[columnOf(type || (types.length === 1 ? types[0] : ""))].push(invoiceNo);
    }
    return columns;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");

// the day a ticket was taken, as the schedule writes it: "Oct-24-26"
export const sheetDate = (iso) => {
    const d = new Date(iso);
    return `${MONTHS[d.getMonth()]}-${pad2(d.getDate())}-${pad2(d.getFullYear() % 100)}`;
};

// a sales time as Customer order keeps it, "08:16", as the schedule writes it: "0816H"; "" for none
export const sheetTime = (time) => (time ? `${time.replace(":", "")}H` : "");

// who assisted the customer at sales: the staff member serving them at their counter, or who served them there and
// handed them over to loading; "" before anyone has called them
export const assistedBy = (order) => order.handedOver?.by?.name ?? order.servedBy?.name ?? "";
