// the Order sheet on Customer order: every order from every day with all its details, shared by every sales staff member
// like a spreadsheet; the runner and receiver are filled in there (no longer on the Order tab), and the sales team can be
// changed there too, one cell at a time, each change kept as an edit with who saved it; the payment status shows there,
// but only the cashier changes it
// run: npm test -- --test-name-pattern="order sheet"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp, localDay } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from the Order tab, which no longer takes the runner or receiver; pass any field to change it
const sale = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings",
    orders: [],
    invoices: [{ invoiceNo: "2223", type: "Roofings" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

// takes the order and gives its id, which the sheet saves it by, since queue numbers repeat every day
const takeOrder = async (overrides) => {
    const { queueNum } = (await app.client().post("/orders", sale(overrides))).assertStatus(201).body;
    return app.db.prepare("SELECT id FROM orders WHERE queue_date = ? AND queue_num = ?").get(localDay(), queueNum).id;
};

// an order from daysAgo days ago with that day's queue number; the API only makes today's, so it goes straight in
const takeEarlierOrder = (daysAgo, queueNum, name) => {
    const day = localDay(daysAgo);
    return Number(app.db
        .prepare(`INSERT INTO orders (queue_date, queue_num, name, purpose, status, payment_status, created_at)
                  VALUES (?, ?, ?, 'Steel', 'done', 'Vale', ?)`)
        .run(day, queueNum, name, `${day}T09:00:00.000Z`).lastInsertRowid);
};

const sheet = (staff, id, cells) => staff.patch(`/admin/order-sheet/${id}`, cells);

describe("order sheet", () => {
    test("sales fill in the runner and receiver on the sheet, and each change is kept with who saved it", async () => {
        const id = await takeOrder();
        const maria = await app.actingAsSales("Maria Santos");
        const ana = await app.actingAsSales("Ana Reyes");

        const withRunner = (await sheet(maria, id, { runner: "  Boy Reyes " })).assertStatus(200).body;
        assert.equal(withRunner.runner, "Boy Reyes");
        assert.deepEqual(withRunner.edits.map((e) => [e.by.name, e.changes]), [["Maria Santos", ["runner"]]]);

        const withReceiver = (await sheet(ana, id, { receiver: "Liza Cruz" })).assertStatus(200).body;
        assert.equal(withReceiver.runner, "Boy Reyes");
        assert.equal(withReceiver.receiver, "Liza Cruz");
        assert.deepEqual(withReceiver.edits.map((e) => [e.by.name, e.changes]), [
            ["Ana Reyes", ["receiver"]],
            ["Maria Santos", ["runner"]],
        ]);
        // everyone in sales sees the same sheet
        const [listed] = (await ana.get("/admin/order-sheet")).assertStatus(200).body;
        assert.equal(listed.receiver, "Liza Cruz");
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "Boy Reyes", receiver: "Liza Cruz" });
    });

    test("the sales team is picked from its list and can be taken off; the payment status is the cashier's", async () => {
        const id = await takeOrder();
        const maria = await app.actingAsSales();

        const mega = (await sheet(maria, id, { team: "MEGA" })).assertStatus(200).body;
        assert.equal(mega.team, "MEGA");
        assert.deepEqual(mega.edits[0].changes, ["team"]);

        const noTeam = (await sheet(maria, id, { team: "" })).assertStatus(200).body;
        assert.equal(noTeam.team, undefined);

        (await sheet(maria, id, { team: "Roofings" })).assertStatus(400);
        for (const paymentStatus of ["Paid", "Cash on hand", ""]) (await sheet(maria, id, { paymentStatus })).assertStatus(400);
        app.assertDatabaseHas("orders", { queue_num: 1, payment_status: "", team: "" });
    });

    test("one cell is saved at a time, so two people on the same order don't overwrite each other", async () => {
        const id = await takeOrder();
        const maria = await app.actingAsSales("Maria Santos");
        const ana = await app.actingAsSales("Ana Reyes");

        await Promise.all([sheet(maria, id, { runner: "Boy Reyes" }), sheet(ana, id, { team: "MEGA" })]);

        app.assertDatabaseHas("orders", { queue_num: 1, runner: "Boy Reyes", team: "MEGA" });
        app.assertDatabaseCount("order_edits", 2);
    });

    test("a cell saved as it was isn't an edit", async () => {
        const id = await takeOrder();
        const maria = await app.actingAsSales();

        const same = (await sheet(maria, id, { team: "GIGA", runner: "" })).assertStatus(200).body;

        assert.equal(same.edits, undefined);
        app.assertDatabaseCount("order_edits", 0);
    });

    test("only the sheet's cells, with values it takes, on an order that's there", async () => {
        const id = await takeOrder();
        const maria = await app.actingAsSales();

        (await sheet(maria, id, {})).assertStatus(400);
        (await sheet(maria, id, { name: "Someone else" })).assertStatus(400);
        (await sheet(maria, id, { constructor: "x" })).assertStatus(400);
        (await sheet(maria, id, { runner: "x".repeat(61) })).assertStatus(400);
        (await sheet(maria, id, { receiver: 5 })).assertStatus(400);
        (await sheet(maria, id + 1, { runner: "Boy Reyes" })).assertStatus(404);
        app.assertDatabaseHas("orders", { queue_num: 1, name: "Juan Dela Cruz", runner: "" });
        app.assertDatabaseCount("order_edits", 0);
    });

    test("the sheet lists every day's orders, not just today's: newest day first, in number order within a day", async () => {
        const twoDaysAgo = takeEarlierOrder(2, 3, "Pedro Reyes");
        const yesterday = takeEarlierOrder(1, 7, "Ana Lim");
        const first = await takeOrder();
        const second = await takeOrder({ name: "Liza Cruz" });
        const maria = await app.actingAsSales();

        const listed = (await maria.get("/admin/order-sheet")).assertStatus(200).body;

        assert.deepEqual(listed.map((o) => [o.id, o.date, o.queueNum, o.isToday]), [
            [first, localDay(), 1, true],
            [second, localDay(), 2, true],
            [yesterday, localDay(1), 7, false],
            [twoDaysAgo, localDay(2), 3, false],
        ]);
        // the queue itself is still only today's
        assert.deepEqual((await maria.get("/admin/orders")).assertStatus(200).body.map((o) => o.queueNum), [1, 2]);
    });

    test("an earlier day's order is filled in by its id, not today's order with the same number", async () => {
        const yesterday = takeEarlierOrder(1, 1, "Ana Lim");
        const todays = await takeOrder();
        const maria = await app.actingAsSales();

        const saved = (await sheet(maria, yesterday, { runner: "Boy Reyes", team: "MEGA" })).assertStatus(200).body;

        assert.deepEqual([saved.id, saved.date, saved.isToday, saved.runner], [yesterday, localDay(1), false, "Boy Reyes"]);
        assert.deepEqual(saved.edits.map((e) => [e.by.name, e.changes]), [["Maria Santos", ["runner", "team"]]]);
        app.assertDatabaseHas("orders", { id: yesterday, runner: "Boy Reyes", team: "MEGA", payment_status: "Vale" });
        app.assertDatabaseHas("orders", { id: todays, runner: "", team: "GIGA" });
    });

    test("a deleted order is left off the sheet and can't be filled in", async () => {
        const kept = await takeOrder();
        const deleted = await takeOrder({ name: "Liza Cruz" });
        const admin = await app.actingAsAdmin();
        (await admin.delete("/admin/orders/2")).assertStatus(204);

        const listed = (await admin.get("/admin/order-sheet")).assertStatus(200).body;

        assert.deepEqual(listed.map((o) => o.id), [kept]);
        (await sheet(admin, deleted, { runner: "Boy Reyes" })).assertStatus(404);
        app.assertDatabaseHas("orders", { id: deleted, runner: "" });
    });

    test("a Customer Report (CR) is a concern, not an order, so it's left off the sheet and can't be filled in", async () => {
        const order = await takeOrder();
        (await app.client().post("/orders", {
            name: "Ana Reyes", purpose: "Customer Report", orders: [], concern: "The roofing is leaking.",
        })).assertStatus(201);
        const reportId = app.db.prepare("SELECT id FROM orders WHERE purpose = 'Customer Report'").get().id;
        const maria = await app.actingAsSales();

        const listed = (await maria.get("/admin/order-sheet")).assertStatus(200).body;

        assert.deepEqual(listed.map((o) => o.id), [order]);
        (await sheet(maria, reportId, { runner: "Boy Reyes" })).assertStatus(404);
        app.assertDatabaseHas("orders", { id: reportId, runner: "" });
        // it's still in today's queue
        assert.equal((await maria.get("/admin/orders")).assertStatus(200).body.length, 2);
    });

    test("admins and sales staff work on the sheet; the loading crew and customers can't", async () => {
        const id = await takeOrder();
        const admin = await app.actingAsAdmin();
        const loading = await app.actingAsLoading();

        (await admin.get("/admin/order-sheet")).assertStatus(200);
        (await loading.get("/admin/order-sheet")).assertStatus(403);
        (await app.client().get("/admin/order-sheet")).assertStatus(401);
        (await sheet(admin, id, { runner: "Boy Reyes" })).assertStatus(200);
        (await sheet(loading, id, { runner: "Someone" })).assertStatus(403);
        (await sheet(app.client(), id, { runner: "Someone" })).assertStatus(401);
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "Boy Reyes" });
    });

    test("updating the ticket from the Order tab keeps the runner and receiver from the sheet", async () => {
        const id = await takeOrder();
        const maria = await app.actingAsSales();
        await sheet(maria, id, { runner: "Boy Reyes", receiver: "Liza Cruz" });

        const updated = (await maria.put("/admin/orders/1", sale({ salesman: "Pedro Cruz" }))).assertStatus(200).body;

        assert.equal(updated.runner, "Boy Reyes");
        assert.equal(updated.receiver, "Liza Cruz");
        assert.deepEqual(updated.edits[0].changes, ["salesman"]);
    });
});
