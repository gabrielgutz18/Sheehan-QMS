import { useEffect, useRef, useState } from 'react';

import formatQueueNum from '../../data/queueNum.js';

const MAX_REMARKS = 120;

const QUICK_REMARKS = [
    { label: "Counter", text: "Please proceed to the counter" },
    { label: "Window 1", text: "Please proceed to Window 1" },
    { label: "Window 2", text: "Please proceed to Window 2" },
    { label: "Window 3", text: "Please proceed to Window 3" },
];

// modal for calling a ticket; the remarks show under the number on the display screen
export default function CallDialog({ order, defaultRemarks = "", busy, error, onCall, onClose }) {
    const dialogRef = useRef(null);
    const inputRef = useRef(null);
    const [remarks, setRemarks] = useState(order.remarks || defaultRemarks);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog.open) dialog.showModal();
        inputRef.current.select();
    }, []);

    const ticket = formatQueueNum(order.queueNum, order.purpose);
    const again = order.status === "serving";

    const submit = (e) => {
        e.preventDefault();
        onCall(remarks.trim());
    };

    return (
        <dialog
            ref={dialogRef}
            className="admin-dialog"
            aria-labelledby="call-title"
            onClose={onClose}
            // don't let Esc close it halfway through a call
            onCancel={(e) => busy && e.preventDefault()}
        >
            <form className="admin-dialog-body" onSubmit={submit}>
                <h2 id="call-title" className="admin-dialog-title">
                    {again ? "Call again" : "Call"} <strong>{ticket}</strong>
                </h2>
                <p className="admin-dialog-sub">{order.name} · {order.purpose}</p>

                <label className="admin-field">
                    Remarks
                    <input
                        ref={inputRef}
                        type="text"
                        maxLength={MAX_REMARKS}
                        placeholder={`Please proceed to ${order.purpose}`}
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                    />
                </label>

                <div className="remark-chips" role="group" aria-label="Quick remarks">
                    {QUICK_REMARKS.map(({ label, text }) => (
                        <button
                            key={text}
                            type="button"
                            className={`remark-chip${remarks === text ? " is-selected" : ""}`}
                            onClick={() => {
                                setRemarks(text);
                                inputRef.current.focus();
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <p className="admin-dialog-hint">
                    Shown under the number on the display. Leave blank to show
                    “Please proceed to {order.purpose}”.
                </p>

                {error && <p className="field-error" role="alert">{error}</p>}

                <div className="admin-dialog-actions">
                    <button type="button" className="admin-btn" onClick={() => dialogRef.current.close()} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="admin-btn admin-btn-call" disabled={busy}>
                        {busy ? "Calling..." : again ? "Call again" : "Call now"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
