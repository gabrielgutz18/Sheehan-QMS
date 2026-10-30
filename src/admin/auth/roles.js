// the kinds of staff account; values must match the backend
// admins run everything; sales staff take each customer's ticket and talk with them, then hand them over from My
// counter (they don't call customers); loading staff (one shared loading line) call the customers sales hands over
// from the Loading page, and hardware staff the same from the Hardware page, for the Hardware department; security
// guards, the last stage, look at where each customer is and what they bought on the Security page, and check it at
// the gate; the cashier, and sales too, change how each order is paid on the Cashier page; loading, hardware, security and cashier keep the Dashboard (the live queue, as the display has it, and
// their profile) and My account and nothing else (the backend enforces this too)
export const ROLE_LABELS = { admin: "Admin", sales: "Sales", loading: "Loading", hardware: "Hardware", security: "Security", cashier: "Cashier" };

const HOMES = {
    admin: "/staff", sales: "/staff/counter", loading: "/staff/loading", hardware: "/staff/hardware", security: "/staff/security", cashier: "/staff/cashier",
};

// where each role lands after signing in
export const homeFor = (user) => HOMES[user?.role] ?? "/staff/account";
