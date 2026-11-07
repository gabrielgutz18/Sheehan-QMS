import http from "../../api/http.js";

// concern reports: what staff send through the guided chat on Message developer, and the developers moving each one
// along; the kinds, topics, impacts and statuses are in src/data/concerns.js

// report: { kind, area, details, extra, impact } → its card message in your conversation (kind 'report')
export const sendConcern = (report) => http.post("/admin/concerns", report);

// the Chat page's Reports (developers only), newest first: [{ id, kind, area, details, extra, impact, status,
// statusNote, statusBy: { id, name } | null, createdAt, updatedAt, staff: { id, name, role, department, photo, disabled } }]
export const listConcerns = (options) => http.get("/admin/concerns", options);

// status: open, in_progress, done or declined; note: optional words for the staff member → { concern, message },
// message being the bot's sentence sent to them from you
export const setConcernStatus = (id, status, note = "") =>
    http.patch(`/admin/concerns/${encodeURIComponent(id)}`, { status, note });
