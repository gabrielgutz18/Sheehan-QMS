import { useState } from 'react';

import useOrders from '../hooks/useOrders.js';
import { useAuth } from '../auth/authContext.js';
import { callAtLoading, finishAtLoading, sendBackFromLoading } from '../api/loadingController.js';
import CallDialog from '../components/callDialog.jsx';
import Greetings from '../components/greetings.jsx';
import OrderDetails from '../components/orderDetails.jsx';
import ServedBy from '../components/servedBy.jsx';
import { defaultLoadingRemarks, quickLoadingRemarks } from '../data/loadingAreas.js';
import { inLine } from '../data/orderStatus.js';
import formatQueueNum from '../../data/queueNum.js';

// the loading crew's counter, one shared line for every loading account: today's customers once a sales counter has
// served them and pressed Hand over to loading on My counter, in queue order; call one (the display shows "Please
// proceed to Roofings", which can be changed before calling), mark them done, or send them back to waiting
// a customer is in one place at a time: while a sales counter has called them back, their Call button is grayed out
// here with "Please wait until Maria Santos finishes." (the backend refuses the call too)

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose);
// Done here lists this many of the latest; the rest are counted under it
const DONE_SHOWN = 8;

export default function LoadingPage() {
    const { user } = useAuth();
    const { orders, setOrders, loading, error } = useOrders();
    const [busy, setBusy] = useState(null);
    const [actionError, setActionError] = useState("");
    const [calling, setCalling] = useState(null);
    const [callError, setCallError] = useState("");

    // a loading account only gets these from the backend; an admin gets every order, so the rest are left out here
    const handedOver = orders.filter((o) => o.handedOver);
    const servingHere = handedOver.filter((o) => o.status === "serving" && o.atLoading);
    // in line for loading: waiting or returning, or called back to a sales counter right now (their Call is grayed out)
    const waiting = handedOver.filter((o) => inLine(o) || (o.status === "serving" && !o.atLoading));
    const next = waiting.find((o) => o.status !== "serving");
    // latest first
    const doneHere = handedOver.filter((o) => o.status === "done").reverse();

    const replace = (saved) => setOrders((prev) => prev.map((o) => (o.queueNum === saved.queueNum ? saved : o)));

    const run = async (order, action) => {
        setBusy(order.queueNum);
        setActionError("");
        try {
            replace(await action());
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

    // errors stay inside the dialog, e.g. when a sales counter called them back first
    const call = async (remarks) => {
        const { queueNum } = calling;
        setBusy(queueNum);
        setCallError("");
        try {
            replace(await callAtLoading(queueNum, remarks));
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
                <h1 className="admin-title">Loading</h1>
                <Greetings name={user.firstName || user.name} role={user.role} />
            </div>

            {(error || actionError) && <p className="field-error" role="alert">{actionError || error}</p>}

            <div className="queue-columns">
                <div className="admin-panel">
                    <div className="counter-head">
                        <h2>Serving at loading</h2>
                        <button
                            type="button"
                            className="admin-btn admin-btn-call"
                            disabled={!next || busy !== null}
                            onClick={() => openCall(next)}
                        >
                            {next ? `Call next: ${ticketOf(next)}` : "No one to call"}
                        </button>
                    </div>

                    {loading ? (
                        <p className="admin-empty">Loading...</p>
                    ) : servingHere.length === 0 ? (
                        <p className="admin-empty">No one yet. Press Call next to call the next customer.</p>
                    ) : (
                        <ul className="counter-list">
                            {servingHere.map((o) => (
                                <li key={o.queueNum} className="counter-ticket">
                                    <div className="counter-ticket-main">
                                        <strong className="counter-number">{ticketOf(o)}</strong>
                                        <span className="counter-name">{o.name}</span>
                                        <span className="counter-meta">{o.purpose}{o.remarks && ` · “${o.remarks}”`}</span>
                                        <OrderDetails order={o} />
                                        <ServedBy order={o} />
                                    </div>
                                    <div className="row-actions">
                                        <button
                                            type="button"
                                            className="admin-btn admin-btn-primary"
                                            disabled={busy === o.queueNum}
                                            onClick={() => run(o, () => finishAtLoading(o.queueNum))}
                                        >
                                            Done
                                        </button>
                                        <button type="button" className="admin-btn" disabled={busy === o.queueNum} onClick={() => openCall(o)}>
                                            Call again
                                        </button>
                                        <button
                                            type="button"
                                            className="admin-btn"
                                            disabled={busy === o.queueNum}
                                            onClick={() => run(o, () => sendBackFromLoading(o.queueNum))}
                                        >
                                            Back to waiting
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="admin-panel">
                    <h2>Waiting for loading ({waiting.length})</h2>
                    {loading ? (
                        <p className="admin-empty">Loading...</p>
                    ) : waiting.length === 0 ? (
                        <p className="admin-empty">
                            No one is waiting for loading. Customers show up here once sales hands them over.
                        </p>
                    ) : (
                        <ul className="counter-list">
                            {waiting.map((o) => {
                                // a sales counter has the customer right now
                                const elsewhere = o.status === "serving";
                                return (
                                    <li key={o.queueNum} className={`counter-ticket${elsewhere ? " is-elsewhere" : ""}`}>
                                        <div className="counter-ticket-main">
                                            <strong className="counter-number">{ticketOf(o)}</strong>
                                            <span className="counter-name">
                                                {o.name}
                                                {o.status === "returning" && <span className="history-badge status-returning returning-tag">Returning</span>}
                                            </span>
                                            <span className="counter-meta">{o.purpose}</span>
                                            <OrderDetails order={o} />
                                        </div>
                                        <div className="row-actions loading-call">
                                            <button
                                                type="button"
                                                className="admin-btn admin-btn-call"
                                                disabled={elsewhere || busy === o.queueNum}
                                                aria-describedby={elsewhere ? `wait-${o.queueNum}` : undefined}
                                                onClick={() => openCall(o)}
                                            >
                                                Call
                                            </button>
                                        </div>
                                        {elsewhere && (
                                            <p id={`wait-${o.queueNum}`} className="wait-hint">
                                                Please wait until {o.servedBy?.name ?? "the other counter"} finishes.
                                            </p>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            <div className="admin-panel">
                <h2>Done at loading today</h2>
                {loading ? (
                    <p className="admin-empty">Loading...</p>
                ) : doneHere.length === 0 ? (
                    <p className="admin-empty">No one yet. Customers loading has finished with are listed here.</p>
                ) : (
                    <ul className="counter-list">
                        {doneHere.slice(0, DONE_SHOWN).map((o) => (
                            <li key={o.queueNum} className="counter-ticket">
                                <div className="counter-ticket-main">
                                    <strong className="counter-number">{ticketOf(o)}</strong>
                                    <span className="counter-name">{o.name}</span>
                                    <span className="counter-meta">{o.purpose}</span>
                                    <ServedBy order={o} />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {doneHere.length > DONE_SHOWN && (
                    <p className="video-hint">…and {doneHere.length - DONE_SHOWN} earlier today.</p>
                )}
            </div>

            {calling && (
                <CallDialog
                    order={calling}
                    defaultRemarks={defaultLoadingRemarks(calling)}
                    quickRemarks={quickLoadingRemarks}
                    busy={busy === calling.queueNum}
                    error={callError}
                    onCall={call}
                    onClose={() => setCalling(null)}
                />
            )}
        </section>
    );
}
