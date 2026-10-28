import { useEffect, useRef } from 'react';

import formatQueueNum from '../../../data/queueNum.js';
import { handOverTo } from '../../data/loadingAreas.js';

// modal to confirm handing the customer a sales counter is serving over to loading, Hardware, or both in turn (by what
// they bought): one shared line each, so there's no team to pick; the order keeps its sales team, and it counts as a
// customer served
export default function HandOverDialog({ order, busy, error, onHandOver, onClose }) {
    const dialogRef = useRef(null);
    const to = handOverTo(order.purpose);
    const pages = to.split(" and ").map((d) => d[0].toUpperCase() + d.slice(1));

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog.open) dialog.showModal();
    }, []);

    const submit = (e) => {
        e.preventDefault();
        onHandOver();
    };

    return (
        <dialog
            ref={dialogRef}
            className="admin-dialog"
            aria-labelledby="handover-title"
            onClose={onClose}
            // don't let Esc close it halfway through
            onCancel={(e) => busy && e.preventDefault()}
        >
            <form className="admin-dialog-body" onSubmit={submit}>
                <h2 id="handover-title" className="admin-dialog-title">
                    Hand over <strong>{formatQueueNum(order.queueNum, order.purpose)}</strong> to {to}
                </h2>
                <p className="admin-dialog-sub">{order.name} · {order.purpose}</p>

                <p className="admin-dialog-hint">
                    The customer waits in line on the {pages.join(" and ")} {pages.length > 1 ? "pages" : "page"}, and counts
                    as a customer you served
                    {order.team ? `, for the ${order.team} team` : ""}.
                </p>

                {error && <p className="field-error" role="alert">{error}</p>}

                <div className="admin-dialog-actions">
                    <button type="button" className="admin-btn" onClick={() => dialogRef.current.close()} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
                        {busy ? "Handing over..." : `Hand over to ${to}`}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
