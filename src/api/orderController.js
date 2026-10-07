import http from './http.js';

// order shape: { name, purpose, orders: [{ item, qty }] }
// the backend assigns queueNum and returns the saved order including it
// listing and deleting orders is staff-only — see src/admin/api/adminOrderController.js

export const createOrder = (order) => http.post("/orders", order);

export const updateOrder = (queueNum, order) => http.put(`/orders/${encodeURIComponent(queueNum)}`, order);
