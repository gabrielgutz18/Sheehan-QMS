import { useEffect, useRef, useState } from 'react';

import OrderProducts from './orderProducts.jsx';
import { checkAtSecurity } from '../../api/adminOrderController.js';
import { stageOf } from '../../data/orderStage.js';
import { REPORTS } from '../../data/securityCheck.js';
import formatQueueNum from '../../../data/queueNum.js';

// must match the backend (server/api.js)
const MAX_NOTE = 300;

// an order on the Security page: what the customer bought, and, while they're at the security check, the guard's
// two ways to finish it: Verified, when what they leave with is the order, or a report of something missing, over
// the quantity or stolen, saying what; either way the order is then done, and the check is kept with it
// refresh(): fetches the page's orders again once the check is saved
export default function SecurityDetails({ order, refresh }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [reporting, setReporting] = useState(false);
    const atCheck = stageOf(order) === "security";
    const ticket = formatQueueNum(order.queueNum, order.purpose);

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
            {atCheck && (
                <div className="security-actions">
                    <button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={verify}
                        aria-label={`Verified: ${ticket} leaves with what's on the order`}>
                        {busy ? "Saving..." : "✓ Verified"}
                    </button>
                    <button type="button" className="admin-btn" disabled={busy} onClick={() => setReporting(true)}>
                        Report a problem
                    </button>
                </div>
            )}
            {error && <p className="field-error" role="alert">{error}</p>}
            {reporting && (
                <ReportDialog order={order} ticket={ticket} onClose={() => setReporting(false)}
                    onReported={() => {
                        setReporting(false);
                        refresh();
                    }} />
            )}
        </>
    );
}

// what's wrong (missing, over the quantity or stolen) and what the guard saw; Report saves it and finishes the order
function ReportDialog({ order, ticket, onClose, onReported }) {
    const dialogRef = useRef(null);
    const [result, setResult] = useState(REPORTS[0].value);
    const [note, setNote] = useState("");
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
        setBusy(true);
        setError("");
        try {
            await checkAtSecurity(order.queueNum, result, note.trim());
            onReported();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <dialog ref={dialogRef} className="admin-dialog" aria-labelledby="report-title" onClose={onClose}
            onCancel={(e) => busy && e.preventDefault()}>
            <form className="admin-dialog-body" onSubmit={submit}>
                <h2 id="report-title" className="admin-dialog-title">Report a problem with <strong>{ticket}</strong></h2>
                <p className="admin-dialog-sub">{order.name} · {order.purpose}</p>

                <fieldset className="security-results">
                    <legend>What's wrong</legend>
                    {REPORTS.map(({ value, label, hint }) => (
                        <label key={value}>
                            <input type="radio" name="result" value={value} checked={result === value}
                                onChange={() => setResult(value)} />
                            <span><strong>{label}</strong> · {hint}</span>
                        </label>
                    ))}
                </fieldset>

                <label className="admin-field">
                    What you saw
                    <textarea className="security-note" maxLength={MAX_NOTE} value={note}
                        placeholder="e.g. One long span sheet short of invoice 44976501"
                        onChange={(e) => setNote(e.target.value)} />
                </label>

                <p className="admin-dialog-hint">The order is marked done with your report, which the admins can see.</p>

                {error && <p className="field-error" role="alert">{error}</p>}

                <div className="admin-dialog-actions">
                    <button type="button" className="admin-btn" onClick={() => dialogRef.current.close()} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="admin-btn admin-btn-call" disabled={busy}>
                        {busy ? "Saving..." : "Report and finish"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
