import '../style/receipt.css';

//assets
import logo from '../assets/SheehanLogo.png';
import { colorLabel } from '../data/roofingColors.js';
import { formatPickup } from '../data/pickupDate.js';

// purpose: the type or types of order, e.g. "Roofings, Steel"
// invoices: [{ invoiceNo, type }], each with the type of order it's for
// paymentStatus, salesman, team, pickupDate: the sales details from Customer order, each shown once it's set
// orders: the items on a ticket taken before invoices; concern: a Customer Report's concern, shown in place of them
// the runner, receiver and sales times from Customer order are for staff only, so the ticket never shows them
export default function Receipt({
    queueNumber, name, purpose, orders = [], concern, invoices = [], paymentStatus, salesman, team, pickupDate,
}) {
    const details = [
        ["Payment", paymentStatus],
        ["Salesman", salesman],
        ["Team", team],
        ["Pick-up", pickupDate && formatPickup(pickupDate)],
    ].filter(([, value]) => value);

    return (
        <section className="receipt">
            <hr className="receipt-tear" />

            <div className="receipt-brand">
                <img className="receipt-logo" src={logo} alt="Sheehan Inc. logo" />
                <div>
                    <h2 className="receipt-header">Sheehan Inc.</h2>
                    <p className="receipt-sub">Queue Ticket</p>
                </div>
            </div>

            <div className="receipt-row">
                <p className="receipt-label">Queue Number</p>
                <p className="receipt-queue">{queueNumber}</p>
            </div>

            <div className="receipt-row">
                <p className="receipt-label">Customer Name</p>
                <p className="receipt-value">{name}</p>
            </div>

            <div className="receipt-row">
                <p className="receipt-label">Type of Order</p>
                <p className="receipt-value">{purpose}</p>
            </div>

            {invoices.length > 0 && (
                <div className="receipt-row">
                    <p className="receipt-label">{invoices.length > 1 ? "Invoice Nos." : "Invoice No."}</p>
                    <ul className="receipt-invoices">
                        {invoices.map(({ invoiceNo, type }) => (
                            <li key={invoiceNo}>
                                <span>{invoiceNo}</span>
                                {type && <span className="receipt-invoice-type">{type}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {details.length > 0 && (
                <dl className="receipt-row receipt-details">
                    {details.map(([label, value]) => (
                        <div key={label}>
                            <dt className="receipt-label">{label}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {concern ? (
                <div className="receipt-row">
                    <p className="receipt-label">Concern</p>
                    <p className="receipt-value receipt-concern">{concern}</p>
                </div>
            ) : orders.length > 0 && (
                <div className="receipt-row">
                    <p className="receipt-label">Order</p>
                    <ul className="receipt-orders">
                        {orders.map((o, i) => (
                            <li key={i}>{o.qty}x {o.item}{o.color && ` (${colorLabel(o.color)})`}</li>
                        ))}
                    </ul>
                </div>
            )}

            <p className="receipt-footer">Please retain this ticket until called</p>
        </section>
    );
}
