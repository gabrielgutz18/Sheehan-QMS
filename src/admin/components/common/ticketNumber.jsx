import { paperNumber, shortDay } from "../../../data/queueNum.js";

// a ticket's number where it stands on its own, in a column or a card's heading: a pick-up's is the number on the
// customer's paper with "PICK-UP · NOV 8" in a tag on the line under it, so a narrow column never runs it into the
// next one; sentences and labels use the one-line ticketNumber() text instead
/** @param {{ order: { queueNum: any, purpose?: string, priority?: any, tbaPriority?: any, pickup?: { num: number, date: string } } }} props */
export default function TicketNumber({ order }) {
    if (!order.pickup) return paperNumber(order);
    return (
        <>
            {paperNumber(order)}
            <span className="pickup-tag">Pick-up · {shortDay(order.pickup.date)}</span>
        </>
    );
}
