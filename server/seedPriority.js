// adds 4 priority orders ("*") and 2 TBA priority ones ("**"), each with several invoices, to today's queue with regular
// customers between them, for checking that each group ends up together on the Order sheet and the Google sheet: taken
// one after the other they'd be next to each other anyway, so here every second ticket is a regular one, and only sorting
// can bring them together; the invoices show how several numbers stack in a cell and spread across columns
// each one goes through the same POST /orders Customer order uses, signed in as the built-in admin from .env, since the
// kiosk can't mark a priority order; safe to run while the app is running
// run: npm run seed:priority
// don't run it on the live server: the customers appear on the queue display, and a running server with
// GOOGLE_SHEET_URL set copies them to the Google sheet
import { createServer } from 'node:http';

import { createApi } from './api.js';
import formatQueueNum from '../src/data/queueNum.js';

// one list per marked customer, with the type of each of their invoices: some stack in one column of the Google sheet,
// some spread across columns and departments; regular customers keep a single invoice
const PRIORITY_INVOICES = [
    ["Roofings", "Roofings"],
    ["Roofings", "Steel"],
    ["Roofings", "Roofings", "Steel", "Hardwares"],
    ["Steel", "Steel", "Steel"],
];
const TBA_PRIORITY_INVOICES = [
    ["Tire", "Tire"],
    ["Tire", "Battery", "Chassis"],
];

const { ADMIN_USERNAME, ADMIN_PASSWORD, DATA_DIR } = process.env;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

// regular, priority, regular, ... regular: the names say which is which and what order they should end up in
const customers = [];
let regulars = 0;
const addRegular = () => customers.push({ name: `Regular Customer ${regulars += 1}`, types: ["Roofings"] });
for (const [i, types] of PRIORITY_INVOICES.entries()) {
    addRegular();
    customers.push({ name: `Priority Customer ${i + 1}`, types, priority: true });
}
for (const [i, types] of TBA_PRIORITY_INVOICES.entries()) {
    addRegular();
    customers.push({ name: `TBA Priority Customer ${i + 1}`, types, tbaPriority: true });
}
addRegular();

// invoice numbers count up from one based on the clock, so no two in this run are the same
let nextInvoice = 90000000 + Date.now() % 1000000;
const asOrder = ({ name, types, priority = false, tbaPriority = false }) => ({
    name,
    purpose: [...new Set(types)].join(", "),
    orders: [],
    invoices: types.map((type) => ({ invoiceNo: String(nextInvoice++), type })),
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    priority,
    tbaPriority,
});

const api = createApi({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD, dataDir: DATA_DIR });
const server = createServer(api);
await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
const base = `http://127.0.0.1:${port}/api`;

// the signed-in admin: keeps its session cookie and sends the header the admin pages send
let cookie = "";
const send = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: {
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/json",
            ...(cookie && { Cookie: cookie }),
        },
        body: JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
};

try {
    const signIn = await send("POST", "/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    if (signIn.status !== 200) throw new Error(`The built-in admin couldn't sign in (${signIn.status}): ${signIn.body?.message}`);

    console.log(`Adding ${PRIORITY_INVOICES.length} priority and ${TBA_PRIORITY_INVOICES.length} TBA priority orders with several invoices to today's queue, with regular customers between them:`);
    for (const customer of customers) {
        const created = await send("POST", "/orders", asOrder(customer));
        if (created.status !== 201) throw new Error(`The API refused a customer (${created.status}): ${created.body?.message}`);
        const order = created.body;
        const invoices = order.invoices.map((invoice) => `${invoice.invoiceNo} ${invoice.type}`).join(", ");
        console.log(`  ${formatQueueNum(order.queueNum, order.purpose, order).padEnd(10)} ${order.name.padEnd(24)} ${invoices}`);
    }
    console.log(`On the Order sheet and the Google sheet, the Priority Customers should be together below the regular orders, then the TBA Priority Customers below them, with any from other days.`);
    console.log(`Data folder: ${api.dataDir}`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    server.closeAllConnections();
    server.close();
    api.close();
}
