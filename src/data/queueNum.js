//format: initials of the purpose + number, e.g. "Roofings Accessories" -> "RA 01"
//falls back to "SHN" when the order has no purpose
const purposeInitials = (purpose) =>
    purpose?.trim().split(/\s+/).map((word) => word[0]).join("").toUpperCase() || "SHN";

const formatQueueNum = (n, purpose) => `${purposeInitials(purpose)} ${String(n).padStart(2, "0")}`;

export default formatQueueNum;
