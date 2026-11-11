import { ticketNumber } from "../../../data/queueNum.js";
import { formatPickup } from "../../../data/pickupDate.js";

// Customer order's summary, beside Serve at the bottom of the form: the ticket's number as it will print and, in one
// line, who it's for, what for and how many invoices, filled in as the form is; Ticket preview shows the whole ticket
// fields: the form as it is now; ticket: the saved ticket while it's being edited, for its number
export default function OrderSummary({ fields, ticket }) {
    const invoices = fields.invoices.filter((invoice) => invoice.invoiceNo.trim()).length;
    const purpose = fields.types.join(", ");
    const number = ticketNumber({
        ...fields,
        queueNum: ticket?.queueNum ?? "--",
        purpose: purpose || ticket?.purpose,
        pickup: ticket?.pickup,
    });
    const parts = [
        fields.name.trim(),
        purpose,
        invoices && (invoices === 1 ? "1 invoice" : `${invoices} invoices`),
        fields.returning && fields.pickupDate && `Pick-up ${formatPickup(fields.pickupDate)}`,
    ].filter(Boolean);

    return (
        <div className="sale-summary">
            {/* the number's letters come from the types of order, so it shows once one is picked */}
            <p className="sale-summary-ticket">
                {ticket ? "Editing" : "New ticket"}
                {(ticket || purpose) && <strong>{number}</strong>}
            </p>
            {parts.length ? (
                <p className="sale-summary-line">{parts.join(" · ")}</p>
            ) : (
                <p className="sale-summary-line is-empty">
                    Fill in the order, then press Serve. The ticket shows after, to print.
                </p>
            )}
        </div>
    );
}
