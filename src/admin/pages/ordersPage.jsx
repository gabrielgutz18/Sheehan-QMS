import { useState } from 'react';

import useOrders from '../hooks/useOrders.js';
import orderStatus from '../data/orderStatus.js';
import QueueTable from '../components/queueTable.jsx';

export default function OrdersPage() {
    const { orders, setOrders, loading, error } = useOrders();
    const [filter, setFilter] = useState("all");

    const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter);

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

            <QueueTable orders={visible} setOrders={setOrders} loading={loading} error={error} />
        </section>
    );
}
