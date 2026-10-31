// the Order sheet copied to Google Sheets: each order as a row of the loading schedule, and only the rows that changed
// sent to the Apps Script web app (a fake one here), with deleted orders taken out; each day's priority orders ("*")
// and TBA priority ones ("**") are grouped at its top
// run: npm test -- --test-name-pattern="Google sheet"
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSheetSync, sheetRow } from '../../server/googleSheet.js';

// an ISO moment at this time today by the local clock, as the server keeps them
const at = (hh, mm) => {
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
};

// an order as the Order sheet lists it (toHistory's shape); pass any field to change it
const order = (overrides = {}) => ({
    id: 1,
    date: "2026-10-29",
    queueNum: 3,
    name: "Melandro Camacho Valdemor",
    purpose: "Roofings, Steel",
    status: "pending",
    createdAt: new Date(2026, 9, 29, 7, 25).toISOString(),
    invoices: [
        { invoiceNo: "450000", type: "Roofings" },
        { invoiceNo: "450004", type: "Steel" },
        { invoiceNo: "450001", type: "Roofings" },
    ],
    areas: [{ name: "Roofings" }, { name: "Steel" }],
    ...overrides,
});

// a stand-in for the web app: answers { ok: true } and keeps what each request sent
const fakeWebApp = ({ fail = false } = {}) => {
    const requests = [];
    const fetch = async (url, init) => {
        requests.push(JSON.parse(init.body));
        if (fail) return new Response("Server error", { status: 500 });
        return Response.json({ ok: true });
    };
    return { requests, fetch };
};
const quietLog = () => {
    const errors = [];
    return { errors, log: (message) => errors.push(message), error: (message) => errors.push(message) };
};

