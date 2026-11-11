import { areasLeft } from "../../data/loadingAreas.js";
import { resultLabel } from "../../data/securityCheck.js";

// the guard's report that sent the order back, while the area it went back to still has to load it again
const sentBack = (order) => (order.returned && areasLeft(order).includes(order.returned.area) ? order.returned : null);

// the crew's recall to an area it had already done (the wrong receipt, the wrong order), while that area still has to
// do it again, and unless the gate sent it back since
const recalled = (order) => {
    const recall = order.recalled;
    if (!recall || !areasLeft(order).includes(recall.area)) return null;
    return order.returned && order.returned.at > recall.at ? null : recall;
};

// why the customer is back at an area that was already done: the gate sent them back, or the crew recalled them
export default function SentBackNote({ order }) {
    const returned = sentBack(order);
    const recall = recalled(order);
    if (recall && !(returned && returned.at > recall.at)) {
        return (
            <p className="sent-back-note">
                Recalled to {recall.area} · “{recall.reason}” · {recall.by.name}
            </p>
        );
    }
    if (!returned) return null;
    return (
        <p className="sent-back-note">
            Sent back to {returned.area} by security · {resultLabel(returned.result)}
            {returned.note && ` · “${returned.note}”`} · {returned.by.name}
        </p>
    );
}
