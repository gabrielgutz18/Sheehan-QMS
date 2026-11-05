// one cell of the Order sheet changed, from the page or from the Google sheet: every column but DATE, QUE and STATUS, which
// run the queue; what's typed is checked here and tidied into what the order keeps, and a wrong one gets a reason for the
// person who typed it
import { INVOICE_COLUMNS, invoiceColumn } from '../src/admin/data/sheetColumns.js';
import { joinList, splitList } from '../src/data/list.js';
import paymentStatus from '../src/data/paymentStatus.js';
import teams from '../src/data/teams.js';
import { cleaned, pick, splitCell, timeFrom, typesFrom } from './sheetTicket.js';

const TEAMS = teams.map((t) => t.name);
const TERMS = paymentStatus.map((p) => p.type);

// must match the backend's limits for an order (server/api.js)
const MAX_NAME = 100;
const MAX_PERSON = 60;
const MAX_PURPOSE = 200;
const MAX_INVOICE = 30;
const MAX_INVOICES = 20;
// a column's name, and what its cells and the typed-over ones take
export const MAX_COLUMN_NAME = 40;
const MAX_CELL = 500;

// the cells the system works out by itself; typed over, the typed one shows in its place, and the order's real path
// (who handed it over, when it loaded) stays as it was
export const TYPED_OVER_CELLS = ["assistedBy", "loadingTimeIn", "loadingTimeOut", "doubleCheckedBy"];
const INVOICE_KEYS = INVOICE_COLUMNS.map((column) => column.key);

// the names a column can't have, since they're the sheet's own: the same as the headers the script knows
const RESERVED_NAMES = new Set([
    "DATE", "QUE", "QUEUE", "TICKET", "TEAM", "SALESMAN", "ASSISTED BY", "CUSTOMER'S NAME", "CUSTOMER NAME", "CUSTOMER",
    "ROOFING", "CONSTRUCTION & HARDWARE", "TBA", "CHASSIS", "OTHERS", "TERMS", "TIME IN", "TIME OUT", "TIME IN (SALES)",
    "TIME OUT (SALES)", "RUNNER", "RUNNER (SALES)", "RECEIVER", "RECEIVER (LOADING / INVENTORY)",
    "TIME IN (LOADING / INVENTORY)", "TIME OUT (LOADING / INVENTORY)", "STATUS", "DOUBLE CHECKED BY", "TYPE OF ORDER",
    "ORDER TYPE", "CREATE TICKET", "APP ID", "APP SORT", "APP LAST", "APP NEW",
]);

// a column's name as the script reads a header, so the page and the Google sheet find the same column: "Plate no:" is
// PLATE NO; must match normalized_ in tools/google-apps-script/orderSheet.gs
const headerOf = (name) => String(name).replace(/\s+/g, " ").replace(/’/g, "'").trim().replace(/:$/, "").toUpperCase();
export const columnKey = (name) => `c:${headerOf(name)}`;
export const isColumnKey = (key) => key.startsWith("c:");

// why a column can't have this name, or "" if it can
export const columnNameProblem = (name) => {
    const header = headerOf(name);
    if (!header) return "A column needs a name.";
    if (header.length > MAX_COLUMN_NAME) return `A column's name can be at most ${MAX_COLUMN_NAME} letters.`;
    if (RESERVED_NAMES.has(header)) return `The sheet already has a column named ${header}.`;
    return "";
};

const tooLong = (max) => `it's too long: at most ${max} letters`;

// the invoices typed in one department's column: the rest of the order's stay as they are, one already there keeps its
// type (Steel and Hardwares share a column), and a new one takes the first of the order's types its column has; a type
// its column doesn't have is refused, so a customer isn't sent to the wrong department; Others has no types of its own,
// so its invoice takes the order's first, and moves to that type's column
const setInvoices = (state, key, typed) => {
    const column = INVOICE_COLUMNS.find((c) => c.key === key);
    const types = splitList(state.purpose);
    const inColumn = (invoice) => invoiceColumn(invoice.type, types) === key;
    const here = state.invoices.filter(inColumn);
    const numbers = splitCell(typed);
    if (JSON.stringify(numbers) === JSON.stringify(here.map((invoice) => invoice.invoiceNo))) return "";

    const next = [];
    for (const invoiceNo of numbers) {
        if (invoiceNo.length > MAX_INVOICE) return `invoice ${invoiceNo} is too long: at most ${MAX_INVOICE} letters`;
        const type = here.find((invoice) => invoice.invoiceNo === invoiceNo)?.type ??
            (column.types.length ? column.types.find((name) => types.includes(name)) : types[0]);
        if (type === undefined) return `invoice ${invoiceNo} is under ${column.header}, but the type of order has no ${column.types.join(" or ")}`;
        next.push({ invoiceNo, type });
    }

    const invoices = [...state.invoices.filter((invoice) => !inColumn(invoice)), ...next];
    if (invoices.length > MAX_INVOICES) return `an order can have at most ${MAX_INVOICES} invoices`;
    if (new Set(invoices.map((invoice) => invoice.invoiceNo.toLowerCase())).size !== invoices.length) return "the same invoice number is in twice";
    if (!invoices.length && !state.items) return "an order needs at least one invoice number";
    state.invoices = invoices;
    return "";
};

