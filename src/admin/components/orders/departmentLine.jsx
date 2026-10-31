import { useState } from 'react';

import useOrders from '../../hooks/useOrders.js';
import { useAuth } from '../../auth/authContext.js';
import { callAtLoading, finishAtLoading, sendBackFromLoading, startLoading } from '../../api/loadingController.js';
import CallDialog from './callDialog.jsx';
import Greetings from '../common/greetings.jsx';
import OrderDetails from './orderDetails.jsx';
import ServedBy from './servedBy.jsx';
import {
    areasLeft, areasLeftIn, atDepartment, defaultLoadingRemarks, departmentHasOrder, departmentStillNeeds, proceedTo,
    quickRemarksFor,
} from '../../data/loadingAreas.js';
import { resultLabel } from '../../data/securityCheck.js';
import { DEPARTMENTS, departmentWord } from '../../../data/loadingAreas.js';
import formatQueueNum from '../../../data/queueNum.js';

// a department's counter, the Loading, TBA, Chassis and Hardware pages' (department: "loading", "tba", "chassis" or "hardware",
// src/data/loadingAreas.js), one shared line for every account of the department: today's customers once a sales
// counter has served them and pressed Hand over on My counter, the ones with something from the department's areas,
// in queue order; call one to one of those areas (the display shows "Please proceed to Roofings", which can be changed
// before calling), mark that area done, or send them back to waiting
// an order is loaded in each of its areas in turn (Roofings, Steel, TBA at loading, then Hardware): Done at one area
// puts the customer back in line for the next, here or at the other department, and Done at the last finishes the
// order and sends them on to the security check at the gate
// loading isn't serving: Done means the crew has finished loading the order (the truck, for roofing), so the ticket
// says "Loaded by" whoever pressed it, and stays served by the sales staff member who handed it over
// a customer is in one place at a time: while a sales counter or the other department has them, their Call button is
// grayed out here with "Please wait until Maria Santos finishes." (the backend refuses the call too)
// loading is one department with no stations to pick: anyone on the crew works any area, but a station loads one
// truck at a time: when the truck is at an area the crew presses Loading at Roofings (or Steel, ...), whether the
// customer was called there, to another area, or not yet, and only then Done; until that area is done, the customer
// can't be called or loaded at another one (the backend refuses it)
// an order a guard sent back from the security check to one area says so, with what the guard saw

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose, o);

// how far loading has got, e.g. "Roofings ✓ · Hardware next", or "Roofings ✓ · Hardware now" while a crew has them
// there; "" for an order from before the areas
const areaProgress = (order) => {
    const now = order.status === "serving" && order.atLoading ? order.loadingArea : null;
    const [next] = areasLeft(order);
    return (order.areas ?? [])
        .map(({ name, loaded }) => (loaded ? `${name} ✓` : name === now ? `${name} now` : !now && name === next ? `${name} next` : name))
        .join(" · ");
};
// Done here lists this many of the latest; the rest are counted under it
const DONE_SHOWN = 8;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// the guard's report that sent the order back, while the area it went back to still has to load it again
const sentBack = (order) => (order.returned && areasLeft(order).includes(order.returned.area) ? order.returned : null);

function SentBack({ order }) {
    const returned = sentBack(order);
    if (!returned) return null;
    return (
        <p className="sent-back-note">
            Sent back to {returned.area} by security · {resultLabel(returned.result)}
            {returned.note && ` · “${returned.note}”`} · {returned.by.name}
        </p>
    );
}

