import { ROLE_LABELS } from "../../auth/roles.js";
import useMediaQuery from "../../hooks/useMediaQuery.js";
import { stageOf, whereNow } from "../../data/orderStage.js";
import { INVOICE_COLUMNS, invoicesByColumn, sheetDate } from "../../data/sheetColumns.js";
import formatQueueNum from "../../../data/queueNum.js";
import paymentStatus from "../../../data/paymentStatus.js";

const PAYMENTS = paymentStatus.map((p) => p.type);

// when each order is a card instead of a table row; By product's lists keep one set of column widths and don't fit
// beside the menu on a smaller screen, and sideways scrolling to reach the payment buttons is easy to miss
const CARDS = "(max-width: 760px)";
const BY_PRODUCT_CARDS = "(max-width: 1279px)";

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const changeFormat = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

const ticketOf = (o) => formatQueueNum(o.queueNum, o.purpose, o);

// the invoice numbers under their department, as on the Order sheet
function Invoices({ order }) {
    const invoices = invoicesByColumn(order);
    const columns = INVOICE_COLUMNS.filter(({ key }) => invoices[key].length > 0);
    if (columns.length === 0) return <span className="cashier-none">No invoices</span>;
    return (
        <dl className="cashier-invoices">
            {columns.map(({ key, header }) => (
                <div key={key}>
                    <dt>{header}</dt>
                    <dd>
                        {invoices[key].map((invoiceNo) => (
                            <span key={invoiceNo} className="order-products-invoice">
                                {invoiceNo}
                            </span>
                        ))}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

// on the By product tab: only this group's invoices, as its heading already says whose they are, and what else is on the
// ticket, so nobody takes this line for the whole order
function GroupInvoices({ invoices, also }) {
    return (
        <>
            {invoices.length === 0 ? (
                <span className="cashier-none">No invoices</span>
            ) : (
                <div className="cashier-group-invoices">
                    {invoices.map(({ invoiceNo }) => (
                        <span key={invoiceNo} className="order-products-invoice">
                            {invoiceNo}
                        </span>
                    ))}
                </div>
            )}
            {also.length > 0 && <span className="order-status-sub">Also: {also.join(", ")}</span>}
        </>
    );
}

// one tap on how the order is paid; the one it is now is pressed, and an order's own status the list no longer has
// still shows
function PaymentButtons({ order, busy, onPick }) {
    const choices =
        order.paymentStatus && !PAYMENTS.includes(order.paymentStatus) ? [order.paymentStatus, ...PAYMENTS] : PAYMENTS;
    return (
        <div className="cashier-payments" role="group" aria-label={`Payment status for ${ticketOf(order)}`}>
            {choices.map((type) => (
                <button
                    key={type}
                    type="button"
                    className={`cashier-payment is-${type.toLowerCase()}`}
                    aria-pressed={order.paymentStatus === type}
                    disabled={busy}
                    onClick={() => onPick(type)}
                >
                    {type}
                </button>
            ))}
        </div>
    );
}

// who last changed how it's paid, with their role, so a cashier covering for a salesman shows as the cashier; an older
// order can have a status with no record of who set it, and then there's nothing to say under it
function LastChange({ change }) {
    return (
        <span className="cashier-change">
            Changed by{" "}
            {change.by.role && (
                <>
                    {ROLE_LABELS[change.by.role]} <span aria-hidden="true">→</span>{" "}
                </>
            )}
            <strong>{change.by.name}</strong> · {changeFormat.format(new Date(change.at))}
        </span>
    );
}

// the orders on both Cashier tabs; lines: [{ order }], with the group's invoices and also from the By product tab
// a mixed ticket is a line under each of its groups but has one payment status, so every line changes with it; busy:
// the ids of the orders whose change is on its way
export default function CashierTable({ lines, byProduct, busy, onPick }) {
    const cards = useMediaQuery(byProduct ? BY_PRODUCT_CARDS : CARDS);
    return (
        <div className="admin-table-wrap">
            <table className={`admin-table cashier-table${cards ? " is-cards" : ""}`}>
                <thead>
                    <tr>
                        <th scope="col">Ticket</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Invoices</th>
                        <th scope="col">Where now</th>
                        <th scope="col">Payment status</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map(({ order: o, invoices, also }) => (
                        <tr key={o.id}>
                            <th scope="row" data-label="Ticket">
                                <strong className="order-status-ticket">{ticketOf(o)}</strong>
                                <span className="order-status-sub">
                                    {o.isToday ? "Today" : sheetDate(o.createdAt)} ·{" "}
                                    {timeFormat.format(new Date(o.createdAt))}
                                </span>
                            </th>
                            <td data-label="Customer">
                                {o.name}
                                <span className="order-status-sub">
                                    {[o.salesman && `Salesman: ${o.salesman}`, o.team].filter(Boolean).join(" · ") ||
                                        o.purpose}
                                </span>
                            </td>
                            <td data-label="Invoices">
                                {invoices ? <GroupInvoices invoices={invoices} also={also} /> : <Invoices order={o} />}
                            </td>
                            <td data-label="Where now">
                                <span className={`stage-badge is-${stageOf(o)}`}>{whereNow(o)}</span>
                            </td>
                            <td data-label="Payment status">
                                <PaymentButtons order={o} busy={busy.has(o.id)} onPick={(type) => onPick(o, type)} />
                                {o.paymentChange && <LastChange change={o.paymentChange} />}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
