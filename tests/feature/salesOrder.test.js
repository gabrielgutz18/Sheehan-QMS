// Customer order as sales staff fill it in: one or more types of order, the invoice that lists the items, the
// salesman, payment status, loading team, and for a returning customer, the day they come back for the items
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
    invoiceNo: "2223",
    salesman: "Maria Santos",
    paymentStatus: "Vale",
    team: "Roofings",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", sale(overrides))).assertStatus(201).body;

describe("sales order", () => {
    test("an order takes a number with its invoice, salesman, payment status and team, and no items", async () => {
        const saved = await takeOrder({ invoiceNo: "  2223 ", salesman: " Maria Santos " });

        assert.equal(saved.queueNum, 1);
        assert.equal(saved.purpose, "Roofings, Steel");
        assert.deepEqual(saved.orders, []);
        assert.equal(saved.invoiceNo, "2223");
        assert.equal(saved.salesman, "Maria Santos");
        assert.equal(saved.paymentStatus, "Vale");
        assert.equal(saved.team, "Roofings");
        assert.equal(saved.pickupDate, undefined);
        app.assertDatabaseHas("orders", {
            queue_num: 1, invoice_no: "2223", salesman: "Maria Santos", payment_status: "Vale", team: "Roofings", pickup_date: null,
        });
        app.assertDatabaseCount("order_items", 0);
    });

    test("a returning customer's order keeps the day they come back for the items", async () => {
        const day = localDay(-3);

        const saved = await takeOrder({ pickupDate: day });

        assert.equal(saved.pickupDate, day);
        app.assertDatabaseHas("orders", { queue_num: 1, pickup_date: day });
    });

    test("the team is optional", async () => {
        const saved = await takeOrder({ purpose: "Hardwares", team: "" });

        assert.equal(saved.team, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, team: "" });
    });

    test("an order needs an invoice number when it lists no items", async () => {
        const desk = app.client();

        (await desk.post("/orders", sale({ invoiceNo: undefined }))).assertStatus(400);
        (await desk.post("/orders", sale({ invoiceNo: "   " }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        (await desk.post("/orders", sale({ invoiceNo: undefined, orders: [{ item: "Long span", qty: 4 }] }))).assertStatus(201);
    });

    test("payment status and team come from their lists, and the rest is checked too", async () => {
        const desk = app.client();

        (await desk.post("/orders", sale({ paymentStatus: "Cash" }))).assertStatus(400);
        (await desk.post("/orders", sale({ paymentStatus: "vale" }))).assertStatus(400);
        (await desk.post("/orders", sale({ team: "Tires" }))).assertStatus(400);
        (await desk.post("/orders", sale({ invoiceNo: "9".repeat(31) }))).assertStatus(400);
        (await desk.post("/orders", sale({ salesman: "x".repeat(61) }))).assertStatus(400);
        (await desk.post("/orders", sale({ pickupDate: "2026-02-30" }))).assertStatus(400);
        (await desk.post("/orders", sale({ pickupDate: "tomorrow" }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        for (const paymentStatus of ["Vale", "Paid", "Terms"]) {
            (await desk.post("/orders", sale({ paymentStatus }))).assertStatus(201);
        }
    });

    test("editing changes the details and keeps the number", async () => {
        await takeOrder();
        const day = localDay(-2);

        const changed = (await app.client().put("/orders/1", sale({
            purpose: "Steel", invoiceNo: "2563", paymentStatus: "Paid", team: "Steel", pickupDate: day,
        }))).assertStatus(200).body;

        assert.equal(changed.queueNum, 1);
        assert.equal(changed.purpose, "Steel");
        assert.equal(changed.invoiceNo, "2563");
        assert.equal(changed.paymentStatus, "Paid");
        assert.equal(changed.team, "Steel");
        assert.equal(changed.pickupDate, day);

        // they took the items after all
        const cleared = (await app.client().put("/orders/1", sale({ pickupDate: null }))).assertStatus(200).body;
        assert.equal(cleared.pickupDate, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, pickup_date: null });
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
        assert.equal(opened.invoiceNo, "2223");
        assert.equal(opened.paymentStatus, "Vale");
        (await maria.get("/admin/orders/2")).assertStatus(404);
        (await pedro.get("/admin/orders/1")).assertStatus(403);
    });
});