export default function DepartmentLine({ department }) {
    const { user } = useAuth();
    const { orders, setOrders, loading, error } = useOrders();
    const [busy, setBusy] = useState(null);
    const [actionError, setActionError] = useState("");
    const [calling, setCalling] = useState(null);
    const [callError, setCallError] = useState("");
    const label = DEPARTMENTS[department];
    const here = departmentWord(department);

    // the one-tap areas in the call dialog: the order's areas still to load here, each calling them there
    const areaChoices = (order) => {
        const left = areasLeftIn(order, department);
        return left.length ? left.map((name) => ({ label: name, text: proceedTo(name), area: name })) : quickRemarksFor(department);
    };

    // a loading or hardware account only gets these from the backend; an admin gets every order, so the rest are
    // left out here
    const handedOver = orders.filter((o) => o.handedOver && departmentHasOrder(o, department));
    const servingHere = handedOver.filter((o) => atDepartment(o, department));
    // in line here: waiting or returning, or with a sales counter or the other department right now (their buttons
    // are grayed out)
    const waiting = handedOver.filter((o) => departmentStillNeeds(o, department) && !atDepartment(o, department));
    const next = waiting.find((o) => o.status !== "serving");
    // the department's part is finished, latest first
    const doneHere = handedOver.filter((o) => !departmentStillNeeds(o, department)).reverse();

    // Loading at each area the order still needs here, the one they were called to first (the main button, for a
    // customer the crew has called); just "Loading" for an order from before the areas
    const loadingButtons = (o, disabled, { called = false } = {}) => {
        const left = areasLeftIn(o, department);
        const areas = left.length ? [...left].sort((a, b) => (b === o.loadingArea) - (a === o.loadingArea)) : [""];
        return areas.map((area, i) => (
            <button
                key={area}
                type="button"
                className={`admin-btn${called && i === 0 ? " admin-btn-primary" : ""}`}
                disabled={disabled}
                onClick={() => run(o, () => startLoading(department, o.queueNum, area || undefined))}
            >
                {area ? `Loading at ${area}` : "Loading"}
            </button>
        ));
    };

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
    const call = async (remarks, area) => {
        const { queueNum } = calling;
        setBusy(queueNum);
        setCallError("");
        try {
            replace(await callAtLoading(department, queueNum, remarks, area));
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
                <h1 className="admin-title">{label}</h1>
                <Greetings name={user.firstName || user.name} role={user.role} />
            </div>

            {(error || actionError) && <p className="field-error" role="alert">{actionError || error}</p>}

            <div className="queue-columns">
                <div className="admin-panel">
                    <div className="counter-head">
                        <h2>Serving at {here}</h2>
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
                                        <span className="counter-meta">
                                            {o.loadingArea && `At ${o.loadingArea} · `}{o.purpose}{o.remarks && ` · “${o.remarks}”`}
                                        </span>
                                        <span className={`loading-state${o.loadingStartedAt ? " is-loading" : ""}`}>
                                            {o.loadingStartedAt
                                                ? `Loading since ${timeFormat.format(new Date(o.loadingStartedAt))}`
                                                : "Called · press Loading at the area once the truck is there"}
                                        </span>
                                        {areaProgress(o) && <span className="counter-meta">{areaProgress(o)}</span>}
                                        <SentBack order={o} />
                                        <OrderDetails order={o} />
                                        <ServedBy order={o} />
                                    </div>
                                    <div className="row-actions">
                                        {o.loadingStartedAt ? (
                                            <button
                                                type="button"
                                                className="admin-btn admin-btn-primary"
                                                disabled={busy === o.queueNum}
                                                onClick={() => run(o, () => finishAtLoading(department, o.queueNum))}
                                            >
                                                {o.loadingArea ? `Done at ${o.loadingArea}` : "Done"}
                                            </button>
                                        ) : (
                                            <>
                                                {loadingButtons(o, busy === o.queueNum, { called: true })}
                                                <button type="button" className="admin-btn" disabled={busy === o.queueNum} onClick={() => openCall(o)}>
                                                    Call again
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            className="admin-btn"
                                            disabled={busy === o.queueNum}
                                            onClick={() => run(o, () => sendBackFromLoading(department, o.queueNum))}
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
                    <h2>Waiting for {here} ({waiting.length})</h2>
                    {loading ? (
                        <p className="admin-empty">Loading...</p>
                    ) : waiting.length === 0 ? (
                        <p className="admin-empty">
                            No one is waiting for {here}. Customers show up here once sales hands them over.
                        </p>
                    ) : (
                        <ul className="counter-list">
                            {waiting.map((o) => {
                                // a sales counter or the other department has the customer right now
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
                                            {areaProgress(o) && <span className="counter-meta">{areaProgress(o)}</span>}
                                            <SentBack order={o} />
                                            <OrderDetails order={o} />
                                        </div>
                                        {/* Call, or Loading at an area straight away when the truck is already there */}
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
                                            {loadingButtons(o, elsewhere || busy === o.queueNum)}
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
                <h2>Done at {here} today</h2>
                {loading ? (
                    <p className="admin-empty">Loading...</p>
                ) : doneHere.length === 0 ? (
                    <p className="admin-empty">No one yet. Orders {here} has finished loading are listed here.</p>
                ) : (
                    <ul className="counter-list">
                        {doneHere.slice(0, DONE_SHOWN).map((o) => (
                            <li key={o.queueNum} className="counter-ticket">
                                <div className="counter-ticket-main">
                                    <strong className="counter-number">{ticketOf(o)}</strong>
                                    <span className="counter-name">{o.name}</span>
                                    <span className="counter-meta">{o.purpose}</span>
                                    {/* the other department may still have its part to do */}
                                    {o.status !== "done" && areaProgress(o) && <span className="counter-meta">{areaProgress(o)}</span>}
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
                    defaultRemarks={defaultLoadingRemarks(calling, department)}
                    quickRemarks={areaChoices(calling)}
                    defaultArea={calling.loadingArea ?? areasLeftIn(calling, department)[0]}
                    busy={busy === calling.queueNum}
                    error={callError}
                    onCall={call}
                    onClose={() => setCalling(null)}
                />
            )}
        </section>
    );
}
