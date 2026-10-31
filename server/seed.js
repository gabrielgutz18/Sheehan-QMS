// adds sample customers to today's queue, like Laravel's db:seed, for trying the counters and the display
// each one goes through the same POST /orders Customer order uses, so they get real queue numbers and show up
// everywhere a real customer would; safe to run while the app is running
// run: npm run seed          5 customers
//      npm run seed -- 12    12 customers (up to 50)
// don't run it on the live server: the customers appear on the queue display
import { createServer } from 'node:http';

import { createApi } from './api.js';
import purposes from '../src/data/purpose.js';
import { joinList } from '../src/data/list.js';
import teams from '../src/data/teams.js';
import formatQueueNum from '../src/data/queueNum.js';

const DEFAULT_COUNT = 5;
const MAX_COUNT = 50;

const NAMES = [
    "Juan Dela Cruz", "Ana Reyes", "Pedro Santos", "Liza Mendoza", "Carlo Bautista", "Rosa Villanueva",
    "Mark Garcia", "Joy Fernandez", "Ramon Aquino", "Grace Torres", "Noel Ramos", "Carmela Cruz",
    "Jose Navarro", "Bea Castillo", "Paolo Domingo", "Tess Manalo",
];

const SALESMEN = ["Maria Santos", "Jun Villareal", "Kris Lopez"];
// about one customer in four sends a runner to collect the items
const RUNNERS = ["Boy Reyes", "Nonoy Santos", "Dodong Cruz", "Totoy Garcia"];
const RUNNER_SHARE = 0.25;
// about one customer in five comes back for the items on a later day
const RETURNING_SHARE = 0.2;

const count = Number(process.argv[2] ?? DEFAULT_COUNT);
if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    console.error(`Give a number of customers from 1 to ${MAX_COUNT}, e.g. npm run seed -- 10`);
    process.exit(1);
}

const { ADMIN_USERNAME, ADMIN_PASSWORD, DATA_DIR } = process.env;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffled = (list) => list.map((value) => [Math.random(), value]).sort(([a], [b]) => a - b).map(([, value]) => value);

const pad2 = (n) => String(n).padStart(2, "0");
// YYYY-MM-DD, n days from today
const daysFromNow = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// a customer as Customer order sends them: one or two types of order (in the list's order), an invoice for each,
// now and then a runner, the salesman, the sales team serving them, and now and then a day they'll come back for the
// items; no payment status: the cashier sets that
const fakeCustomer = (name) => {
    const types = shuffled(purposes).slice(0, between(1, 2));
    const purpose = purposes.filter((p) => types.includes(p)).map((p) => p.name);
    return {
        name,
        purpose: joinList(purpose),
        orders: [],
        invoices: purpose.map((type) => ({ invoiceNo: String(between(10000000, 99999999)), type })),
        salesman: pick(SALESMEN),
        runner: Math.random() < RUNNER_SHARE ? pick(RUNNERS) : "",
        team: pick(teams).name,
        pickupDate: Math.random() < RETURNING_SHARE ? daysFromNow(between(1, 5)) : null,
    };
};

const api = createApi({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD, dataDir: DATA_DIR });
const server = createServer(api);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
    const names = shuffled(NAMES);
    console.log(`Adding ${count} customer${count === 1 ? "" : "s"} to today's queue:`);
    for (let i = 0; i < count; i++) {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fakeCustomer(names[i % names.length])),
        });
        const order = await res.json();
        if (res.status !== 201) throw new Error(`The API refused a customer (${res.status}): ${order.message}`);
        const details = [
            order.purpose,
            order.invoices.map(({ invoiceNo, type }) => `invoice ${invoiceNo} (${type})`).join(", "),
            order.runner && `runner: ${order.runner}`,
            order.team && `${order.team} team`,
            order.pickupDate && `picks up ${order.pickupDate}`,
        ].filter(Boolean).join(" · ");
        console.log(`  ${formatQueueNum(order.queueNum, order.purpose, order.priority).padEnd(7)} ${order.name.padEnd(16)} ${details}`);
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
