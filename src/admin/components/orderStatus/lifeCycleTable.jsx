import { useId, useState } from 'react';
import '../../style/orderStatus.css';

import useOrderStatus from '../../hooks/useOrderStatus.js';
import { STAGES, stageOf, stepsOf, whereNow } from '../../data/orderStage.js';
import formatQueueNum from '../../../data/queueNum.js';
import { formatPickup } from '../../../data/pickupDate.js';
import teams from '../../../data/teams.js';

// the Order status board: every order today and where its customer is now (in line, at a sales counter, waiting for
// or at loading, or done), so every counter and the loading crew see the same thing; it refreshes by itself every few
// seconds
// beside Customer order (admin and sales), in the Order status drawer every other page opens from its top bar, and on
// the loading crews' Order status page
// heading: "h1" where it's the page itself, "h2" where it's a section of one
// compact: a card for each order instead of the table, for the narrow column beside Customer order and the drawer
// action: something more for the corner across from the heading, e.g. the drawer's close button
// list, title, details and startWith are for the Security page: what to fetch (see useOrderStatus), the heading, a
// component showing more of each order (what the customer bought, and the guard's check) in its own column or under
// the card, given the order and refresh() to fetch them all again, and the filter it opens on

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

// the buttons along the top, each with how many orders it has: the ones still going, each stage, or all of them
const FILTERS = [
    { value: "active", label: "In progress", shows: (stage) => stage !== "done" },
    ...STAGES.map(({ value, label }) => ({ value, label, shows: (stage) => stage === value })),
    { value: "all", label: "All", shows: () => true },
];

const STEP_MARKS = { done: "✓", now: "●", waiting: "" };
const STEP_STATES = { done: "done", now: "now", waiting: "not yet" };

// "Juan", "RT 03" or "3" finds the order, and so does an invoice number where the board has them (Security)
const matches = (order, search) => {
    const text = search.trim().toLowerCase();
    if (!text) return true;
    const ticket = formatQueueNum(order.queueNum, order.purpose, order).toLowerCase();
    return order.name.toLowerCase().includes(text) || ticket.includes(text) || String(order.queueNum) === text ||
        (order.invoices ?? []).some(({ invoiceNo }) => invoiceNo.toLowerCase().includes(text));
};

// the order's steps in turn: the sales counter, loading (once they're handed over), then done
function Steps({ order }) {
    return (
        <ol className="order-steps">
            {stepsOf(order).map(({ label, state }) => (
                <li key={label} className={`order-step is-${state}`}>
                    <span className="order-step-pill">
                        {STEP_MARKS[state] && <span aria-hidden="true">{STEP_MARKS[state]}</span>}
                        {label}
                        <span className="visually-hidden"> ({STEP_STATES[state]})</span>
                    </span>
                </li>
            ))}
        </ol>
    );
}

// a returning customer: they come back for the items that day
const Pickup = ({ order }) =>
    order.pickupDate && <span className="order-status-pickup">Picks up {formatPickup(order.pickupDate)}</span>;

export default function LifeCycleTable({
    heading = "h2", compact = false, action = null, list, title = "Order status", details: Details = null,
    startWith = "active",
}) {
    const { orders, loading, error, updatedAt, refresh } = useOrderStatus({ list });
    const [filter, setFilter] = useState(startWith);
    const [search, setSearch] = useState("");
    const [team, setTeam] = useState("");
    const titleId = useId();
    const Heading = heading;

    const staged = orders.map((order) => ({ order, stage: stageOf(order) }));
    const count = (shows) => staged.filter(({ stage }) => shows(stage)).length;
    const { shows } = FILTERS.find((f) => f.value === filter);
    const visible = staged.filter(({ order, stage }) =>
        shows(stage) && matches(order, search) && (!team || order.team === team));

    return (
        <section className={`order-status${compact ? " is-compact" : ""}`} aria-labelledby={titleId}>
            <div className="order-status-head">
                <Heading id={titleId} className={heading === "h1" ? "admin-title" : "order-status-title"}>
                    {title}
                </Heading>
                {updatedAt && (
                    <p className={`order-status-live${error ? " is-stale" : ""}`}>
                        {error ? "Not updating" : "Live"} · as of {clockFormat.format(updatedAt)}
                    </p>
                )}
                {action}
            </div>

            <div className="order-status-tools">
                <div className="order-status-filters" role="group" aria-label="Show">
                    {FILTERS.map(({ value, label, shows: inFilter }) => (
                        <button key={value} type="button" className="status-chip" aria-pressed={filter === value}
                            onClick={() => setFilter(value)}>
                            {label}
                            <span className="status-chip-count">{count(inFilter)}</span>
                        </button>
                    ))}
                </div>
                <input type="search" className="order-status-search"
                    placeholder={Details ? "Name, number or invoice" : "Search name or number"}
                    aria-label={Details ? "Search by customer name, ticket number or invoice number"
                        : "Search by customer name or ticket number"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)} />
                <select className="order-status-team" aria-label="Sales team" value={team}
                    onChange={(e) => setTeam(e.target.value)}>
                    <option value="">All teams</option>
                    {teams.map(({ name }) => <option key={name} value={name}>{name}</option>)}
                </select>
            </div>

            {error && (
                <p className="field-error" role="alert">
                    Couldn't refresh the orders: {error}
                    {updatedAt && ` These are as of ${clockFormat.format(updatedAt)}.`}
                </p>
            )}

            {loading ? (
                <p className="admin-status">Loading the orders...</p>
            ) : visible.length === 0 ? (
                <p className="order-status-empty">
                    {orders.length === 0 ? "No orders yet today." : "No orders match."}
                </p>
            ) : compact ? (
                <ul className="order-status-list">
                    {visible.map(({ order, stage }) => (
                        <li key={order.queueNum} className={`order-status-card is-${stage}`}>
                            <div className="order-status-card-head">
                                <strong className="order-status-ticket">
                                    {formatQueueNum(order.queueNum, order.purpose, order)}
                                </strong>
                                <span className="order-status-card-name">{order.name}</span>
                                <span className="order-status-sub">{timeFormat.format(new Date(order.createdAt))}</span>
                            </div>
                            <span className="order-status-sub">{order.purpose}</span>
                            <Pickup order={order} />
                            <span className={`stage-badge is-${stage}`}>{whereNow(order)}</span>
                            <Steps order={order} />
                            {Details && <Details order={order} refresh={refresh} />}
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table order-status-table">
                        <thead>
                            <tr>
                                <th scope="col">Ticket</th>
                                <th scope="col">Customer</th>
                                <th scope="col">Where now</th>
                                <th scope="col">Progress</th>
                                {Details && <th scope="col">Products</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(({ order, stage }) => (
                                <tr key={order.queueNum}>
                                    <td>
                                        <strong className="order-status-ticket">
                                            {formatQueueNum(order.queueNum, order.purpose, order)}
                                        </strong>
                                        <span className="order-status-sub">{timeFormat.format(new Date(order.createdAt))}</span>
                                    </td>
                                    <td>
                                        {order.name}
                                        <span className="order-status-sub">{order.purpose}</span>
                                        <Pickup order={order} />
                                    </td>
                                    <td>
                                        <span className={`stage-badge is-${stage}`}>{whereNow(order)}</span>
                                    </td>
                                    <td>
                                        <Steps order={order} />
                                    </td>
                                    {Details && <td><Details order={order} refresh={refresh} /></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
