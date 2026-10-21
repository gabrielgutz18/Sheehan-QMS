import { useState } from 'react';
import '../../style/customerOrder.css';

import Receipt from '../../components/receipt.jsx';
import { NameField, PurposeDropdown, OrderField } from '../../components/fields.jsx';
import CustomerReport from '../../components/customerReport.jsx';
import formatQueueNum from '../../data/queueNum.js';
import newId from '../../data/newId.js';
import { ROOFING_PURPOSE } from '../../data/roofingColors.js';
import { MAX_CONCERN, REPORT_PURPOSE } from '../../data/customerReport.js';
import { createOrder, updateOrder } from '../../api/orderController.js';
import PrintFunc from '../../printing/printFunc.jsx';

const newOrder = () => ({ id: newId(), item: "", qty: 0, color: "" });

// staff (admin or sales) take a customer's name, purpose and items, or a concern for a Customer Report;
// the backend gives the ticket its queue number and it prints straight away, the same as the old kiosk
export default function CustomerOrderPage() {
    const [name, setName] = useState("");
    const [purpose, setPurpose] = useState("");
    const [orders, setOrders] = useState([newOrder()]);
    // a Customer Report asks for a concern instead of items; both are kept while the purpose is switched
    const [concern, setConcern] = useState("");
    const [errors, setErrors] = useState({});
    const [submitted, setSubmitted] = useState(null);
    const [editing, setEditing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    // fields show before the first submit and while editing; the receipt shows otherwise
    const showForm = !submitted || editing;
    const isReport = purpose === REPORT_PURPOSE;

    const validate = () => {
        const next = {};
        if (!name.trim()) next.name = "Please enter the customer's name.";
        if (!purpose) next.purpose = "Please choose a purpose.";
        if (isReport) {
            if (!concern.trim()) next.concern = "Please enter the customer's concern.";
            else if (concern.trim().length > MAX_CONCERN) next.concern = `Please keep it under ${MAX_CONCERN} characters.`;
            return next;
        }
        const filled = orders.filter((o) => o.item.trim());
        if (filled.length === 0) next.orders = "Please add at least one order.";
        else if (filled.some((o) => o.qty < 1)) next.orders = "Each order needs a quantity of at least 1.";
        return next;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        const next = validate();
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        const payload = isReport
            ? { name: name.trim(), purpose, orders: [], concern: concern.trim() }
            : {
                name: name.trim(),
                purpose,
                orders: orders
                    .filter((o) => o.item.trim())
                    // colors only apply to roofing; any picked before switching purpose are dropped
                    .map(({ item, qty, color }) => ({
                        item: item.trim(),
                        qty,
                        ...(purpose === ROOFING_PURPOSE && color && { color }),
                    })),
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

    // clear a field's error as soon as the user edits it
    const withClear = (setter, key) => (value) => {
        setter(value);
        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

    const resetForm = () => {
        setName("");
        setPurpose("");
        setOrders([newOrder()]);
        setConcern("");
        setErrors({});
        setSubmitError("");
        setSubmitted(null);
        setEditing(false);
    };

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">Customer order</h1>
            </div>

            <div className="admin-panel order-panel">
                {showForm ? (
                    <form className="order-card" onSubmit={handleSubmit} noValidate>
                        <NameField value={name} onChange={withClear(setName, "name")} error={errors.name} />
                        <PurposeDropdown value={purpose} onChange={withClear(setPurpose, "purpose")} error={errors.purpose} />
                        {isReport ? (
                            <CustomerReport value={concern} onChange={withClear(setConcern, "concern")} error={errors.concern} />
                        ) : (
                            <OrderField orders={orders} purpose={purpose} onChange={withClear(setOrders, "orders")} error={errors.orders} />
                        )}

                        {submitError && <p className="field-error" role="alert">{submitError}</p>}

                        {/* while editing, re-submitting updates the same ticket */}
                        <button type="submit" className="submit-btn" disabled={submitting}>
                            {submitting ? "Sending..." : editing ? "Update" : "Submit"}
                        </button>
                        <p className="submit-hint">The ticket prints as soon as it's submitted.</p>
                    </form>
                ) : (
                    // ticket on the left, actions beside it
                    <section className="receipt-section">
                        <Receipt
                            queueNumber={formatQueueNum(submitted.queueNum, submitted.purpose)}
                            name={submitted.name}
                            purpose={submitted.purpose}
                            orders={submitted.orders}
                            concern={submitted.concern}
                        />
                        <div className="receipt-actions">
                            <button type="button" className="submit-btn" onClick={() => setEditing(true)}>
                                Edit
                            </button>
                            <PrintFunc ticket={submitted} />
                            <button type="button" className="submit-btn" onClick={resetForm}>
                                New order
                            </button>
                        </div>
                    </section>
                )}
            </div>
        </section>
    );
}
