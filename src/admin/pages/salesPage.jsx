import { useState } from 'react';

import useOrders from '../hooks/useOrders.js';
import { useAuth } from '../auth/authContext.js';
import { callOrder, handOverOrder, updateOrderStatus } from '../api/adminOrderController.js';
import CallDialog from '../components/callDialog.jsx';
import HandOverDialog from '../components/handOverDialog.jsx';
import MyStats from '../components/myStats.jsx';
import AnnouncerVolume from '../components/announcerVolume.jsx';
import { readLastRemarks, saveLastRemarks } from '../data/lastRemarks.js';
import { inLine } from '../data/orderStatus.js';
import formatQueueNum from '../../data/queueNum.js';
import { joinList } from '../../data/list.js';
import Greetings from '../components/greetings.jsx';
import ServedBy from '../components/servedBy.jsx';
import OrderDetails from '../components/orderDetails.jsx';
import TicketDialog from '../components/ticketDialog.jsx';

// a sales staff member's counter: serve the next customer, recall them, mark them done (one point each)
// or send them back to waiting, put a served customer who comes back in line as returning,
// plus their own served totals and the announcer volume
// (sales can't change the voice or the display video; the backend enforces that too)
// every customer is served here first; for an order that goes to the loading crews, Hand over to loading sends
// the customer on to the Loading page (it counts as a customer served), and they leave this counter's lists

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose);
// Served today lists this many of the latest; the rest are counted under it
const SERVED_SHOWN = 5;
// when this person finished with them here: handed over to loading, or marked Done
const servedTime = (o) => o.handedOver?.at ?? o.servedAt ?? "";

