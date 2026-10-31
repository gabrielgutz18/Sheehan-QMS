// adds sample customers to today's queue and hands each one over to loading at once, like Laravel's db:seed, for
// trying the Loading, TBA and Hardware pages and the security check without serving them at a sales counter first
// each one goes through the same POST /orders Customer order uses and the same POST /admin/orders/:n/handover My
// counter uses, signed in as the built-in admin from .env, so they get real queue numbers and wait on the Loading
// page; the mix covers orders loaded in several areas in turn (Roofings then Steel, then TBA or Hardware); safe to run while
// the app is running
// run: npm run seed:handover          6 customers
//      npm run seed:handover -- 12    12 customers (up to 50)
// pair it with npm run seed:loading for loading accounts; don't run it on the live server: the customers appear on
// the queue display
import { createServer } from 'node:http';

import { createApi } from './api.js';
import purposes from '../src/data/purpose.js';
import { joinList } from '../src/data/list.js';
import teams from '../src/data/teams.js';
import formatQueueNum from '../src/data/queueNum.js';

const DEFAULT_COUNT = 6;
const MAX_COUNT = 50;

const NAMES = [
    "Juan Dela Cruz", "Ana Reyes", "Pedro Santos", "Liza Mendoza", "Carlo Bautista", "Rosa Villanueva",
    "Mark Garcia", "Joy Fernandez", "Ramon Aquino", "Grace Torres", "Noel Ramos", "Carmela Cruz",
];
const SALESMEN = ["Maria Santos", "Jun Villareal", "Kris Lopez"];

// the types of order each customer bought, in turn: several areas first, so each department has a part
const MIXES = [
    ["Roofings", "Steel"],
    ["Roofings", "Steel", "Hardwares"],
    ["Roofings", "Tire"],
    ["Steel"],
    ["Roofings", "Roofings Accessories", "Steel"],
    ["Tire", "Battery"],
    ["Steel", "Hardwares"],
    ["Hardwares"],
];

const count = Number(process.argv[2] ?? DEFAULT_COUNT);
if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    console.error(`Give a number of customers from 1 to ${MAX_COUNT}, e.g. npm run seed:handover -- 10`);
    process.exit(1);
}

const { ADMIN_USERNAME, ADMIN_PASSWORD, DATA_DIR } = process.env;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// a customer as Customer order sends them: the types in the list's order, an invoice for each, the salesman and the
// sales team serving them
const fakeCustomer = (i) => {
    const types = purposes.map(({ name }) => name).filter((name) => MIXES[i % MIXES.length].includes(name));
    return {
        name: NAMES[i % NAMES.length],
        purpose: joinList(types),
        orders: [],
        invoices: types.map((type) => ({ invoiceNo: String(between(10000000, 99999999)), type })),
        salesman: pick(SALESMEN),
        team: pick(teams).name,
        pickupDate: null,
    };
};

const api = createApi({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD, dataDir: DATA_DIR });
const server = createServer(api);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

// the signed-in admin: keeps its session cookie and sends the header the admin pages send
let cookie = "";
const send = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: {
            "X-Requested-With": "XMLHttpRequest",
            ...(body !== undefined && { "Content-Type": "application/json" }),
            ...(cookie && { Cookie: cookie }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
};

try {
    const signIn = await send("POST", "/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    if (signIn.status !== 200) throw new Error(`The built-in admin couldn't sign in (${signIn.status}): ${signIn.body?.message}`);

    console.log(`Adding ${count} customer${count === 1 ? "" : "s"} to today's queue, handed over to loading:`);
    for (let i = 0; i < count; i++) {
        const created = await send("POST", "/orders", fakeCustomer(i));
        if (created.status !== 201) throw new Error(`The API refused a customer (${created.status}): ${created.body?.message}`);
        const { queueNum } = created.body;
        const handed = await send("POST", `/admin/orders/${queueNum}/handover`);
        if (handed.status !== 200) throw new Error(`The API refused to hand over ${queueNum} (${handed.status}): ${handed.body?.message}`);
        const order = handed.body;
        const areas = order.areas.map(({ name }) => name).join(" → ");
        console.log(`  ${formatQueueNum(order.queueNum, order.purpose, order).padEnd(9)} ${order.name.padEnd(16)} ${order.purpose.padEnd(38)} ${areas}`);
    }
    console.log(`Data folder: ${api.dataDir}`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    server.closeAllConnections();
    server.close();
    api.close();
}
