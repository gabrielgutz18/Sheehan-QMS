import { useState } from "react";
import "../style/orderStatus.css";
import "../style/cashier.css";

import useOrders from "../hooks/useOrders.js";
import { useAuth } from "../auth/authContext.js";
import { listPayments, updatePayment } from "../api/adminOrderController.js";
import CashierTable from "../components/cashier/cashierTable.jsx";
import Greetings from "../components/common/greetings.jsx";
import PageTabs from "../components/common/pageTabs.jsx";
import { NO_PRODUCT, groupsByProduct, ticketCount } from "../data/productGroups.js";
import { sheetDate } from "../data/sheetColumns.js";
import formatQueueNum from "../../data/queueNum.js";
import paymentStatus from "../../data/paymentStatus.js";

// sales take new orders all day, so it fetches again as often as the Order sheet does
const REFRESH_MS = 5000;

// the buttons along the top, each with how many orders it has: every order, each payment status, or none picked yet
const FILTERS = [
    { value: "all", label: "All", shows: () => true },
    ...paymentStatus.map(({ type }) => ({ value: type, label: type, shows: (order) => order.paymentStatus === type })),
    { value: "none", label: "Not set", shows: (order) => !order.paymentStatus },
];

const ALL_PRODUCTS = "all";

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose, o);

const clean = (search) => search.trim().toLowerCase();

const matchesTicket = (order, text) =>
    order.name.toLowerCase().includes(text) ||
    ticketOf(order).toLowerCase().includes(text) ||
    String(order.queueNum) === text ||
    sheetDate(order.createdAt).toLowerCase().includes(text);

const hasInvoice = (invoices, text) => invoices.some(({ invoiceNo }) => invoiceNo.toLowerCase().includes(text));

// "Juan", "RT 03" or "3" finds the order, so does an invoice number, and "Oct-24" every order that day
const matches = (order, search) => {
    const text = clean(search);
    return !text || matchesTicket(order, text) || hasInvoice(order.invoices, text);
};

// on the By product tab an invoice number finds only the group it's in, not every group on its ticket
const lineMatches = ({ order, invoices }, search) => {
    const text = clean(search);
    return !text || matchesTicket(order, text) || hasInvoice(invoices, text);
};

