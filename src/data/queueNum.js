import { splitList } from './list.js';
import orderTypes from './purpose.js';

//format: initials of the purpose + number, e.g. "Roofings Accessories" -> "RA 01"
//a ticket for several types of order takes each one's initials, in the list's order: "Roofings, Tire" -> "RT 01",
//"Roofings Accessories, Steel" -> "RAS 01"
//a type with its own letters in purpose.js uses those instead: "Stainless" -> "ST 01", "Steel, Stainless" -> "SST 01"
//falls back to "SHN" when the order has no purpose
//marks is the order (or anything with its priority and tbaPriority): a mark sales put on Customer order shows in
//front, "*" for a priority order ("* RS 01") and "**" for a TBA priority one ("** T 01"); an order has one at most
const initials = (name) =>
    orderTypes.find((type) => type.name === name.trim())?.initials ??
    name.trim().split(/\s+/).map((word) => word[0]).join("");

const purposeInitials = (purpose) => splitList(purpose).map(initials).join("").toUpperCase() || "SHN";

/** @param {{ priority?: any, tbaPriority?: any }} [marks] */
export const markOf = ({ priority, tbaPriority } = {}) => (tbaPriority ? "**" : priority ? "*" : "");

const formatQueueNum = (n, purpose, marks) => {
    const mark = markOf(marks);
    return `${mark && `${mark} `}${purposeInitials(purpose)} ${String(n).padStart(2, "0")}`;
};

export default formatQueueNum;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-11-11" → "Nov 11", the same on every computer
export const shortDay = (day) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;

// the number on the customer's paper: a pick-up's is the one it was given on the day they ordered (order.pickup, { num,
// date }), not the one it's kept under today, which is never shown
/** @param {{ queueNum: any, purpose?: string, priority?: any, tbaPriority?: any, pickup?: { num: number, date: string } }} order */
export const paperNumber = (order) => formatQueueNum(order.pickup?.num ?? order.queueNum, order.purpose ?? "", order);

// how staff screens show a ticket: a pick-up (back on a later day for the items) goes by its paper's number and the day
// it was given, "RS 01 · PICK-UP · Nov 11", since numbers restart daily and today's RS 01, or another pick-up's from
// Nov 12, is someone else; any other ticket is just its number, "RS 01"
/** @param {{ queueNum: any, purpose?: string, priority?: any, tbaPriority?: any, pickup?: { num: number, date: string } }} order */
export const ticketNumber = (order) =>
    order.pickup ? `${paperNumber(order)} · PICK-UP · ${shortDay(order.pickup.date)}` : paperNumber(order);
