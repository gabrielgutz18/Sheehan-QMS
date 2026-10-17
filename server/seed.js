// adds sample customers (orders and Customer Reports) to today's queue, like Laravel's db:seed, for trying the
// counters and the display
// each one goes through the same POST /orders the kiosk uses, so they get real queue numbers and show up
// everywhere a real customer would; safe to run while the app is running
// run: npm run seed          5 customers
//      npm run seed -- 12    12 customers (up to 50)
// don't run it on the live server: the customers appear on the queue display
import { createServer } from 'node:http';

import { createApi } from './api.js';
import purposes from '../src/data/purpose.js';
import roofingColors, { ROOFING_PURPOSE } from '../src/data/roofingColors.js';
import { REPORT_PURPOSE } from '../src/data/customerReport.js';
import formatQueueNum from '../src/data/queueNum.js';

const DEFAULT_COUNT = 5;
const MAX_COUNT = 50;

const NAMES = [
    "Juan Dela Cruz", "Ana Reyes", "Pedro Santos", "Liza Mendoza", "Carlo Bautista", "Rosa Villanueva",
    "Mark Garcia", "Joy Fernandez", "Ramon Aquino", "Grace Torres", "Noel Ramos", "Carmela Cruz",
    "Jose Navarro", "Bea Castillo", "Paolo Domingo", "Tess Manalo",
];

// what each purpose's customers usually ask for; a purpose missing here gets GENERAL_ITEMS
const ITEMS = {
    "Roofings": ["Long span roofing", "Rib type roofing", "Corrugated sheet"],
    "Roofings Accessories": ["Ridge roll", "Gutter", "Flashing", "Tek screws"],
    "Tire": ["Tire 7.50-16", "Tire 11R22.5", "Inner tube", "Flap"],
    "Steel": ["Angle bar", "Flat bar", "C-purlins", "Deformed bar 10mm"],
    "Hardwares": ["Concrete nails", "Blind rivets", "Welding rod", "Paint brush"],
    "Chassis": ["Leaf spring", "U-bolt", "Center bolt", "Shackle"],
};
const GENERAL_ITEMS = ["Assorted parts"];

// what Customer Report customers come in about
const CONCERNS = [
    "The roofing I bought last week is leaking at the joints.",
    "I was charged twice on my receipt.",
    "Wrong tire size was delivered to my shop.",
    "I'd like to follow up on my delivery schedule.",
    "Some of the steel bars I ordered arrived rusty.",
    "I want to return unused gutters.",
];

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

// a customer as the kiosk would send them: 1 to 3 different items, with a color for roofing,
// or for a Customer Report, just their concern
const fakeCustomer = (name) => {
    const purpose = pick(purposes).name;
    if (purpose === REPORT_PURPOSE) return { name, purpose, orders: [], concern: pick(CONCERNS) };
    const items = shuffled(ITEMS[purpose] ?? GENERAL_ITEMS).slice(0, between(1, 3));
    return {
        name,
        purpose,
        orders: items.map((item) => ({
            item,
            qty: between(1, 20),
            ...(purpose === ROOFING_PURPOSE && { color: pick(roofingColors).value }),
        })),
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
        const details = order.concern
            ? `Concern: ${order.concern}`
            : order.orders.map(({ qty, item, color }) => `${qty} × ${item}${color ? ` (${color})` : ""}`).join(", ");
        console.log(`  ${formatQueueNum(order.queueNum, order.purpose).padEnd(7)} ${order.name.padEnd(16)} ${details}`);
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
