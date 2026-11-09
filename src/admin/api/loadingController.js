import http from "../../api/http.js";

// the Loading, Logistics, Service, Chassis and Hardware pages (department: "loading", "logistics", "service", "chassis" or "hardware", src/data/loadingAreas.js): each is one shared
// line, so the department's crew calls any customer sales has handed over to one of the order's areas it works, marks
// that area done (the order then waits for its next area, here or at the other department, or goes on to the security
// check after the last), or sends them back to waiting
// each returns the order; a call while a sales counter or the other department is serving the customer is refused
// (409, "Please wait until Maria Santos finishes.")

// area: one of the order's areas still to load here, the next one when left out
export const callAtLoading = (department, queueNum, remarks, area) =>
    http.post(`/admin/${department}/${encodeURIComponent(queueNum)}/call`, { remarks, area });

// Loading at Roofings (area): the truck is at that area, whether they were called there, to another area, or not yet;
// until that area is done no other area can take them, and Done is refused before it (409)
export const startLoading = (department, queueNum, area) =>
    http.post(`/admin/${department}/${encodeURIComponent(queueNum)}/start`, { area });

export const finishAtLoading = (department, queueNum) =>
    http.post(`/admin/${department}/${encodeURIComponent(queueNum)}/done`);

// the History tab: the orders handed over to one of the department's lists, 50 at a time → { rows, more }; before is
// "YYYY-MM-DD:N", the day and number of the last row shown, for Show more; empty values are left out
/**
 * @param {string} department
 * @param {{ list?: string, from?: string, to?: string, search?: string, before?: string }} query
 * @param {{ signal?: AbortSignal }} [options]
 */
export const departmentHistory = (department, query, options) => {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value));
    return http.get(`/admin/department-history/${encodeURIComponent(department)}?${params}`, options);
};

// what's coming to the signed-in department: today's unfinished orders staff made or handed over, with only its own
// part → [{ id, ticket, name, types, invoices: [invoiceNo], handedOver?: { by, at } }]
export const listNewOrders = (options) => http.get("/admin/new-orders", options);

export const sendBackFromLoading = (department, queueNum) =>
    http.post(`/admin/${department}/${encodeURIComponent(queueNum)}/back`);
