import formatQueueNum from '../../data/queueNum.js';

export default function ServingCompo({ orders }) {
    // newest call first, the same order as the queue display
    const serving = orders.filter((o) => o.status === "serving").sort((a, b) => b.calledAt - a.calledAt);

    return (
        <div className="admin-panel">
            <h2>Now serving</h2>
            {serving.length === 0 ? (
                <p className="admin-empty">No one is being served.</p>
            ) : (
                <ul className="queue-list">
                    {serving.map((o) => (
                        <li key={o.queueNum}>
                            <strong>{formatQueueNum(o.queueNum, o.purpose)}</strong> {o.name}
                            {o.remarks && <span className="order-remarks">“{o.remarks}”</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
