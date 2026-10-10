import { Link } from 'react-router';

import formatQueueNum from '../../data/queueNum.js';

// the next few pending tickets, in queue order
export default function NextNumComp({ orders, limit = 5 }) {
    const nextUp = orders.filter((o) => o.status === "pending").slice(0, limit);

    return (
        <div className="admin-panel">
            <h2>Next up</h2>
            {nextUp.length === 0 ? (
                <p className="admin-empty">The queue is empty.</p>
            ) : (
                <ul className="queue-list">
                    {nextUp.map((o) => (
                        <li key={o.queueNum}>
                            <strong>{formatQueueNum(o.queueNum, o.purpose)}</strong> {o.name} · {o.purpose}
                        </li>
                    ))}
                </ul>
            )}
            <Link to="/admin/orders" className="admin-link">Manage orders →</Link>
        </div>
    );
}
