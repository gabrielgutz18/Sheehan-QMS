import { colorLabel } from '../../data/roofingColors.js';

// what the customer came for: the items they ordered, or a Customer Report's concern in their own words
export default function OrderDetails({ order }) {
    if (order.concern) {
        return (
            <p className="order-concern">
                <span className="order-details-label">Concern</span>
                {order.concern}
            </p>
        );
    }

    return (
        <ul className="item-list">
            {order.orders?.map((item, i) => (
                <li key={i}>{item.qty} × {item.item}{item.color && ` (${colorLabel(item.color)})`}</li>
            ))}
        </ul>
    );
}
