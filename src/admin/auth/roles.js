// the two kinds of staff account; values must match the backend
// admins run everything; sales staff serve customers from My counter (the backend enforces this too)
export const ROLE_LABELS = { admin: "Admin", sales: "Sales" };

// where each role lands after signing in
export const homeFor = (user) => (user?.role === "admin" ? "/admin" : "/admin/counter");
