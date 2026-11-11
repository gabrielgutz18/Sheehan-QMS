//func
import { paperNumber, shortDay } from "../../data/queueNum.js";
import "../style/numberCard.css";

// variant: "serving" (the headline number) | "upcoming" (a ticket in the line, or someone else at a counter)
// marks: the order, for the mark in front of a priority ("* RS 01") or TBA priority ("** T 01") one, and for a
// pick-up's paper number (marks.pickup), which shows with the day it was given under it, "PICK-UP · NOV 11", so it's
// never mistaken for today's RS 01 or another day's
export default function NumberCard({ number, purpose, marks, variant = "upcoming" }) {
    const text = paperNumber({ ...marks, queueNum: number, purpose });
    // the stylesheet sizes the number by how long it is; a ticket can be for several types of order
    const fit = /** @type {import('react').CSSProperties} */ ({ "--len": text.length });

    return (
        <div
            className={`number-card number-card--${variant}${marks?.pickup ? " number-card--pickup" : ""}`}
            style={fit}
        >
            <span className="number-card-value">{text}</span>
            {marks?.pickup && <span className="number-card-pickup">Pick-up · {shortDay(marks.pickup.date)}</span>}
        </div>
    );
}
