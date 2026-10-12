import http from '../../api/http.js';

// for whoever is signed in, admin or sales

// customers served (one point each), by calendar period; period: "day" | "week" | "month" | "year"
// → { period, from, to, totals: { total, today, week, month, year }, buckets: [{ key, served, future }] }
export const getMyStats = (period, options) => http.get(`/admin/me/stats?period=${encodeURIComponent(period)}`, options);

// volume: 0 (silent) to 1 (full) → the announcer settings
export const setAnnouncerVolume = (volume) => http.put("/admin/announcer/volume", { volume });
