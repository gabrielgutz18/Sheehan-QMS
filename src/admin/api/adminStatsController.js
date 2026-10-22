import http from '../../api/http.js';

// sales for the dashboard graph; period: "day" | "week" | "month" | "year"
// → { period, from, to, buckets: [{ key, orders: { type: n }, total }], servedToday }
// orders counts each type of order (an order for Roofings and Steel is in both); total is the slot's orders, each once
// key: "08" (hour) for day, "YYYY-MM-DD" for week and month, "YYYY-MM" for year
export const getStats = (period, options) => http.get(`/admin/stats?period=${encodeURIComponent(period)}`, options);
