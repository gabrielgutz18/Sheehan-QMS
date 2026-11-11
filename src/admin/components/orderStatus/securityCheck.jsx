import { useEffect, useRef, useState } from "react";

import OrderProducts from "./orderProducts.jsx";
import Icon from "../common/icon.jsx";
import { checkAtSecurity } from "../../api/adminOrderController.js";
import { stageOf } from "../../data/orderStage.js";
import { REPORTS, resultLabel } from "../../data/securityCheck.js";
import { ticketNumber } from "../../../data/queueNum.js";

// must match the backend (server/api.js)
const MAX_NOTE = 300;

const CHECK = "M20 6 9 17l-5-5";
const WARNING = "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01";

// an order on the Security page: what the customer bought, and, while they're at the security check, the guard's
// two ways to finish it: Verified, when what they leave with is the order, or Report a problem, for something missing,
// over the quantity or stolen, saying what; the same two buttons on every order, however many areas it was loaded in
// the report says what happens next: the order finishes with the report, or goes back to the one area the problem is
// at, where only that area loads it again, the others stay loaded, and then it comes back here for a new check
// refresh(): fetches the page's orders again once the check is saved
export default function SecurityDetails({ order, refresh }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [reporting, setReporting] = useState(false);
    const atCheck = stageOf(order) === "security";
    const ticket = ticketNumber(order);

    const verify = async () => {
        setBusy(true);
        setError("");
        try {
            await checkAtSecurity(order.queueNum, "verified");
            refresh();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <OrderProducts order={order} />
            {order.returned && (
                <p className="sent-back-note">
                    Sent back to {order.returned.area} by {order.returned.by.name} ·{" "}
                    {resultLabel(order.returned.result)}
                    {order.returned.note && ` · “${order.returned.note}”`}
                </p>
            )}
            {atCheck && (
                <div className="security-actions">
                    <button
                        type="button"
                        className="admin-btn admin-btn-primary"
                        disabled={busy}
                        onClick={verify}
                        aria-label={`Verified: ${ticket} leaves with what's on the order`}
                    >
                        {busy ? (
                            "Saving..."
                        ) : (
                            <>
                                <Icon d={CHECK} /> Verified
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        className="admin-btn security-report"
                        disabled={busy}
                        aria-label={`Report a problem with ${ticket}`}
                        onClick={() => setReporting(true)}
                    >
                        <Icon d={WARNING} /> Report a problem
                    </button>
                </div>
            )}
            {error && (
                <p className="field-error" role="alert">
                    {error}
                </p>
            )}
            {reporting && (
                <ReportDialog
                    order={order}
                    ticket={ticket}
                    areas={areasOf(order)}
                    onClose={() => setReporting(false)}
                    onReported={() => {
                        setReporting(false);
                        refresh();
                    }}
                />
            )}
        </>
    );
}

// the areas a report can send the order back to; only an order sales handed over was loaded in its areas
const areasOf = (order) => (order.handedOver ? (order.areas ?? []).map(({ name }) => name) : []);

// what's wrong (missing, over the quantity or stolen), what the guard saw, and whether to finish the order with the
// report or send it back to one of its areas to be loaded there again; nothing is picked for them, since finishing lets
// the customer leave and sending back keeps them, and a guard in a hurry shouldn't get either by accident
function ReportDialog({ order, ticket, areas, onClose, onReported }) {
    const dialogRef = useRef(null);
    const [result, setResult] = useState(REPORTS[0].value);
    const [note, setNote] = useState("");
    // the area it goes back to, "" to finish the order, null until the guard picks; with no areas it can only finish
    const [returnTo, setReturnTo] = useState(areas.length > 0 ? null : "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog.open) dialog.showModal();
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        if (!note.trim()) {
            setError("Say what's wrong, e.g. which item and how many.");
            return;
        }
        if (returnTo === null) {
            setError("Choose what happens next: finish the order, or send it back to an area.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await checkAtSecurity(order.queueNum, result, note.trim(), returnTo);
            onReported();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <dialog
            ref={dialogRef}
            className="admin-dialog"
            aria-labelledby="report-title"
            onClose={onClose}
            onCancel={(e) => busy && e.preventDefault()}
        >
            <form className="admin-dialog-body" onSubmit={submit}>
                <h2 id="report-title" className="admin-dialog-title">
                    Report a problem with <strong>{ticket}</strong>
                </h2>
                <p className="admin-dialog-sub">
                    {order.name} · {order.purpose}
                </p>

                <fieldset className="security-results">
                    <legend>What's wrong</legend>
                    {REPORTS.map(({ value, label, hint }) => (
                        <label key={value}>
                            <input
                                type="radio"
                                name="result"
                                value={value}
                                checked={result === value}
                                onChange={() => setResult(value)}
                            />
                            <span>
                                <strong>{label}</strong> · {hint}
                            </span>
                        </label>
                    ))}
                </fieldset>

                <label className="admin-field">
                    What you saw
                    <textarea
                        className="security-note"
                        maxLength={MAX_NOTE}
                        value={note}
                        placeholder="e.g. One long span sheet short of invoice 44976501"
                        onChange={(e) => setNote(e.target.value)}
                    />
                </label>

                {areas.length > 0 && (
                    <fieldset className="security-results">
                        <legend>What happens next</legend>
                        {areas.map((area) => (
                            <label key={area}>
                                <input
                                    type="radio"
                                    name="returnTo"
                                    value={area}
                                    checked={returnTo === area}
                                    onChange={() => setReturnTo(area)}
                                />
                                <span>
                                    <strong>Send back to {area}</strong> · only {area} loads it again
                                </span>
                            </label>
                        ))}
                        <label>
                            <input
                                type="radio"
                                name="returnTo"
                                value=""
                                checked={returnTo === ""}
                                onChange={() => setReturnTo("")}
                            />
                            <span>
                                <strong>Finish the order</strong> · it leaves with this report
                            </span>
                        </label>
                    </fieldset>
                )}

                {returnTo !== null && (
                    <p className="admin-dialog-hint">
                        {returnTo
                            ? `The customer goes back in line for ${returnTo}, with your report. The other areas stay done, and the order comes back here once ${returnTo} finishes.`
                            : "The order is marked done with your report, which the admins can see."}
                    </p>
                )}

                {error && (
                    <p className="field-error" role="alert">
                        {error}
                    </p>
                )}

                <div className="admin-dialog-actions">
                    <button
                        type="button"
                        className="admin-btn"
                        onClick={() => dialogRef.current.close()}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button type="submit" className="admin-btn admin-btn-call" disabled={busy}>
                        {busy
                            ? "Saving..."
                            : returnTo
                              ? `Report and send back to ${returnTo}`
                              : returnTo === ""
                                ? "Report and finish"
                                : "Report"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
