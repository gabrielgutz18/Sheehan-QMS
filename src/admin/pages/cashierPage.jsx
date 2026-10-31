import { useState } from 'react';
import '../style/orderStatus.css';
import '../style/cashier.css';

import useOrders from '../hooks/useOrders.js';
import { useAuth } from '../auth/authContext.js';
import { listPayments, updatePayment } from '../api/adminOrderController.js';
import Greetings from '../components/common/greetings.jsx';
import { stageOf, whereNow } from '../data/orderStage.js';
import { INVOICE_COLUMNS, invoicesByColumn, sheetDate } from '../data/sheetColumns.js';
import formatQueueNum from '../../data/queueNum.js';
import paymentStatus from '../../data/paymentStatus.js';

// sales take new orders all day, so it fetches again as often as the Order sheet does
const REFRESH_MS = 5000;

const PAYMENTS = paymentStatus.map((p) => p.type);
// the buttons along the top, each with how many orders it has: every order, each payment status, or none picked yet
const FILTERS = [
    { value: "all", label: "All", shows: () => true },
    ...PAYMENTS.map((type) => ({ value: type, label: type, shows: (order) => order.paymentStatus === type })),
    { value: "none", label: "Not set", shows: (order) => !order.paymentStatus },
];

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const changeFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose, o.priority);

// "Juan", "RT 03" or "3" finds the order, so does an invoice number, and "Oct-24" every order that day
const matches = (order, search) => {
    const text = search.trim().toLowerCase();
    if (!text) return true;
    return order.name.toLowerCase().includes(text) || ticketOf(order).toLowerCase().includes(text) ||
        String(order.queueNum) === text || sheetDate(order.createdAt).toLowerCase().includes(text) ||
        order.invoices.some(({ invoiceNo }) => invoiceNo.toLowerCase().includes(text));
};

// the invoice numbers under their department, as on the Order sheet
function Invoices({ order }) {
    const invoices = invoicesByColumn(order);
    const columns = INVOICE_COLUMNS.filter(({ key }) => invoices[key].length > 0);
    if (columns.length === 0) return <span className="cashier-none">No invoices</span>;
    return (
        <dl className="cashier-invoices">
            {columns.map(({ key, header }) => (
                <div key={key}>
                    <dt>{header}</dt>
                    <dd>{invoices[key].map((invoiceNo) => <span key={invoiceNo}>{invoiceNo}</span>)}</dd>
                </div>
            ))}
        </dl>
    );
}

// one tap on how the order is paid; the one it is now is pressed, and an order's own status the list no longer has
// still shows
function PaymentButtons({ order, busy, onPick }) {
    const choices = order.paymentStatus && !PAYMENTS.includes(order.paymentStatus)
        ? [order.paymentStatus, ...PAYMENTS] : PAYMENTS;
    return (
        <div className="cashier-payments" role="group" aria-label={`Payment status for ${ticketOf(order)}`}>
            {choices.map((type) => (
                <button key={type} type="button" className={`cashier-payment is-${type.toLowerCase()}`}
                    aria-pressed={order.paymentStatus === type} disabled={busy}
                    onClick={() => onPick(type)}>
                    {type}
                </button>
            ))}
        </div>
    );
}

