// adds 4 priority orders ("*") to today's queue with regular customers between them, for checking that the priority
// orders end up together on the Google sheet: taken one after the other they'd be next to each other anyway, so here
// every second ticket is a regular one, and only sorting can bring the four together
// each one goes through the same POST /orders Customer order uses, signed in as the built-in admin from .env, since the
// kiosk can't mark a priority order; safe to run while the app is running
// run: npm run seed:priority
// don't run it on the live server: the customers appear on the queue display, and a running server with
// GOOGLE_SHEET_URL set copies them to the Google sheet
import { createServer } from 'node:http';

import { createApi } from './api.js';
import formatQueueNum from '../src/data/queueNum.js';

const PRIORITY_COUNT = 4;

const { ADMIN_USERNAME, ADMIN_PASSWORD, DATA_DIR } = process.env;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

// regular, priority, regular, ... regular: the names say which is which and what order they should end up in
const customers = [];
for (let i = 1; i <= PRIORITY_COUNT; i++) {
    customers.push({ name: `Regular Customer ${i}`, priority: false });
    customers.push({ name: `Priority Customer ${i}`, priority: true });
}
customers.push({ name: `Regular Customer ${PRIORITY_COUNT + 1}`, priority: false });

const asOrder = ({ name, priority }, i) => ({
    name,
    purpose: "Roofings",
    orders: [],
    invoices: [{ invoiceNo: String(90000000 + Date.now() % 1000000 + i), type: "Roofings" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    priority,
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

    console.log(`Adding ${PRIORITY_COUNT} priority orders to today's queue, with regular customers between them:`);
    for (const [i, customer] of customers.entries()) {
        const created = await send("POST", "/orders", asOrder(customer, i));
        if (created.status !== 201) throw new Error(`The API refused a customer (${created.status}): ${created.body?.message}`);
        const order = created.body;
        console.log(`  ${formatQueueNum(order.queueNum, order.purpose, order).padEnd(8)} ${order.name}`);
    }
    console.log(`On the Google sheet, today's Priority Customers 1 to ${PRIORITY_COUNT} should be together at the top of the day.`);
    console.log(`Data folder: ${api.dataDir}`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    server.closeAllConnections();
    server.close();
    api.close();
}