// the Cashier page: every order from every day (as on the Order sheet: no Customer Reports), newest day first, with
// what the customer bought (the invoice numbers under their department), the salesman and where the customer is now;
// sales staff, admins and the cashier, when the salesman isn't around, change how the order is paid with one tap (Vale,
// COD, Terms, Paid, ... from src/data/paymentStatus.js), saved at once and kept on the ticket as an edit with who made
// it, and the last change shows on the row with their role; it can be changed again but not cleared, and nothing else
// here calls, changes or saves an order
// two tabs (?tab=products) over the same orders: Orders, and By product, each type of order on its own; the payment
// filter and the search carry across, as they live here and not in the tabs
export default function CashierPage() {
    const { user } = useAuth();
    const { orders, setOrders, loading, error, updatedAt, changed } = useOrders({
        refreshMs: REFRESH_MS,
        list: listPayments,
    });
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [product, setProduct] = useState(ALL_PRODUCTS);
    // the orders whose change is on its way
    const [busy, setBusy] = useState(() => new Set());
    const [savedOnce, setSavedOnce] = useState(false);
    const [saveError, setSaveError] = useState("");

    const { shows } = FILTERS.find((f) => f.value === filter);
    const visible = orders.filter((o) => shows(o) && matches(o, search));
    const groups = groupsByProduct(visible).map(({ name, lines }) => ({
        name,
        lines: lines.filter((line) => lineMatches(line, search)),
    }));
    const shownGroups = groups.filter(
        ({ name, lines }) => lines.length > 0 && (product === ALL_PRODUCTS || product === name),
    );
    // by id, since queue numbers repeat every day
    const put = (id, change) => setOrders((prev) => prev.map((o) => (o.id === id ? change(o) : o)));
    const mark = (id, on) =>
        setBusy((prev) => {
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

    const table = (lines, byProduct = false) => (
        <CashierTable lines={lines} byProduct={byProduct} busy={busy} onPick={pick} />
    );

    const nothingFound = orders.length === 0 ? "No orders yet." : "No orders match.";

    const ordersTab =
        visible.length === 0 ? (
            <p className="order-status-empty">{nothingFound}</p>
        ) : (
            table(visible.map((order) => ({ order })))
        );

    const productsTab =
        shownGroups.length === 0 ? (
            <p className="order-status-empty">
                {orders.length > 0 && product !== ALL_PRODUCTS ? `No ${product} orders match.` : nothingFound}
            </p>
        ) : (
            <div className="cashier-groups">
                {shownGroups.map(({ name, lines }) => (
                    <section key={name} className="cashier-group" aria-label={name}>
                        <h2 className="cashier-group-title">
                            {name}
                            <span className="cashier-group-count">
                                {lines.length} {lines.length === 1 ? "order" : "orders"}
                            </span>
                        </h2>
                        {table(lines, true)}
                    </section>
                ))}
            </div>
        );

    const chip = (value, label, count) => (
        <button
            key={value}
            type="button"
            className="status-chip"
            aria-pressed={product === value}
            onClick={() => setProduct(value)}
        >
            {label}
            <span className="status-chip-count">{count}</span>
        </button>
    );

    // what both tabs share; No product only has a button once there's something under it
    // By product says in words what each row of buttons is for, as it has two of them one above the other
    const board = (hint, body, productChips = null) => (
        <div className={`admin-panel cashier${productChips ? " is-by-product" : ""}`}>
            <div className="cashier-head">
                <p className="tab-hint">{hint}</p>
                <div className="cashier-head-status">
                    <p className="order-sheet-status" role="status">
                        {busy.size > 0 ? "Saving..." : savedOnce ? "All changes saved" : ""}
                    </p>
                    {updatedAt && (
                        <p className={`order-status-live${error ? " is-stale" : ""}`}>
                            {error ? "Not updating" : "Live"} · as of {clockFormat.format(updatedAt)}
                        </p>
                    )}
                </div>
            </div>

            {productChips}

            <div className="order-status-tools">
                {productChips && <p className="cashier-filter-label">Payment status</p>}
                <div className="order-status-filters" role="group" aria-label="Show">
                    {FILTERS.map(({ value, label, shows: inFilter }) => (
                        <button
                            key={value}
                            type="button"
                            className="status-chip"
                            aria-pressed={filter === value}
                            onClick={() => setFilter(value)}
                        >
                            {label}
                            <span className="status-chip-count">{orders.filter(inFilter).length}</span>
                        </button>
                    ))}
                </div>
                <input
                    type="search"
                    className="order-status-search"
                    placeholder="Name, number, invoice or date"
                    aria-label="Search by customer name, ticket number, invoice number or date"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {(saveError || error) && (
                <p className="field-error" role="alert">
                    {saveError || `Couldn't refresh the orders: ${error}`}
                </p>
            )}

            {loading ? <p className="admin-status">Loading the orders...</p> : body}
        </div>
    );

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">Cashier</h1>
                <Greetings name={user.firstName || user.name} role={user.role} />
            </div>

            <div>
                <PageTabs
                    label="Cashier orders"
                    tabs={[
                        {
                            key: "orders",
                            label: "Orders",
                            page: board(
                                "Every day's orders, newest first. Tap how an order is paid to change it; it saves at once and shows on the ticket with your name.",
                                ordersTab,
                            ),
                        },
                        {
                            key: "products",
                            label: "By product",
                            page: board(
                                "Each product has its own list. An order with several products is in each of their lists, with one payment status for the whole order.",
                                productsTab,
                                <div className="cashier-filter">
                                    <p className="cashier-filter-label">Product</p>
                                    <div
                                        className="order-status-filters cashier-products"
                                        role="group"
                                        aria-label="Product"
                                    >
                                        {chip(ALL_PRODUCTS, "All products", ticketCount(groups))}
                                        {groups
                                            .filter(
                                                ({ name, lines }) =>
                                                    name !== NO_PRODUCT || lines.length > 0 || product === NO_PRODUCT,
                                            )
                                            .map(({ name, lines }) => chip(name, name, lines.length))}
                                    </div>
                                </div>,
                            ),
                        },
                    ]}
                />
            </div>
        </section>
    );
}
