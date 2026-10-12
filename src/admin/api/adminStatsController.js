import http from '../../api/http.js';

// sales for the dashboard graph; period: "day" | "week" | "month" | "year"
// → { period, from, to, buckets: [{ key, qty: { purpose: n }, tickets: { purpose: n } }], servedToday }
// key: "08" (hour) for day, "YYYY-MM-DD" for week and month, "YYYY-MM" for year
export const getStats = (period, options) => http.get(`/admin/stats?period=${encodeURIComponent(period)}`, options);
