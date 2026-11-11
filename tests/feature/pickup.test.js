// pick-ups: a customer who ordered on one day and comes back on a later day (the pick-up date on Customer order) for
// the items. On that day the ticket comes into the day's line for a sales counter by itself, where sales checks the
// order is theirs; it keeps what was loaded the first time, takes none of the day's walk-in numbers, and goes everywhere
// by the number on the customer's paper and the day it was given, so RS 01 from Nov 11, RS 01 from Nov 12 and today's
// RS 01 are never mixed up
// run: npm test            only these: npm test -- --test-name-pattern="Pick-up"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp, localDay } from "../support/testApp.js";
import { ticketNumber } from "../../src/data/queueNum.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

const ROOFINGS_AND_STEEL = {
    purpose: "Roofings, Steel",
    invoices: [
        { invoiceNo: "1", type: "Roofings" },
        { invoiceNo: "101", type: "Steel" },
    ],
};

// an order from Customer order; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    orders: [],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...ROOFINGS_AND_STEEL,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// an order taken `daysAgo` days ago: made today, then moved back with that day's numbers, as if it had been
const orderedDaysAgo = async (daysAgo, overrides) => {
    const taken = await takeOrder(overrides);
    const { id } = app.db.prepare("SELECT MAX(id) AS id FROM orders").get();
    app.db.prepare("UPDATE orders SET queue_date = ? WHERE id = ?").run(localDay(daysAgo), id);
    app.db.prepare("UPDATE queue_counters SET queue_date = ? WHERE queue_date = ?").run(localDay(daysAgo), localDay());
    return { ...taken, id };
};

const queue = async () => (await app.client().get("/queue")).assertStatus(200).body;

