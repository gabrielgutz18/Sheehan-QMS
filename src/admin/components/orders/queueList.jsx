import { useState } from "react";

import orderStatus from "../../data/orderStatus.js";
import { useAuth } from "../../auth/authContext.js";
import { callOrder, deleteOrder, updateOrderStatus } from "../../api/adminOrderController.js";
import CallDialog from "./callDialog.jsx";
import TicketCard, { TicketLinks } from "./ticketCard.jsx";
import { ticketNumber } from "../../../data/queueNum.js";
import { readLastRemarks, saveLastRemarks } from "../../data/lastRemarks.js";

// today's tickets as cards with their actions (status, call, view, edit, delete) and the call dialog
// admins and sales staff can both set the status, edit and delete (sales, a ticket made by mistake; it can be restored);
// only admins call (sales hand customers over and loading calls them); the backend checks too
// Edit opens the ticket on Customer order, e.g. to change its payment status or pick-up day later
export default function QueueList({ orders, setOrders, loading, error }) {
    const { user } = useAuth();
    const canDelete = user?.role === "admin" || user?.role === "sales";
    const canCall = user?.role === "admin";
    const [busy, setBusy] = useState(null);
    const [actionError, setActionError] = useState("");
    const [calling, setCalling] = useState(null);
    const [callError, setCallError] = useState("");
    const [lastRemarks, setLastRemarks] = useState(readLastRemarks);

    // run one card's action at a time and surface its error above the list
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

    const remove = (order) => {
        const { queueNum } = order;
        const ticket = ticketNumber(order);
        if (
            !window.confirm(
                `Delete ticket ${ticket}? It leaves the queue and the display, and can be restored from the Deleted tab.`,
            )
        )
            return;
        runAction(queueNum, async () => {
            await deleteOrder(queueNum);
            setOrders((prev) => prev.filter((o) => o.queueNum !== queueNum));
        });
    };

    return (
        <>
            {(error || actionError) && (
                <p className="field-error" role="alert">
                    {actionError || error}
                </p>
            )}

            {loading ? (
                <p className="ticket-cards-empty">Loading orders...</p>
            ) : orders.length === 0 ? (
                <p className="ticket-cards-empty">No orders to show.</p>
            ) : (
                <ul className="ticket-cards">
                    {orders.map((o) => {
                        const ticket = ticketNumber(o);
                        return (
                            <TicketCard
                                key={o.queueNum}
                                order={o}
                                status={
                                    <select
                                        className={`status-select status-${o.status}`}
                                        aria-label={`Status for ${ticket}`}
                                        value={o.status}
                                        disabled={busy === o.queueNum}
                                        onChange={(e) => changeStatus(o.queueNum, e.target.value)}
                                    >
                                        {/* Now serving calls them, which sales don't, so they aren't offered it (it stays
                                            on a ticket already being served, to show its status); a done order goes
                                            back in line (Waiting or Returning) before it's called */}
                                        {orderStatus
                                            .filter(
                                                ({ value }) => value !== "serving" || canCall || o.status === "serving",
                                            )
                                            .map(({ value, label }) => (
                                                <option
                                                    key={value}
                                                    value={value}
                                                    disabled={value === "serving" && o.status === "done"}
                                                >
                                                    {label}
                                                </option>
                                            ))}
                                    </select>
                                }
                                notes={
                                    o.status === "serving" &&
                                    o.remarks && <p className="order-remarks">“{o.remarks}”</p>
                                }
                                actions={
                                    <>
                                        {/* stays in its place once a ticket is done, grayed out with what to do */}
                                        {canCall && (
                                            <button
                                                type="button"
                                                className="admin-btn admin-btn-call"
                                                aria-label={`${o.status === "serving" ? "Call again" : "Call"} ${ticket}`}
                                                title={
                                                    o.status === "done"
                                                        ? "This ticket is done. Set its status back to Waiting to call it."
                                                        : undefined
                                                }
                                                disabled={o.status === "done" || busy === o.queueNum}
                                                onClick={() => openCall(o)}
                                            >
                                                {o.status === "serving" ? "Call again" : "Call"}
                                            </button>
                                        )}
                                        <TicketLinks order={o} />
                                        {canDelete && (
                                            <button
                                                type="button"
                                                className="admin-btn admin-btn-danger"
                                                aria-label={`Delete ticket ${ticket}`}
                                                disabled={busy === o.queueNum}
                                                onClick={() => remove(o)}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </>
                                }
                            />
                        );
                    })}
                </ul>
            )}

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
