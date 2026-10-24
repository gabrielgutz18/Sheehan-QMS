import { colorLabel } from '../../data/roofingColors.js';
import { formatPickup } from '../../data/pickupDate.js';
import { teamState, teamsOf } from '../data/loadingTeams.js';

const TEAM_STATES = {
    waiting: { mark: "", label: "waiting" },
    serving: { mark: " · now", label: "serving now" },
    done: { mark: " ✓", label: "done" },
};

// a sales time as Customer order keeps it, "13:05", the way this computer shows the time, e.g. "1:05 PM"
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const formatSalesTime = (time) => timeFormat.format(new Date(`2000-01-01T${time}`));

// what the customer came for: the invoices (each with its type of order), payment status, loading teams (and how far
// along each is), salesman, runner, receiver, sales times and pick-up day from Customer order, the items on a ticket
// taken before invoices, or a Customer Report's concern in their own words
export default function OrderDetails({ order }) {
    if (order.concern) {
        return (
            <p className="order-concern">
                <span className="order-details-label">Concern</span>
                {order.concern}
            </p>
        );
    }

    const invoices = order.invoices ?? [];
    const hasSale =
        invoices.length > 0 || order.paymentStatus || order.team || order.salesman || order.runner || order.receiver ||
        order.salesTimeIn || order.salesTimeOut || order.pickupDate;

    return (
        <>
            {hasSale && (
                <ul className="sale-facts">
                    {invoices.map(({ invoiceNo, type }) => (
                        <li key={invoiceNo}>
                            Invoice <strong>{invoiceNo}</strong>
                            {type && <span className="invoice-type">{type}</span>}
                        </li>
                    ))}
                    {order.paymentStatus && <li className="sale-pay">{order.paymentStatus}</li>}
                    {teamsOf(order).map((team) => {
                        const state = teamState(order, team);
                        return (
                            <li key={team} className={`team-stop is-${state}`}>
                                {team}
                                <span aria-hidden="true">{TEAM_STATES[state].mark}</span>
                                <span className="visually-hidden"> ({TEAM_STATES[state].label})</span>
                            </li>
                        );
                    })}
                    {order.salesman && <li>Sold by {order.salesman}</li>}
                    {/* who the customer sent to collect the items */}
                    {order.runner && <li>Runner <strong>{order.runner}</strong></li>}
                    {order.receiver && <li>Receiver <strong>{order.receiver}</strong></li>}
                    {/* when the customer came in to sales and when they left it */}
                    {order.salesTimeIn && <li>Time in {formatSalesTime(order.salesTimeIn)}</li>}
                    {order.salesTimeOut && <li>Time out {formatSalesTime(order.salesTimeOut)}</li>}
                    {/* a returning customer: they come back for the items that day */}
                    {order.pickupDate && <li className="sale-pickup">Picks up {formatPickup(order.pickupDate)}</li>}
                </ul>
            )}
            {order.orders?.length > 0 && (
                <ul className="item-list">
                    {order.orders.map((item, i) => (
                        <li key={i}>{item.qty} × {item.item}{item.color && ` (${colorLabel(item.color)})`}</li>
                    ))}
                </ul>
            )}
        </>
    );
}
