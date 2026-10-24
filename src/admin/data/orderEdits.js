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
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayTimeFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// "12:54 PM" for an edit made today, "Oct 22, 12:54 PM" for one on another day (History)
export const editTime = (iso) => {
    const at = new Date(iso);
    return (at.toDateString() === new Date().toDateString() ? timeFormat : dayTimeFormat).format(at);
};

// ["runner", "invoices"] → "Runner, Invoices"
export const changedDetails = (changes) => changes.map((key) => DETAIL_LABELS[key] ?? key).join(", ");
