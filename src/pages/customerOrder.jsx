import { useCallback, useEffect, useState } from 'react';
import '../style/customerOrder.css';

import Header from '../components/header.jsx';
import Receipt from '../components/receipt.jsx';
import Countdown from '../components/countdown.jsx';
import { NameField, PurposeDropdown, OrderField } from '../components/fields.jsx';
import CustomerReport from '../components/customerReport.jsx';
import formatQueueNum from '../data/queueNum.js';
import newId from '../data/newId.js';
import { ROOFING_PURPOSE } from '../data/roofingColors.js';
import { MAX_CONCERN, REPORT_PURPOSE } from '../data/customerReport.js';
import { createOrder, updateOrder } from '../api/orderController.js';
import PrintFunc from '../printing/printFunc.jsx';

const newOrder = () => ({ id: newId(), item: "", qty: 0, color: "" });

// after an order, the receipt stays up this long, then a thank-you shows before the form clears
const RECEIPT_SECONDS = 30;
const THANK_YOU_MS = 5000;

export default function CustomerOrder() {
    const [name, setName] = useState("");
    const [purpose, setPurpose] = useState("");
    const [orders, setOrders] = useState([newOrder()]);
    // a Customer Report asks for a concern instead of items; both are kept while the customer switches purpose
    const [concern, setConcern] = useState("");
    const [errors, setErrors] = useState({});
    const [submitted, setSubmitted] = useState(null);
    const [editing, setEditing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [thanking, setThanking] = useState(false);

    // fields show before the first submit and while editing; the receipt shows otherwise
    const showForm = !submitted || editing;
    const isReport = purpose === REPORT_PURPOSE;

    const validate = () => {
        const next = {};
        if (!name.trim()) next.name = "Please enter your name.";
        if (!purpose) next.purpose = "Please choose a purpose.";
        if (isReport) {
            if (!concern.trim()) next.concern = "Please tell us your concern.";
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

    const resetForm = useCallback(() => {
        setName("");
        setPurpose("");
        setOrders([newOrder()]);
        setConcern("");
        setErrors({});
        setSubmitError("");
        setSubmitted(null);
        setEditing(false);
        setThanking(false);
    }, []);

    const showThankYou = useCallback(() => setThanking(true), []);

    // hold the thank-you on screen, then hand the kiosk to the next customer
    useEffect(() => {
        if (!thanking) return;
        const id = setTimeout(resetForm, THANK_YOU_MS);
        return () => clearTimeout(id);
    }, [thanking, resetForm]);

    return (
        <div className="order-screen">
            <Header />

            <main className="order-page">
                {thanking ? (
                    <section className="thank-you" role="status">
                        <h1 className="thank-you-title">Thank you!</h1>
                        <p className="thank-you-text">Please wait for your number to be called.</p>
                    </section>
                ) : showForm ? (
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
                        <p className="submit-hint">
                            Please make sure to print your ticket after submitting your request. Thank you!
                        </p>
                    </form>
                ) : (
                    // ticket on the left, actions beside it, so the whole thing fits one screen
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
                            {/* restarts from the top whenever the receipt is shown again, e.g. after an edit */}
                            <Countdown seconds={RECEIPT_SECONDS} onDone={showThankYou} />
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
