import { useState } from 'react';

import useOrders from '../hooks/useOrders.js';
import { useAuth } from '../auth/authContext.js';
import { callAtTeam, finishAtTeam, sendBackFromTeam } from '../api/loadingController.js';
import CallDialog from '../components/callDialog.jsx';
import Greetings from '../components/greetings.jsx';
import OrderDetails from '../components/orderDetails.jsx';
import ServedBy from '../components/servedBy.jsx';
import { servingElsewhere, teamState, teamsOf } from '../data/loadingTeams.js';
import formatQueueNum from '../../data/queueNum.js';
import teams, { proceedTo } from '../../data/teams.js';

// a loading crew's counter: today's customers whose order goes to this crew, once a sales counter has served them and
// pressed Hand over to loading on My counter, in queue order; call one to the
// crew's area (the display shows "Please proceed to Roofings", which can be changed before calling), mark the
// crew's part done (the order is done once every crew on it is), or send them back to waiting
// a customer is in one place at a time: while another crew or a sales counter is serving them, their Call button
// is grayed out here with "Please wait until Roofings finishes." (the backend refuses the call too)
// a loading account works for its own team (set by an admin on Accounts); an admin picks one to work as

const ADMIN_TEAM_KEY = "admin.loadingTeam";
const teamNames = teams.map((t) => t.name);

const readAdminTeam = () => {
    try {
        const saved = localStorage.getItem(ADMIN_TEAM_KEY);
        return teamNames.includes(saved) ? saved : teamNames[0];
    } catch {
        return teamNames[0];
    }
};

const saveAdminTeam = (team) => {
    try {
        localStorage.setItem(ADMIN_TEAM_KEY, team);
    } catch {
        // storage blocked; it starts on the first team next time
    }
};

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose);
// Done here lists this many of the latest; the rest are counted under it
const DONE_SHOWN = 8;

// the crews' areas as one-tap messages in the call dialog: this crew's first, then the ones marked quickRemark in
// teams.js (Roofings and Steel)
const quickRemarksFor = (team) =>
    [team, ...teams.filter((t) => t.quickRemark && t.name !== team).map((t) => t.name)]
        .map((name) => ({ label: name, text: proceedTo(name) }));

// the crews on the order still to serve the customer, besides this one
const othersLeft = (order, team) => teamsOf(order).filter((t) => t !== team && teamState(order, t) !== "done");

