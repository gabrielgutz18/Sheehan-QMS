import { INVOICE_COLUMNS, invoicesByColumn } from '../../data/sheetColumns.js';
import { colorLabel } from '../../../data/roofingColors.js';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const timeOf = (iso) => timeFormat.format(new Date(iso));

// what the customer bought, on the Security page, for the guards to check against what they leave with: the invoice
// numbers under their department (as on the Order sheet), the items and quantities on a ticket taken before invoices,
// who finished loading it, and when it was marked Done
export default function OrderProducts({ order }) {
    const invoices = invoicesByColumn(order);
    const columns = INVOICE_COLUMNS.filter(({ key }) => invoices[key].length > 0);
    const items = order.orders ?? [];

    return (
        <div className="order-products">
            {columns.length === 0 && items.length === 0 && <p className="order-products-none">No products listed</p>}
            {columns.length > 0 && (
                <dl className="order-products-invoices">
                    {columns.map(({ key, header }) => (
                        <div key={key} className="order-products-row">
                            <dt>{header}</dt>
                            <dd>
                                {invoices[key].map((invoiceNo) => (
                                    <span key={invoiceNo} className="order-products-invoice">{invoiceNo}</span>
                                ))}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
            {items.length > 0 && (
                <ul className="order-products-items">
                    {items.map((item, i) => (
                        <li key={i}>
                            <strong>{item.qty} ×</strong> {item.item}{item.color && ` (${colorLabel(item.color)})`}
                        </li>
                    ))}
                </ul>
            )}
            {(order.loaded || order.servedAt) && (
                <p className="order-products-loaded">
                    {order.loaded && <>Loaded by {order.loaded.by.name}{order.loaded.at && ` · ${timeOf(order.loaded.at)}`}</>}
                    {order.loaded && order.servedAt && " · "}
                    {order.servedAt && <>Done {timeOf(order.servedAt)}</>}
                </p>
            )}
        </div>
    );
}
