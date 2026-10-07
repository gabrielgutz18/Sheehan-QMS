import { Link } from 'react-router';

import useOrders from '../hooks/useOrders.js';
import orderStatus from '../data/orderStatus.js';
import formatQueueNum from '../../data/queueNum.js';

export default function DashboardPage() {
    const { orders, loading, error } = useOrders();

    const countByStatus = (value) => orders.filter((o) => o.status === value).length;
    const serving = orders.filter((o) => o.status === "serving");
    const nextUp = orders.filter((o) => o.status === "pending").slice(0, 5);

    return (
        <section className="admin-page">
            <h1 className="admin-title">Dashboard</h1>

            {error && <p className="field-error" role="alert">{error}</p>}

            <div className="stat-grid">
                <div className="stat-card">
                    <span className="stat-label">Total orders</span>
                    <span className="stat-value">{loading ? "–" : orders.length}</span>
                </div>
                {orderStatus.map(({ value, label }) => (
                    <div key={value} className="stat-card">
                        <span className="stat-label">{label}</span>
                        <span className="stat-value">{loading ? "–" : countByStatus(value)}</span>
                    </div>
                ))}
            </div>

            <div className="queue-columns">
                <div className="admin-panel">
                    <h2>Now serving</h2>
                    {serving.length === 0 ? (
                        <p className="admin-empty">No one is being served.</p>
                    ) : (
                        <ul className="queue-list">
                            {serving.map((o) => (
                                <li key={o.queueNum}>
                                    <strong>{formatQueueNum(o.queueNum)}</strong> {o.name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="admin-panel">
                    <h2>Next up</h2>
                    {nextUp.length === 0 ? (
                        <p className="admin-empty">The queue is empty.</p>
                    ) : (
                        <ul className="queue-list">
                            {nextUp.map((o) => (
                                <li key={o.queueNum}>
                                    <strong>{formatQueueNum(o.queueNum)}</strong> {o.name} · {o.purpose}
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link to="/admin/orders" className="admin-link">Manage orders →</Link>
                </div>
            </div>
        </section>
    );
}
