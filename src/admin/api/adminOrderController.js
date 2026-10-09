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

export const deleteOrder = (queueNum) => http.delete(`/admin/orders/${encodeURIComponent(queueNum)}`);
