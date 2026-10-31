//func
import formatQueueNum from '../../data/queueNum.js';
import '../style/numberCard.css';

// variant: "serving" (the headline number) | "upcoming" (a ticket in the line, or someone else at a counter)
// priority: a priority order, shown as "* RS 01"
export default function NumberCard({ number, purpose, priority = false, variant = "upcoming" }) {
    return (
        <div className={`number-card number-card--${variant}`}>
            <span className="number-card-value">{formatQueueNum(number, purpose, priority)}</span>
        </div>
    );
}
