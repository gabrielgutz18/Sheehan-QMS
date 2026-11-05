// the Order sheet on Customer order: every order from every day with all its details, shared by every sales staff member
// like a spreadsheet: every cell but the date, queue number and status, one at a time, each change kept as an edit with who
// saved it; a new row makes a ticket, and anyone can add a column of their own
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

    test("the sales team is picked from its list and can be taken off", async () => {
        const id = await takeOrder();
        const maria = await app.actingAsSales();

        const mega = (await sheet(maria, id, { team: "MEGA" })).assertStatus(200).body;
        assert.equal(mega.team, "MEGA");
        assert.deepEqual(mega.edits[0].changes, ["team"]);

        const noTeam = (await sheet(maria, id, { team: "" })).assertStatus(200).body;
        assert.equal(noTeam.team, undefined);

        (await sheet(maria, id, { team: "Roofings" })).assertStatus(400);
        app.assertDatabaseHas("orders", { queue_num: 1, team: "" });
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

    test("the regular orders come first, then all the priority orders together, then all the TBA priority ones, whatever their day", async () => {
        const maria = await app.actingAsSales();
        const take = async (name, marks) =>
            (await maria.post("/orders", sale({ name, ...marks }))).assertStatus(201);
        await take("Regular 1");
        await take("Priority 1", { priority: true });
        await take("Regular 2");
        await take("TBA 1", { purpose: "Tire", invoices: [{ invoiceNo: "2224", type: "Tire" }], tbaPriority: true });
        await take("Priority 2", { priority: true });
        await take("Regular 3");
        takeEarlierOrder(1, 7, "Yesterday");
        const earlierPriority = takeEarlierOrder(1, 8, "Yesterday's priority");
        app.db.prepare("UPDATE orders SET priority = 1 WHERE id = ?").run(earlierPriority);

        const listed = (await maria.get("/admin/order-sheet")).assertStatus(200).body;

        assert.deepEqual(listed.map((o) => o.name), [
            "Regular 1", "Regular 2", "Regular 3", "Yesterday",
            "Priority 1", "Priority 2", "Yesterday's priority",
            "TBA 1",
        ]);
        // the line and the Cashier page stay in number order: a mark doesn't move a customer ahead there
        assert.deepEqual((await maria.get("/admin/orders")).assertStatus(200).body.map((o) => o.queueNum), [1, 2, 3, 4, 5, 6]);
        assert.deepEqual(
            (await maria.get("/admin/payments")).assertStatus(200).body.filter((o) => o.isToday).map((o) => o.queueNum),
            [1, 2, 3, 4, 5, 6],
        );
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

    describe("every cell but the date, number and status", () => {
        test("the terms change like they do on the Cashier page, in any capitals, and can't be cleared", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales("Maria Santos");

            const saved = (await sheet(maria, id, { terms: "vale" })).assertStatus(200).body;
            assert.equal(saved.paymentStatus, "Vale");
            assert.deepEqual(saved.edits[0].changes, ["paymentStatus"]);

            const [listed] = (await maria.get("/admin/payments")).assertStatus(200).body;
            assert.deepEqual([listed.paymentStatus, listed.paymentChange.by.name], ["Vale", "Maria Santos"]);

            assert.match((await sheet(maria, id, { terms: "" })).assertStatus(400).body.message, /not cleared/);
            assert.match((await sheet(maria, id, { terms: "Maybe" })).assertStatus(400).body.message, /isn't one of the terms/);
            app.assertDatabaseHas("orders", { id, payment_status: "Vale" });
        });

        test("the customer, salesman and times change, and the name can't be emptied", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales();

            const saved = (await sheet(maria, id, { customer: "  Pedro Cruz ", salesman: "Ana", salesTimeIn: "0734H", salesTimeOut: "9:05" })).assertStatus(200).body;

            assert.deepEqual([saved.name, saved.salesman, saved.salesTimeIn, saved.salesTimeOut], ["Pedro Cruz", "Ana", "07:34", "09:05"]);
            assert.deepEqual(saved.edits[0].changes, ["name", "salesman", "salesTimeIn", "salesTimeOut"]);
            (await sheet(maria, id, { customer: " " })).assertStatus(400);
            (await sheet(maria, id, { salesTimeIn: "2560H" })).assertStatus(400);
            assert.equal((await sheet(maria, id, { salesTimeOut: "" })).assertStatus(200).body.salesTimeOut, undefined);
        });

        test("invoices go under their column with its type, and one already there keeps its own", async () => {
            const id = await takeOrder({
                purpose: "Hardwares, Steel",
                invoices: [{ invoiceNo: "1", type: "Hardwares" }, { invoiceNo: "2", type: "Steel" }],
            });
            const maria = await app.actingAsSales();
            const invoices = (order) => order.invoices.map(({ invoiceNo, type }) => [invoiceNo, type]);

            const added = (await sheet(maria, id, { construction: "1\n2, 3" })).assertStatus(200).body;
            assert.deepEqual(invoices(added), [["1", "Hardwares"], ["2", "Steel"], ["3", "Steel"]]);
            assert.deepEqual(added.edits[0].changes, ["invoices"]);

            const removed = (await sheet(maria, id, { construction: "2" })).assertStatus(200).body;
            assert.deepEqual(invoices(removed), [["2", "Steel"]]);
        });

        test("an invoice can't go to a department the ticket doesn't have, or be in twice, and the last one can't go", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales();

            assert.match((await sheet(maria, id, { tba: "9" })).assertStatus(400).body.message, /invoice 9 is under TBA/);
            assert.match((await sheet(maria, id, { roofing: "5, 5" })).assertStatus(400).body.message, /in twice/);
            assert.match((await sheet(maria, id, { roofing: "" })).assertStatus(400).body.message, /at least one invoice/);
            app.assertDatabaseCount("order_edits", 0);
        });

        test("an invoice under Others takes the ticket's first type", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales();

            const saved = (await sheet(maria, id, { others: "7" })).assertStatus(200).body;

            assert.deepEqual(saved.invoices.map(({ invoiceNo, type }) => [invoiceNo, type]), [["2223", "Roofings"], ["7", "Roofings"]]);
        });

        test("the type of order changes, in the list's order, but can't leave an invoice behind", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales();

            assert.equal((await sheet(maria, id, { purpose: "steel, roofings" })).assertStatus(200).body.purpose, "Roofings, Steel");
            assert.match((await sheet(maria, id, { purpose: "Steel" })).assertStatus(400).body.message, /invoice 2223 is for Roofings/);
            (await sheet(maria, id, { purpose: "" })).assertStatus(400);
            (await sheet(maria, id, { purpose: "Customer Report" })).assertStatus(400);
            app.assertDatabaseHas("orders", { id, purpose: "Roofings, Steel" });
        });

        test("typing over what the system works out shows in its place, and clearing it goes back, with the real path untouched", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales();

            const typed = (await sheet(maria, id, { assistedBy: "Someone", loadingTimeIn: "8:15", doubleCheckedBy: "Ana" })).assertStatus(200).body;
            assert.deepEqual(typed.sheetCells, { assistedBy: "Someone", loadingTimeIn: "0815H", doubleCheckedBy: "Ana" });
            assert.deepEqual(typed.edits[0].changes, ["assistedBy", "loadingTimeIn", "doubleCheckedBy"]);
            assert.equal(typed.servedBy, undefined);
            assert.equal(typed.handedOver, undefined);

            (await sheet(maria, id, { loadingTimeIn: "2560H" })).assertStatus(400);
            const cleared = (await sheet(maria, id, { assistedBy: "", loadingTimeIn: "", doubleCheckedBy: "" })).assertStatus(200).body;
            assert.equal(cleared.sheetCells, undefined);
        });

        test("the date, number and status can't be changed", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales();

            for (const key of ["date", "que", "status"]) (await sheet(maria, id, { [key]: "x" })).assertStatus(400);
            app.assertDatabaseHas("orders", { id, status: "pending", queue_num: 1 });
        });
    });

    describe("a new row", () => {
        const row = (overrides = {}) => ({ customer: "New Customer", purpose: "Roofings", roofing: "450000", ...overrides });

        test("becomes a ticket in line, with a time in, under the person who typed it", async () => {
            const maria = await app.actingAsSales("Maria Santos");

            const created = (await maria.post("/admin/order-sheet", row({ terms: "vale", team: "giga", runner: "Boy" }))).assertStatus(201).body;

            assert.deepEqual([created.name, created.purpose, created.status, created.isToday], ["New Customer", "Roofings", "pending", true]);
            assert.deepEqual([created.paymentStatus, created.team, created.runner], ["Vale", "GIGA", "Boy"]);
            assert.match(created.salesTimeIn, /^\d{2}:\d{2}$/);
            assert.deepEqual(created.edits.map((e) => [e.by.name, e.changes]), [["Maria Santos", ["paymentStatus"]]]);
            assert.equal((await maria.get("/admin/orders")).assertStatus(200).body.length, 1);
        });

        test("keeps the cells of its own columns, and what's typed over what the system works out", async () => {
            const maria = await app.actingAsSales();
            const { key } = (await maria.post("/admin/order-sheet/columns", { name: "Truck" })).assertStatus(201).body;

            const created = (await maria.post("/admin/order-sheet", row({ [key]: "Isuzu", assistedBy: "Ana" }))).assertStatus(201).body;

            assert.deepEqual(created.sheetCells, { [key]: "Isuzu", assistedBy: "Ana" });
        });

        test("a row that's missing something makes no ticket, and says why", async () => {
            const maria = await app.actingAsSales();

            assert.match((await maria.post("/admin/order-sheet", row({ customer: "" }))).assertStatus(400).body.message, /^No ticket made: the customer's name/);
            assert.match((await maria.post("/admin/order-sheet", row({ purpose: "" }))).assertStatus(400).body.message, /type of order is empty/);
            assert.match((await maria.post("/admin/order-sheet", row({ roofing: "" }))).assertStatus(400).body.message, /no invoice number/);
            app.assertDatabaseCount("orders", 0);
        });

        test("only for those who work on the sheet", async () => {
            (await (await app.actingAsLoading()).post("/admin/order-sheet", row())).assertStatus(403);
            (await app.client().post("/admin/order-sheet", row())).assertStatus(401);
            app.assertDatabaseCount("orders", 0);
        });
    });

    describe("a column of their own", () => {
        test("is added, filled in on each order, and shows for everyone", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales("Maria Santos");
            const ana = await app.actingAsSales("Ana Reyes");

            const added = (await maria.post("/admin/order-sheet/columns", { name: " Plate no: " })).assertStatus(201).body;
            assert.equal(added.key, "c:PLATE NO");

            assert.deepEqual((await ana.get("/admin/order-sheet/columns")).assertStatus(200).body.map((c) => c.id), [added.id]);
            const saved = (await sheet(ana, id, { [added.key]: "ABC 123" })).assertStatus(200).body;
            assert.equal(saved.sheetCells[added.key], "ABC 123");
            assert.deepEqual(saved.edits[0].changes, [added.name]);
            const [listed] = (await maria.get("/admin/order-sheet")).assertStatus(200).body;
            assert.equal(listed.sheetCells[added.key], "ABC 123");
        });

        test("can't be named like one of the sheet's own, or twice, or have no name", async () => {
            const maria = await app.actingAsSales();

            for (const name of ["", "  ", "x".repeat(41), "Runner", "date", "TIME IN", "APP ID", 5]) {
                (await maria.post("/admin/order-sheet/columns", { name })).assertStatus(400);
            }
            (await maria.post("/admin/order-sheet/columns", { name: "Truck" })).assertStatus(201);
            (await maria.post("/admin/order-sheet/columns", { name: "TRUCK:" })).assertStatus(409);
        });

        test("taken off, its cells can't be filled in; added again, they're back", async () => {
            const id = await takeOrder();
            const maria = await app.actingAsSales();
            const { id: columnId, key } = (await maria.post("/admin/order-sheet/columns", { name: "Truck" })).assertStatus(201).body;
            (await sheet(maria, id, { [key]: "Isuzu" })).assertStatus(200);

            (await maria.delete(`/admin/order-sheet/columns/${columnId}`)).assertStatus(204);
            (await maria.delete(`/admin/order-sheet/columns/${columnId}`)).assertStatus(404);
            assert.deepEqual((await maria.get("/admin/order-sheet/columns")).assertStatus(200).body, []);
            (await sheet(maria, id, { [key]: "Fuso" })).assertStatus(400);

            (await maria.post("/admin/order-sheet/columns", { name: "truck" })).assertStatus(201);
            const [listed] = (await maria.get("/admin/order-sheet")).assertStatus(200).body;
            assert.equal(listed.sheetCells[key], "Isuzu");
        });

        test("only for those who work on the sheet", async () => {
            const loading = await app.actingAsLoading();
            (await loading.get("/admin/order-sheet/columns")).assertStatus(403);
            (await loading.post("/admin/order-sheet/columns", { name: "Truck" })).assertStatus(403);
            (await loading.delete("/admin/order-sheet/columns/1")).assertStatus(403);
            (await app.client().get("/admin/order-sheet/columns")).assertStatus(401);
        });
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
