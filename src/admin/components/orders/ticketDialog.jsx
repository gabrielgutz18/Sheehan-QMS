import { useEffect, useRef } from 'react';

import formatQueueNum from '../../../data/queueNum.js';
import OrderDetails from './orderDetails.jsx';
import ServedBy from './servedBy.jsx';
import { inLine } from '../../data/orderStatus.js';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// "25 min", or "1 h 5 min"
const duration = (ms) => {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

// one ticket up close, opened with View on a waiting or returning ticket: its purpose and what the customer ordered
// (invoice, payment status, team, pick-up day), or their concern for a Customer Report
// order: the ticket as it is now, so it shows straight away when someone else takes it
// openedAt: when View was pressed, for how long they've waited; leave it out for a ticket that isn't in today's queue
// day: the ticket's day, for a ticket from the lists that cover every day
// children: anything more to show under who served it
// onServe: shows Serve while the ticket is still in line (My counter, for admins); leave it out to only look
/**
 * @param {{ order: any, openedAt?: number, day?: string, children?: any, onServe?: (order: any) => void, onClose: () => void }} props
 */
export default function TicketDialog({ order, openedAt, day, children, onServe, onClose }) {
    const dialogRef = useRef(null);

    useEffect(() => {
        if (!dialogRef.current.open) dialogRef.current.showModal();
    }, []);

    // how long they've waited counts from the ticket, so it's left off for a returning customer
    const waiting = openedAt !== undefined && order.status === "pending";

    return (
        <dialog ref={dialogRef} className="admin-dialog" aria-labelledby="ticket-title" onClose={onClose}>
            <div className="admin-dialog-body">
                <h2 id="ticket-title" className="admin-dialog-title">
                    <strong>{formatQueueNum(order.queueNum, order.purpose, order)}</strong> {order.name}
                </h2>

                <dl className="ticket-facts">
                    {day && (
                        <div>
                            <dt>Day</dt>
                            <dd>{day}</dd>
                        </div>
                    )}
                    <div>
                        <dt>Purpose</dt>
                        <dd>{order.purpose}</dd>
                    </div>
                    <div>
                        <dt>Took a ticket</dt>
                        <dd>
                            {timeFormat.format(new Date(order.createdAt))}
                            {waiting && ` · waiting ${duration(openedAt - Date.parse(order.createdAt))}`}
                        </dd>
                    </div>
                </dl>

                <div className="ticket-details">
                    {!order.concern && <span className="order-details-label">Order</span>}
                    <OrderDetails order={order} />
                </div>

                <ServedBy order={order} />
                {children}

                <div className="admin-dialog-actions">
                    <button type="button" className="admin-btn" onClick={() => dialogRef.current.close()}>
                        Close
                    </button>
                    {onServe && inLine(order) && (
                        <button type="button" className="admin-btn admin-btn-call" onClick={() => onServe(order)}>
                            Serve
                        </button>
                    )}
                </div>
            </div>
        </dialog>
    );
}
