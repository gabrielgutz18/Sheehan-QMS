// the kinds of staff account; values must match the backend
// admins run everything; sales staff serve customers from My counter; loading staff (one shared loading line) call
// the customers sales hands over from the Loading page and keep My account, nothing else (the backend enforces this
// too)
export const ROLE_LABELS = { admin: "Admin", sales: "Sales", loading: "Loading" };

const HOMES = { admin: "/admin", sales: "/admin/counter", loading: "/admin/loading" };

// where each role lands after signing in
export const homeFor = (user) => HOMES[user?.role] ?? "/admin/account";
