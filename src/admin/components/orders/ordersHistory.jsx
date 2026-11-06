import { useEffect, useState } from 'react';

import useOrders from '../../hooks/useOrders.js';
import { useAuth } from '../../auth/authContext.js';
import { deleteOrders, listHistory, purgeOrders, restoreOrder } from '../../api/adminOrderController.js';
import orderStatus from '../../data/orderStatus.js';
import formatQueueNum from '../../../data/queueNum.js';
import QueueList from './queueList.jsx';
import TicketCard, { TicketLinks } from './ticketCard.jsx';
import OrderExport from './orderExport.jsx';

// today's queue, live, with the row actions; the tickets deleted (from any day); and every ticket of every day
const ORDER_VIEWS = [
    { value: "today", label: "Today" },
    { value: "deleted", label: "Deleted" },
    { value: "all", label: "All tickets" },
];

// wait for a pause in typing before searching
const SEARCH_DELAY_MS = 300;

const tickets = (n) => (n === 1 ? "1 ticket" : `${n} tickets`);

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
                <QueueList orders={visible} setOrders={setOrders} loading={loading} error={error} />
            </div>
        </>
    );
}

// deleted tickets, or every ticket of every day, searched by name, ticket number or day, with Restore
// admins can also pick several: on All tickets to Delete them (moved to Deleted, and off the Google sheet), and on
// Deleted to Purge them, erased for good to free up the database
function TicketHistory({ deleted }) {
    const { user } = useAuth();
    const canPick = user?.role === "admin";
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
    // ids of the tickets picked; only the ones still shown count, so a new search never acts on hidden ones
    const [picked, setPicked] = useState(() => new Set());
    const [acting, setActing] = useState(false);

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

    // on All tickets a deleted ticket has nothing to delete, so it has no box
    const pickable = canPick && !loading ? result.rows.filter((row) => deleted || !row.deletedAt) : [];
    const chosen = pickable.filter((row) => picked.has(row.id));
    const allPicked = chosen.length > 0 && chosen.length === pickable.length;

    const pick = (id, on) => setPicked((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
    });
    const pickAll = (on) => setPicked(on ? new Set(pickable.map((row) => row.id)) : new Set());

    // Delete on All tickets, Purge on Deleted, for the tickets picked
    const actOnPicked = async () => {
        const count = tickets(chosen.length);
        const question = deleted
            ? `Purge ${count} for good? They're erased from the system and can't be restored. Staff points stay, and a copy of the database is saved first.`
            : `Delete ${count}? They leave the queue, the display and the Google sheet, and can be restored from the Deleted tab.`;
        if (!window.confirm(question)) return;
        setActing(true);
        setError("");
        setNotice("");
        try {
            const ids = chosen.map((row) => row.id);
            if (deleted) setNotice(`Purged ${tickets((await purgeOrders(ids)).purged)}.`);
            else setNotice(`Deleted ${tickets((await deleteOrders(ids)).deleted)}. They're on the Deleted tab.`);
            setPicked(new Set());
            setVersion((v) => v + 1);
        } catch (err) {
            setError(err.message);
        } finally {
            setActing(false);
        }
    };

    const restore = async (row) => {
        const before = formatQueueNum(row.queueNum, row.purpose, row);
        setRestoring(row.id);
        setError("");
        setNotice("");
        try {
            const restored = await restoreOrder(row.id);
            const now = formatQueueNum(restored.queueNum, restored.purpose, restored);
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

                {pickable.length > 0 && (
                    <div className="history-pick-bar">
                        <label className="history-pick-all">
                            <input
                                type="checkbox"
                                checked={allPicked}
                                ref={(box) => {
                                    if (box) box.indeterminate = chosen.length > 0 && !allPicked;
                                }}
                                onChange={(e) => pickAll(e.target.checked)}
                            />
                            Select all shown
                        </label>
                        {chosen.length > 0 && (
                            <>
                                <span className="history-pick-count">{tickets(chosen.length)} picked</span>
                                <button type="button" className="admin-btn" onClick={() => pickAll(false)} disabled={acting}>
                                    Clear
                                </button>
                                <button type="button" className="admin-btn admin-btn-danger" onClick={actOnPicked} disabled={acting}>
                                    {acting
                                        ? deleted ? "Purging..." : "Deleting..."
                                        : `${deleted ? "Purge" : "Delete"} ${tickets(chosen.length)}`}
                                </button>
                            </>
                        )}
                    </div>
                )}

                {loading ? (
                    <p className="ticket-cards-empty">Loading...</p>
                ) : result.rows.length === 0 ? (
                    <p className="ticket-cards-empty">{deleted ? "No deleted tickets." : "No tickets found."}</p>
                ) : (
                    <ul className="ticket-cards">
                        {result.rows.map((row) => {
                            const inQueue = row.isToday && !row.deletedAt;
                            const canPickRow = pickable.includes(row);
                            return (
                                <TicketCard
                                    key={row.id}
                                    order={row}
                                    picked={canPickRow && picked.has(row.id)}
                                    onPick={canPickRow ? (on) => pick(row.id, on) : undefined}
                                    day={row.isToday ? "Today" : formatDay(row.date)}
                                    status={row.deletedAt ? (
                                        <span className="ticket-card-status is-deleted">Deleted</span>
                                    ) : (
                                        <span className={`ticket-card-status status-${row.status}`}>{statusLabel(row.status)}</span>
                                    )}
                                    statusNote={row.deletedAt && `Deleted ${formatTime(row.deletedAt)}`}
                                    notes={(row.originalDate || row.restoredAt) && (
                                        <div>
                                            {row.originalDate && (
                                                <span className="history-note">
                                                    First {formatQueueNum(row.originalNum, row.purpose, row)} on {formatDay(row.originalDate)}
                                                </span>
                                            )}
                                            {row.restoredAt && <span className="history-note">Restored {formatTime(row.restoredAt)}</span>}
                                        </div>
                                    )}
                                    actions={(
                                        <>
                                            {/* the same place and size as Restore, to say why there's nothing to restore */}
                                            <button
                                                type="button"
                                                className="admin-btn admin-btn-call"
                                                disabled={inQueue || restoring === row.id}
                                                onClick={() => restore(row)}
                                            >
                                                {inQueue ? "In today's queue" : restoring === row.id ? "Restoring..." : "Restore"}
                                            </button>
                                            <TicketLinks order={row} today={inQueue} />
                                        </>
                                    )}
                                />
                            );
                        })}
                    </ul>
                )}

                {!loading && result.rows.length >= 200 && (
                    <p className="history-note ticket-cards-limit">Showing the newest 200. Search by name or pick a day to find older tickets.</p>
                )}
            </div>
        </>
    );
}
