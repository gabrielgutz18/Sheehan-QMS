import { useState } from 'react';
import { Link } from 'react-router';

import orderStatus from '../../data/orderStatus.js';
import { useAuth } from '../../auth/authContext.js';
import { callOrder, deleteOrder, updateOrderStatus } from '../../api/adminOrderController.js';
import CallDialog from './callDialog.jsx';
import ServedBy from './servedBy.jsx';
import EditedBy from './editedBy.jsx';
import OrderDetails from './orderDetails.jsx';
import formatQueueNum from '../../../data/queueNum.js';
import { readLastRemarks, saveLastRemarks } from '../../data/lastRemarks.js';

// orders table with the row actions (status, call, edit, delete) and the call dialog
// admins and sales staff can both set the status and edit; only admins call (sales hand customers over and loading
// calls them) and delete (the backend checks too)
// Edit opens the ticket on Customer order, e.g. to change its payment status or pick-up day later
export default function QueueTable({ orders, setOrders, loading, error }) {
    const { user } = useAuth();
    const canDelete = user?.role === "admin";
    const canCall = user?.role === "admin";
    const [busy, setBusy] = useState(null);
    const [actionError, setActionError] = useState("");
    const [calling, setCalling] = useState(null);
    const [callError, setCallError] = useState("");
    const [lastRemarks, setLastRemarks] = useState(readLastRemarks);

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

    const openCall = (order) => {
        setCallError("");
        setCalling(order);
    };

    // errors stay inside the dialog so the admin can fix the remarks and retry
    const call = async (remarks) => {
        const { queueNum } = calling;
        setBusy(queueNum);
        setCallError("");
        try {
            const saved = await callOrder(queueNum, remarks);
            setOrders((prev) => prev.map((o) => (o.queueNum === queueNum ? { ...o, ...saved } : o)));
            saveLastRemarks(remarks);
            setLastRemarks(remarks);
            setCalling(null);
        } catch (err) {
            setCallError(err.message);
        } finally {
            setBusy(null);
        }
    };

    const remove = (queueNum, purpose, marks) => {
        const ticket = formatQueueNum(queueNum, purpose, marks);
        if (!window.confirm(`Delete ticket ${ticket}? It leaves the queue and the display, and can be restored from History.`)) return;
        runAction(queueNum, async () => {
            await deleteOrder(queueNum);
            setOrders((prev) => prev.filter((o) => o.queueNum !== queueNum));
        });
    };

    return (
        <>
            {(error || actionError) && <p className="field-error" role="alert">{actionError || error}</p>}

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">Queue #</th>
                            <th scope="col">Name</th>
                            <th scope="col">Purpose</th>
                            <th scope="col">Order</th>
                            <th scope="col">Status</th>
                            <th scope="col"><span className="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="admin-empty">Loading orders...</td></tr>
                        ) : orders.length === 0 ? (
                            <tr><td colSpan={6} className="admin-empty">No orders to show.</td></tr>
                        ) : (
                            orders.map((o) => (
                                <tr key={o.queueNum}>
                                    <td><strong>{formatQueueNum(o.queueNum, o.purpose, o)}</strong></td>
                                    <td>{o.name}</td>
                                    <td>{o.purpose}</td>
                                    <td><OrderDetails order={o} /></td>
                                    <td>
                                        <select
                                            className={`status-select status-${o.status}`}
                                            aria-label={`Status for ${formatQueueNum(o.queueNum, o.purpose, o)}`}
                                            value={o.status}
                                            disabled={busy === o.queueNum}
                                            onChange={(e) => changeStatus(o.queueNum, e.target.value)}
                                        >
                                            {/* a done order goes back in line (Waiting or Returning) before it's called;
                                                Now serving calls them, which sales don't */}
                                            {orderStatus.map(({ value, label }) => (
                                                <option key={value} value={value}
                                                    disabled={value === "serving" && o.status !== "serving" && (o.status === "done" || !canCall)}>
                                                    {label}
                                                </option>
                                            ))}
                                        </select>
                                        {o.status === "serving" && o.remarks && (
                                            <p className="order-remarks">“{o.remarks}”</p>
                                        )}
                                        <ServedBy order={o} />
                                        <EditedBy edits={o.edits} />
                                    </td>
                                    <td>
                                        <div className="row-actions">
                                            {canCall && o.status !== "done" && (
                                                <button
                                                    type="button"
                                                    className="admin-btn admin-btn-call"
                                                    disabled={busy === o.queueNum}
                                                    onClick={() => openCall(o)}
                                                >
                                                    {o.status === "serving" ? "Call again" : "Call"}
                                                </button>
                                            )}
                                            {/* the queue ticket, to print it again */}
                                            <Link className="admin-btn" to={`/staff/customer-order?ticket=${o.queueNum}&view=1`}>
                                                View ticket
                                            </Link>
                                            {/* a Customer Report has a concern, which Customer order no longer takes */}
                                            {!o.concern && (
                                                <Link className="admin-btn" to={`/staff/customer-order?ticket=${o.queueNum}`}>
                                                    Edit
                                                </Link>
                                            )}
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    className="admin-btn admin-btn-danger"
                                                    disabled={busy === o.queueNum}
                                                    onClick={() => remove(o.queueNum, o.purpose, o)}
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {calling && (
                <CallDialog
                    order={calling}
                    defaultRemarks={lastRemarks}
                    busy={busy === calling.queueNum}
                    error={callError}
                    onCall={call}
                    onClose={() => setCalling(null)}
                />
            )}
        </>
    );
}
