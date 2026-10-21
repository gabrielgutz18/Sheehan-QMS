// the kinds of staff account; values must match the backend
// admins run everything; sales staff serve customers from My counter; loading staff (the roofing and steel
// loading crews) get their own Loading page and My account, nothing else (the backend enforces this too)
export const ROLE_LABELS = { admin: "Admin", sales: "Sales", loading: "Loading" };

const HOMES = { admin: "/admin", sales: "/admin/counter", loading: "/admin/loading" };

// where each role lands after signing in
export const homeFor = (user) => HOMES[user?.role] ?? "/admin/account";
