import http from '../../api/http.js';

// admin endpoints sit under /admin so the backend can guard the whole prefix with one auth check
// order shape: { queueNum, name, purpose, orders: [{ item, qty }], status, createdAt, calledAt?, remarks? }

export const listOrders = (options) => http.get("/admin/orders", options);

// the Order status board, for every staff member: all of today's orders, with only where each customer is
// → [{ queueNum, name, purpose, status, createdAt, team? (the sales team), atLoading?, handedOver?, servedBy?: { id, name, photo },
//      pickupDate?, areas: [{ name, loaded?: { by: { name }, at } }] (the loading areas in turn), loadingArea? (where
//      the crew has them now), security?: "waiting" | "verified" | "reported" }]
export const listOrderStatus = (options) => http.get("/admin/order-status", options);

// the Security page, for the guards at the gate (and admins): today's orders as on the Order status board, plus what
// each customer bought, to check what they leave with; no Customer Reports, and no payment or other sales details
// → [{ ...as listOrderStatus, orders: [{ item, qty, color? }], invoices: [{ invoiceNo, type }],
//      loaded?: { by: { name }, at? }, servedAt?, securityCheck?: { result, note?, by: { name }, at } }]
export const listSecurityOrders = (options) => http.get("/admin/security", options);

// the security check at the gate (security guards and admins), for an order waiting for it: result "verified", or a
// report, "missing", "over" (more than the order's quantity) or "stolen", with a note saying what (needed for a
// report, up to 300 characters) → the order as listSecurityOrders has it, done, with securityCheck: { result, note?,
// by: { name }, at }
export const checkAtSecurity = (queueNum, result, note = "") =>
    http.post(`/admin/security/${encodeURIComponent(queueNum)}/check`, { result, note });

export const getOrder = (queueNum, options) => http.get(`/admin/orders/${encodeURIComponent(queueNum)}`, options);

// saves one of today's orders again from Customer order (admins and sales staff only), in the shape createOrder
// sends; a save that changes something is kept as an edit → the order, with edits: [{ by: { id, name, photo },
// team?, changes: ["runner", ...], at }], newest first
export const updateOrder = (queueNum, order) => http.put(`/admin/orders/${encodeURIComponent(queueNum)}`, order);

// the Order sheet on Customer order: every order from every day (deleted ones and Customer Reports left out), newest
// day first and in number order within a day → [{ id, date, isToday, ...the order }]; id picks one out, since numbers
// repeat every day
export const listOrderSheet = (options) => http.get("/admin/order-sheet", options);

// saves cells of one of the Order sheet's orders, from any day, only the ones given: { runner?, receiver?,
// paymentStatus?, team? } → the order, as listOrderSheet has it; a save that changes something is kept as an edit,
// like updateOrder
export const updateOrderSheet = (id, cells) => http.patch(`/admin/order-sheet/${encodeURIComponent(id)}`, cells);

// the Cashier page (cashiers and admins): the Order sheet's orders, every one from every day, with how each is paid
// → [{ id, date, isToday, ...as listOrderStatus, invoices: [{ invoiceNo, type }], salesman?, paymentStatus?,
//      paymentChange?: { by: { name }, at } (who last changed the payment status, and when) }]
export const listPayments = (options) => http.get("/admin/payments", options);

// the cashier changes how one of those orders is paid, to one of src/data/paymentStatus.js (it can't be cleared)
// → the order, as listPayments has it; a change is kept as an edit, like one on the Order sheet
export const updatePayment = (id, paymentStatus) =>
    http.patch(`/admin/payments/${encodeURIComponent(id)}`, { paymentStatus });

export const updateOrderStatus = (queueNum, status) =>
    http.patch(`/admin/orders/${encodeURIComponent(queueNum)}`, { status });

// puts the ticket on the display as now serving; remarks replace the default "Please wait" line
export const callOrder = (queueNum, remarks) =>
    http.post(`/admin/orders/${encodeURIComponent(queueNum)}/call`, { remarks });

// a sales counter hands the customer it's serving over to loading: they wait in line on the Loading page, the order
// keeps its sales team, and it counts as the customer served
export const handOverOrder = (queueNum) => http.post(`/admin/orders/${encodeURIComponent(queueNum)}/handover`);

// takes the ticket out of the queue and moves it to History, where it can be restored
export const deleteOrder = (queueNum) => http.delete(`/admin/orders/${encodeURIComponent(queueNum)}`);

// tickets from any day, newest first (up to 200)
// filters: { search: name or ticket number, day: "YYYY-MM-DD", deleted: true for deleted ones only }
// → [{ id, date, isToday, queueNum, name, purpose, orders, status, deletedAt, restoredAt, originalDate?, originalNum? }]
export const listHistory = ({ search = "", day = "", deleted = false } = {}, options) =>
    http.get(`/admin/history?${new URLSearchParams({ search, day, deleted: deleted ? "1" : "0" })}`, options);

// puts a ticket back in today's queue as waiting; one from an earlier day gets today's next number
export const restoreOrder = (id) => http.post(`/admin/history/${encodeURIComponent(id)}/restore`);
