import { useState } from "react";
import { Link } from "react-router";

import formatQueueNum from "../../../data/queueNum.js";
import { colorLabel } from "../../../data/roofingColors.js";
import { formatPickup } from "../../../data/pickupDate.js";
import { resultLabel } from "../../data/securityCheck.js";
import servedByInfo from "../../data/servedBy.js";
import Avatar from "../common/avatar.jsx";
import EditedBy from "./editedBy.jsx";
import TicketDialog from "./ticketDialog.jsx";

const invoiceLine = ({ invoices = [], orders = [] }) => {
    const more = (count) => count > 1 && <span className="ticket-card-more"> +{count - 1} more</span>;
    if (invoices.length > 0) {
        return (
            <>
                Invoice <strong>{invoices[0].invoiceNo}</strong>
                {invoices[0].type && <span className="invoice-type">{invoices[0].type}</span>}
                {more(invoices.length)}
            </>
        );
    }
    // a ticket taken before invoices
    if (orders.length > 0) {
        const [{ qty, item, color }] = orders;
        return (
            <>
                {qty} × {item}
                {color && ` (${colorLabel(color)})`}
                {more(orders.length)}
            </>
        );
    }
    return null;
};

// the one thing staff need to know next about the order: a guard's report first, then the gate, the day a returning
// customer picks up, and otherwise who sold it
const nextFact = (order) => {
    const check = order.securityCheck;
    if (check && check.result !== "verified") {
        return { text: `Reported ${resultLabel(check.result).toLowerCase()} by ${check.by.name}`, reported: true };
    }
    if (order.security === "waiting") return { text: "At the security check" };
    if (check) return { text: `Verified by ${check.by.name}` };
    if (order.pickupDate) return { text: `Picks up ${formatPickup(order.pickupDate)}` };
    if (order.salesman) return { text: `Sold by ${order.salesman}` };
    return null;
};

// the short version of OrderDetails: always the same three lines, so every card stays one size; See all details has
// the rest
function OrderSummary({ order }) {
    if (order.concern) return <p className="ticket-card-concern">{order.concern}</p>;

    const first = invoiceLine(order);
    const second = [order.paymentStatus, order.team && `${order.team} team`].filter(Boolean).join(" · ");
    const third = nextFact(order);
    if (!first && !second && !third) return <p className="ticket-card-line ticket-card-none">No order details yet</p>;

    return (
        <>
            <p className="ticket-card-line">{first}</p>
            <p className="ticket-card-line">{second}</p>
            <p className={`ticket-card-line${third?.reported ? " is-reported" : ""}`}>{third?.text}</p>
        </>
    );
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// who has the customer now, under the status, or when they took their ticket until someone does; the earlier tags are
// in See all details
function CurrentStaff({ order }) {
    const info = servedByInfo(order).at(-1);
    if (!info) {
        return (
            <span className="ticket-card-line">Took a ticket at {timeFormat.format(new Date(order.createdAt))}</span>
        );
    }
    return (
        <>
            <Avatar account={info.account} size={22} />
            <span className="ticket-card-line">
                {info.label} <strong>{info.account.name}</strong>
                {info.time && ` · ${info.time}`}
            </span>
        </>
    );
}

// View ticket and Edit, which only work on a ticket in today's queue, since a ticket number is only unique for its day:
// they stay in their place on every card and are grayed out with the reason when they can't be used
export function TicketLinks({ order, today = true }) {
    const ticket = formatQueueNum(order.queueNum, order.purpose, order);
    const notToday = "Only tickets in today's queue can be opened.";

    return (
        <>
            {/* the queue ticket, to print it again */}
            {today ? (
                <Link
                    className="admin-btn"
                    aria-label={`View ticket ${ticket}`}
                    to={`/staff/customer-order?ticket=${order.queueNum}&view=1`}
                >
                    View ticket
                </Link>
            ) : (
                <button type="button" className="admin-btn" disabled title={notToday}>
                    View ticket
                </button>
            )}
            {/* a Customer Report has a concern, which Customer order no longer takes */}
            {today && !order.concern ? (
                <Link
                    className="admin-btn"
                    aria-label={`Edit ticket ${ticket}`}
                    to={`/staff/customer-order?ticket=${order.queueNum}`}
                >
                    Edit
                </Link>
            ) : (
                <button
                    type="button"
                    className="admin-btn"
                    disabled
                    title={today ? "A customer report can't be edited." : notToday}
                >
                    Edit
                </button>
            )}
        </>
    );
}

// one ticket on Orders & history, the same on Today, Deleted and All tickets: its number and name, then Status, Purpose
// and Order in fixed rows, and the buttons along the bottom, so every card is one size with everything in the same
// place, and the longer facts open in See all details
// day: the ticket's day, on the lists that cover every day; those tickets aren't live, so no "waiting" time
// status: the status box; statusNote: replaces who has the customer under it; notes: extra lines for the details
// actions: the buttons
/**
 * @param {{ order: any, day?: string, status: any, statusNote?: any, notes?: any, actions: any }} props
 */
export default function TicketCard({ order, day, status, statusNote, notes, actions }) {
    const [openedAt, setOpenedAt] = useState(null);
    const ticket = formatQueueNum(order.queueNum, order.purpose, order);

    return (
        <li className="ticket-card">
            <div className="ticket-card-head">
                <div className="ticket-card-title">
                    <h2 className="ticket-card-number">{ticket}</h2>
                    {day && <span className="ticket-card-day">{day}</span>}
                </div>
                <p className="ticket-card-name" title={order.name}>
                    {order.name}
                </p>
            </div>

            <dl className="ticket-card-info">
                <div>
                    <dt>Status</dt>
                    <dd>
                        {status}
                        <div className="ticket-card-who">{statusNote ?? <CurrentStaff order={order} />}</div>
                    </dd>
                </div>
                <div>
                    <dt>Purpose</dt>
                    <dd className="ticket-card-purpose">{order.purpose}</dd>
                </div>
                <div>
                    <dt>{order.concern ? "Concern" : "Order"}</dt>
                    <dd>
                        <div className="ticket-card-order">
                            <OrderSummary order={order} />
                        </div>
                        <button
                            type="button"
                            className="ticket-card-details"
                            aria-label={`See all details of ticket ${ticket}`}
                            onClick={() => setOpenedAt(Date.now())}
                        >
                            See all details
                        </button>
                    </dd>
                </div>
            </dl>

            <div className="ticket-card-actions">{actions}</div>

            {openedAt !== null && (
                <TicketDialog
                    order={order}
                    day={day}
                    openedAt={day ? undefined : openedAt}
                    onClose={() => setOpenedAt(null)}
                >
                    {notes}
                    <EditedBy edits={order.edits} />
                </TicketDialog>
            )}
        </li>
    );
}
