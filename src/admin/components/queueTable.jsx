import { useState } from 'react';

import orderStatus from '../data/orderStatus.js';
import { callOrder, deleteOrder, updateOrderStatus } from '../api/adminOrderController.js';
import CallDialog from './callDialog.jsx';
import formatQueueNum from '../../data/queueNum.js';
import { colorLabel } from '../../data/roofingColors.js';

// the dialog starts with the last remarks used, since staff usually call to the same window
const LAST_REMARKS_KEY = "admin.lastRemarks";

const readLastRemarks = () => {
    try {
        return localStorage.getItem(LAST_REMARKS_KEY) ?? "";
    } catch {
        return "";
    }
};

const saveLastRemarks = (remarks) => {
    try {
        localStorage.setItem(LAST_REMARKS_KEY, remarks);
    } catch {
        // storage blocked; the dialog just starts empty next time
    }
};

// orders table with the row actions (status, call, delete) and the call dialog
export default function QueueTable({ orders, setOrders, loading, error }) {
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

    const remove = (queueNum, purpose) => {
        if (!window.confirm(`Delete order ${formatQueueNum(queueNum, purpose)}? This can't be undone.`)) return;
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
                            <th scope="col">Items</th>
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
                                    <td><strong>{formatQueueNum(o.queueNum, o.purpose)}</strong></td>
                                    <td>{o.name}</td>
                                    <td>{o.purpose}</td>
                                    <td>
                                        <ul className="item-list">
                                            {o.orders?.map((item, i) => (
                                                <li key={i}>{item.qty} × {item.item}{item.color && ` (${colorLabel(item.color)})`}</li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td>
                                        <select
                                            className={`status-select status-${o.status}`}
                                            aria-label={`Status for ${formatQueueNum(o.queueNum, o.purpose)}`}
                                            value={o.status}
                                            disabled={busy === o.queueNum}
                                            onChange={(e) => changeStatus(o.queueNum, e.target.value)}
                                        >
                                            {orderStatus.map(({ value, label }) => (
                                                <option key={value} value={value}>{label}</option>
                                            ))}
                                        </select>
                                        {o.status === "serving" && o.remarks && (
                                            <p className="order-remarks">“{o.remarks}”</p>
                                        )}
                                    </td>
                                    <td>
                                        <div className="row-actions">
                                            {o.status !== "done" && (
                                                <button
                                                    type="button"
                                                    className="admin-btn admin-btn-call"
                                                    disabled={busy === o.queueNum}
                                                    onClick={() => openCall(o)}
                                                >
                                                    {o.status === "serving" ? "Call again" : "Call"}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="admin-btn admin-btn-danger"
                                                disabled={busy === o.queueNum}
                                                onClick={() => remove(o.queueNum, o.purpose)}
                                            >
                                                Delete
                                            </button>
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
