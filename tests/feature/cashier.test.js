// the Cashier page: the cashier's one job is how each order is paid; they see every day's orders with what the
// customer bought and how it's paid, and change the payment status (Vale, COD, Terms, Paid, ...), each change kept on
// the ticket as an edit with who made it; they can't call, change or save anything else but their own account
// run: npm test            only these: npm test -- --test-name-pattern="cashier"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp, localDay } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order; pass any field to change it
const sale = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings, Steel",
    orders: [],
    invoices: [{ invoiceNo: "449765", type: "Roofings" }, { invoiceNo: "2231", type: "Steel" }],
    salesman: "Maria Santos",
    runner: "",
    paymentStatus: "Vale",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

// takes the order and gives its id, which the cashier changes it by, since queue numbers repeat every day
const takeOrder = async (overrides) => {
    const { queueNum } = (await app.client().post("/orders", sale(overrides))).assertStatus(201).body;
    return app.db.prepare("SELECT id FROM orders WHERE queue_date = ? AND queue_num = ?").get(localDay(), queueNum).id;
};

const pay = (staff, id, paymentStatus) => staff.patch(`/admin/payments/${id}`, { paymentStatus });

describe("cashier", () => {
    test("an admin makes a cashier account, and it can be switched to and from another role", async () => {
        const admin = await app.actingAsAdmin();

        const made = (await admin.post("/admin/users", {
            username: "rosa", name: "Rosa Bayad", password: "cashier-password", role: "cashier",
        })).assertStatus(201).body;
        assert.equal(made.role, "cashier");

        (await admin.patch(`/admin/users/${made.id}`, { role: "sales" })).assertStatus(200);
        const back = (await admin.patch(`/admin/users/${made.id}`, { role: "cashier" })).assertStatus(200).body;
        assert.equal(back.role, "cashier");
        (await admin.patch(`/admin/users/${made.id}`, { role: "teller" })).assertStatus(400);
        app.assertDatabaseHas("users", { username: "rosa", role: "cashier" });
    });

    test("the cashier sees every day's orders with what was bought and how it's paid, but no other sales details", async () => {
        const day = localDay(1);
        const yesterday = Number(app.db.prepare(`INSERT INTO orders (queue_date, queue_num, name, purpose, status,
                payment_status, created_at) VALUES (?, 4, 'Ana Lim', 'Tire', 'done', 'Terms', ?)`)
            .run(day, `${day}T09:00:00.000Z`).lastInsertRowid);
        const today = await takeOrder({ runner: "Boy Reyes", receiver: "Pedro" });
        const cashier = await app.actingAsCashier();

        const listed = (await cashier.get("/admin/payments")).assertStatus(200).body;

        assert.deepEqual(listed.map((o) => [o.id, o.date, o.isToday, o.paymentStatus]), [
            [today, localDay(), true, "Vale"],
            [yesterday, day, false, "Terms"],
        ]);
        const [juan] = listed;
        assert.equal(juan.queueNum, 1);
        assert.equal(juan.status, "pending");
        assert.equal(juan.salesman, "Maria Santos");
        assert.equal(juan.team, "GIGA");
        assert.deepEqual(juan.invoices, [{ invoiceNo: "449765", type: "Roofings" }, { invoiceNo: "2231", type: "Steel" }]);
        for (const hidden of ["runner", "receiver", "checkers", "salesTimeIn", "orders", "edits", "concern"]) {
            assert.equal(juan[hidden], undefined, `${hidden} isn't the cashier's`);
        }
    });

    test("the cashier changes the payment status, and the change is kept on the ticket with who made it", async () => {
        const id = await takeOrder();
        const cashier = await app.actingAsCashier();

        const saved = (await pay(cashier, id, "Paid")).assertStatus(200).body;

        assert.equal(saved.paymentStatus, "Paid");
        assert.equal(saved.paymentChange.by.name, "Rosa Bayad");
        assert.ok(saved.paymentChange.at);
        app.assertDatabaseHas("orders", { id, payment_status: "Paid", salesman: "Maria Santos", team: "GIGA" });
        app.assertDatabaseHas("order_edits", { order_id: id, user_id: cashier.account.id, changes: '["paymentStatus"]' });
        // sales see who changed it on the ticket
        const ticket = (await (await app.actingAsSales()).get("/admin/orders/1")).assertStatus(200).body;
        assert.deepEqual(ticket.edits.map((e) => [e.by.name, e.changes]), [["Rosa Bayad", ["paymentStatus"]]]);

        for (const status of ["COD", "Terms", "Vale", "Partial"]) (await pay(cashier, id, status)).assertStatus(200);
        app.assertDatabaseHas("orders", { id, payment_status: "Partial" });
        app.assertDatabaseCount("order_edits", 5, { order_id: id });
    });

    test("the last change shows, even after sales edit something else on the ticket", async () => {
        const id = await takeOrder();
        const cashier = await app.actingAsCashier();
        await pay(cashier, id, "Paid");
        const maria = await app.actingAsSales();
        (await maria.patch(`/admin/order-sheet/${id}`, { runner: "Boy Reyes" })).assertStatus(200);

        const [order] = (await cashier.get("/admin/payments")).assertStatus(200).body;

        assert.equal(order.paymentChange.by.name, "Rosa Bayad");
        (await maria.patch(`/admin/order-sheet/${id}`, { paymentStatus: "COD" })).assertStatus(200);
        const [again] = (await cashier.get("/admin/payments")).assertStatus(200).body;
        assert.deepEqual([again.paymentStatus, again.paymentChange.by.name], ["COD", "Maria Santos"]);
    });

    test("an earlier day's order is changed by its id, not today's order with the same number", async () => {
        const day = localDay(1);
        const yesterday = Number(app.db.prepare(`INSERT INTO orders (queue_date, queue_num, name, purpose, status,
                payment_status, created_at) VALUES (?, 1, 'Ana Lim', 'Steel', 'done', 'Vale', ?)`)
            .run(day, `${day}T09:00:00.000Z`).lastInsertRowid);
        const todays = await takeOrder();

        const saved = (await pay(await app.actingAsCashier(), yesterday, "Paid")).assertStatus(200).body;

        assert.deepEqual([saved.id, saved.isToday, saved.paymentStatus], [yesterday, false, "Paid"]);
        app.assertDatabaseHas("orders", { id: yesterday, payment_status: "Paid" });
        app.assertDatabaseHas("orders", { id: todays, payment_status: "Vale" });
    });

    test("the same status again isn't a change", async () => {
        const id = await takeOrder();

        (await pay(await app.actingAsCashier(), id, "Vale")).assertStatus(200);

        app.assertDatabaseCount("order_edits", 0);
    });

    test("only a status from the list, and only the payment status, on an order that's there", async () => {
        const id = await takeOrder();
        await app.client().post("/orders", { name: "Liza Cruz", purpose: "Customer Report", orders: [], concern: "Leaking." });
        const deleted = await takeOrder({ name: "Deleted Customer" });
        (await (await app.actingAsAdmin()).delete("/admin/orders/3")).assertStatus(204);
        const cashier = await app.actingAsCashier();

        for (const status of ["", "Cash", null, 3]) (await pay(cashier, id, status)).assertStatus(400);
        (await cashier.patch(`/admin/payments/${id}`, {})).assertStatus(400);
        (await cashier.patch(`/admin/payments/${id}`, { runner: "Someone" })).assertStatus(400);
        (await pay(cashier, id + 1, "Paid")).assertStatus(404);
        (await pay(cashier, deleted, "Paid")).assertStatus(404);
        (await pay(cashier, deleted + 1, "Paid")).assertStatus(404);

        const listed = (await cashier.get("/admin/payments")).assertStatus(200).body;
        assert.deepEqual(listed.map((o) => o.name), ["Juan Dela Cruz"]);
        app.assertDatabaseHas("orders", { id, payment_status: "Vale", runner: "" });
        app.assertDatabaseCount("order_edits", 0);
    });

    test("the cashier can only change payments: no queue, calling, sheet, loading, security, history or accounts", async () => {
        const id = await takeOrder();
        const cashier = await app.actingAsCashier();

        (await cashier.get("/admin/order-status")).assertStatus(200);
        (await cashier.get("/auth/me")).assertStatus(200);
        (await cashier.patch("/admin/me", { firstName: "Rosa", surname: "Bayad" })).assertStatus(200);
        const refused = [
            ["get", "/admin/orders"],
            ["get", "/admin/orders/1"],
            ["put", "/admin/orders/1", sale({ paymentStatus: "Paid" })],
            ["patch", "/admin/orders/1", { status: "done" }],
            ["post", "/admin/orders/1/call"],
            ["post", "/admin/orders/1/handover"],
            ["get", "/admin/order-sheet"],
            ["patch", `/admin/order-sheet/${id}`, { paymentStatus: "Paid" }],
            ["post", "/admin/loading/1/call"],
            ["get", "/admin/security"],
            ["post", "/admin/security/1/check", { result: "verified" }],
            ["get", "/admin/history"],
            ["get", "/admin/me/stats"],
            ["get", "/admin/users"],
            ["delete", "/admin/orders/1"],
        ];
        for (const [method, path, body] of refused) (await cashier[method](path, body)).assertStatus(403);
        app.assertDatabaseHas("orders", { id, status: "pending", payment_status: "Vale" });
    });

    test("only cashiers and admins have the Cashier page", async () => {
        const id = await takeOrder();
        const admin = await app.actingAsAdmin();

        (await admin.get("/admin/payments")).assertStatus(200);
        (await pay(admin, id, "Paid")).assertStatus(200);
        for (const staff of [await app.actingAsSales(), await app.actingAsLoading(), await app.actingAsSecurity()]) {
            (await staff.get("/admin/payments")).assertStatus(403);
            (await pay(staff, id, "COD")).assertStatus(403);
        }
        (await app.client().get("/admin/payments")).assertStatus(401);
        (await pay(app.client(), id, "COD")).assertStatus(401);
        app.assertDatabaseHas("orders", { id, payment_status: "Paid" });
    });
});
