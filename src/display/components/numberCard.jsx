//func
import formatQueueNum from '../../data/queueNum.js';
import '../style/numberCard.css';

// variant: "serving" (the headline number) | "upcoming" (a ticket in the line, or someone else at a counter)
// marks: the order, for the mark in front of a priority ("* RS 01") or TBA priority ("** T 01") one
export default function NumberCard({ number, purpose, marks, variant = "upcoming" }) {
    return (
        <div className={`number-card number-card--${variant}`}>
            <span className="number-card-value">{formatQueueNum(number, purpose, marks)}</span>
        </div>
    );
}
