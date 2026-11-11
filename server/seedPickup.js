// sets up the pick-up mix-up to check by eye: two customers who ordered on different days were both given RS 05 (numbers
// restart daily) and told to come back today for the items, and today's own RS 05 is a walk-in. Juan Dela Cruz ordered
// 3 days ago, and his Roofings was loaded then; Pedro Penduko ordered 2 days ago; Ana Reyes walks in today. All three
// should be told apart everywhere: on the queue display "RS 05", "RS 05 PICK-UP · <day>" twice, and on the staff
// screens "RS 05", "RS 05 · PICK-UP · <day>"
// the two earlier days' orders are written into the database as they would have been left on those days (the API only
// takes today's), with the same number on both, the first one both days have free; today's walk-in goes through POST
// /orders like the kiosk, and today's numbers jump ahead to that same number so it's an RS 05 too; the pick-ups come
// into today's line on the first request, as they would when the day starts
// run: npm run seed:pickup
// don't run it on the live server: the customers appear on the queue display, and a running server with
// GOOGLE_SHEET_URL set copies them to the Google sheet
import { createServer } from "node:http";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createApi } from "./api.js";
import { DB_FILE } from "./db.js";
import { ticketNumber } from "../src/data/queueNum.js";

const { ADMIN_USERNAME, ADMIN_PASSWORD, DATA_DIR } = process.env;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

const pad2 = (n) => String(n).padStart(2, "0");
// YYYY-MM-DD by the local clock, n days ago, the way the server dates tickets
const localDay = (daysAgo = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
// 9 in the morning that day, as the ticket's time
const morningOf = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
};

// invoice numbers count up from one based on the clock, so no two in this run are the same
let nextInvoice = 70000000 + (Date.now() % 1000000);
const invoices = () => [
    { invoiceNo: String(nextInvoice++), type: "Roofings" },
    { invoiceNo: String(nextInvoice++), type: "Steel" },
];

const api = createApi({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD, dataDir: DATA_DIR });
const db = new DatabaseSync(join(api.dataDir, DB_FILE));
const server = createServer(api);
await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
const base = `http://127.0.0.1:${port}/api`;

let cookie = "";
const send = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: {
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/json",
            ...(cookie && { Cookie: cookie }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
};

const lastNum = (day) =>
    Number(db.prepare("SELECT last_num FROM queue_counters WHERE queue_date = ?").get(day)?.last_num ?? 0);
const setLastNum = (day, num) =>
    db
        .prepare(
            `INSERT INTO queue_counters (queue_date, last_num) VALUES (?, ?)
             ON CONFLICT (queue_date) DO UPDATE SET last_num = MAX(last_num, excluded.last_num)`,
        )
        .run(day, num);

// an order as it was left at the end of the day it was taken: served and paid, coming back today for the items
const insertEarlier = (daysAgo, num, name) => {
    const { lastInsertRowid: id } = db
        .prepare(
            `INSERT INTO orders (queue_date, queue_num, name, purpose, status, created_at, salesman, team, payment_status,
                sales_time_in, sales_time_out, pickup_date)
             VALUES (?, ?, ?, 'Roofings, Steel', 'done', ?, 'Maria Santos', 'GIGA', 'Paid', '09:00', '09:20', ?)`,
        )
        .run(localDay(daysAgo), num, name, morningOf(daysAgo), localDay());
    for (const [position, { invoiceNo, type }] of invoices().entries()) {
        db.prepare("INSERT INTO order_invoices (order_id, position, invoice_no, type) VALUES (?, ?, ?, ?)").run(
            id,
            position,
            invoiceNo,
            type,
        );
    }
    setLastNum(localDay(daysAgo), num);
    return Number(id);
};

try {
    const signIn = await send("POST", "/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    if (signIn.status !== 200)
        throw new Error(`The built-in admin couldn't sign in (${signIn.status}): ${signIn.body?.message}`);

    // one number all three can have: free on both earlier days and still to come today
    const num = Math.max(lastNum(localDay(3)), lastNum(localDay(2)), lastNum(localDay())) + 1;

    const juan = insertEarlier(3, num, "Juan Dela Cruz");
    // his Roofings was loaded on the first visit; the Steel wasn't ready
    const crew = db
        .prepare("SELECT id, name FROM users WHERE role = 'loading' AND disabled_at IS NULL ORDER BY id LIMIT 1")
        .get();
    if (crew) {
        db.prepare("INSERT INTO order_loads (order_id, area, loaded_by, loaded_at) VALUES (?, 'Roofings', ?, ?)").run(
            juan,
            crew.id,
            // an hour after the ticket
            new Date(Date.parse(morningOf(3)) + 60 * 60 * 1000).toISOString(),
        );
    }
    insertEarlier(2, num, "Pedro Penduko");

    // today's walk-in takes the same number
    setLastNum(localDay(), num - 1);
    const walkIn = await send("POST", "/orders", {
        name: "Ana Reyes",
        purpose: "Roofings, Steel",
        orders: [],
        invoices: invoices(),
        salesman: "Maria Santos",
        team: "GIGA",
        pickupDate: null,
    });
    if (walkIn.status !== 201)
        throw new Error(`The API refused the walk-in (${walkIn.status}): ${walkIn.body?.message}`);

    // that request already brought the pick-ups into today's line; this is how sales sees it now
    const { body: today } = await send("GET", "/admin/orders");
    const ours = today.filter(
        (o) =>
            ["Juan Dela Cruz", "Pedro Penduko", "Ana Reyes"].includes(o.name) && (o.pickup?.num ?? o.queueNum) === num,
    );
    console.log(`Today's line now has three customers who are all RS ${pad2(num)}:`);
    for (const o of ours) {
        const loaded = o.areas?.filter((area) => area.loaded).map((area) => area.name) ?? [];
        console.log(
            `  ${ticketNumber(o).padEnd(28)} ${o.name.padEnd(16)} ${o.pickup ? `ordered ${o.pickup.date}, picking up today` : "walked in today"}${loaded.length ? `, ${loaded.join(", ")} already loaded` : ""}`,
        );
    }
    if (!crew) console.log("  (no loading account to have loaded Juan's Roofings, so nothing of his is loaded yet)");
    console.log(
        "Check the queue display, My counter, Order status, the Order sheet and History (search RS " + pad2(num) + ").",
    );
    console.log(`Data folder: ${api.dataDir}`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    db.close();
    server.closeAllConnections();
    server.close();
    api.close();
}
