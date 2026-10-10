import orderStatus from '../data/orderStatus.js';

// total order count plus one card per status
export default function TotalViewer({ orders, loading }) {
    const countByStatus = (value) => orders.filter((o) => o.status === value).length;

    return (
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
    );
}
