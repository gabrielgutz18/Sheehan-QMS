import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import '../../style/customerOrder.css';

import Receipt from '../../components/receipt.jsx';
import { CheckPicker, InvoiceFields, ReturningField, SaleSelect, SaleText, SaleTime } from '../components/saleFields.jsx';
import OrderSummary from '../components/orderSummary.jsx';
import TicketPicker from '../components/ticketPicker.jsx';
import { useAuth } from '../auth/authContext.js';
import formatQueueNum from '../../data/queueNum.js';
import { joinList, splitList } from '../../data/list.js';
import purpose from '../../data/purpose.js';
import paymentStatus from '../../data/paymentStatus.js';
import teams from '../../data/teams.js';
import { createOrder, updateOrder } from '../../api/orderController.js';
import { getOrder } from '../api/adminOrderController.js';
import PrintFunc from '../../printing/printFunc.jsx';

// must match the backend (server/api.js)
const MAX_NAME = 100;
const MAX_INVOICE = 30;
const MAX_INVOICES = 20;
const MAX_SALESMAN = 60;
const MAX_RUNNER = 60;
const MAX_RECEIVER = 60;

// one row of the invoice list; the key keeps each row's fields its own while rows are added and taken away
let nextInvoiceKey = 0;
const invoiceRow = (invoiceNo = "", type = "") => ({ key: nextInvoiceKey++, invoiceNo, type });

// the form for a saved ticket, or a blank one with the signed-in staff member as the salesman
const fieldsFor = (saved, salesman) => ({
    name: saved?.name ?? "",
    types: splitList(saved?.purpose),
    invoices: saved?.invoices?.length
        ? saved.invoices.map((invoice) => invoiceRow(invoice.invoiceNo, invoice.type))
        : [invoiceRow()],
    salesman: saved ? saved.salesman ?? "" : salesman,
    runner: saved?.runner ?? "",
    receiver: saved?.receiver ?? "",
    salesTimeIn: saved?.salesTimeIn ?? "",
    salesTimeOut: saved?.salesTimeOut ?? "",
    paymentStatus: saved?.paymentStatus ?? "",
    teams: splitList(saved?.team),
    returning: Boolean(saved?.pickupDate),
    pickupDate: saved?.pickupDate ?? "",
});

// staff (admin or sales) take a customer's order: their name, the runner they sent to collect the items and the
// receiver (if any), the types of order, the invoices (each with the type of order it's for), the salesman, how
// it's paid, the times the customer came in to sales and left it (if typed in), the loading teams that call them on
// the Loading page, and for a customer coming back for the items on a later day, that day; Serve gives the ticket
// its queue number and shows it, and Print ticket opens the print preview to pick the printer
// the runner, receiver and sales times are kept for staff only: they're never on the ticket
// ?ticket=5 opens today's ticket 5 to edit it (Edit on Orders); ?ticket=5&view=1 shows its ticket to print it again
// (View queue ticket here, or View ticket on Orders)
export default function CustomerOrderPage() {
    const [params, setParams] = useSearchParams();
    const ticket = Number(params.get("ticket")) || null;
    const viewing = params.get("view") === "1";
    // the ticket ?ticket= asks for, once it's loaded: { ticket, order } or { ticket, error }
    const [opened, setOpened] = useState(null);
    // New order starts the form over
    const [round, setRound] = useState(0);

    useEffect(() => {
        if (!ticket) return;
        const controller = new AbortController();
        getOrder(ticket, { signal: controller.signal })
            .then((order) => setOpened({ ticket, order }))
            .catch((err) => !controller.signal.aborted && setOpened({ ticket, error: err.message }));
        return () => controller.abort();
    }, [ticket]);

    const startNew = () => {
        setParams({});
        setRound((prev) => prev + 1);
    };

    const loaded = ticket && opened?.ticket === ticket ? opened : null;

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">Customer order</h1>
                <TicketPicker current={ticket} onView={(queueNum) => setParams({ ticket: String(queueNum), view: "1" })} />
            </div>

            {ticket && !loaded ? (
                <p className="admin-status">Opening the ticket...</p>
            ) : loaded?.error ? (
                <div className="admin-panel sale-missing">
                    <p className="field-error" role="alert">Couldn't open ticket {ticket}: {loaded.error}</p>
                    <button type="button" className="admin-btn" onClick={startNew}>Take a new order</button>
                </div>
            ) : (
                <OrderDesk
                    key={`${ticket ?? "new"}-${viewing ? "view" : "edit"}-${round}`}
                    saved={loaded?.order ?? null}
                    viewing={viewing}
                    onNew={startNew}
                />
            )}
        </section>
    );
}

