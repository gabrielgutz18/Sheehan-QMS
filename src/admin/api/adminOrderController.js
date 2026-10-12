import http from '../../api/http.js';

// admin endpoints sit under /admin so the backend can guard the whole prefix with one auth check
// order shape: { queueNum, name, purpose, orders: [{ item, qty }], status, createdAt, calledAt?, remarks? }

export const listOrders = (options) => http.get("/admin/orders", options);

export const getOrder = (queueNum, options) => http.get(`/admin/orders/${encodeURIComponent(queueNum)}`, options);

export const updateOrderStatus = (queueNum, status) =>
    http.patch(`/admin/orders/${encodeURIComponent(queueNum)}`, { status });

// puts the ticket on the display as now serving; remarks replace the default "Please proceed to ..." line
export const callOrder = (queueNum, remarks) =>
    http.post(`/admin/orders/${encodeURIComponent(queueNum)}/call`, { remarks });

// takes the ticket out of the queue and moves it to History, where it can be restored
export const deleteOrder = (queueNum) => http.delete(`/admin/orders/${encodeURIComponent(queueNum)}`);

// tickets from any day, newest first (up to 200)
// filters: { search: name or ticket number, day: "YYYY-MM-DD", deleted: true for deleted ones only }
// → [{ id, date, isToday, queueNum, name, purpose, orders, status, deletedAt, restoredAt, originalDate?, originalNum? }]
export const listHistory = ({ search = "", day = "", deleted = false } = {}, options) =>
    http.get(`/admin/history?${new URLSearchParams({ search, day, deleted: deleted ? "1" : "0" })}`, options);

// puts a ticket back in today's queue as waiting; one from an earlier day gets today's next number
export const restoreOrder = (id) => http.post(`/admin/history/${encodeURIComponent(id)}/restore`);
