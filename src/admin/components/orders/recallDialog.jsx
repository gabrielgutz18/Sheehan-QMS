import { useEffect, useRef, useState } from "react";

import formatQueueNum from "../../../data/queueNum.js";
import { proceedTo } from "../../../data/loadingAreas.js";

// the same limit as MAX_RECALL_REASON in server/api.js
const MAX_REASON = 120;

// the usual reasons a customer is recalled, one tap each; anything else can be typed
const QUICK_REASONS = ["Wrong receipt", "Wrong order", "Wrong item", "Missing item"];

// Recall on the Loading, Service and Hardware pages: calls a customer straight back to an area the department had
// already done, e.g. they got the wrong receipt or the wrong order, with why; only that area is loaded again, and the
// order goes through the security check again
// areas: the order's areas this department has done, the ones they can be recalled to; onRecall(area, reason)
/**
 * @param {{ order: any, areas: string[], busy: boolean, error: string, onRecall: (area: string, reason: string) => any, onClose: () => void }} props
 */
export default function RecallDialog({ order, areas, busy, error, onRecall, onClose }) {
    const dialogRef = useRef(null);
    const inputRef = useRef(null);
    const [area, setArea] = useState(areas[0]);
    const [reason, setReason] = useState("");

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog.open) dialog.showModal();
        inputRef.current.focus();
    }, []);

    const ticket = formatQueueNum(order.queueNum, order.purpose, order);

    const submit = (e) => {
        e.preventDefault();
        onRecall(area, reason.trim());
    };

    return (
        <dialog
            ref={dialogRef}
            className="admin-dialog"
            aria-labelledby="recall-title"
            onClose={onClose}
            // don't let Esc close it halfway through a recall
            onCancel={(e) => busy && e.preventDefault()}
        >
            <form className="admin-dialog-body" onSubmit={submit}>
                <h2 id="recall-title" className="admin-dialog-title">
                    Recall <strong>{ticket}</strong>
                </h2>
                <p className="admin-dialog-sub">
                    {order.name} · {order.purpose}
                </p>

                {areas.length > 1 && (
                    <div className="remark-chips" role="group" aria-label="Recall to">
                        {areas.map((name) => (
                            <button
                                key={name}
                                type="button"
                                className={`remark-chip${area === name ? " is-selected" : ""}`}
                                aria-pressed={area === name}
                                onClick={() => setArea(name)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                )}

                <label className="admin-field">
                    Reason
                    <input
                        ref={inputRef}
                        type="text"
                        required
                        maxLength={MAX_REASON}
                        placeholder="e.g. Wrong receipt"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </label>

                <div className="remark-chips" role="group" aria-label="Quick reasons">
                    {QUICK_REASONS.map((text) => (
                        <button
                            key={text}
                            type="button"
                            className={`remark-chip${reason === text ? " is-selected" : ""}`}
                            onClick={() => {
                                setReason(text);
                                inputRef.current.focus();
                            }}
                        >
                            {text}
                        </button>
                    ))}
                </div>

                <p className="admin-dialog-hint">
                    They're called back now: the display shows “{proceedTo(area)}”. Only {area} is done again, then the
                    order goes through the security check again.
                </p>

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
                    <button type="submit" className="admin-btn admin-btn-call" disabled={busy || !reason.trim()}>
                        {busy ? "Recalling..." : "Recall now"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
