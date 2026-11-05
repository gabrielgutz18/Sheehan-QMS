// the details an edit can change, as Customer order names them; the keys are what the backend keeps for each edit
// (server/api.js, EDITABLE_COLUMNS plus items and invoices)
const DETAIL_LABELS = {
    name: "Customer name",
    purpose: "Type of order",
    items: "Items",
    invoices: "Invoices",
    concern: "Concern",
    salesman: "Salesman",
    runner: "Runner",
    receiver: "Receiver",
    salesTimeIn: "Time in",
    salesTimeOut: "Time out",
    checkers: "Checkers",
    paymentStatus: "Payment status",
    team: "Sales team",
    pickupDate: "Pick-up date",
    priority: "Priority order",
    tbaPriority: "TBA priority order",
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayTimeFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// "12:54 PM" for an edit made today, "Oct 22, 12:54 PM" for one on another day (History)
export const editTime = (iso) => {
    const at = new Date(iso);
    return (at.toDateString() === new Date().toDateString() ? timeFormat : dayTimeFormat).format(at);
};

// a ticket made from a row in the Google sheet lists this in place of a change (server/api.js, CREATED_IN_SHEET)
const CREATED_IN_SHEET = "createdInSheet";
export const wasCreatedInSheet = (edit) => edit.changes.includes(CREATED_IN_SHEET);

// how an edit's line starts: "Edited by Maria Santos", or "Created in Google sheet"
export const editVerb = (edit) => (wasCreatedInSheet(edit) ? "Created in" : "Edited by");

// ["runner", "invoices"] → "Runner, Invoices"
export const changedDetails = (changes) =>
    changes.filter((key) => key !== CREATED_IN_SHEET).map((key) => DETAIL_LABELS[key] ?? key).join(", ");
