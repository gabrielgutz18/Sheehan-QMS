import formatQueueNum from '../../data/queueNum.js';
import { formatPickup } from '../../data/pickupDate.js';

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
    const rows = [
        ["Invoice number", fields.invoiceNo.trim()],
        ["Salesman", fields.salesman.trim()],
        ["Payment status", fields.paymentStatus],
        ["Team", fields.teams.join(", ")],
        ["Pick-up", pickup],
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
                    {rows.map(([label, value]) => <SummaryRow key={label} label={label} value={value} />)}
                </dl>
            </div>
        </aside>
    );
}
