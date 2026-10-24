// Customer Report: a kiosk ticket for a concern instead of an order (purpose "Customer Report", no items)
// run: npm test            only these: npm test -- --test-name-pattern="report"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp, ticket } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// what the kiosk sends for a Customer Report
const report = (overrides = {}) => ({
    name: "Ana Reyes",
    purpose: "Customer Report",
    orders: [],
    concern: "The roofing I bought last week is leaking at the joints.",
    ...overrides,
});

describe("customer reports", () => {
    test("a customer report takes a number with just the concern", async () => {
        const saved = (await app.client().post("/orders", report({ concern: "  Leaking roof.  " }))).assertStatus(201).body;

        assert.equal(saved.queueNum, 1);
        assert.equal(saved.status, "pending");
        assert.equal(saved.concern, "Leaking roof.");
        assert.deepEqual(saved.orders, []);
        app.assertDatabaseHas("orders", { queue_num: 1, purpose: "Customer Report", concern: "Leaking roof." });
        app.assertDatabaseCount("order_items", 0);
    });

    test("the display shows the report's number but never the concern", async () => {
        await app.client().post("/orders", report());

        const { upcoming } = (await app.client().get("/queue")).assertStatus(200).body;

        assert.deepEqual(upcoming, [{ queueNum: 1, name: "Ana Reyes", purpose: "Customer Report" }]);
    });

    test("staff see the concern in today's orders", async () => {
        await app.client().post("/orders", report());
        const maria = await app.actingAsSales();

        const [listed] = (await maria.get("/admin/orders")).assertStatus(200).body;

        assert.equal(listed.concern, "The roofing I bought last week is leaking at the joints.");
        assert.deepEqual(listed.orders, []);
    });

    test("a report needs a concern of up to 300 characters, and no items", async () => {
        const kiosk = app.client();

        (await kiosk.post("/orders", report({ concern: undefined }))).assertStatus(400);
        (await kiosk.post("/orders", report({ concern: "   " }))).assertStatus(400);
        (await kiosk.post("/orders", report({ concern: "x".repeat(301) }))).assertStatus(400);
        (await kiosk.post("/orders", report({ orders: [{ item: "Gutter", qty: 1 }] }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        (await kiosk.post("/orders", report({ concern: "x".repeat(300) }))).assertStatus(201);
        (await kiosk.post("/orders", report({ orders: undefined }))).assertStatus(201);
    });

    test("an order never keeps a concern", async () => {
        const saved = (await app.client().post("/orders", ticket({ concern: "Not a report" }))).assertStatus(201).body;

        assert.equal(saved.concern, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, concern: "" });
    });

    test("editing switches cleanly between a report and an order", async () => {
        await app.client().post("/orders", report());
        const desk = await app.actingAsSales();

        const asOrder = (await desk.put("/admin/orders/1", ticket())).assertStatus(200).body;
        assert.equal(asOrder.concern, undefined);
        assert.equal(asOrder.orders.length, 1);
        app.assertDatabaseHas("orders", { queue_num: 1, purpose: "Roofings", concern: "" });

        const asReport = (await desk.put("/admin/orders/1", report({ concern: "Changed my mind" }))).assertStatus(200).body;
        assert.equal(asReport.concern, "Changed my mind");
        assert.deepEqual(asReport.orders, []);
        app.assertDatabaseCount("order_items", 0);
    });

    test("a report is served and marked served by whoever took it, like any ticket", async () => {
        await app.client().post("/orders", report());
        const maria = await app.actingAsSales();

        (await maria.post("/admin/orders/1/call", { remarks: "Customer service desk" })).assertStatus(200);
        const done = (await maria.patch("/admin/orders/1", { status: "done" })).assertStatus(200).body;

        assert.equal(done.servedBy.name, "Maria Santos");
        assert.ok(done.servedAt);
        app.assertDatabaseHas("serves", { user_id: maria.account.id });
    });

    test("reports stay out of the sales graph, which counts what was ordered", async () => {
        const kiosk = app.client();
        await kiosk.post("/orders", report());
        await kiosk.post("/orders", ticket());
        const admin = await app.actingAsAdmin();

        const { buckets } = (await admin.get("/admin/stats?period=day")).assertStatus(200).body;

        const purposes = new Set(buckets.flatMap((b) => Object.keys(b.orders)));
        assert.deepEqual([...purposes], ["Roofings"]);
        assert.equal(buckets.reduce((sum, b) => sum + b.total, 0), 1);
    });
});
