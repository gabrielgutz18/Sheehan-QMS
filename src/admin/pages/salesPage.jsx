import { useState } from 'react';

import useOrders from '../hooks/useOrders.js';
import { useAuth } from '../auth/authContext.js';
import { callOrder, updateOrderStatus } from '../api/adminOrderController.js';
import CallDialog from '../components/callDialog.jsx';
import MyStats from '../components/myStats.jsx';
import AnnouncerVolume from '../components/announcerVolume.jsx';
import { readLastRemarks, saveLastRemarks } from '../data/lastRemarks.js';
import formatQueueNum from '../../data/queueNum.js';
import { colorLabel } from '../../data/roofingColors.js';
import Greetings from '../components/greetings.jsx';

// a sales staff member's counter: serve the next customer, recall them, mark them done (one point each)
// or send them back to waiting, plus their own served totals and the announcer volume
// (sales can't change the voice or the display video; the backend enforces that too)

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose);

const Items = ({ order }) => (
    <ul className="item-list">
        {order.orders.map((item, i) => (
            <li key={i}>{item.qty} × {item.item}{item.color && ` (${colorLabel(item.color)})`}</li>
        ))}
    </ul>
);

export default function SalesPage() {
    const { user } = useAuth();
    const { orders, setOrders, loading, error } = useOrders();
    const [busy, setBusy] = useState(null);
    const [actionError, setActionError] = useState("");
    const [calling, setCalling] = useState(null);
    const [callError, setCallError] = useState("");
    const [lastRemarks, setLastRemarks] = useState(readLastRemarks);
    // bumped after Done so the served totals update straight away
    const [statsVersion, setStatsVersion] = useState(0);

    const serving = orders.filter((o) => o.status === "serving");
    const mine = serving.filter((o) => o.servedBy?.id === user.id);
    const others = serving.filter((o) => o.servedBy?.id !== user.id);
    const waiting = orders.filter((o) => o.status === "pending");

    const replace = (saved) => setOrders((prev) => prev.map((o) => (o.queueNum === saved.queueNum ? saved : o)));

    const setStatus = async (order, status) => {
        setBusy(order.queueNum);
        setActionError("");
        try {
            replace(await updateOrderStatus(order.queueNum, status));
            if (status === "done") setStatsVersion((v) => v + 1);
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(null);
        }
    };

    const openCall = (order) => {
        setCallError("");
        setCalling(order);
    };

    // errors stay inside the dialog so the remarks can be fixed and sent again
    const call = async (remarks) => {
        const { queueNum } = calling;
        setBusy(queueNum);
        setCallError("");
        try {
            replace(await callOrder(queueNum, remarks));
            saveLastRemarks(remarks);
            setLastRemarks(remarks);
            setCalling(null);
        } catch (err) {
            setCallError(err.message);
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">My counter</h1>
                <Greetings name={user.firstName || user.name} role={user.role} />
            </div>

            {(error || actionError) && <p className="field-error" role="alert">{actionError || error}</p>}

            <div className="queue-columns">
                <div className="admin-panel">
                    <div className="counter-head">
                        <h2>You're serving</h2>
                        <button
                            type="button"
                            className="admin-btn admin-btn-call"
                            disabled={waiting.length === 0 || busy !== null}
                            onClick={() => openCall(waiting[0])}
                        >
                            {waiting.length ? `Serve next: ${ticketOf(waiting[0])}` : "No one waiting"}
                        </button>
                    </div>

                    {loading ? (
                        <p className="admin-empty">Loading...</p>
                    ) : mine.length === 0 ? (
                        <p className="admin-empty">No one yet. Press Serve next to call the next customer.</p>
                    ) : (
                        <ul className="counter-list">
                            {mine.map((o) => (
                                <li key={o.queueNum} className="counter-ticket">
                                    <div className="counter-ticket-main">
                                        <strong className="counter-number">{ticketOf(o)}</strong>
                                        <span className="counter-name">{o.name}</span>
                                        <span className="counter-meta">{o.purpose}{o.remarks && ` · “${o.remarks}”`}</span>
                                        <Items order={o} />
                                    </div>
                                    <div className="row-actions">
                                        <button
                                            type="button"
                                            className="admin-btn admin-btn-primary"
                                            disabled={busy === o.queueNum}
                                            onClick={() => setStatus(o, "done")}
                                        >
                                            Done
                                        </button>
                                        <button type="button" className="admin-btn" disabled={busy === o.queueNum} onClick={() => openCall(o)}>
                                            Recall
                                        </button>
                                        <button
                                            type="button"
                                            className="admin-btn"
                                            disabled={busy === o.queueNum}
                                            onClick={() => setStatus(o, "pending")}
                                        >
                                            Back to waiting
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {others.length > 0 && (
                        <p className="counter-others">
                            Also serving: {others.map((o) => `${ticketOf(o)} (${o.servedBy?.name ?? "—"})`).join(", ")}
                        </p>
                    )}
                </div>

                <div className="admin-panel">
                    <h2>Waiting ({waiting.length})</h2>
                    {loading ? (
                        <p className="admin-empty">Loading...</p>
                    ) : waiting.length === 0 ? (
                        <p className="admin-empty">The queue is empty.</p>
                    ) : (
                        <ul className="counter-list">
                            {waiting.map((o) => (
                                <li key={o.queueNum} className="counter-ticket">
                                    <div className="counter-ticket-main">
                                        <strong className="counter-number">{ticketOf(o)}</strong>
                                        <span className="counter-name">{o.name}</span>
                                        <span className="counter-meta">{o.purpose}</span>
                                    </div>
                                    <div className="row-actions">
                                        <button
                                            type="button"
                                            className="admin-btn admin-btn-call"
                                            disabled={busy === o.queueNum}
                                            onClick={() => openCall(o)}
                                        >
                                            Serve
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <MyStats version={statsVersion} />

            <AnnouncerVolume />

            {calling && (
                <CallDialog
                    order={calling}
                    defaultRemarks={lastRemarks}
                    busy={busy === calling.queueNum}
                    error={callError}
                    onCall={call}
                    onClose={() => setCalling(null)}
                />
            )}
        </section>
    );
}