// the Cashier page (the cashier's, and sales staff's too): every order from every day (as on the Order sheet: no Customer Reports), newest day first, with
// what the customer bought (the invoice numbers under their department), the salesman, where the customer is now and
// how the order is paid; the cashier or a salesman changes that with one tap (Vale, COD, Terms, Paid, ... from
// src/data/paymentStatus.js), saved at once and kept on the ticket as an edit with who made it, and the last change
// shows on the row; it can be changed again but not cleared, and nothing else here calls, changes or saves an order
export default function CashierPage() {
    const { user } = useAuth();
    const { orders, setOrders, loading, error, changed } = useOrders({ refreshMs: REFRESH_MS, list: listPayments });
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    // the orders whose change is on its way
    const [busy, setBusy] = useState(() => new Set());
    const [savedOnce, setSavedOnce] = useState(false);
    const [saveError, setSaveError] = useState("");

    const { shows } = FILTERS.find((f) => f.value === filter);
    const visible = orders.filter((o) => shows(o) && matches(o, search));
    // by id, since queue numbers repeat every day
    const put = (id, change) => setOrders((prev) => prev.map((o) => (o.id === id ? change(o) : o)));
    const mark = (id, on) => setBusy((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
    });

    // shows the new status straight away, and puts the old one back if it doesn't save
    const pick = async (order, type) => {
        const before = order.paymentStatus;
        if (type === before) return;
        setSaveError("");
        mark(order.id, true);
        changed();
        put(order.id, (o) => ({ ...o, paymentStatus: type }));
        try {
            const saved = await updatePayment(order.id, type);
            put(order.id, () => saved);
            setSavedOnce(true);
        } catch (err) {
            put(order.id, (o) => ({ ...o, paymentStatus: before }));
            setSaveError(`Couldn't change the payment status for ${ticketOf(order)}: ${err.message}`);
        } finally {
            changed();
            mark(order.id, false);
        }
    };

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">Cashier</h1>
                <Greetings name={user.firstName || user.name} role={user.role} />
            </div>

            <div className="admin-panel cashier">
                <div className="cashier-head">
                    <p className="tab-hint">
                        Every day's orders, newest first. Tap how an order is paid to change it; it saves at once and
                        shows on the ticket with your name.
                    </p>
                    <p className="order-sheet-status" role="status">
                        {busy.size > 0 ? "Saving..." : savedOnce ? "All changes saved" : ""}
                    </p>
                </div>

                <div className="order-status-tools">
                    <div className="order-status-filters" role="group" aria-label="Show">
                        {FILTERS.map(({ value, label, shows: inFilter }) => (
                            <button key={value} type="button" className="status-chip" aria-pressed={filter === value}
                                onClick={() => setFilter(value)}>
                                {label}
                                <span className="status-chip-count">{orders.filter(inFilter).length}</span>
                            </button>
                        ))}
                    </div>
                    <input type="search" className="order-status-search" placeholder="Name, number, invoice or date"
                        aria-label="Search by customer name, ticket number, invoice number or date"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)} />
                </div>

                {(saveError || error) && (
                    <p className="field-error" role="alert">{saveError || `Couldn't refresh the orders: ${error}`}</p>
                )}

                {loading ? (
                    <p className="admin-status">Loading the orders...</p>
                ) : visible.length === 0 ? (
                    <p className="order-status-empty">{orders.length === 0 ? "No orders yet." : "No orders match."}</p>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table cashier-table">
                            <thead>
                                <tr>
                                    <th scope="col">Ticket</th>
                                    <th scope="col">Customer</th>
                                    <th scope="col">Invoices</th>
                                    <th scope="col">Where now</th>
                                    <th scope="col">Payment status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((o) => (
                                    <tr key={o.id}>
                                        <th scope="row" data-label="Ticket">
                                            <strong className="order-status-ticket">{ticketOf(o)}</strong>
                                            <span className="order-status-sub">
                                                {o.isToday ? "Today" : sheetDate(o.createdAt)} · {timeFormat.format(new Date(o.createdAt))}
                                            </span>
                                        </th>
                                        <td data-label="Customer">
                                            {o.name}
                                            <span className="order-status-sub">
                                                {[o.salesman && `Salesman: ${o.salesman}`, o.team].filter(Boolean).join(" · ") || o.purpose}
                                            </span>
                                        </td>
                                        <td data-label="Invoices"><Invoices order={o} /></td>
                                        <td data-label="Where now">
                                            <span className={`stage-badge is-${stageOf(o)}`}>{whereNow(o)}</span>
                                        </td>
                                        <td data-label="Payment status">
                                            <PaymentButtons order={o} busy={busy.has(o.id)} onPick={(type) => pick(o, type)} />
                                            {o.paymentChange && (
                                                <span className="cashier-change">
                                                    Changed by <strong>{o.paymentChange.by.name}</strong> · {changeFormat.format(new Date(o.paymentChange.at))}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
