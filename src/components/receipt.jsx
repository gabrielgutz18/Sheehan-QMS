import '../style/receipt.css';

//assets
import logo from '../assets/SheehanLogo.png';

export default function Receipt({ queueNumber, name, purpose, orders = [] }) {
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

            <div className="receipt-row">
                <p className="receipt-label">Order</p>
                <ul className="receipt-orders">
                    {orders.map((o, i) => (
                        <li key={i}>{o.qty}x {o.item}</li>
                    ))}
                </ul>
            </div>

            <p className="receipt-footer">Please retain this ticket until called</p>
        </section>
    );
}
