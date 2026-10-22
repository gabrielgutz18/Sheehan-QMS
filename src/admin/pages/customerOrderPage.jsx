import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import '../../style/customerOrder.css';

import Receipt from '../../components/receipt.jsx';
import { CheckPicker, ReturningField, SaleSelect, SaleText } from '../components/saleFields.jsx';
import OrderSummary from '../components/orderSummary.jsx';
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
const MAX_SALESMAN = 60;

// the form for a saved ticket, or a blank one with the signed-in staff member as the salesman
const fieldsFor = (saved, salesman) => ({
    name: saved?.name ?? "",
    types: splitList(saved?.purpose),
    invoiceNo: saved?.invoiceNo ?? "",
    salesman: saved ? saved.salesman ?? "" : salesman,
    paymentStatus: saved?.paymentStatus ?? "",
    teams: splitList(saved?.team),
    returning: Boolean(saved?.pickupDate),
    pickupDate: saved?.pickupDate ?? "",
});

// staff (admin or sales) take a customer's order: their name, the types of order, the invoice, the salesman, how
// it's paid, the loading teams that call them on the Loading page, and for a customer coming back for the items on
// a later day, that day; Serve gives the ticket its queue number and prints it
// ?ticket=5 opens today's ticket 5 to edit it (Edit on Orders)
export default function CustomerOrderPage() {
    const [params, setParams] = useSearchParams();
    const ticket = Number(params.get("ticket")) || null;
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
            </div>

            {ticket && !loaded ? (
                <p className="admin-status">Opening the ticket...</p>
            ) : loaded?.error ? (
                <div className="admin-panel sale-missing">
                    <p className="field-error" role="alert">Couldn't open ticket {ticket}: {loaded.error}</p>
                    <button type="button" className="admin-btn" onClick={startNew}>Take a new order</button>
                </div>
            ) : (
                <OrderDesk key={`${ticket ?? "new"}-${round}`} saved={loaded?.order ?? null} onNew={startNew} />
            )}
        </section>
    );
}

// the form, then the printed ticket with Edit, Print again and New order
// saved: a ticket opened to edit, or null for a new order
function OrderDesk({ saved, onNew }) {
    const { user } = useAuth();
    const [fields, setFields] = useState(() => fieldsFor(saved, user?.name ?? ""));
    const [errors, setErrors] = useState({});
    const [submitted, setSubmitted] = useState(saved);
    const [editing, setEditing] = useState(Boolean(saved));
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    // fields show before the first Serve and while editing; the ticket shows otherwise
    const showForm = !submitted || editing;

    // change one field, clearing its error as soon as it's edited
    const set = (key) => (value) => {
        setFields((prev) => ({ ...prev, [key]: value }));
        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

    const validate = () => {
        const next = {};
        if (!fields.name.trim()) next.name = "Please enter the customer's name.";
        if (fields.types.length === 0) next.types = "Please choose at least one type of order.";
        if (!fields.invoiceNo.trim()) next.invoiceNo = "Please enter the invoice number.";
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
            // the invoice lists what they bought; a ticket taken before keeps the items it was taken with
            orders: submitted?.orders ?? [],
            invoiceNo: fields.invoiceNo.trim(),
            salesman: fields.salesman.trim(),
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
                        invoiceNo={submitted.invoiceNo}
                        paymentStatus={submitted.paymentStatus}
                        salesman={submitted.salesman}
                        team={submitted.team}
                        pickupDate={submitted.pickupDate}
                    />
                    <div className="receipt-actions">
                        <button type="button" className="submit-btn" onClick={() => setEditing(true)}>
                            Edit
                        </button>
                        <PrintFunc ticket={submitted} />
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
                <CheckPicker id="sale-types" label="Type of order" placeholder="Choose one or more"
                    names={purpose.map((p) => p.name)}
                    value={fields.types} onChange={set("types")} error={errors.types} />
                <SaleText id="sale-invoice" label="Invoice number" maxLength={MAX_INVOICE} placeholder="e.g. 2223"
                    value={fields.invoiceNo} onChange={set("invoiceNo")} error={errors.invoiceNo} />
                <SaleText id="sale-salesman" label="Salesman name" narrow maxLength={MAX_SALESMAN}
                    value={fields.salesman} onChange={set("salesman")} error={errors.salesman} />
                <SaleSelect id="sale-payment" label="Payment status" narrow placeholder="Choose..."
                    options={paymentStatus.map((p) => p.type)}
                    value={fields.paymentStatus} onChange={set("paymentStatus")} error={errors.paymentStatus} />
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
                <p className="submit-hint">The ticket prints as soon as it's {editing ? "updated" : "served"}.</p>
            </div>
        </form>
    );
}