describe("Google sheet", () => {
    test("an order is one row of the loading schedule, its invoices stacked under their department", () => {
        const row = sheetRow(order({
            team: "GIGA",
            salesman: "AMADO",
            servedBy: { id: 2, name: "BELULIA" },
            paymentStatus: "Paid",
            salesTimeIn: "07:30",
            salesTimeOut: "07:34",
            runner: "REMZ",
            receiver: "ROMA",
        }));

        assert.deepEqual(row, {
            id: "1",
            date: "Oct-29-26",
            que: "RS 03",
            team: "GIGA",
            salesman: "AMADO",
            assistedBy: "BELULIA",
            customer: "Melandro Camacho Valdemor",
            roofing: "450000\n450001",
            construction: "450004",
            tba: "",
            chassis: "",
            others: "",
            terms: "Paid",
            salesTimeIn: "0730H",
            salesTimeOut: "0734H",
            runner: "REMZ",
            receiver: "ROMA",
            loadingTimeIn: "",
            loadingTimeOut: "",
            status: "In line for sales",
            doubleCheckedBy: "",
            sortKey: "2026-10-29 2 0003",
        });
    });

    test("a priority order's QUE is \"*\" and a TBA priority one's \"**\", in place of the number", () => {
        assert.equal(sheetRow(order({ priority: true })).que, "*");
        assert.equal(sheetRow(order({ tbaPriority: true, purpose: "Tire" })).que, "**");
        assert.equal(sheetRow(order({ purpose: "Tire" })).que, "T 03");
    });

    test("each day's rows sort with the priority orders first, then the TBA priority ones, then the rest", () => {
        const rows = [
            order({ id: 1, queueNum: 1 }),
            order({ id: 2, queueNum: 2, tbaPriority: true }),
            order({ id: 3, queueNum: 3, priority: true }),
            order({ id: 4, queueNum: 4, tbaPriority: true }),
            order({ id: 5, queueNum: 10, priority: true }),
            order({ id: 6, queueNum: 1, date: "2026-10-28" }),
        ].map(sheetRow);

        const sorted = rows.toSorted((a, b) => a.sortKey.localeCompare(b.sortKey));

        assert.deepEqual(sorted.map((row) => [row.id, row.que]), [
            ["6", "RS 01"],
            ["3", "*"], ["5", "*"],
            ["2", "**"], ["4", "**"],
            ["1", "RS 01"],
        ]);
    });

    test("loading's times: in when sales handed them over, out once every area is loaded", () => {
        const handedOver = { by: { id: 2, name: "BELULIA" }, at: at(7, 52) };
        const halfway = sheetRow(order({
            status: "pending",
            handedOver,
            areas: [{ name: "Roofings", loaded: { by: { name: "Pedro" }, at: at(8, 1) } }, { name: "Steel" }],
        }));
        assert.equal(halfway.loadingTimeIn, "0752H");
        assert.equal(halfway.loadingTimeOut, "");
        assert.equal(halfway.status, "Waiting for Steel");

        const loaded = sheetRow(order({
            status: "done",
            handedOver,
            areas: [
                { name: "Roofings", loaded: { by: { name: "Pedro" }, at: at(8, 1) } },
                { name: "Steel", loaded: { by: { name: "Ana" }, at: at(8, 11) } },
            ],
        }));
        assert.equal(loaded.loadingTimeOut, "0811H");
        assert.equal(loaded.status, "Done");
    });

    test("double checked by is each column's 2nd checker, each name once", () => {
        const row = sheetRow(order({
            checkers: { Roofing: ["Pedro", "Ana"], Construction: ["Ben", "Ana"], "Hardware/TBA/Chassis": ["Cris", ""] },
        }));
        assert.equal(row.doubleCheckedBy, "Ana");
    });

    test("the first sync sends every row, oldest first, and the ids to keep", async () => {
        const app = fakeWebApp();
        const orders = [order({ id: 2, queueNum: 1, date: "2026-10-29" }), order({ id: 1, queueNum: 7, date: "2026-10-28" })];
        const sync = createSheetSync({ url: "https://example.test/exec", token: "secret", listOrders: () => orders, fetch: app.fetch });

        await sync.syncOnce();

        assert.equal(app.requests.length, 2);
        assert.equal(app.requests[0].token, "secret");
        assert.deepEqual(app.requests[0].rows.map((row) => row.id), ["1", "2"]);
        assert.deepEqual(app.requests[1], { token: "secret", keep: ["1", "2"] });
    });

    test("after that, only a row that changed is sent, and nothing when nothing did", async () => {
        const app = fakeWebApp();
        let orders = [order({ id: 1 }), order({ id: 2, queueNum: 4 })];
        const sync = createSheetSync({ url: "https://example.test/exec", token: "t", listOrders: () => orders, fetch: app.fetch });
        await sync.syncOnce();
        app.requests.length = 0;

        await sync.syncOnce();
        assert.equal(app.requests.length, 0);

        orders = [order({ id: 1 }), order({ id: 2, queueNum: 4, runner: "REMZ" })];
        await sync.syncOnce();
        assert.equal(app.requests.length, 1);
        assert.deepEqual(app.requests[0].rows.map((row) => [row.id, row.runner]), [["2", "REMZ"]]);
    });

    test("a deleted order is taken out of the sheet", async () => {
        const app = fakeWebApp();
        let orders = [order({ id: 1 }), order({ id: 2, queueNum: 4 })];
        const sync = createSheetSync({ url: "https://example.test/exec", token: "t", listOrders: () => orders, fetch: app.fetch });
        await sync.syncOnce();
        app.requests.length = 0;

        orders = [order({ id: 1 })];
        await sync.syncOnce();
        assert.deepEqual(app.requests, [{ token: "t", remove: ["2"] }]);
    });

    test("a sheet that can't be reached is logged once, and the rows are sent again once it can", async () => {
        const down = fakeWebApp({ fail: true });
        const up = fakeWebApp();
        let fetch = down.fetch;
        const log = quietLog();
        const sync = createSheetSync({
            url: "https://example.test/exec", token: "t", listOrders: () => [order()], fetch: (...args) => fetch(...args), log,
        });

        await sync.syncOnce();
        await sync.syncOnce();
        assert.deepEqual(log.errors, ["Google sheet: couldn't sync the orders: the web app answered 500"]);

        fetch = up.fetch;
        await sync.syncOnce();
        assert.deepEqual(up.requests[0].rows.map((row) => row.id), ["1"]);
        assert.equal(log.errors.at(-1), "Google sheet: back in sync");
    });

    test("a web app that refuses the rows (wrong token) is an error, not a sync", async () => {
        const log = quietLog();
        const sync = createSheetSync({
            url: "https://example.test/exec", token: "wrong", listOrders: () => [order()], log,
            fetch: async () => Response.json({ ok: false, error: "Wrong token." }),
        });

        await sync.syncOnce();
        assert.deepEqual(log.errors, ["Google sheet: couldn't sync the orders: Wrong token."]);
    });
});
