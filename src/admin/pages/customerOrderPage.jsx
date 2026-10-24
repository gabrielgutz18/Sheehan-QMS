import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import '../../style/customerOrder.css';

import Receipt from '../../components/receipt.jsx';
import {
    CheckPicker, InvoiceFields, ReturningField, SaleSelect, SaleTabs, SaleText, SaleTime,
} from '../components/saleFields.jsx';
import CheckerSection from './checkerSection.jsx';
import LifeCycleTable from '../../components/lifeCycleStatus/lifecyle.jsx';
import { BOARD_DOCKS } from '../components/orderStatusDrawer.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';
import OrderSummary from '../components/orderSummary.jsx';
import TicketPicker from '../components/ticketPicker.jsx';
import { useAuth } from '../auth/authContext.js';
import formatQueueNum from '../../data/queueNum.js';
import { joinList, splitList } from '../../data/list.js';
import purpose from '../../data/purpose.js';
import paymentStatus from '../../data/paymentStatus.js';
import teams from '../../data/teams.js';

const teamNames = teams.map((t) => t.name);
import checkerColumns, { CHECKER_ROUNDS } from '../../data/checkers.js';
import { createOrder } from '../../api/orderController.js';
import { getOrder, updateOrder } from '../api/adminOrderController.js';
import EditedBy from '../components/editedBy.jsx';
import OrderSheet from '../components/orderSheet.jsx';
import PrintFunc from '../../printing/printFunc.jsx';

// must match the backend (server/api.js)
const MAX_NAME = 100;
const MAX_INVOICE = 30;
const MAX_INVOICES = 20;
const MAX_SALESMAN = 60;
const MAX_CHECKER = 60;

// the two halves of the page: taking a customer's order for their queue ticket, and the Order sheet with every order
// today, which every sales staff member works on together
const VIEWS = [
    { value: "ticket", label: "Queue ticket" },
    { value: "sheet", label: "Order sheet" },
];

// the tabs along the top of the form: the order itself, the checkers printed on the ticket, and the ticket as it
// will print
const DESK_TABS = [
    { id: "sale-tab-order", label: "Order" },
    { id: "sale-tab-checker", label: "Checker" },
    { id: "sale-tab-preview", label: "Ticket preview" },
];

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
    salesTimeIn: saved?.salesTimeIn ?? "",
    salesTimeOut: saved?.salesTimeOut ?? "",
    // every column's 1st and 2nd checker, "" until it's filled in
    checkers: Object.fromEntries(checkerColumns.map(({ name }) =>
        [name, CHECKER_ROUNDS.map((_, i) => saved?.checkers?.[name]?.[i] ?? "")])),
    paymentStatus: saved?.paymentStatus ?? "",
    // one sales team; a ticket from before had a list, which has to be picked again
    team: teamNames.includes(saved?.team) ? saved.team : "",
    returning: Boolean(saved?.pickupDate),
    pickupDate: saved?.pickupDate ?? "",
});

// what Serve sends: the form as it is now; submitted is the ticket being edited, if any
// the runner and receiver are left out: they're filled in on the Order sheet, and Update keeps them as they are
const orderFrom = (fields, submitted) => ({
    name: fields.name.trim(),
    purpose: joinList(fields.types),
    // the invoices list what they bought; a ticket taken before keeps the items it was taken with
    orders: submitted?.orders ?? [],
    invoices: fields.invoices.map(({ invoiceNo, type }) => ({ invoiceNo: invoiceNo.trim(), type })),
    salesman: fields.salesman.trim(),
    salesTimeIn: fields.salesTimeIn,
    salesTimeOut: fields.salesTimeOut,
    checkers: Object.fromEntries(Object.entries(fields.checkers).map(([column, names]) =>
        [column, names.map((name) => name.trim())])),
    paymentStatus: fields.paymentStatus,
    team: fields.team,
    pickupDate: fields.returning ? fields.pickupDate : null,
});

