//func
import formatQueueNum from "../../data/queueNum.js";
import "../style/numberCard.css";

// variant: "serving" (the headline number) | "upcoming" (a ticket in the line, or someone else at a counter)
// marks: the order, for the mark in front of a priority ("* RS 01") or TBA priority ("** T 01") one
export default function NumberCard({ number, purpose, marks, variant = "upcoming" }) {
    const text = formatQueueNum(number, purpose, marks);
    // the stylesheet sizes the number by how long it is; a ticket can be for several types of order
    const fit = /** @type {import('react').CSSProperties} */ ({ "--len": text.length });

    return (
        <div className={`number-card number-card--${variant}`} style={fit}>
            <span className="number-card-value">{text}</span>
        </div>
    );
}