export default function LoadingPage() {
    const { user } = useAuth();
    const isAdmin = user.role === "admin";
    const [adminTeam, setAdminTeam] = useState(readAdminTeam);
    const team = isAdmin ? adminTeam : user.team;
    const { orders, setOrders, loading, error } = useOrders();
    const [busy, setBusy] = useState(null);
    const [actionError, setActionError] = useState("");
    const [calling, setCalling] = useState(null);
    const [callError, setCallError] = useState("");

    // a loading account only gets these from the backend; an admin gets every order, so the rest are left out here
    const mine = orders.filter((o) => o.handedOver && teamsOf(o).includes(team));
    const servingHere = mine.filter((o) => teamState(o, team) === "serving");
    // in line for this crew: waiting or returning, or somewhere else right now (their Call is grayed out)
    const waiting = mine.filter((o) => teamState(o, team) === "waiting");
    const next = waiting.find((o) => o.status !== "serving");
    // latest first
    const doneHere = mine.filter((o) => teamState(o, team) === "done").reverse();

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

    // errors stay inside the dialog, e.g. when another crew called them first
    const call = async (remarks) => {
        const { queueNum } = calling;
        setBusy(queueNum);
        setCallError("");
        try {
            replace(await callAtTeam(queueNum, { team, remarks }));
            setCalling(null);
        } catch (err) {
            setCallError(err.message);
        } finally {
            setBusy(null);
        }
    };

    const pickTeam = (name) => {
        setAdminTeam(name);
        saveAdminTeam(name);
    };

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">
                    Loading{team && <span className="team-badge">{team} team</span>}
                </h1>
                {isAdmin ? (
                    <label className="admin-filter">
                        <span>Working as</span>
                        <select value={adminTeam} onChange={(e) => pickTeam(e.target.value)}>
                            {teamNames.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </label>
                ) : (
                    <Greetings name={user.firstName || user.name} role={user.role} />
                )}
            </div>

            {!team ? (
                <p className="admin-panel admin-empty" role="status">
                    Your account isn't on a team yet. Ask an admin to pick your team ({teamNames.join(" or ")}) on Accounts.
                </p>
            ) : (
                <>
                    {(error || actionError) && <p className="field-error" role="alert">{actionError || error}</p>}

                    <div className="queue-columns">
                        <div className="admin-panel">
                            <div className="counter-head">
                                <h2>Serving at {team}</h2>
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
                                    {servingHere.map((o) => {
                                        const left = othersLeft(o, team);
                                        return (
                                            <li key={o.queueNum} className="counter-ticket">
                                                <div className="counter-ticket-main">
                                                    <strong className="counter-number">{ticketOf(o)}</strong>
                                                    <span className="counter-name">{o.name}</span>
                                                    <span className="counter-meta">{o.purpose}{o.remarks && ` · “${o.remarks}”`}</span>
                                                    <OrderDetails order={o} />
                                                    <ServedBy order={o} />
                                                </div>
                                                <div className="row-actions">
                                                    {/* with crews still to go, the customer waits in line for them next */}
                                                    <button
                                                        type="button"
                                                        className="admin-btn admin-btn-primary"
                                                        disabled={busy === o.queueNum}
                                                        onClick={() => run(o, () => finishAtTeam(o.queueNum, team))}
                                                    >
                                                        {left.length ? `Done, next: ${left.join(", ")}` : "Done"}
                                                    </button>
                                                    <button type="button" className="admin-btn" disabled={busy === o.queueNum} onClick={() => openCall(o)}>
                                                        Call again
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="admin-btn"
                                                        disabled={busy === o.queueNum}
                                                        onClick={() => run(o, () => sendBackFromTeam(o.queueNum, team))}
                                                    >
                                                        Back to waiting
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <div className="admin-panel">
                            <h2>Waiting for {team} ({waiting.length})</h2>
                            {loading ? (
                                <p className="admin-empty">Loading...</p>
                            ) : waiting.length === 0 ? (
                                <p className="admin-empty">
                                    No one is waiting for {team}. Customers show up here once sales hands them over.
                                </p>
                            ) : (
                                <ul className="counter-list">
                                    {waiting.map((o) => {
                                        // someone else has the customer right now
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
                                                        Please wait until {servingElsewhere(o)} finishes.
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
                        <h2>Done at {team} today</h2>
                        {loading ? (
                            <p className="admin-empty">Loading...</p>
                        ) : doneHere.length === 0 ? (
                            <p className="admin-empty">No one yet. Customers {team} has finished with are listed here.</p>
                        ) : (
                            <ul className="counter-list">
                                {doneHere.slice(0, DONE_SHOWN).map((o) => {
                                    const left = othersLeft(o, team);
                                    return (
                                        <li key={o.queueNum} className="counter-ticket">
                                            <div className="counter-ticket-main">
                                                <strong className="counter-number">{ticketOf(o)}</strong>
                                                <span className="counter-name">{o.name}</span>
                                                <span className="counter-meta">
                                                    {left.length === 0 ? "All done"
                                                        : o.status === "serving" ? `Now at ${servingElsewhere(o)}`
                                                        : `Waiting for ${left.join(", ")}`}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {doneHere.length > DONE_SHOWN && (
                            <p className="video-hint">…and {doneHere.length - DONE_SHOWN} earlier today.</p>
                        )}
                    </div>
                </>
            )}

            {calling && (
                <CallDialog
                    order={calling}
                    defaultRemarks={proceedTo(team)}
                    quickRemarks={quickRemarksFor(team)}
                    busy={busy === calling.queueNum}
                    error={callError}
                    onCall={call}
                    onClose={() => setCalling(null)}
                />
            )}
        </section>
    );
}