export default function SalesPage() {
    const { user } = useAuth();
    const { orders: allOrders, setOrders, loading, error } = useOrders();
    // the customers handed over are with the loading crews now
    const orders = allOrders.filter((o) => !o.handedOver);
    const [busy, setBusy] = useState(null);
    const [actionError, setActionError] = useState("");
    const [calling, setCalling] = useState(null);
    const [callError, setCallError] = useState("");
    const [handingOver, setHandingOver] = useState(null);
    const [handOverError, setHandOverError] = useState("");
    // the waiting ticket opened with View: { queueNum, openedAt }
    const [viewing, setViewing] = useState(null);
    const [lastRemarks, setLastRemarks] = useState(readLastRemarks);
    // bumped after Done so the served totals update straight away
    const [statsVersion, setStatsVersion] = useState(0);

    const serving = orders.filter((o) => o.status === "serving");
    const mine = serving.filter((o) => o.servedBy?.id === user.id);
    const others = serving.filter((o) => o.servedBy?.id !== user.id);
    // waiting and returning customers, in number order
    const waiting = orders.filter(inLine);
    // customers this person marked Done or handed over to loading today, latest first
    const servedToday = allOrders
        .filter((o) => (o.handedOver ? o.handedOver.by.id === user.id : o.status === "done" && o.servedBy?.id === user.id))
        .sort((a, b) => servedTime(b).localeCompare(servedTime(a)));

    // looked up in the live queue, so the dialog follows the ticket; it closes if the ticket is deleted
    const viewed = viewing && orders.find((o) => o.queueNum === viewing.queueNum);

    const replace = (saved) => setOrders((prev) => prev.map((o) => (o.queueNum === saved.queueNum ? saved : o)));

    const setStatus = async (order, status) => {
        setBusy(order.queueNum);
        setActionError("");
        try {
            replace(await updateOrderStatus(order.queueNum, status));
            // Done gives a point and leaving Done takes it back
            if (status === "done" || order.status === "done") setStatsVersion((v) => v + 1);
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

    const openHandOver = (order) => {
        setHandOverError("");
        setHandingOver(order);
    };

    // errors stay inside the dialog so the teams can be fixed and sent again
    const handOver = async (teams) => {
        const { queueNum } = handingOver;
        setBusy(queueNum);
        setHandOverError("");
        try {
            replace(await handOverOrder(queueNum, joinList(teams)));
            setStatsVersion((v) => v + 1);
            setHandingOver(null);
        } catch (err) {
            setHandOverError(err.message);
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
                                        <OrderDetails order={o} />
                                        <ServedBy order={o} />
                                    </div>
                                    <div className="row-actions">
                                        {/* an order with loading teams goes on to them, so that's the main button */}
                                        <button
                                            type="button"
                                            className={`admin-btn${o.team ? "" : " admin-btn-primary"}`}
                                            disabled={busy === o.queueNum}
                                            onClick={() => setStatus(o, "done")}
                                        >
                                            Done
                                        </button>
                                        <button
                                            type="button"
                                            className={`admin-btn${o.team ? " admin-btn-primary" : ""}`}
                                            disabled={busy === o.queueNum}
                                            aria-haspopup="dialog"
                                            onClick={() => openHandOver(o)}
                                        >
                                            Hand over to loading
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
                        <div className="counter-others">
                            <h3>At other counters</h3>
                            <ul>
                                {others.map((o) => (
                                    <li key={o.queueNum}>
                                        <span><strong>{ticketOf(o)}</strong> {o.name}</span>
                                        <ServedBy order={o} />
                                    </li>
                                ))}
                            </ul>
                        </div>
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
                                        <span className="counter-name">
                                            {o.name}
                                            {o.status === "returning" && <span className="history-badge status-returning returning-tag">Returning</span>}
                                        </span>
                                        <span className="counter-meta">{o.purpose}</span>
                                    </div>
                                    <div className="row-actions">
                                        <button
                                            type="button"
                                            className="link-btn"
                                            aria-haspopup="dialog"
                                            aria-label={`View ${ticketOf(o)}`}
                                            onClick={() => setViewing({ queueNum: o.queueNum, openedAt: Date.now() })}
                                        >
                                            View
                                        </button>
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

            <div className="admin-panel">
                <h2>Served today</h2>
                {loading ? (
                    <p className="admin-empty">Loading...</p>
                ) : servedToday.length === 0 ? (
                    <p className="admin-empty">
                        No one yet. Customers you mark Done or hand over to loading are listed here. If one comes back,
                        press Returning to put them in line again.
                    </p>
                ) : (
                    <ul className="counter-list">
                        {servedToday.slice(0, SERVED_SHOWN).map((o) => (
                            <li key={o.queueNum} className="counter-ticket">
                                <div className="counter-ticket-main">
                                    <strong className="counter-number">{ticketOf(o)}</strong>
                                    <span className="counter-name">{o.name}</span>
                                    {o.handedOver ? (
                                        <>
                                            {/* the teams, and how far along each is with them */}
                                            <span className="counter-meta">{o.purpose} · handed over to loading</span>
                                            <OrderDetails order={o} />
                                        </>
                                    ) : (
                                        <>
                                            <span className="counter-meta">{o.purpose}</span>
                                            <ServedBy order={o} />
                                        </>
                                    )}
                                </div>
                                {/* they came back after being served: back in line until a counter calls them (or,
                                    once loading has finished with them, until the crews do) */}
                                {o.status === "done" && (
                                    <div className="row-actions">
                                        <button
                                            type="button"
                                            className="admin-btn"
                                            disabled={busy === o.queueNum}
                                            onClick={() => setStatus(o, "returning")}
                                        >
                                            Returning
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {servedToday.length > SERVED_SHOWN && (
                    <p className="video-hint">…and {servedToday.length - SERVED_SHOWN} earlier today.</p>
                )}
            </div>

            <MyStats version={statsVersion} />

            <AnnouncerVolume />

            {viewed && (
                <TicketDialog
                    order={viewed}
                    openedAt={viewing.openedAt}
                    onServe={(o) => {
                        setViewing(null);
                        openCall(o);
                    }}
                    onClose={() => setViewing(null)}
                />
            )}

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

            {handingOver && (
                <HandOverDialog
                    order={handingOver}
                    busy={busy === handingOver.queueNum}
                    error={handOverError}
                    onHandOver={handOver}
                    onClose={() => setHandingOver(null)}
                />
            )}
        </section>
    );
}
