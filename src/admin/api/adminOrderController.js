import http from '../../api/http.js';

// admin endpoints sit under /admin so the backend can guard the whole prefix with one auth check
// order shape: { queueNum, name, purpose, orders: [{ item, qty }], status, createdAt, calledAt?, remarks? }

export const listOrders = (options) => http.get("/admin/orders", options);

// the Order status board, for every staff member: all of today's orders, with only where each customer is
// → [{ queueNum, name, purpose, status, createdAt, team? (the sales team), atLoading?, handedOver?, servedBy?: { name },
//      pickupDate? }]
export const listOrderStatus = (options) => http.get("/admin/order-status", options);

export const getOrder = (queueNum, options) => http.get(`/admin/orders/${encodeURIComponent(queueNum)}`, options);

// saves one of today's orders again from Customer order (admins and sales staff only), in the shape createOrder
// sends; a save that changes something is kept as an edit → the order, with edits: [{ by: { id, name, photo },
// team?, changes: ["runner", ...], at }], newest first
export const updateOrder = (queueNum, order) => http.put(`/admin/orders/${encodeURIComponent(queueNum)}`, order);

// saves cells of the Order sheet on Customer order, only the ones given: { runner?, receiver?, paymentStatus?, team? }
// → the order; a save that changes something is kept as an edit, like updateOrder
export const updateOrderSheet = (queueNum, cells) =>
    http.patch(`/admin/orders/${encodeURIComponent(queueNum)}/sheet`, cells);

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
