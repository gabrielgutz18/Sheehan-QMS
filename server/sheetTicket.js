// a row typed in the Google sheet, turned into what Customer order would have sent for that ticket; the sheet checks
// nothing itself, so each cell is checked here, and a wrong one gets a reason for the person who typed it, shown as a
// note on the row, rather than a ticket with the wrong department on it
import { INVOICE_COLUMNS } from '../src/admin/data/sheetColumns.js';
import { joinList } from '../src/data/list.js';
import paymentStatus from '../src/data/paymentStatus.js';
import purpose from '../src/data/purpose.js';
import teams from '../src/data/teams.js';

const TYPES = purpose.map((p) => p.name);
const TEAMS = teams.map((t) => t.name);
const TERMS = paymentStatus.map((p) => p.type);

export const cleaned = (text) => String(text ?? "").trim();
// the list's own spelling of what was typed, whatever its capitals; undefined if it isn't on the list
export const pick = (list, typed) => list.find((name) => name.toUpperCase() === typed.toUpperCase());
// several in one cell go one above the other, as the sheet shows them, or with commas
export const splitCell = (text) => cleaned(text).split(/[\n,]+/).map(cleaned).filter(Boolean);

// the types of order typed in a cell, in the list's order and spelling, like every other ticket, which is what its queue
// code is made from: { types }, or { problem } saying what to fix
export const typesFrom = (typed) => {
    const words = splitCell(typed);
    if (!words.length) return { problem: `the type of order is empty: ${TYPES.join(", ")}` };
    const unknown = words.find((word) => !pick(TYPES, word));
    if (unknown) return { problem: `"${unknown}" isn't a type of order: ${TYPES.join(", ")}` };
    const chosen = words.map((word) => pick(TYPES, word));
    return { types: TYPES.filter((type) => chosen.includes(type)) };
};

// a time as the sheet writes it, "0734H", or as a person might, "7:34", as the HH:MM an order keeps; null if it isn't one
export const timeFrom = (typed) => {
    const match = /^(\d{1,2}):?(\d{2})\s*H?$/i.exec(typed);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    return `${match[1].padStart(2, "0")}:${match[2]}`;
};

// each invoice under its department's column, with the first of the order's types that column has: "Construction &
// hardware" on a "Steel" ticket is a Steel invoice; Others has no types of its own, so it takes the order's first
const invoicesFrom = (values, types) => {
    const invoices = [];
    for (const { key, header, types: own } of INVOICE_COLUMNS) {
        for (const invoiceNo of splitCell(values[key])) {
            const type = own.length ? own.find((name) => types.includes(name)) : types[0];
            if (!type) return { problem: `invoice ${invoiceNo} is under ${header}, but the type of order has no ${own.join(" or ")}` };
            invoices.push({ invoiceNo, type });
        }
    }
    return { invoices };
};

// values: the row's cells by column key, { customer, purpose, roofing, team, ... }; gives { order } in the shape POST
// /orders takes (still to go through validOrder, for its limits), or { problem } saying what to fix
export const ticketFromSheet = (values) => {
    const name = cleaned(values.customer);
    if (!name) return { problem: "the customer's name is empty" };

    const { types, problem: typesProblem } = typesFrom(values.purpose);
    if (typesProblem) return { problem: typesProblem };

    const { invoices, problem } = invoicesFrom(values, types);
    if (problem) return { problem };
    if (!invoices.length) return { problem: "it has no invoice number" };

    const typedTeam = cleaned(values.team);
    const team = typedTeam && pick(TEAMS, typedTeam);
    if (typedTeam && !team) return { problem: `"${typedTeam}" isn't a sales team: ${TEAMS.join(", ")}` };

    const typedTerms = cleaned(values.terms);
    const paymentStatusPicked = typedTerms && pick(TERMS, typedTerms);
    if (typedTerms && !paymentStatusPicked) return { problem: `"${typedTerms}" isn't one of the terms: ${TERMS.join(", ")}` };

    const typedIn = cleaned(values.salesTimeIn);
    const salesTimeIn = typedIn && timeFrom(typedIn);
    if (typedIn && !salesTimeIn) return { problem: `"${typedIn}" isn't a time in: write it like 0734H` };
    const typedOut = cleaned(values.salesTimeOut);
    const salesTimeOut = typedOut && timeFrom(typedOut);
    if (typedOut && !salesTimeOut) return { problem: `"${typedOut}" isn't a time out: write it like 0734H` };

    // the sheet's QUE is just the mark for a priority order, so typing the mark there makes one
    const mark = cleaned(values.que);
    return {
        order: {
            name,
            purpose: joinList(types),
            orders: [],
            invoices,
            salesman: cleaned(values.salesman),
            runner: cleaned(values.runner),
            receiver: cleaned(values.receiver),
            team,
            paymentStatus: paymentStatusPicked,
            salesTimeIn,
            salesTimeOut,
            priority: mark === "*",
            tbaPriority: mark === "**",
            pickupDate: null,
            // the sheet has neither: the checkers are filled in later on the ticket, and a concern is for a Customer Report
            checkers: undefined,
            concern: "",
        },
    };
};
