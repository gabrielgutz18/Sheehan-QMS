import '../style/receipt.css';

//assets
import logo from '../../assets/SheehanLogo.png';
import checkerColumns, { CHECKER_ROUNDS, breakable } from '../../data/checkers.js';

// the invoice table's lines; more invoices than this add a line each
const INVOICE_ROWS = 13;

// the queue ticket and exit pass, a form filled in by hand at the gate and the warehouse: the date and time in and
// out, trucking, plate number, runner, the pick-up question and each invoice's status are left blank to write in
// purpose: the type or types of order, e.g. "Roofings, Steel"
// name: the customer, in Driver / Customer name
// invoices: [{ invoiceNo, type }]; each number goes on a line of the invoice table
// concern: a Customer Report's concern, shown under the type of order
// checkers: { Roofing: ["Pedro", ""] }; the table is always on the ticket, each name left out blank to write it in
// the payment, salesman, team, pick-up day, runner, receiver and sales times from Customer order are for staff only,
// so the ticket never shows them
// paper: laid out exactly as it prints on its 90 x 148 mm page (see .receipt--paper in receipt.css)
export default function Receipt({ queueNumber, name, purpose, concern, invoices = [], checkers = {}, paper = false }) {
    const invoiceRows = Array.from({ length: Math.max(INVOICE_ROWS, invoices.length) }, (_, i) => invoices[i]);

    return (
        <section className={`receipt${paper ? " receipt--paper" : ""}`}>
            <header className="receipt-head">
                <div className="receipt-brand">
                    <img className="receipt-logo" src={logo} alt="Sheehan Inc. logo" />
                    <div>
                        <h2 className="receipt-header">Sheehan Inc.</h2>
                        <p className="receipt-sub">Queue Ticket &amp; Exit Pass</p>
                    </div>
                </div>
                <div className="receipt-number">
                    <p className="receipt-label">Queue Number</p>
                    <p className="receipt-queue">{queueNumber}</p>
                </div>
            </header>

            <table className="receipt-form receipt-times">
                <tbody>
                    <tr>
                        <th scope="row">Date/Time</th>
                        <td />
                        <td>In</td>
                        <td>Out</td>
                    </tr>
                </tbody>
            </table>

            <table className="receipt-form receipt-info">
                <tbody>
                    <tr>
                        <td>Trucking</td>
                        <td className="receipt-type" rowSpan={4}>
                            <p className="receipt-label">Type of Order</p>
                            <p className="receipt-value">{purpose}</p>
                            {concern && <p className="receipt-concern">{concern}</p>}
                        </td>
                    </tr>
                    <tr><td>Plate Number</td></tr>
                    <tr>
                        <td>
                            Driver / Customer Name
                            {name && <span className="receipt-name">{name}</span>}
                        </td>
                    </tr>
                    <tr><td>Runner Name</td></tr>
                </tbody>
            </table>

            <table className="receipt-form receipt-checkers">
                <thead>
                    <tr>
                        <th scope="col">Checker</th>
                        {checkerColumns.map(({ name: column }) => (
                            <th key={column} scope="col">{breakable(column)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {CHECKER_ROUNDS.map(({ name: round, short }, i) => (
                        <tr key={round}>
                            <th scope="row" aria-label={round}>{short}</th>
                            {checkerColumns.map(({ name: column }) => (
                                <td key={column}>{checkers[column]?.[i]}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="receipt-pickup">
                <p>May kasabay bang ibang pick up?</p>
                <p className="receipt-pickup-answer">
                    <span className="receipt-box" /> No
                    <span className="receipt-box" /> Yes
                    <span className="receipt-pickup-count">If yes, how many:</span>
                </p>
            </div>

            <table className="receipt-form receipt-invoices">
                <thead>
                    <tr>
                        <th scope="col">Invoice No.</th>
                        <th scope="col">Status (Partial / Full)</th>
                        <th scope="col">With Invoice</th>
                        <th scope="col">Without Invoice</th>
                    </tr>
                </thead>
                <tbody>
                    {invoiceRows.map((invoice, i) => (
                        <tr key={i}>
                            <td>{invoice?.invoiceNo}</td>
                            <td />
                            <td />
                            <td />
                        </tr>
                    ))}
                </tbody>
            </table>

            <p className="receipt-footer">Please retain this ticket until called</p>
        </section>
    );
}
