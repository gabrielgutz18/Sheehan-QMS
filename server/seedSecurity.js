// adds a Security account and today's customers at every stage, like Laravel's db:seed, for trying the Security page:
// in line, a returning customer, at a sales counter, waiting for loading, at loading in one area, waiting for its next
// area, back at sales, at the security check (after loading, and after a sales counter), and done, verified or with a
// guard's report; with invoices for every department and one older ticket with items and quantities
// everything goes through the same API the app uses (POST /orders, then a sales counter, the loading crew area by area
// and the guard), so each customer is at their stage exactly as staff would have left them; a demo sales counter and
// loading crew member are added for that, so the board shows their names
// signed in as the built-in admin from .env; safe to run while the app is running, and running it again leaves the
// accounts alone and adds the customers again with the next numbers
// run: npm run seed:security                                the guard security1, password security123
//      npm run seed:security -- lester guard-password-1     the guard with your own username and password
// don't run it on the live server: the customers appear on the queue display and the called ones are announced
import { createServer } from 'node:http';

import { createApi } from './api.js';
import { whereNow } from '../src/admin/data/orderStage.js';
import formatQueueNum from '../src/data/queueNum.js';

const DEFAULT_PASSWORD = "security123";

// the guard who checks them at the gate, and the demo staff who move the customers along
const [guardName, guardPassword = DEFAULT_PASSWORD] = process.argv.slice(2);
const GUARD = { username: guardName ?? "security1", name: "Security Guard", role: "security" };
const SALES = { username: "demo.sales", name: "Maria Santos", role: "sales" };
const LOADING = { username: "demo.loading", name: "Pedro Garcia", role: "loading" };

// a customer as Customer order sends them; invoices list what they bought, under their type of order
const sale = (name, purpose, invoices, team = "GIGA") => ({
    name, purpose, orders: [], invoices: invoices.map(([invoiceNo, type]) => ({ invoiceNo, type })),
    salesman: SALES.name, runner: "", paymentStatus: "Paid", team, pickupDate: null,
});

// the sales counter serves the customer; handing them over sends them on to loading
const call = (n, sales) => sales("POST", `/admin/orders/${n}/call`);
const handOver = async (n, sales) => {
    await call(n, sales);
    await sales("POST", `/admin/orders/${n}/handover`);
};
const doneAtSales = async (n, sales) => {
    await call(n, sales);
    await sales("PATCH", `/admin/orders/${n}`, { status: "done" });
};
// the loading crew calls them to their next area; Done there sends them on to the area after it, or, after the last,
// to the security check
const callToNextArea = (n, loading) => loading("POST", `/admin/loading/${n}/call`, { remarks: "" });
const loadNextArea = async (n, loading) => {
    await callToNextArea(n, loading);
    return (await loading("POST", `/admin/loading/${n}/done`)).body;
};
const loadEveryArea = async (n, loading) => {
    while ((await loadNextArea(n, loading)).status !== "done");
};
// the guard at the gate: verified, or a report of what's wrong
const check = (n, guard, result, note) => guard("POST", `/admin/security/${n}/check`, { result, note });

