import { colorLabel } from '../../../data/roofingColors.js';
import { formatPickup } from '../../../data/pickupDate.js';
import { checkerSummary } from '../../../data/checkers.js';
import { resultLabel } from '../../data/securityCheck.js';

// a sales time as Customer order keeps it, "13:05", the way this computer shows the time, e.g. "1:05 PM"
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const formatSalesTime = (time) => timeFormat.format(new Date(`2000-01-01T${time}`));

// what the customer came for: the invoices (each with its type of order), payment status, sales team, salesman,
// runner, receiver, sales times, checkers and pick-up day from Customer order, who loaded it in each area, the
// security check at the gate (waiting, verified, or what the guard reported), the items on a ticket taken before
// invoices, or a Customer Report's concern in their own words
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
    const checked = checkerSummary(order.checkers);
    const loadedAreas = (order.areas ?? []).filter((area) => area.loaded);
    const check = order.securityCheck;
    const hasSale =
        invoices.length > 0 || order.paymentStatus || order.team || order.salesman || order.runner || order.receiver ||
        order.salesTimeIn || order.salesTimeOut || checked || order.pickupDate || loadedAreas.length > 0 ||
        order.security;

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
                    {/* the sales team that served the customer */}
                    {order.team && <li>{order.team} team</li>}
                    {order.salesman && <li>Sold by {order.salesman}</li>}
                    {/* who the customer sent to collect the items */}
                    {order.runner && <li>Runner <strong>{order.runner}</strong></li>}
                    {order.receiver && <li>Receiver <strong>{order.receiver}</strong></li>}
                    {/* when the customer came in to sales and when they left it */}
                    {order.salesTimeIn && <li>Time in {formatSalesTime(order.salesTimeIn)}</li>}
                    {order.salesTimeOut && <li>Time out {formatSalesTime(order.salesTimeOut)}</li>}
                    {checked && <li>Checked by {checked}</li>}
                    {/* a returning customer: they come back for the items that day */}
                    {order.pickupDate && <li className="sale-pickup">Picks up {formatPickup(order.pickupDate)}</li>}
                    {/* loading, area by area */}
                    {loadedAreas.map(({ name, loaded }) => (
                        <li key={name}>{name} loaded by <strong>{loaded.by.name}</strong></li>
                    ))}
                    {/* the security check at the gate */}
                    {order.security === "waiting" && <li className="sale-security">At the security check</li>}
                    {check && (
                        <li className={`sale-security${check.result === "verified" ? "" : " is-reported"}`}>
                            {check.result === "verified" ? "Verified" : `Reported ${resultLabel(check.result).toLowerCase()}`} by{" "}
                            <strong>{check.by.name}</strong>
                            {check.note && `: “${check.note}”`}
                        </li>
                    )}
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
