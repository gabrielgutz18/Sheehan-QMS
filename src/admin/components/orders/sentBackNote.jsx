import { areasLeft } from '../../data/loadingAreas.js';
import { resultLabel } from '../../data/securityCheck.js';

// the guard's report that sent the order back, while the area it went back to still has to load it again
const sentBack = (order) => (order.returned && areasLeft(order).includes(order.returned.area) ? order.returned : null);

export default function SentBackNote({ order }) {
    const returned = sentBack(order);
    if (!returned) return null;
    return (
        <p className="sent-back-note">
            Sent back to {returned.area} by security · {resultLabel(returned.result)}
            {returned.note && ` · “${returned.note}”`} · {returned.by.name}
        </p>
    );
}
