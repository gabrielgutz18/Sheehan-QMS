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

// the column an invoice goes under; an invoice with no type goes with the order's type of order when it has only one
export const invoiceColumn = (type, types) => columnOf(type || (types.length === 1 ? types[0] : ""));

// an order's invoice numbers by column, every column there: { roofing: ["449765", "449767"], construction: [], ... }
export const invoicesByColumn = (order) => {
    const columns = Object.fromEntries(INVOICE_COLUMNS.map((column) => [column.key, []]));
    const types = splitList(order.purpose);
    for (const { invoiceNo, type } of order.invoices ?? []) columns[invoiceColumn(type, types)].push(invoiceNo);
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

// who assisted the customer at sales: whoever pressed Assist on My counter while the ticket's maker was away, or else
// the staff member serving them at their counter, or who served them there and handed them over to loading; "" before
// anyone has
export const assistedBy = (order) => order.assistedBy?.name ?? order.handedOver?.by?.name ?? order.servedBy?.name ?? "";

// a moment (ISO 8601) as the schedule writes a time, by this computer's clock: "0734H"; "" for none
const clockTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${pad2(d.getHours())}${pad2(d.getMinutes())}H`;
};

// when the last of the order's areas finished loading, once every one has; an order loaded before areas were kept
// has only when loading pressed Done
const loadedAt = (order) => {
    const areas = order.areas ?? [];
    if (!areas.length) return order.loaded?.at;
    return areas.every((area) => area.loaded) ? areas.map((area) => area.loaded.at).toSorted().at(-1) : undefined;
};

// who checked the items again: the 2nd checker of each column, each name once
const doubleCheckedBy = (checkers = {}) =>
    [...new Set(Object.values(checkers).map(([, second = ""]) => second.trim()).filter(Boolean))].join(", ");

// what each editable cell of an order's row shows, { [column key]: text }, the same on the page and in the Google sheet;
// several invoice numbers in a column go one above the other; a cell the system works out by itself shows what was typed
// over it, if anything
export const sheetValues = (order) => {
    const invoices = invoicesByColumn(order);
    const typed = order.sheetCells ?? {};
    return {
        team: order.team ?? "",
        salesman: order.salesman ?? "",
        assistedBy: typed.assistedBy ?? assistedBy(order),
        customer: order.name,
        ...Object.fromEntries(INVOICE_COLUMNS.map(({ key }) => [key, invoices[key].join("\n")])),
        terms: order.paymentStatus ?? "",
        salesTimeIn: sheetTime(order.salesTimeIn),
        salesTimeOut: sheetTime(order.salesTimeOut),
        runner: order.runner ?? "",
        receiver: order.receiver ?? "",
        // in to loading when sales handed them over, out when the last area finished
        loadingTimeIn: typed.loadingTimeIn ?? clockTime(order.handedOver?.at),
        loadingTimeOut: typed.loadingTimeOut ?? clockTime(loadedAt(order)),
        doubleCheckedBy: typed.doubleCheckedBy ?? doubleCheckedBy(order.checkers),
        purpose: order.purpose ?? "",
    };
};
