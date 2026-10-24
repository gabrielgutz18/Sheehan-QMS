import formatQueueNum from '../../data/queueNum.js';
import { formatPickup } from '../../data/pickupDate.js';
import { checkerSummary } from '../../data/checkers.js';

// one line of the summary, with a dash until it's filled in
function SummaryRow({ label, value }) {
    return (
        <div>
            <dt>{label}</dt>
            <dd className={value ? undefined : "is-empty"}>{value || "—"}</dd>
        </div>
    );
}

// Customer order's Summary: what the ticket will say, filled in as the form is
// fields: the form as it is now; ticket: the saved ticket while it's being edited, for its number
export default function OrderSummary({ fields, ticket }) {
    const pickup = !fields.returning ? "Today" : fields.pickupDate && formatPickup(fields.pickupDate);
    const invoices = fields.invoices.filter((invoice) => invoice.invoiceNo.trim());
    const rows = [
        ["Salesman", fields.salesman.trim()],
        ["Payment status", fields.paymentStatus],
        ["Team", fields.teams.join(", ")],
        ["Pick-up", pickup],
        // from the Checker tab; a dash while they're all blank, to be written in by hand
        ["Checkers", checkerSummary(fields.checkers)],
    ];

    return (
        <aside className="sale-summary" aria-labelledby="sale-summary-title">
            <h2 id="sale-summary-title" className="sale-summary-title">Summary</h2>
            <div className="sale-summary-box">
                {ticket && (
                    <p className="sale-summary-ticket">
                        Editing <strong>{formatQueueNum(ticket.queueNum, fields.types.join(", ") || ticket.purpose)}</strong>
                    </p>
                )}
                <dl className="sale-summary-list">
                    <SummaryRow label="Customer" value={fields.name.trim()} />
                    <div>
                        <dt>Type of order</dt>
                        {fields.types.length ? (
                            <dd>
                                <ul className="type-chips">
                                    {fields.types.map((type) => <li key={type}>{type}</li>)}
                                </ul>
                            </dd>
                        ) : (
                            <dd className="is-empty">—</dd>
                        )}
                    </div>
                    <div>
                        <dt>{invoices.length > 1 ? `Invoices (${invoices.length})` : "Invoice"}</dt>
                        {invoices.length ? (
                            <dd>
                                <ul className="summary-invoices">
                                    {invoices.map(({ key, invoiceNo, type }) => (
                                        <li key={key}>
                                            {invoiceNo.trim()}
                                            {fields.types.includes(type) && <span className="invoice-type">{type}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </dd>
                        ) : (
                            <dd className="is-empty">—</dd>
                        )}
                    </div>
                    {rows.map(([label, value]) => <SummaryRow key={label} label={label} value={value} />)}
                </dl>
            </div>
        </aside>
    );
}
