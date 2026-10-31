// a priority order: sales staff mark it on Customer order, and its ticket shows with a "*" in front, "* RS 01", on
// every page, the display and the printed ticket; a TBA priority order the same, with "**", "** T 01"; the kiosk and
// other staff can't mark one
// run: npm test            only these: npm test -- --test-name-pattern="priority order"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import formatQueueNum from '../../src/data/queueNum.js';
import { bootApp } from '../support/testApp.js';

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
    checkers: {},
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

describe("priority order", () => {
    test("its ticket has a \"*\" in front of the number", () => {
        assert.equal(formatQueueNum(1, "Roofings, Steel", { priority: true }), "* RS 01");
        assert.equal(formatQueueNum(1, "Roofings, Steel", { priority: false }), "RS 01");
        assert.equal(formatQueueNum(1, "Roofings, Steel"), "RS 01");
    });

    test("sales mark it as they take the order, and every page and the display see it", async () => {
        const maria = await app.actingAsSales("Maria Santos");

        const taken = (await maria.post("/orders", sale({ priority: true }))).assertStatus(201).body;

        assert.equal(taken.priority, true);
        app.assertDatabaseHas("orders", { queue_num: 1, priority: 1 });
        const [status] = (await maria.get("/admin/order-status")).assertStatus(200).body;
        assert.equal(status.priority, true);
        const { upcoming } = (await app.client().get("/queue")).assertStatus(200).body;
        assert.equal(upcoming[0].priority, true);
    });

    test("an order that isn't marked leaves it out", async () => {
        const taken = (await (await app.actingAsSales()).post("/orders", sale())).assertStatus(201).body;

        assert.equal(taken.priority, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, priority: 0 });
        const { upcoming } = (await app.client().get("/queue")).assertStatus(200).body;
        assert.equal(upcoming[0].priority, undefined);
    });

    test("the kiosk and the cashier can't mark one", async () => {
        (await app.client().post("/orders", sale({ priority: true }))).assertStatus(201);
        (await (await app.actingAsCashier()).post("/orders", sale({ priority: true }))).assertStatus(201);

        app.assertDatabaseCount("orders", 2, { priority: 0 });
    });

    test("editing the ticket marks it or takes the mark away, kept as an edit", async () => {
        const maria = await app.actingAsSales("Maria Santos");
        (await maria.post("/orders", sale())).assertStatus(201);

        const marked = (await maria.put("/admin/orders/1", sale({ priority: true }))).assertStatus(200).body;

        assert.equal(marked.priority, true);
        assert.deepEqual(marked.edits.map((e) => e.changes), [["priority"]]);
        const unmarked = (await maria.put("/admin/orders/1", sale({ priority: false }))).assertStatus(200).body;
        assert.equal(unmarked.priority, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, priority: 0 });
    });

    test("anything but true or false is refused", async () => {
        (await (await app.actingAsSales()).post("/orders", sale({ priority: "yes" }))).assertStatus(400);

        app.assertDatabaseCount("orders", 0);
    });
});

describe("TBA priority order", () => {
    test("its ticket has \"**\" in front of the number, whatever the types of order", () => {
        assert.equal(formatQueueNum(1, "Tire", { tbaPriority: true }), "** T 01");
        assert.equal(formatQueueNum(7, "Roofings, Tire", { tbaPriority: true }), "** RT 07");
        assert.equal(formatQueueNum(1, "Tire", { tbaPriority: false }), "T 01");
    });

    test("sales mark it as they take the order, and every page and the display see it", async () => {
        const maria = await app.actingAsSales("Maria Santos");

        const taken = (await maria.post("/orders", sale({ purpose: "Roofings, Tire", tbaPriority: true }))).assertStatus(201).body;

        assert.equal(taken.tbaPriority, true);
        assert.equal(taken.priority, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, tba_priority: 1, priority: 0 });
        const [status] = (await maria.get("/admin/order-status")).assertStatus(200).body;
        assert.equal(status.tbaPriority, true);
        const { upcoming } = (await app.client().get("/queue")).assertStatus(200).body;
        assert.equal(upcoming[0].tbaPriority, true);
    });

    test("an order is priority or TBA priority, not both", async () => {
        const maria = await app.actingAsSales();

        (await maria.post("/orders", sale({ priority: true, tbaPriority: true }))).assertStatus(400);

        app.assertDatabaseCount("orders", 0);
    });

    test("the kiosk and the cashier can't mark one", async () => {
        (await app.client().post("/orders", sale({ tbaPriority: true }))).assertStatus(201);
        (await (await app.actingAsCashier()).post("/orders", sale({ tbaPriority: true }))).assertStatus(201);

        app.assertDatabaseCount("orders", 2, { tba_priority: 0 });
    });

    test("editing the ticket switches a priority order to TBA priority, kept as an edit", async () => {
        const maria = await app.actingAsSales("Maria Santos");
        (await maria.post("/orders", sale({ priority: true }))).assertStatus(201);

        const switched = (await maria.put("/admin/orders/1", sale({ tbaPriority: true }))).assertStatus(200).body;

        assert.equal(switched.priority, undefined);
        assert.equal(switched.tbaPriority, true);
        assert.deepEqual(switched.edits.map((e) => e.changes), [["priority", "tbaPriority"]]);
    });

    test("anything but true or false is refused", async () => {
        (await (await app.actingAsSales()).post("/orders", sale({ tbaPriority: 1 }))).assertStatus(400);

        app.assertDatabaseCount("orders", 0);
    });
});
