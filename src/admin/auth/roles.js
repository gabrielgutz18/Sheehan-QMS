// the kinds of staff account; values must match the backend
// admins run everything; sales staff serve customers from My counter; loading staff (one shared loading line) call
// the customers sales hands over from the Loading page; security guards, the last stage, look at where each customer
// is and what they bought on the Security page, and check it at the gate; the cashier changes how each order is paid
// on the Cashier page; loading, security and cashier keep the Dashboard (the live queue, as the display has it, and
// their profile) and My account and nothing else (the backend enforces this too)
export const ROLE_LABELS = { admin: "Admin", sales: "Sales", loading: "Loading", security: "Security", cashier: "Cashier" };

const HOMES = {
    admin: "/admin", sales: "/admin/counter", loading: "/admin/loading", security: "/admin/security", cashier: "/admin/cashier",
};

// where each role lands after signing in
export const homeFor = (user) => HOMES[user?.role] ?? "/admin/account";
