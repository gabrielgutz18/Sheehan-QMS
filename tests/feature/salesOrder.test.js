// Customer order as sales staff fill it in: one or more types of order, the invoices that list the items (each with
// the type of order it's for), the salesman, payment status, loading team, and for a returning customer, the day
// they come back for the items
// run: npm test            only these: npm test -- --test-name-pattern="sales order"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp, localDay } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// what Customer order sends; pass any field to change it
const sale = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings, Steel",
    orders: [],
    invoices: [{ invoiceNo: "2223", type: "Roofings" }],
    salesman: "Maria Santos",
    paymentStatus: "Vale",
    team: "Roofings",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", sale(overrides))).assertStatus(201).body;

describe("sales order", () => {
    test("an order takes a number with its invoices, salesman, payment status and team, and no items", async () => {
        const saved = await takeOrder({
            invoices: [{ invoiceNo: "  43355521 ", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }],
            salesman: " Maria Santos ",
        });

        assert.equal(saved.queueNum, 1);
        assert.equal(saved.purpose, "Roofings, Steel");
        assert.deepEqual(saved.orders, []);
        assert.deepEqual(saved.invoices, [{ invoiceNo: "43355521", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }]);
        assert.equal(saved.salesman, "Maria Santos");
        assert.equal(saved.paymentStatus, "Vale");
        assert.equal(saved.team, "Roofings");
        assert.equal(saved.pickupDate, undefined);
        app.assertDatabaseHas("orders", {
            queue_num: 1, salesman: "Maria Santos", payment_status: "Vale", team: "Roofings", pickup_date: null,
        });
        app.assertDatabaseHas("order_invoices", { position: 0, invoice_no: "43355521", type: "Roofings" });
        app.assertDatabaseHas("order_invoices", { position: 1, invoice_no: "5566", type: "Steel" });
        app.assertDatabaseCount("order_items", 0);
    });

    test("a returning customer's order keeps the day they come back for the items", async () => {
        const day = localDay(-3);

        const saved = await takeOrder({ pickupDate: day });

        assert.equal(saved.pickupDate, day);
        app.assertDatabaseHas("orders", { queue_num: 1, pickup_date: day });
    });

    test("the team is optional", async () => {
        const saved = await takeOrder({ purpose: "Hardwares", invoices: [{ invoiceNo: "2223", type: "Hardwares" }], team: "" });

        assert.equal(saved.team, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, team: "" });
    });

    test("an order needs an invoice when it lists no items", async () => {
        const desk = app.client();

        (await desk.post("/orders", sale({ invoices: undefined }))).assertStatus(400);
        (await desk.post("/orders", sale({ invoices: [] }))).assertStatus(400);
        (await desk.post("/orders", sale({ invoices: [{ invoiceNo: "   ", type: "Roofings" }] }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        (await desk.post("/orders", sale({ invoices: undefined, orders: [{ item: "Long span", qty: 4 }] }))).assertStatus(201);
    });

    test("each invoice is for one of the order's types, and no number is listed twice", async () => {
        const desk = app.client();
        const invoices = (...list) => sale({ invoices: list });

        // Tire isn't one of this order's types, and every invoice needs one
        (await desk.post("/orders", invoices({ invoiceNo: "2223", type: "Tire" }))).assertStatus(400);
        (await desk.post("/orders", invoices({ invoiceNo: "2223" }))).assertStatus(400);
        (await desk.post("/orders", invoices({ invoiceNo: "2223", type: "" }))).assertStatus(400);
        (await desk.post("/orders", invoices({ invoiceNo: "2223", type: "Roofings" }, { invoiceNo: " 2223", type: "Steel" })))
            .assertStatus(400);
        (await desk.post("/orders", invoices("2223"))).assertStatus(400);
        (await desk.post("/orders", invoices(null))).assertStatus(400);
        (await desk.post("/orders", sale({ invoices: { invoiceNo: "2223", type: "Roofings" } }))).assertStatus(400);
        const many = Array.from({ length: 21 }, (_, i) => ({ invoiceNo: String(1000 + i), type: "Steel" }));
        (await desk.post("/orders", sale({ invoices: many }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        // two invoices can be for the same type
        (await desk.post("/orders", invoices({ invoiceNo: "2223", type: "Steel" }, { invoiceNo: "2224", type: "Steel" })))
            .assertStatus(201);
        (await desk.post("/orders", sale({ invoices: many.slice(0, 20) }))).assertStatus(201);
    });

    test("payment status and team come from their lists, and the rest is checked too", async () => {
        const desk = app.client();

        (await desk.post("/orders", sale({ paymentStatus: "Cash" }))).assertStatus(400);
        (await desk.post("/orders", sale({ paymentStatus: "vale" }))).assertStatus(400);
        (await desk.post("/orders", sale({ team: "Tires" }))).assertStatus(400);
        (await desk.post("/orders", sale({ invoices: [{ invoiceNo: "9".repeat(31), type: "Roofings" }] }))).assertStatus(400);
        (await desk.post("/orders", sale({ salesman: "x".repeat(61) }))).assertStatus(400);
        (await desk.post("/orders", sale({ pickupDate: "2026-02-30" }))).assertStatus(400);
        (await desk.post("/orders", sale({ pickupDate: "tomorrow" }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        for (const paymentStatus of ["Vale", "Paid", "Terms"]) {
            (await desk.post("/orders", sale({ paymentStatus }))).assertStatus(201);
        }
    });

    test("editing changes the details and invoices and keeps the number", async () => {
        await takeOrder({ invoices: [{ invoiceNo: "2223", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }] });
        const day = localDay(-2);

        const changed = (await app.client().put("/orders/1", sale({
            purpose: "Steel", invoices: [{ invoiceNo: "2563", type: "Steel" }], paymentStatus: "Paid", team: "Steel", pickupDate: day,
        }))).assertStatus(200).body;

        assert.equal(changed.queueNum, 1);
        assert.equal(changed.purpose, "Steel");
        assert.deepEqual(changed.invoices, [{ invoiceNo: "2563", type: "Steel" }]);
        assert.equal(changed.paymentStatus, "Paid");
        assert.equal(changed.team, "Steel");
        assert.equal(changed.pickupDate, day);
        app.assertDatabaseCount("order_invoices", 1);

        // they took the items after all
        const cleared = (await app.client().put("/orders/1", sale({ pickupDate: null }))).assertStatus(200).body;
        assert.equal(cleared.pickupDate, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, pickup_date: null });
        // an invoice for a type the order no longer has is refused
        (await app.client().put("/orders/1", sale({ purpose: "Tire" }))).assertStatus(400);
    });

    test("the display shows the number but never the sales details", async () => {
        await takeOrder();

        const { upcoming } = (await app.client().get("/queue")).assertStatus(200).body;

        assert.deepEqual(upcoming, [{ queueNum: 1, name: "Juan Dela Cruz", purpose: "Roofings, Steel" }]);
    });

    test("sales staff see the details and can open one ticket to edit it; loading staff can't", async () => {
        await takeOrder({ pickupDate: localDay(-1) });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();

        const [listed] = (await maria.get("/admin/orders")).assertStatus(200).body;
        const opened = (await maria.get("/admin/orders/1")).assertStatus(200).body;

        assert.deepEqual(opened, listed);
        assert.deepEqual(opened.invoices, [{ invoiceNo: "2223", type: "Roofings" }]);
        assert.equal(opened.paymentStatus, "Vale");
        (await maria.get("/admin/orders/2")).assertStatus(404);
        (await pedro.get("/admin/orders/1")).assertStatus(403);
    });

    test("the sales graph counts orders for each type of order, and each order once in all", async () => {
        await takeOrder({ purpose: "Roofings, Steel" });
        await takeOrder({ purpose: "Steel", invoices: [{ invoiceNo: "3001", type: "Steel" }] });
        await takeOrder({ purpose: "Tire", invoices: [{ invoiceNo: "3002", type: "Tire" }] });
        // a deleted one is left out
        await takeOrder({ purpose: "Tire", invoices: [{ invoiceNo: "3003", type: "Tire" }] });
        const admin = await app.actingAsAdmin();
        (await admin.delete("/admin/orders/4")).assertStatus(204);

        for (const period of ["day", "week", "month", "year"]) {
            const { buckets } = (await admin.get(`/admin/stats?period=${period}`)).assertStatus(200).body;
            const today = buckets.filter((b) => b.total > 0);

            assert.equal(today.length, 1, period);
            assert.equal(today[0].total, 3, period);
            assert.deepEqual(today[0].orders, { Roofings: 1, Steel: 2, Tire: 1 }, period);
        }
    });

    test("a deleted ticket keeps its invoices in History", async () => {
        await takeOrder({ invoices: [{ invoiceNo: "2223", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }] });
        const admin = await app.actingAsAdmin();
        (await admin.delete("/admin/orders/1")).assertStatus(204);

        const [ticket] = (await admin.get("/admin/history?deleted=1")).assertStatus(200).body;

        assert.deepEqual(ticket.invoices.map((i) => i.invoiceNo), ["2223", "5566"]);
    });
});
