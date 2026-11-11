import { colorLabel } from "../../../data/roofingColors.js";
import { formatPickup, todayKey } from "../../../data/pickupDate.js";
import { checkerSummary } from "../../../data/checkers.js";
import { workOf } from "../../../data/loadingAreas.js";
import { resultLabel } from "../../data/securityCheck.js";

// a sales time as Customer order keeps it, "13:05", the way this computer shows the time, e.g. "1:05 PM"
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const formatSalesTime = (time) => timeFormat.format(new Date(`2000-01-01T${time}`));

// when the customer was at sales: "9:00 AM – 9:20 AM", or just the one time sales kept
const salesTime = ({ salesTimeIn, salesTimeOut }) =>
    [salesTimeIn, salesTimeOut].filter(Boolean).map(formatSalesTime).join(" – ");

// OrderDetails as a small spreadsheet for the department pages' cards, a label column and a value column with lines
// between the rows, so the crew reads straight down instead of hunting through a wrapped line: the invoices to load first, then how it's paid, who sold it and
// when, the pick-up day, who did each area so far, the gate, and anything else Customer order took
// lead: the card's own rows to put first, e.g. a changed call message; false ones are left out
/** @param {{ order: any, lead?: any[] }} props */
export default function OrderFacts({ order, lead = [] }) {
    const invoices = order.invoices ?? [];
    const items = order.orders ?? [];
    const loadedAreas = (order.areas ?? []).filter((area) => area.loaded);
    const check = order.securityCheck;
    const checked = checkerSummary(order.checkers);
    const time = salesTime(order);
    const soldBy = [order.salesman, order.team && `${order.team} team`].filter(Boolean).join(" · ");

    /** @type {{ label: string, value: any, tone?: string }[]} */
    const rows = [
        ...lead,
        // a Customer Report's concern, in the customer's own words, where an order's invoices would be
        order.concern && { label: "Concern", value: order.concern, tone: "concern" },
        invoices.length > 0 && {
            label: invoices.length > 1 ? "Invoices" : "Invoice",
            value: invoices.map(({ invoiceNo, type }) => (
                <span key={invoiceNo} className="order-facts-invoice">
                    <strong>{invoiceNo}</strong>
                    {type && <span className="invoice-type">{type}</span>}
                </span>
            )),
        },
        items.length > 0 && {
            label: "Items",
            value: items.map((item, i) => (
                <span key={i} className="order-facts-line">
                    {item.qty} × {item.item}
                    {item.color && ` (${colorLabel(item.color)})`}
                </span>
            )),
        },
        // paid in green, anything still to collect (Vale, Terms, COD, Partial) in amber
        order.paymentStatus && {
            label: "Payment",
            value: (
                <span className={`order-facts-pay${order.paymentStatus === "Paid" ? " is-paid" : ""}`}>
                    {order.paymentStatus}
                </span>
            ),
        },
        soldBy && { label: "Sold by", value: soldBy },
        time && { label: "At sales", value: time },
        // who the customer sent to collect the items
        order.runner && { label: "Runner", value: <strong>{order.runner}</strong> },
        order.receiver && { label: "Receiver", value: <strong>{order.receiver}</strong> },
        checked && { label: "Checked by", value: checked },
        // a returning customer: the day they come back for the items
        order.pickupDate && {
            label: "Pick-up",
            value:
                order.pickupDate === todayKey()
                    ? `Today · ${formatPickup(order.pickupDate)}`
                    : formatPickup(order.pickupDate),
            tone: "pickup",
        },
        // each area done so far, and who did it ("Hardware prepared by", workOf)
        loadedAreas.length > 0 && {
            label: "Done",
            value: loadedAreas.map(({ name, loaded }) => (
                <span key={name} className="order-facts-line">
                    {name} {workOf(name).done} by <strong>{loaded.by.name}</strong>
                </span>
            )),
        },
        // the security check at the gate
        order.security === "waiting" && { label: "Gate", value: "At the security check", tone: "security" },
        check && {
            label: "Gate",
            value: (
                <>
                    {check.result === "verified" ? "Verified" : `Reported ${resultLabel(check.result).toLowerCase()}`}{" "}
                    by <strong>{check.by.name}</strong>
                    {check.note && `: “${check.note}”`}
                </>
            ),
            tone: check.result === "verified" ? "security" : "reported",
        },
    ].filter(Boolean);

    if (rows.length === 0) return null;

    return (
        <table className="order-facts">
            <tbody>
                {rows.map(({ label, value, tone }, i) => (
                    <tr key={`${label}-${i}`} className={tone ? `is-${tone}` : undefined}>
                        <th scope="row">{label}</th>
                        <td>{value}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
