import { INVOICE_COLUMNS, invoicesByColumn } from '../../data/sheetColumns.js';
import { resultLabel } from '../../data/securityCheck.js';
import { colorLabel } from '../../../data/roofingColors.js';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const timeOf = (iso) => timeFormat.format(new Date(iso));

// what the customer bought, on the Security page, for the guards to check against what they leave with: the invoice
// numbers under their department (as on the Order sheet), the items and quantities on a ticket taken before invoices,
// who loaded it in each area, and the guard's check: verified, or what they reported
export default function OrderProducts({ order }) {
    const invoices = invoicesByColumn(order);
    const columns = INVOICE_COLUMNS.filter(({ key }) => invoices[key].length > 0);
    const items = order.orders ?? [];
    const loadedAreas = (order.areas ?? []).filter((area) => area.loaded);
    const check = order.securityCheck;

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
            {loadedAreas.map(({ name, loaded }) => (
                <p key={name} className="order-products-loaded">
                    {name}: loaded by {loaded.by.name} · {timeOf(loaded.at)}
                </p>
            ))}
            {loadedAreas.length === 0 && order.loaded && (
                <p className="order-products-loaded">
                    Loaded by {order.loaded.by.name}{order.loaded.at && ` · ${timeOf(order.loaded.at)}`}
                </p>
            )}
            {check && (
                <p className={`order-products-check${check.result === "verified" ? "" : " is-reported"}`}>
                    {check.result === "verified" ? "✓ Verified" : `Reported: ${resultLabel(check.result)}`}
                    {` by ${check.by.name} · ${timeOf(check.at)}`}
                    {check.note && <span className="order-products-check-note">“{check.note}”</span>}
                </p>
            )}
        </div>
    );
}