describe("Pick-up", () => {
    test("comes into the line for sales on its day, under the number and day on the customer's paper", async () => {
        const juan = await orderedDaysAgo(3, { pickupDate: localDay() });

        const { upcoming } = await queue();

        assert.equal(upcoming.length, 1);
        assert.equal(upcoming[0].name, "Juan Dela Cruz");
        assert.equal(upcoming[0].queueNum, 1001);
        assert.deepEqual(upcoming[0].pickup, { num: 1, date: localDay(3) });
        app.assertDatabaseHas("orders", {
            id: juan.id,
            queue_date: localDay(),
            queue_num: 1001,
            original_date: localDay(3),
            original_num: 1,
            status: "pending",
            handed_over_by: null,
        });
    });

    test("two RS 01s from different days and today's own RS 01 are three tickets, each told apart", async () => {
        await orderedDaysAgo(3, { name: "Juan Dela Cruz", pickupDate: localDay() });
        await orderedDaysAgo(2, { name: "Pedro Penduko", pickupDate: localDay() });
        const walkIn = await takeOrder({ name: "Ana Reyes" });

        // the pick-ups take none of the day's numbers, so the first walk-in is still number 1
        assert.equal(walkIn.queueNum, 1);
        const { upcoming } = await queue();
        const shown = upcoming.map((o) => [o.name, ticketNumber(o)]);
        const nov = (n) => {
            const [, m, d] = localDay(n).split("-");
            return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${Number(d)}`;
        };
        assert.deepEqual(shown, [
            ["Ana Reyes", "RS 01"],
            ["Juan Dela Cruz", `RS 01 · PICK-UP · ${nov(3)}`],
            ["Pedro Penduko", `RS 01 · PICK-UP · ${nov(2)}`],
        ]);
        assert.equal(new Set(upcoming.map((o) => o.queueNum)).size, 3);
    });

    test("keeps what was loaded on the first visit, and goes to sales before the departments", async () => {
        const sales = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        await takeOrder({ pickupDate: localDay() });
        (await sales.post("/admin/orders/1/handover")).assertStatus(200);
        (await pedro.post("/admin/loading/1/start", { area: "Roofings" })).assertStatus(200);
        (await pedro.post("/admin/loading/1/done")).assertStatus(200);
        const { id } = app.db.prepare("SELECT MAX(id) AS id FROM orders").get();
        app.db.prepare("UPDATE orders SET queue_date = ? WHERE id = ?").run(localDay(1), id);

        const back = (await sales.get("/admin/orders/1001")).assertStatus(200).body;

        assert.equal(back.status, "pending");
        assert.equal(back.handedOver, undefined);
        assert.deepEqual(back.pickup, { num: 1, date: localDay(1) });
        assert.deepEqual(
            back.areas.map(({ name, loaded }) => [name, Boolean(loaded)]),
            [
                ["Roofings", true],
                ["Steel", false],
            ],
        );
        // the loading crew sees it again only once sales hands it over
        const crewList = (await pedro.get("/admin/orders")).assertStatus(200).body;
        assert.equal(crewList.length, 0);
        (await sales.post("/admin/orders/1001/handover")).assertStatus(200);
        const handedOver = (await pedro.get("/admin/orders")).assertStatus(200).body;
        assert.deepEqual(
            handedOver.map((o) => [o.queueNum, o.pickup]),
            [[1001, { num: 1, date: localDay(1) }]],
        );
    });

    test("shows on the display and the Order status board under its paper's number", async () => {
        await orderedDaysAgo(2, { pickupDate: localDay() });
        const sales = await app.actingAsSales();
        const admin = await app.actingAsAdmin();
        (await admin.post("/admin/orders/1001/call", { remarks: "Please proceed to Window 1" })).assertStatus(200);

        const { serving } = await queue();
        assert.deepEqual(serving[0].pickup, { num: 1, date: localDay(2) });
        const board = (await sales.get("/admin/order-status")).assertStatus(200).body;
        assert.deepEqual(board[0].pickup, { num: 1, date: localDay(2) });
    });

    test("is found in History by the number on their paper", async () => {
        await orderedDaysAgo(2, { pickupDate: localDay() });
        const sales = await app.actingAsSales();

        const found = (await sales.get("/admin/history?search=RS%2001")).assertStatus(200).body;

        assert.deepEqual(
            found.map((o) => [o.queueNum, o.pickup]),
            [[1001, { num: 1, date: localDay(2) }]],
        );
    });

    test("waits for its day, and a deleted ticket doesn't come back", async () => {
        await orderedDaysAgo(3, { name: "Not yet", pickupDate: localDay(-2) });
        await orderedDaysAgo(2, { name: "Deleted", pickupDate: localDay() });
        app.db.prepare("UPDATE orders SET deleted_at = ? WHERE name = 'Deleted'").run(new Date().toISOString());

        const { upcoming } = await queue();

        assert.deepEqual(upcoming, []);
        app.assertDatabaseHas("orders", { name: "Not yet", queue_date: localDay(3), pickup_at: null });
        app.assertDatabaseHas("orders", { name: "Deleted", queue_date: localDay(2), pickup_at: null });
    });

    test("a customer who didn't come and gets a new day keeps the number on their paper", async () => {
        await orderedDaysAgo(3, { pickupDate: localDay() });
        await queue();
        // they didn't come; sales set a later day, which is today now
        app.db.prepare("UPDATE orders SET queue_date = ? WHERE queue_num = 1001").run(localDay(1));

        const { upcoming } = await queue();

        assert.deepEqual(upcoming[0].pickup, { num: 1, date: localDay(3) });
    });

    test("counts on the day it was ordered in the stats, not the day it was collected", async () => {
        await orderedDaysAgo(2, { pickupDate: localDay() });
        const admin = await app.actingAsAdmin();

        const { buckets } = (await admin.get("/admin/stats?period=week")).assertStatus(200).body;

        const totals = Object.fromEntries(buckets.map((b) => [b.key, b.total]));
        assert.equal(totals[localDay(2)], 1);
        assert.equal(totals[localDay()], 0);
        // it really was moved into today
        app.assertDatabaseHas("orders", { original_date: localDay(2), queue_date: localDay() });
    });
});
