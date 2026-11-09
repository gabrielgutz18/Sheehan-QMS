import { splitList } from './list.js';
import orderTypes from './purpose.js';

//format: initials of the purpose + number, e.g. "Roofings Accessories" -> "RA 01"
//a ticket for several types of order takes each one's initials, in the list's order: "Roofings, Tire" -> "RT 01",
//"Roofings Accessories, Steel" -> "RAS 01"
//a type with its own letters in purpose.js uses those instead: "For Logistics" -> "LA 01", "Steel, For Logistics" -> "SLA 01"
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
