import http from './http.js';

// order shape: { name, purpose, orders: [{ item, qty }] }
// the backend assigns queueNum and returns the saved order including it

export const listOrders = () => http.get("/orders");

export const getOrder = (queueNum) => http.get(`/orders/${queueNum}`);

export const createOrder = (order) => http.post("/orders", order);

export const updateOrder = (queueNum, order) => http.put(`/orders/${queueNum}`, order);

export const deleteOrder = (queueNum) => http.delete(`/orders/${queueNum}`);