// every stage, each with what gets it there; s is the sales counter, l the loading crew, g the guard
const CUSTOMERS = [
    {
        order: sale("Juan Dela Cruz", "Roofings, Steel", [["44976501", "Roofings"], ["44976502", "Roofings"], ["22310077", "Steel"]]),
        steps: async (n, s, l, g) => { await handOver(n, s); await loadEveryArea(n, l); await check(n, g, "verified"); },
    },
    {
        order: sale("Carmela Cruz", "Roofings Accessories, Hardwares", [["55120034", "Roofings Accessories"], ["88120415", "Hardwares"]], "MEGA"),
        steps: async (n, s, l, g) => {
            await handOver(n, s);
            await loadEveryArea(n, l);
            await check(n, g, "missing", "One box of tek screws short of invoice 88120415");
        },
    },
    {
        order: sale("Mark Garcia", "Steel", [["22310150", "Steel"]]),
        steps: async (n, s, l) => { await handOver(n, s); await loadEveryArea(n, l); },
    },
    {
        order: sale("Ana Lim", "Tire, Battery", [["60770012", "Tire"], ["60770013", "Battery"]]),
        steps: async (n, s) => { await doneAtSales(n, s); },
    },
    {
        // Roofings done, called to Steel now
        order: sale("Ramon Aquino", "Roofings, Steel", [["44976590", "Roofings"], ["22310102", "Steel"]], "MEGA"),
        steps: async (n, s, l) => { await handOver(n, s); await loadNextArea(n, l); await callToNextArea(n, l); },
    },
    {
        // Roofings done, in line for Steel
        order: sale("Liza Mendoza", "Roofings, Steel, Chassis", [["44976610", "Roofings"], ["22310120", "Steel"], ["70440088", "Chassis"]]),
        steps: async (n, s, l) => { await handOver(n, s); await loadNextArea(n, l); },
    },
    {
        order: sale("Joy Fernandez", "Roofings", [["44976655", "Roofings"]]),
        steps: async (n, s) => { await handOver(n, s); },
    },
    {
        // a sales counter calls a handed-over customer back, e.g. to fix an invoice
        order: sale("Noel Ramos", "Roofings", [["44976640", "Roofings"]], "MEGA"),
        steps: async (n, s) => { await handOver(n, s); await call(n, s); },
    },
    {
        order: sale("Grace Torres", "Hardwares", [["88120533", "Hardwares"]]),
        steps: async (n, s) => { await call(n, s); },
    },
    {
        // served before, and back in line for more
        order: sale("Paolo Domingo", "Battery", [["60770140", "Battery"]], "MEGA"),
        steps: async (n, s) => { await doneAtSales(n, s); await s("PATCH", `/admin/orders/${n}`, { status: "returning" }); },
    },
    {
        // a ticket taken before invoices: the items and quantities are on the ticket itself
        order: {
            name: "Rosa Villanueva", purpose: "Roofings",
            orders: [{ item: "Long span", qty: 12, color: "red" }, { item: "Gutter", qty: 4 }],
        },
        steps: async () => {},
    },
];

const { ADMIN_USERNAME, ADMIN_PASSWORD, DATA_DIR } = process.env;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

const api = createApi({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD, dataDir: DATA_DIR });
const server = createServer(api);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

// one signed-in browser: keeps its session cookie and sends the header the admin pages send; any answer but a 2xx
// stops the seeding with the API's message
const browser = () => {
    let cookie = "";
    return async (method, path, body, { allow = [] } = {}) => {
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
        const answer = text ? JSON.parse(text) : null;
        if (!res.ok && !allow.includes(res.status)) throw new Error(`${method} ${path} was refused (${res.status}): ${answer?.message}`);
        return { status: res.status, body: answer };
    };
};

// the account, made the way an admin does on Accounts unless it's there already, and a browser signed in as it; one
// that's there with another password can't be signed in to, so the built-in admin does its part instead
const signedInAs = async (admin, account, password) => {
    const made = await admin("POST", "/admin/users", { ...account, password }, { allow: [409] });
    const staff = browser();
    const signIn = await staff("POST", "/auth/login", { username: account.username, password }, { allow: [401] });
    if (made.status === 409) console.log(`There's already an account named ${account.username}; left it as it is.`);
    else console.log(`Added ${account.name}: username ${account.username}, password ${password}, role ${account.role}`);
    if (signIn.status === 200) return staff;
    console.log(`  (couldn't sign in as ${account.username} with ${password}, so the built-in admin stands in for it)`);
    return null;
};

try {
    const admin = browser();
    await admin("POST", "/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });

    const guard = await signedInAs(admin, GUARD, guardPassword);
    const sales = (await signedInAs(admin, SALES, DEFAULT_PASSWORD)) ?? admin;
    const loading = (await signedInAs(admin, LOADING, DEFAULT_PASSWORD)) ?? admin;

    const added = [];
    for (const { order, steps } of CUSTOMERS) {
        const { body: taken } = await admin("POST", "/orders", order);
        await steps(taken.queueNum, sales, loading, guard ?? admin);
        added.push(taken.queueNum);
    }

    // what the guard sees for them on the Security page
    const board = (await (guard ?? admin)("GET", "/admin/security")).body.filter((o) => added.includes(o.queueNum));
    console.log(`\nAdded ${board.length} customers to today's queue; the Security page shows:`);
    for (const order of board) {
        const products = [
            ...order.invoices.map(({ invoiceNo }) => invoiceNo),
            ...order.orders.map(({ item, qty }) => `${qty} × ${item}`),
        ].join(", ");
        console.log(`  ${formatQueueNum(order.queueNum, order.purpose).padEnd(7)} ${order.name.padEnd(16)} ${whereNow(order).padEnd(30)} ${products}`);
    }
    console.log(`\nSign in as ${GUARD.username}${guard ? ` (password ${guardPassword})` : ""} to see it: /admin/security`);
    console.log(`Data folder: ${api.dataDir}`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    server.closeAllConnections();
    server.close();
    api.close();
}