// the ticket Receipt shows for the form as it is now (Ticket preview); a new order gets its number with Serve, so it
// shows as "R --" until then
const previewOf = (fields, submitted) => {
    const order = orderFrom(fields, submitted);
    return {
        ...order,
        queueNumber: formatQueueNum(submitted?.queueNum ?? "--", order.purpose || submitted?.purpose),
        invoices: order.invoices.filter((invoice) => invoice.invoiceNo),
        concern: submitted?.concern,
    };
};

// staff (admin or sales) take a customer's order: their name, the types of order, the invoices (each with the type of
// order it's for), the salesman, how it's paid, the times the customer came in to sales and left it (if typed in), the sales team that served them (it
// stays theirs after the hand-over to loading), and for a customer coming back for the items on a later day, that
// day; the Checker tab takes the
// checkers, which the ticket always has, blank to be written in by hand, and Ticket preview shows the ticket exactly
// as it will print; Serve gives the ticket its queue number and shows it, and Print ticket opens the print preview to
// pick the printer
// the sales times are kept for staff only: they're never on the ticket
// the Order sheet beside Queue ticket lists every order today with all its details, like a shared spreadsheet: any
// sales staff member fills in the runner the customer sent to collect the items and the receiver there (never on the
// ticket either), and can change the payment status and sales team, each cell saved and kept as an edit on its own
// ?ticket=5 opens today's ticket 5 to edit it (Edit on Orders); ?ticket=5&view=1 shows its ticket to print it again
// (View queue ticket here, or View ticket on Orders)
// beside it all on the right, the Order status board: where every customer today is (in a narrower window, the top
// bar's Order status drawer opens it)
export default function CustomerOrderPage() {
    const [params, setParams] = useSearchParams();
    const ticket = Number(params.get("ticket")) || null;
    const viewing = params.get("view") === "1";
    // the ticket ?ticket= asks for, once it's loaded: { ticket, order } or { ticket, error }
    const [opened, setOpened] = useState(null);
    // New order starts the form over
    const [round, setRound] = useState(0);
    // the Order sheet keeps the form as it is underneath, so switching back finds it as it was left
    const [view, setView] = useState("ticket");
    const boardDocks = useMediaQuery(BOARD_DOCKS);

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

    // a ticket from View queue ticket or the sheet's Open, on the Queue ticket tab
    const openTicket = (queueNum, params) => {
        setParams({ ticket: String(queueNum), ...params });
        setView("ticket");
    };

    const loaded = ticket && opened?.ticket === ticket ? opened : null;

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">Customer order</h1>
                <div className="video-tabs desk-views" role="radiogroup" aria-label="Show">
                    {VIEWS.map(({ value, label }) => (
                        <button key={value} type="button" role="radio" aria-checked={view === value} className="video-tab"
                            onClick={() => setView(value)}>
                            {label}
                        </button>
                    ))}
                </div>
                <TicketPicker current={ticket} onView={(queueNum) => openTicket(queueNum, { view: "1" })} />
            </div>

            {view === "sheet" && <OrderSheet onOpen={(queueNum) => openTicket(queueNum)} />}

            {/* hidden, not taken away, while the sheet shows: a half-filled form is still there to come back to */}
            <div className={`desk-layout${boardDocks ? " has-status" : ""}`} hidden={view !== "ticket"}>
                <div className="desk-main">
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
                </div>

                {/* every order today and where its customer is, the same board every counter and crew sees; in a
                    narrower window, the top bar's Order status drawer opens it instead */}
                {boardDocks && (
                    <aside className="admin-panel desk-status">
                        <LifeCycleTable compact />
                    </aside>
                )}
            </div>
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
    const [tab, setTab] = useState(DESK_TABS[0].id);

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
        // every field that can be wrong is on the Order tab, so that's where to look
        if (Object.keys(next).length > 0) {
            setTab("sale-tab-order");
            return;
        }

        const payload = orderFrom(fields, submitted);

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
                    {/* on its paper, exactly as it prints */}
                    <div className="ticket-sheet">
                        <Receipt
                            paper
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
                            checkers={submitted.checkers}
                        />
                    </div>
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
                        {/* who last saved a change to it, and when; never printed */}
                        <EditedBy edits={submitted.edits} />
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="sale-card">
            <SaleTabs label="Customer order" tabs={DESK_TABS} current={tab} onChange={setTab} />
            <form className="admin-panel sale-form" onSubmit={handleSubmit} noValidate>
                <div id="sale-tab-order-panel" className="sale-fields" role="tabpanel" aria-labelledby="sale-tab-order"
                    hidden={tab !== "sale-tab-order"}>
                    <SaleText id="sale-name" label="Customer name" maxLength={MAX_NAME}
                        value={fields.name} onChange={set("name")} error={errors.name} />
                    <CheckPicker id="sale-types" label="Type of order" placeholder="Choose one or more"
                        names={purpose.map((p) => p.name)}
                        value={fields.types} onChange={setTypes} error={errors.types} />
                    <InvoiceFields invoices={fields.invoices} types={fields.types} errors={errors.invoices}
                        maxLength={MAX_INVOICE} max={MAX_INVOICES}
                        onChange={set("invoices")} onAdd={addInvoice} onRemove={removeInvoice} />
                    <SaleText id="sale-salesman" label="Salesman name" narrow maxLength={MAX_SALESMAN}
                        value={fields.salesman} onChange={set("salesman")} error={errors.salesman} />
                    <SaleSelect id="sale-payment" label="Payment status" narrow placeholder="Choose..."
                        options={paymentStatus.map((p) => p.type)}
                        value={fields.paymentStatus} onChange={set("paymentStatus")} error={errors.paymentStatus} />
                    {/* when the customer came in to sales and when they left it */}
                    <SaleTime id="sale-time-in" label="Time in (sales)" optional narrow
                        value={fields.salesTimeIn} onChange={set("salesTimeIn")} />
                    <SaleTime id="sale-time-out" label="Time out (sales)" optional narrow
                        value={fields.salesTimeOut} onChange={set("salesTimeOut")} />
                    {/* the sales team serving the customer; handing them over to loading doesn't change it */}
                    <SaleSelect id="sale-team" label="Sales team" optional narrow placeholder="No team"
                        options={teamNames}
                        value={fields.team} onChange={set("team")} />
                    <ReturningField
                        returning={fields.returning}
                        pickupDate={fields.pickupDate}
                        onReturning={set("returning")}
                        onPickupDate={set("pickupDate")}
                        error={errors.pickupDate}
                    />
                </div>

                <div id="sale-tab-checker-panel" role="tabpanel" aria-labelledby="sale-tab-checker"
                    hidden={tab !== "sale-tab-checker"}>
                    <CheckerSection value={fields.checkers} onChange={set("checkers")} maxLength={MAX_CHECKER} />
                </div>

                {/* the ticket on its paper, as it will print, filled in from the other two tabs */}
                <div id="sale-tab-preview-panel" className="ticket-preview" role="tabpanel"
                    aria-labelledby="sale-tab-preview" hidden={tab !== "sale-tab-preview"}>
                    {tab === "sale-tab-preview" && (
                        <>
                            <p className="tab-hint">
                                The ticket as it prints, on its 90 × 148 mm page.
                                {!submitted && " It gets its queue number when you press Serve."}
                            </p>
                            <div className="ticket-sheet">
                                <Receipt paper {...previewOf(fields, submitted)} />
                            </div>
                        </>
                    )}
                </div>

                {/* the preview already shows it all, on the ticket itself */}
                {tab !== "sale-tab-preview" && <OrderSummary fields={fields} ticket={editing ? submitted : null} />}

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
        </div>
    );
}
