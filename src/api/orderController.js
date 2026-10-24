import http from './http.js';

// order shape, from Customer order: { name, purpose: "Roofings, Steel", orders: [], invoices: [{ invoiceNo, type }],
//   salesman, runner, receiver, salesTimeIn: "HH:MM" or "", salesTimeOut, paymentStatus, team,
//   pickupDate: "YYYY-MM-DD" or null }
// the backend assigns queueNum and returns the saved order including it
// listing and deleting orders is staff-only — see src/admin/api/adminOrderController.js

export const createOrder = (order) => http.post("/orders", order);

export const updateOrder = (queueNum, order) => http.put(`/orders/${encodeURIComponent(queueNum)}`, order);
