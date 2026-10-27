import orderStatus from '../../data/orderStatus.js';

// total order count plus one card per status, each marked with its status's color
export default function TotalViewer({ orders, loading }) {
    const countByStatus = (value) => orders.filter((o) => o.status === value).length;

    return (
        <div className="stat-grid">
            <div className="stat-card">
                <span className="stat-label"><span className="stat-dot is-total" aria-hidden="true" />Total orders</span>
                <span className="stat-value">{loading ? "–" : orders.length}</span>
            </div>
            {orderStatus.map(({ value, label }) => (
                <div key={value} className="stat-card">
                    <span className="stat-label"><span className={`stat-dot is-${value}`} aria-hidden="true" />{label}</span>
                    <span className="stat-value">{loading ? "–" : countByStatus(value)}</span>
                </div>
            ))}
        </div>
    );
}
