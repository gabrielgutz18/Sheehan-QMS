import { useState } from 'react';

import useOrders from '../hooks/useOrders.js';
import orderStatus from '../data/orderStatus.js';
import { deleteOrder, updateOrderStatus } from '../api/adminOrderController.js';
import formatQueueNum from '../../data/queueNum.js';

export default function OrdersPage() {
    const { orders, setOrders, loading, error } = useOrders();
    const [filter, setFilter] = useState("all");
    const [busy, setBusy] = useState(null);
    const [actionError, setActionError] = useState("");

    const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter);

    // run one row action at a time and surface its error above the table
    const runAction = async (queueNum, action) => {
        setBusy(queueNum);
        setActionError("");
        try {
            await action();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(null);
        }
    };

    const changeStatus = (queueNum, status) =>
        runAction(queueNum, async () => {
            const saved = await updateOrderStatus(queueNum, status);
            setOrders((prev) => prev.map((o) => (o.queueNum === queueNum ? { ...o, ...saved, status } : o)));
        });

    const remove = (queueNum) => {
        if (!window.confirm(`Delete order ${formatQueueNum(queueNum)}? This can't be undone.`)) return;
        runAction(queueNum, async () => {
            await deleteOrder(queueNum);
            setOrders((prev) => prev.filter((o) => o.queueNum !== queueNum));
        });
    };

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">Orders</h1>
                <label className="admin-filter">
                    <span>Show</span>
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="all">All</option>
                        {orderStatus.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>
            </div>

            {(error || actionError) && <p className="field-error" role="alert">{actionError || error}</p>}

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">Queue #</th>
                            <th scope="col">Name</th>
                            <th scope="col">Purpose</th>
                            <th scope="col">Items</th>
                            <th scope="col">Status</th>
                            <th scope="col"><span className="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="admin-empty">Loading orders...</td></tr>
                        ) : visible.length === 0 ? (
                            <tr><td colSpan={6} className="admin-empty">No orders to show.</td></tr>
                        ) : (
                            visible.map((o) => (
                                <tr key={o.queueNum}>
                                    <td><strong>{formatQueueNum(o.queueNum)}</strong></td>
                                    <td>{o.name}</td>
                                    <td>{o.purpose}</td>
                                    <td>
                                        <ul className="item-list">
                                            {o.orders?.map((item, i) => (
                                                <li key={i}>{item.qty} × {item.item}</li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td>
                                        <select
                                            className={`status-select status-${o.status}`}
                                            aria-label={`Status for ${formatQueueNum(o.queueNum)}`}
                                            value={o.status}
                                            disabled={busy === o.queueNum}
                                            onChange={(e) => changeStatus(o.queueNum, e.target.value)}
                                        >
                                            {orderStatus.map(({ value, label }) => (
                                                <option key={value} value={value}>{label}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className="admin-btn admin-btn-danger"
                                            disabled={busy === o.queueNum}
                                            onClick={() => remove(o.queueNum)}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
