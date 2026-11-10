// the kinds of staff account; values must match the backend
// admins run everything; sales staff take each customer's ticket and talk with them, then hand them over from My
// counter (they don't call customers); loading staff (one shared loading line) call the customers sales hands over
// from the Loading page (Roofings, Steel, Logistics and Chassis), and service and hardware staff the same from the Service and Hardware pages, for their own departments; security
// guards, the last stage, look at where each customer is and what they bought on the Security page, and check it at
// the gate; the Cashier page is where sales change how each order is paid, and the cashier too when the salesman isn't around; loading, service, hardware, security, cashier and inventory keep the Dashboard (the live queue, as the display has it, and
// their profile) and My account and nothing else (the backend enforces this too); developers, the team that builds the
// app, answer what staff write from Message developer on the Chat page, and have the Dashboard (with the reports staff
// sent through the bot), the Order status board and Accounts (not admin accounts)
export const ROLE_LABELS = {
    admin: "Admin",
    sales: "Sales",
    loading: "Loading",
    service: "Service",
    hardware: "Hardware",
    security: "Security",
    cashier: "Cashier",
    inventory: "Inventory",
    developer: "Developer",
};

const HOMES = {
    admin: "/staff",
    sales: "/staff/counter",
    loading: "/staff/loading",
    service: "/staff/service",
    hardware: "/staff/hardware",
    security: "/staff/security",
    cashier: "/staff/cashier",
    inventory: "/staff",
    developer: "/staff",
};

// where each role lands after signing in
export const homeFor = (user) => HOMES[user?.role] ?? "/staff/account";
