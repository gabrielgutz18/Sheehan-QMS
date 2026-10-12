import '../style/receipt.css';

//assets
import logo from '../assets/SheehanLogo.png';
import { colorLabel } from '../data/roofingColors.js';

// concern: a Customer Report's concern, shown in place of the order
export default function Receipt({ queueNumber, name, purpose, orders = [], concern }) {
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
                <p className="receipt-label">Purpose</p>
                <p className="receipt-value">{purpose}</p>
            </div>

            {concern ? (
                <div className="receipt-row">
                    <p className="receipt-label">Concern</p>
                    <p className="receipt-value receipt-concern">{concern}</p>
                </div>
            ) : (
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
