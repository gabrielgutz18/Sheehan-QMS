//func
import formatQueueNum from '../data/queueNum.js';
import '../style/numberCard.css';

// variant: "serving" (big red card) | "next" (first in line) | "upcoming"
export default function NumberCard({ number, purpose, variant = "upcoming" }) {
    return (
        <div className={`number-card number-card--${variant}`}>
            <span className="number-card-value">{formatQueueNum(number, purpose)}</span>
        </div>
    );
}
