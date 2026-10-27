import { useState } from 'react';
import { Link } from 'react-router';

import formatQueueNum from '../../../data/queueNum.js';
import TicketDialog from '../orders/ticketDialog.jsx';
import { inLine } from '../../data/orderStatus.js';

// the line, as the queue display lists it but smaller: the next waiting or returning tickets in queue order, each with
// the customer's name and their type of order, and how many are in line altogether
// manage: the orders have their details (admins), so a ticket's number opens its order or concern, with a link to
// Orders under the list
export default function NextNumComp({ orders, loading, limit = 6, manage = false }) {
    const line = orders.filter(inLine);
    const shown = line.slice(0, limit);
    const hidden = line.length - shown.length;
    // the ticket opened from its number: { queueNum, openedAt }, looked up in the live queue so it stays current
    const [viewing, setViewing] = useState(null);
    const viewed = viewing && orders.find((o) => o.queueNum === viewing.queueNum);

    return (
        <section className="mini-line" aria-labelledby="mini-line-title">
            <div className="mini-line-head">
                <h2 id="mini-line-title" className="mini-line-title">In line</h2>
                <span className="mini-line-count">{loading ? "–" : line.length} in line</span>
            </div>

            {shown.length === 0 ? (
                <p className="mini-empty">{loading ? "Loading..." : "No one in line"}</p>
            ) : (
                <table className="mini-line-table">
                    <thead>
                        <tr>
                            <th scope="col">Ticket</th>
                            <th scope="col">Customer</th>
                            <th scope="col">Station</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((o) => {
                            const ticket = formatQueueNum(o.queueNum, o.purpose);
                            return (
                                <tr key={o.queueNum}>
                                    <td>
                                        {manage ? (
                                            <button
                                                type="button"
                                                className="mini-num mini-line-view"
                                                aria-haspopup="dialog"
                                                aria-label={`View ${ticket}`}
                                                onClick={() => setViewing({ queueNum: o.queueNum, openedAt: Date.now() })}
                                            >
                                                {ticket}
                                            </button>
                                        ) : (
                                            <span className="mini-num">{ticket}</span>
                                        )}
                                    </td>
                                    <td className="mini-name">
                                        {o.name}
                                        {o.status === "returning" && <span className="mini-returning">Returning</span>}
                                    </td>
                                    <td><span className="mini-pill">{o.purpose}</span></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            {hidden > 0 && <p className="mini-more">+{hidden} more in line</p>}
            {manage && <Link to="/admin/orders" className="admin-link mini-line-manage">Manage orders →</Link>}

            {viewed && <TicketDialog order={viewed} openedAt={viewing.openedAt} onClose={() => setViewing(null)} />}
        </section>
    );
}
