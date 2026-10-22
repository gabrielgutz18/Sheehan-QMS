import { colorLabel } from '../../data/roofingColors.js';
import { formatPickup } from '../../data/pickupDate.js';
import { teamState, teamsOf } from '../data/loadingTeams.js';

const TEAM_STATES = {
    waiting: { mark: "", label: "waiting" },
    serving: { mark: " · now", label: "serving now" },
    done: { mark: " ✓", label: "done" },
};

// what the customer came for: the invoice, payment status, loading teams (and how far along each is), salesman and
// pick-up day from Customer order, the items on a ticket taken before invoices, or a Customer Report's concern in
// their own words
export default function OrderDetails({ order }) {
    if (order.concern) {
        return (
            <p className="order-concern">
                <span className="order-details-label">Concern</span>
                {order.concern}
            </p>
        );
    }

    const hasSale = order.invoiceNo || order.paymentStatus || order.team || order.salesman || order.pickupDate;

    return (
        <>
            {hasSale && (
                <ul className="sale-facts">
                    {order.invoiceNo && <li>Invoice <strong>{order.invoiceNo}</strong></li>}
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
