// a Customer Report is a ticket for a concern instead of an order: the kiosk asks for the concern in place of items
// both must match the backend (REPORT_PURPOSE and MAX_CONCERN in server/api.js); the purpose must match purpose.js
export const REPORT_PURPOSE = "Customer Report";
export const MAX_CONCERN = 300;
