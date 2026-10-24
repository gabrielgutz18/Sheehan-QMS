import { splitList } from './list.js';

//format: initials of the purpose + number, e.g. "Roofings Accessories" -> "RA 01"
//a ticket for several types of order takes each one's initials, in the list's order: "Roofings, Tire" -> "RT 01",
//"Roofings Accessories, Steel" -> "RAS 01"
//falls back to "SHN" when the order has no purpose
const initials = (name) => name.trim().split(/\s+/).map((word) => word[0]).join("");

const purposeInitials = (purpose) => splitList(purpose).map(initials).join("").toUpperCase() || "SHN";

const formatQueueNum = (n, purpose) => `${purposeInitials(purpose)} ${String(n).padStart(2, "0")}`;

export default formatQueueNum;
