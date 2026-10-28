// every kind of staff account
const STAFF = ["admin", "sales", "loading", "hardware", "security", "cashier"];

// the sidebar's groups, in order; a group with none of the signed-in role's pages is left out
export const NAV_GROUPS = ["Overview", "My work", "Display", "Account"];

// folders in the sidebar that open and close on a click, each with its icon; a link joins one with folder
export const NAV_FOLDERS = {
    Department: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
};

// the sidebar's links; roles: who sees the link (the routes in adminApp.jsx and the backend check the same)
// icon: one 24 × 24 SVG path, drawn by Icon; blurb: what the page is for, on the Dashboard's links to a role's pages
// folder: the NAV_FOLDERS folder it sits in, left out for one straight in its group
const navItems = [
    { to: "/admin", label: "Dashboard", end: true, group: "Overview", roles: STAFF, icon: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z", blurb: "The live queue and your profile" },
    { to: "/admin/customer-order", label: "Customer order", group: "My work", roles: ["admin", "sales"], icon: "M9 3h6v3H9zM9 4.5H5V21h14V4.5h-4M12 10v7M8.5 13.5h7", blurb: "Take a customer's order and print their ticket" },
    { to: "/admin/counter", label: "My counter", group: "My work", roles: ["admin", "sales"], icon: "M3 10h18M5 10v10h14V10M8 10V6a4 4 0 0 1 8 0v4", blurb: "Serve the next customer in line" },
    { to: "/admin/orders", label: "Orders", group: "My work", roles: ["admin", "sales"], icon: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01", blurb: "Every ticket today, its status and calling it" },
    { to: "/admin/loading", label: "Loading", group: "My work", folder: "Department", roles: ["admin", "loading"], icon: "M3 6h11v10H3zM14 10h4l3 3v3h-7M5 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0", blurb: "Call the customers handed over to loading" },
    { to: "/admin/hardware", label: "Hardware", group: "My work", folder: "Department", roles: ["admin", "hardware"], icon: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z", blurb: "Call the customers handed over to Hardware" },
    // admins and sales have the same board on Customer order
    { to: "/admin/order-status", label: "Order status", group: "My work", roles: ["loading", "hardware"], icon: "M4 6h3M4 12h3M4 18h3M11 6h9M11 12h9M11 18h9M5.5 4.5v3M5.5 10.5v3M5.5 16.5v3", blurb: "Where every customer is today" },
    { to: "/admin/security", label: "Security", group: "My work", folder: "Department", roles: ["admin", "security"], icon: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5", blurb: "Check what each customer leaves with" },
    { to: "/admin/cashier", label: "Cashier", group: "My work", folder: "Department", roles: ["admin", "cashier"], icon: "M2 6h20v12H2zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M5.5 9v6M18.5 9v6", blurb: "Change how each order is paid" },
    { to: "/admin/history", label: "History", group: "My work", roles: ["admin", "sales"], icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2", blurb: "Earlier tickets, and restoring deleted ones" },
    { to: "/admin/video", label: "Display video", group: "Display", roles: ["admin"], icon: "M3 6h13v12H3zM16 10l5-3v10l-5-3", blurb: "What plays on the queue display" },
    { to: "/admin/announcer", label: "Announcer", group: "Display", roles: ["admin"], icon: "M4 9v6h4l5 4V5L8 9zM16 9a3 3 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11", blurb: "The voice that calls each number" },
    { to: "/admin/printer", label: "Printer", group: "Display", roles: ["admin"], icon: "M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z", blurb: "The receipt printer for tickets" },
    { to: "/admin/account", label: "My account", group: "Account", roles: STAFF, icon: "M20 21v-1a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", blurb: "Your photo, name and details" },
    { to: "/admin/accounts", label: "Accounts", group: "Account", roles: ["admin"], icon: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 8v6M22 11h-6", blurb: "Staff accounts and their roles" },
];

// the links one role sees
export const navFor = (role) => navItems.filter(({ roles }) => roles.includes(role));

// a group's links as the sidebar shows them: each folder's links gathered where its first one is, as
// { folder, icon, links }; a folder with only one of the role's links (a guard's Security) stays a plain link
export const withFolders = (items) => items.flatMap((item) => {
    if (!item.folder) return [item];
    const links = items.filter(({ folder }) => folder === item.folder);
    if (links.length < 2) return [item];
    return links[0] === item ? [{ folder: item.folder, icon: NAV_FOLDERS[item.folder], links }] : [];
});

export default navItems;
