// the Order sheet copied to Google Sheets: each order as a row of the loading schedule, and only the rows that changed
// sent to the Apps Script web app (a fake one here), with deleted orders taken out; all the priority orders ("*") and
// TBA priority ones ("**") are grouped below the regular ones, whatever their day
// run: npm test -- --test-name-pattern="Google sheet"
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSheetSync, sheetRow } from '../../server/googleSheet.js';
import { bootApp } from '../support/testApp.js';

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
            sortKey: "0 2026-10-29 0003",
        });
    });

    test("a priority order's QUE is \"*\" and a TBA priority one's \"**\", in place of the number", () => {
        assert.equal(sheetRow(order({ priority: true })).que, "*");
        assert.equal(sheetRow(order({ tbaPriority: true, purpose: "Tire" })).que, "**");
        assert.equal(sheetRow(order({ purpose: "Tire" })).que, "T 03");
    });

    test("the rows sort with the regular orders first, then all the priority orders, then all the TBA priority ones, whatever their day", () => {
        const rows = [
            order({ id: 1, queueNum: 1 }),
            order({ id: 2, queueNum: 2, tbaPriority: true }),
            order({ id: 3, queueNum: 3, priority: true }),
            order({ id: 4, queueNum: 4, tbaPriority: true }),
            order({ id: 5, queueNum: 10, priority: true }),
            order({ id: 6, queueNum: 1, date: "2026-10-28" }),
            // an earlier day's marked orders join their groups, rather than staying with that day
            order({ id: 7, queueNum: 9, date: "2026-10-28", priority: true }),
            order({ id: 8, queueNum: 8, date: "2026-10-28", tbaPriority: true }),
        ].map(sheetRow);

        const sorted = rows.toSorted((a, b) => a.sortKey.localeCompare(b.sortKey));

        assert.deepEqual(sorted.map((row) => [row.id, row.que]), [
            ["6", "RS 01"], ["1", "RS 01"],
            ["7", "*"], ["3", "*"], ["5", "*"],
            ["8", "**"], ["2", "**"], ["4", "**"],
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

    test("the status goes from waiting to saving to saved", async () => {
        let answer;
        const sync = createSheetSync({
            url: "https://example.test/exec", token: "t", listOrders: () => [order()],
            fetch: () => new Promise((resolve) => { answer = resolve; }),
        });
        assert.deepEqual(sync.status(), { state: "waiting", savedAt: null, error: "" });

        const syncing = sync.syncOnce();
        assert.equal(sync.status().state, "saving");

        // the rows, then the ids to keep
        answer(Response.json({ ok: true }));
        await new Promise((resolve) => setImmediate(resolve));
        answer(Response.json({ ok: true }));
        await syncing;

        const { state, savedAt, error } = sync.status();
        assert.equal(state, "saved");
        assert.ok(!Number.isNaN(Date.parse(savedAt)));
        assert.equal(error, "");
    });

    test("the status stays failed with its reason through a retry, keeps the last save, and clears once one gets through", async () => {
        let fetch = fakeWebApp().fetch;
        const sync = createSheetSync({
            url: "https://example.test/exec", token: "t", listOrders: () => orders, log: quietLog(),
            fetch: (...args) => fetch(...args),
        });
        let orders = [order()];
        await sync.syncOnce();
        const { savedAt } = sync.status();

        orders = [order({ runner: "REMZ" })];
        fetch = async () => { throw new Error("fetch failed"); };
        await sync.syncOnce();
        assert.deepEqual(sync.status(), { state: "failed", savedAt, error: "fetch failed" });

        // still failed while the retry is on its way, rather than flickering to saving
        let answer;
        fetch = () => new Promise((resolve) => { answer = resolve; });
        const retrying = sync.syncOnce();
        assert.equal(sync.status().state, "failed");

        answer(Response.json({ ok: true }));
        await retrying;
        assert.equal(sync.status().state, "saved");
        assert.equal(sync.status().error, "");
    });

    test("nothing to send is not a save: the last save's time stays", async () => {
        const sync = createSheetSync({ url: "https://example.test/exec", token: "t", listOrders: () => [order()], fetch: fakeWebApp().fetch });
        await sync.syncOnce();
        const { savedAt } = sync.status();

        await new Promise((resolve) => setTimeout(resolve, 5));
        await sync.syncOnce();
        assert.equal(sync.status().savedAt, savedAt);
    });

    describe("on the Order sheet", () => {
        const LINK = "https://docs.google.com/spreadsheets/d/abc/edit";

        // the API with a sheet set up behind this fake fetch, stopped after the test
        const withSheet = async (t, fetch, link = LINK) => {
            const app = await bootApp({ googleSheet: { url: "https://example.test/exec", token: "t", link, fetch, log: quietLog() } });
            t.after(() => app.close());
            return app;
        };
        // the first sync runs as the API starts; this waits for it to finish
        const settled = async (browser, state) => {
            for (let tries = 0; tries < 100; tries += 1) {
                const { body } = (await browser.get("/admin/order-sheet/sync")).assertStatus(200);
                if (body.state === state) return body;
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.fail(`the sync never reached ${state}`);
        };

        test("sales see that it saved, with the link to open it", async (t) => {
            const app = await withSheet(t, fakeWebApp().fetch);
            const body = await settled(await app.actingAsSales(), "saved");
            assert.equal(body.link, LINK);
            assert.equal(body.error, "");
        });

        test("sales see why it failed", async (t) => {
            const app = await withSheet(t, async () => { throw new Error("fetch failed"); });
            const body = await settled(await app.actingAsSales(), "failed");
            assert.equal(body.error, "fetch failed");
            assert.equal(body.savedAt, null);
        });

        test("it's off where no sheet is set up", async (t) => {
            const app = await bootApp();
            t.after(() => app.close());
            const { body } = (await (await app.actingAsAdmin()).get("/admin/order-sheet/sync")).assertStatus(200);
            assert.deepEqual(body, { state: "off" });
        });

        test("only sales and admins may see it, and it needs a sign-in", async (t) => {
            const app = await withSheet(t, fakeWebApp().fetch);
            (await (await app.actingAsLoading()).get("/admin/order-sheet/sync")).assertStatus(403);
            (await app.client().get("/admin/order-sheet/sync")).assertStatus(401);
        });
    });
});
