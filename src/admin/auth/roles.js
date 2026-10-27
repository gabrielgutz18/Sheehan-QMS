// the kinds of staff account; values must match the backend
// admins run everything; sales staff serve customers from My counter; loading staff (one shared loading line) call
// the customers sales hands over from the Loading page; security guards, the last stage, look at where each customer
// is and what they bought on the Security page, nothing they can change; loading and security keep My account and
// nothing else (the backend enforces this too)
export const ROLE_LABELS = { admin: "Admin", sales: "Sales", loading: "Loading", security: "Security" };

const HOMES = { admin: "/admin", sales: "/admin/counter", loading: "/admin/loading", security: "/admin/security" };

// where each role lands after signing in
export const homeFor = (user) => HOMES[user?.role] ?? "/admin/account";