// the form, then the ticket with Edit, Print ticket and New order
// saved: a ticket opened to edit, or null for a new order; viewing: show the saved ticket instead, to print it again
function OrderDesk({ saved, viewing, onNew }) {
    const { user } = useAuth();
    const [fields, setFields] = useState(() => fieldsFor(saved, user?.name ?? ""));
    const [errors, setErrors] = useState({});
    const [submitted, setSubmitted] = useState(saved);
    const [editing, setEditing] = useState(Boolean(saved) && !viewing);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    // fields show before the first Serve and while editing; the ticket shows otherwise
    const showForm = !submitted || editing;

    // change one field, clearing its error as soon as it's edited
    const set = (key) => (value) => {
        setFields((prev) => ({ ...prev, [key]: value }));
        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

    // the invoices can only be for the types of order ticked: one that's unticked is cleared from them, and with
    // just one type ticked, every invoice is for it
    const setTypes = (types) => {
        setFields((prev) => ({
            ...prev,
            types,
            invoices: prev.invoices.map((invoice) => ({
                ...invoice,
                type: types.length === 1 ? types[0] : types.includes(invoice.type) ? invoice.type : "",
            })),
        }));
        if (errors.types) setErrors((prev) => ({ ...prev, types: undefined }));
    };

    const addInvoice = () =>
        set("invoices")([...fields.invoices, invoiceRow("", fields.types.length === 1 ? fields.types[0] : "")]);
    const removeInvoice = (key) => set("invoices")(fields.invoices.filter((invoice) => invoice.key !== key));

    // each invoice needs its number, once, and the type of order it's for
    const invoiceErrors = () => {
        const found = {};
        const seen = new Set();
        for (const { key, invoiceNo, type } of fields.invoices) {
            const number = invoiceNo.trim().toLowerCase();
            const error = {};
            if (!number) error.invoiceNo = "Please enter the invoice number.";
            else if (seen.has(number)) error.invoiceNo = "This invoice number is already listed.";
            if (fields.types.length && !fields.types.includes(type)) error.type = "Please choose the type of order this invoice is for.";
            seen.add(number);
            if (error.invoiceNo || error.type) found[key] = error;
        }
        return Object.keys(found).length ? found : undefined;
    };

    const validate = () => {
        const next = {};
        if (!fields.name.trim()) next.name = "Please enter the customer's name.";
        if (fields.types.length === 0) next.types = "Please choose at least one type of order.";
        const invoices = invoiceErrors();
        if (invoices) next.invoices = invoices;
        if (!fields.salesman.trim()) next.salesman = "Please enter the salesman's name.";
        if (!fields.paymentStatus) next.paymentStatus = "Please choose a payment status.";
        if (fields.returning && !fields.pickupDate) next.pickupDate = "Please pick the day they'll come back.";
        return next;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        const next = validate();
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        const payload = {
            name: fields.name.trim(),
            purpose: joinList(fields.types),
            // the invoices list what they bought; a ticket taken before keeps the items it was taken with
            orders: submitted?.orders ?? [],
            invoices: fields.invoices.map(({ invoiceNo, type }) => ({ invoiceNo: invoiceNo.trim(), type })),
            salesman: fields.salesman.trim(),
            runner: fields.runner.trim(),
            receiver: fields.receiver.trim(),
            salesTimeIn: fields.salesTimeIn,
            salesTimeOut: fields.salesTimeOut,
            paymentStatus: fields.paymentStatus,
            team: joinList(fields.teams),
            pickupDate: fields.returning ? fields.pickupDate : null,
        };

        setSubmitting(true);
        setSubmitError("");
        try {
            // editing an order keeps its number; the backend assigns one to a new order
            const saved = submitted
                ? await updateOrder(submitted.queueNum, payload)
                : await createOrder(payload);
            setSubmitted(saved);
            setEditing(false);
        } catch (err) {
            setSubmitError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (!showForm) {
        return (
            <div className="admin-panel order-panel">
                {/* ticket on the left, actions beside it */}
                <section className="receipt-section">
                    <Receipt
                        queueNumber={formatQueueNum(submitted.queueNum, submitted.purpose)}
                        name={submitted.name}
                        purpose={submitted.purpose}
                        orders={submitted.orders}
                        concern={submitted.concern}
                        invoices={submitted.invoices}
                        paymentStatus={submitted.paymentStatus}
                        salesman={submitted.salesman}
                        team={submitted.team}
                        pickupDate={submitted.pickupDate}
                    />
                    <div className="receipt-actions">
                        {/* a Customer Report has a concern, which Customer order no longer takes */}
                        {!submitted.concern && (
                            <button type="button" className="submit-btn" onClick={() => setEditing(true)}>
                                Edit
                            </button>
                        )}
                        <PrintFunc />
                        <button type="button" className="submit-btn" onClick={onNew}>
                            New order
                        </button>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <form className="admin-panel sale-form" onSubmit={handleSubmit} noValidate>
            <div className="sale-fields">
                <SaleText id="sale-name" label="Customer name" maxLength={MAX_NAME}
                    value={fields.name} onChange={set("name")} error={errors.name} />
                {/* someone the customer sent to collect the items for them; the loading crews hand them over to this person */}
                
                <CheckPicker id="sale-types" label="Type of order" placeholder="Choose one or more"
                    names={purpose.map((p) => p.name)}
                    value={fields.types} onChange={setTypes} error={errors.types} />
                <InvoiceFields invoices={fields.invoices} types={fields.types} errors={errors.invoices}
                    maxLength={MAX_INVOICE} max={MAX_INVOICES}
                    onChange={set("invoices")} onAdd={addInvoice} onRemove={removeInvoice} />
                <SaleText id="sale-salesman" label="Salesman name" narrow maxLength={MAX_SALESMAN}
                    value={fields.salesman} onChange={set("salesman")} error={errors.salesman} />
                <SaleText id="sale-runner" label="Runner name" optional maxLength={MAX_RUNNER}
                    placeholder="Input the name"
                    value={fields.runner} onChange={set("runner")} />
                <SaleText id="sale-receiver" label="Receiver name" optional maxLength={MAX_RECEIVER}
                    value={fields.receiver} onChange={set("receiver")} />
                <SaleSelect id="sale-payment" label="Payment status" narrow placeholder="Choose..."
                    options={paymentStatus.map((p) => p.type)}
                    value={fields.paymentStatus} onChange={set("paymentStatus")} error={errors.paymentStatus} />
                {/* when the customer came in to sales and when they left it */}
                <SaleTime id="sale-time-in" label="Time in (sales)" optional narrow
                    value={fields.salesTimeIn} onChange={set("salesTimeIn")} />
                <SaleTime id="sale-time-out" label="Time out (sales)" optional narrow
                    value={fields.salesTimeOut} onChange={set("salesTimeOut")} />
                {/* the loading crews that call the customer, one at a time, on the Loading page */}
                <CheckPicker id="sale-teams" label="Team name" optional placeholder="No team"
                    names={teams.map((t) => t.name)}
                    value={fields.teams} onChange={set("teams")} />
                <ReturningField
                    returning={fields.returning}
                    pickupDate={fields.pickupDate}
                    onReturning={set("returning")}
                    onPickupDate={set("pickupDate")}
                    error={errors.pickupDate}
                />
            </div>

            <OrderSummary fields={fields} ticket={editing ? submitted : null} />

            <div className="sale-actions">
                {submitError && <p className="field-error" role="alert">{submitError}</p>}
                {/* while editing, sending again updates the same ticket */}
                <button type="submit" className="submit-btn" disabled={submitting}>
                    {submitting ? "Sending..." : editing ? "Update" : "Serve"}
                </button>
                <p className="submit-hint">
                    The ticket shows once it's {editing ? "updated" : "served"}; print it from there.
                </p>
            </div>
        </form>
    );
}
