import { useState } from 'react';
import { Link } from 'react-router';

import formatQueueNum from '../../../data/queueNum.js';
import TicketDialog from '../orders/ticketDialog.jsx';
import { inLine } from '../../data/orderStatus.js';

// the next few waiting or returning tickets, in queue order, each with View for its order or concern
export default function NextNumComp({ orders, limit = 5 }) {
    const nextUp = orders.filter(inLine).slice(0, limit);
    // the ticket opened with View: { queueNum, openedAt }, looked up in the live queue so it stays current
    const [viewing, setViewing] = useState(null);
    const viewed = viewing && orders.find((o) => o.queueNum === viewing.queueNum);

    return (
        <div className="admin-panel">
            <h2>Next up</h2>
            {nextUp.length === 0 ? (
                <p className="admin-empty">The queue is empty.</p>
            ) : (
                <ul className="queue-list">
                    {nextUp.map((o) => (
                        <li key={o.queueNum} className="next-up-row">
                            <span>
                                <strong>{formatQueueNum(o.queueNum, o.purpose)}</strong> {o.name} · {o.purpose}
                                {o.status === "returning" && <span className="history-badge status-returning returning-tag">Returning</span>}
                            </span>
                            <button
                                type="button"
                                className="link-btn"
                                aria-haspopup="dialog"
                                aria-label={`View ${formatQueueNum(o.queueNum, o.purpose)}`}
                                onClick={() => setViewing({ queueNum: o.queueNum, openedAt: Date.now() })}
                            >
                                View
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <Link to="/admin/orders" className="admin-link">Manage orders →</Link>

            {viewed && <TicketDialog order={viewed} openedAt={viewing.openedAt} onClose={() => setViewing(null)} />}
        </div>
    );
}