// a changed type of order can't leave an invoice behind: its department would no longer be on the ticket
const setPurpose = (state, typed) => {
    const { types, problem } = typesFrom(typed);
    if (problem) return problem;
    const purpose = joinList(types);
    if (purpose.length > MAX_PURPOSE) return tooLong(MAX_PURPOSE);
    const left = state.invoices.find((invoice) => invoice.type && !types.includes(invoice.type));
    if (left) return `invoice ${left.invoiceNo} is for ${left.type}, so the type of order must keep ${left.type} until that invoice is moved or removed`;
    state.purpose = purpose;
    return "";
};

const setTyped = (state, key, typed, max) => {
    if (typed.length > max) return tooLong(max);
    state[key] = typed;
    return "";
};

// a time kept the way the order keeps it (HH:MM), "" for none
const setTime = (state, key, typed, label) => {
    const time = typed && timeFrom(typed);
    if (typed && !time) return `"${typed}" isn't a ${label}: write it like 0734H`;
    state[key] = time;
    return "";
};

// a typed-over cell, "" to go back to what the system works out, or for one of the columns, to empty it
const setCell = (state, key, typed, max) => {
    if (typed.length > max) return tooLong(max);
    if (typed) state.cells[key] = typed;
    else delete state.cells[key];
    return "";
};

// a cell's new value put into state (sheetStateOf below); answers why it can't be taken, or "" once it has; columns: the
// keys of the columns on the sheet now
export const applyCell = (state, key, value, columns = []) => {
    if (typeof value !== "string") return "it isn't text";
    const typed = cleaned(value);
    if (INVOICE_KEYS.includes(key)) return setInvoices(state, key, typed);
    if (TYPED_OVER_CELLS.includes(key)) {
        if (key === "loadingTimeIn" || key === "loadingTimeOut") {
            const time = typed && timeFrom(typed);
            if (typed && !time) return `"${typed}" isn't a time: write it like 0734H`;
            return setCell(state, key, time ? `${time.replace(":", "")}H` : "", MAX_PERSON);
        }
        return setCell(state, key, typed, MAX_PERSON * 2);
    }
    if (isColumnKey(key)) return columns.includes(key) ? setCell(state, key, typed, MAX_CELL) : "that column isn't on the sheet";

    switch (key) {
        case "customer":
            if (!typed) return "the customer's name can't be empty";
            return setTyped(state, key, typed, MAX_NAME);
        case "purpose":
            return setPurpose(state, typed);
        case "team": {
            const team = typed && pick(TEAMS, typed);
            if (typed && !team) return `"${typed}" isn't a sales team: ${TEAMS.join(", ")}`;
            state.team = team;
            return "";
        }
        case "terms": {
            // the same as on the Cashier page: it can be changed, but not cleared
            if (!typed) return state.terms ? "the terms can be changed but not cleared" : "";
            const terms = pick(TERMS, typed);
            if (!terms) return `"${typed}" isn't one of the terms: ${TERMS.join(", ")}`;
            state.terms = terms;
            return "";
        }
        case "salesman":
        case "runner":
        case "receiver":
            return setTyped(state, key, typed, MAX_PERSON);
        case "salesTimeIn":
            return setTime(state, key, typed, "time in");
        case "salesTimeOut":
            return setTime(state, key, typed, "time out");
        default:
            return "only DATE, QUE and STATUS can't be changed, and this isn't a column of the sheet";
    }
};

// an order's row, invoices and typed cells as applyCell works on them
export const sheetStateOf = (row, invoices, itemCount, cells) => ({
    customer: row.name,
    purpose: row.purpose,
    team: row.team,
    salesman: row.salesman,
    runner: row.runner,
    receiver: row.receiver,
    terms: row.payment_status,
    salesTimeIn: row.sales_time_in,
    salesTimeOut: row.sales_time_out,
    invoices: invoices.map(({ invoice_no, type }) => ({ invoiceNo: invoice_no, type })),
    items: itemCount,
    cells: Object.fromEntries(cells.map(({ cell, value }) => [cell, value])),
});

// the name an edit keeps for this cell, as src/admin/data/orderEdits.js labels them
export const editNameOf = (key) => {
    if (INVOICE_KEYS.includes(key)) return "invoices";
    if (key === "customer") return "name";
    if (key === "terms") return "paymentStatus";
    return key;
};

// whether a cell differs between two of those states
export const cellChanged = (before, after, key) => {
    if (INVOICE_KEYS.includes(key)) return JSON.stringify(before.invoices) !== JSON.stringify(after.invoices);
    if (TYPED_OVER_CELLS.includes(key) || isColumnKey(key)) return (before.cells[key] ?? "") !== (after.cells[key] ?? "");
    return (before[key] ?? "") !== (after[key] ?? "");
};
