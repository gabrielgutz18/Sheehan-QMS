import { useEffect, useState } from 'react';

import useOrders from '../../hooks/useOrders.js';
import { listHistory, restoreOrder } from '../../api/adminOrderController.js';
import orderStatus from '../../data/orderStatus.js';
import formatQueueNum from '../../../data/queueNum.js';
import QueueTable from './queueTable.jsx';
import ServedBy from './servedBy.jsx';
import EditedBy from './editedBy.jsx';
import OrderDetails from './orderDetails.jsx';
import OrderExport from './orderExport.jsx';

// today's queue, live, with the row actions; the tickets deleted (from any day); and every ticket of every day
const ORDER_VIEWS = [
    { value: "today", label: "Today" },
    { value: "deleted", label: "Deleted" },
    { value: "all", label: "All tickets" },
];

// wait for a pause in typing before searching
const SEARCH_DELAY_MS = 300;

const statusLabel = (value) => orderStatus.find((s) => s.value === value)?.label ?? value;

const formatDay = (day) =>
    new Date(`${day}T00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const formatTime = (iso) =>
    new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// the Orders & history tab of Customer order: what were the Orders and History pages, in one place
// Today is the live queue (set a status, call, edit, view or delete a ticket); Deleted and All tickets search every
// day's tickets, with Restore to put one back in today's queue; Export to Excel is there for all three
// initial: which of ORDER_VIEWS to start on (the old /staff/history address starts on Deleted)
export default function OrdersHistory({ initial = "today" }) {
    const [view, setView] = useState(initial);

    return (
        <div className="orders-history">
            <div className="history-filters">
                <div className="video-tabs" role="radiogroup" aria-label="Show">
                    {ORDER_VIEWS.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={view === value}
                            className="video-tab"
                            onClick={() => setView(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {view === "today" ? <TodayOrders /> : <TicketHistory key={view} deleted={view === "deleted"} />}
            </div>
        </div>
    );
}

// today's tickets, refreshed every few seconds, shown by status
function TodayOrders() {
    const { orders, setOrders, loading, error } = useOrders();
    const [filter, setFilter] = useState("all");

    const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter);

    return (
        <>
            <label className="admin-filter">
                <span>Status</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All</option>
                    {orderStatus.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </label>
            <div className="orders-history-export"><OrderExport /></div>

            <div className="orders-history-body">
                <QueueTable orders={visible} setOrders={setOrders} loading={loading} error={error} />
            </div>
        </>
    );
}

// deleted tickets, or every ticket of every day, searched by name, ticket number or day, with Restore
function TicketHistory({ deleted }) {
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [day, setDay] = useState("");
    // bumped after a restore to load the list again
    const [version, setVersion] = useState(0);
    // the rows and the filters they were loaded for, so changing a filter shows "Loading..." until they match
    const [result, setResult] = useState({ key: null, rows: [], error: "" });
    const [restoring, setRestoring] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        const id = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
        return () => clearTimeout(id);
    }, [search]);

    const key = JSON.stringify([deleted, query, day, version]);

    useEffect(() => {
        const controller = new AbortController();
        listHistory({ search: query, day, deleted }, { signal: controller.signal })
            .then((rows) => setResult({ key, rows, error: "" }))
            .catch((err) => !controller.signal.aborted && setResult({ key, rows: [], error: err.message }));
        return () => controller.abort();
    }, [key, deleted, query, day]);

    const loading = result.key !== key;

    const restore = async (row) => {
        const before = formatQueueNum(row.queueNum, row.purpose, row.priority);
        setRestoring(row.id);
        setError("");
        setNotice("");
        try {
            const restored = await restoreOrder(row.id);
            const now = formatQueueNum(restored.queueNum, restored.purpose, restored.priority);
            setNotice(row.isToday
                ? `${now} is back in today's queue.`
                : `Restored to today's queue as ${now} (was ${before} on ${formatDay(row.date)}).`);
            setVersion((v) => v + 1);
        } catch (err) {
            setError(err.message);
        } finally {
            setRestoring(null);
        }
    };

    return (
        <>
            <label className="history-field">
                <span className="visually-hidden">Search</span>
                <input
                    type="search"
                    placeholder="Search name or ticket no."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </label>
            <label className="history-field">
                <span>Day</span>
                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </label>
            {day && (
                <button type="button" className="admin-btn" onClick={() => setDay("")}>
                    Any day
                </button>
            )}
            <div className="orders-history-export"><OrderExport /></div>

            <div className="orders-history-body">
                {(error || result.error) && <p className="field-error" role="alert">{error || result.error}</p>}
                {notice && <p className="admin-notice" role="status">{notice}</p>}

                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Day</th>
                                <th scope="col">Ticket</th>
                                <th scope="col">Name</th>
                                <th scope="col">Purpose</th>
                                <th scope="col">Order</th>
                                <th scope="col">Status</th>
                                <th scope="col"><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="admin-empty">Loading...</td></tr>
                            ) : result.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="admin-empty">
                                        {deleted ? "No deleted tickets." : "No tickets found."}
                                    </td>
                                </tr>
                            ) : (
                                result.rows.map((row) => (
                                    <tr key={row.id}>
                                        <td>{row.isToday ? "Today" : formatDay(row.date)}</td>
                                        <td>
                                            <strong>{formatQueueNum(row.queueNum, row.purpose, row.priority)}</strong>
                                            {row.originalDate && (
                                                <span className="history-note">
                                                    first {formatQueueNum(row.originalNum, row.purpose, row.priority)} on {formatDay(row.originalDate)}
                                                </span>
                                            )}
                                        </td>
                                        <td>{row.name}</td>
                                        <td>{row.purpose}</td>
                                        <td><OrderDetails order={row} /></td>
                                        <td>
                                            {row.deletedAt ? (
                                                <>
                                                    <span className="history-badge history-badge--deleted">Deleted</span>
                                                    <span className="history-note">{formatTime(row.deletedAt)}</span>
                                                </>
                                            ) : (
                                                <span className={`history-badge status-${row.status}`}>{statusLabel(row.status)}</span>
                                            )}
                                            <ServedBy order={row} />
                                            <EditedBy edits={row.edits} />
                                            {row.restoredAt && <span className="history-note">Restored {formatTime(row.restoredAt)}</span>}
                                        </td>
                                        <td>
                                            <div className="row-actions">
                                                {row.isToday && !row.deletedAt ? (
                                                    <span className="history-note">In today's queue</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="admin-btn admin-btn-call"
                                                        disabled={restoring === row.id}
                                                        onClick={() => restore(row)}
                                                    >
                                                        {restoring === row.id ? "Restoring..." : "Restore"}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && result.rows.length >= 200 && (
                    <p className="history-note">Showing the newest 200. Search by name or pick a day to find older tickets.</p>
                )}
            </div>
        </>
    );
}
