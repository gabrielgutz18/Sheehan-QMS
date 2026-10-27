// the Security page: the guards at the gate, the last stage, check the products and quantities a customer leaves with;
// they see where every customer is today and what they bought, with no payment or other sales details; every
// finished order waits at the security check until a guard verifies it or reports something missing, over the
// quantity or stolen, and then it's done; the guards can't call, change or save anything else but their own account
// run: npm test            only these: npm test -- --test-name-pattern="security"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings, Steel",
    orders: [],
    invoices: [{ invoiceNo: "449765", type: "Roofings" }, { invoiceNo: "2231", type: "Steel" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// the sales counter serves the customer and hands them over; the loading crew calls them to each of the order's
// areas in turn and finishes loading there, until it's done and at the security check
const loadAndFinish = async (sales, loading, queueNum) => {
    (await sales.post(`/admin/orders/${queueNum}/call`)).assertStatus(200);
    (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200);
    for (let status = ""; status !== "done";) {
        (await loading.post(`/admin/loading/${queueNum}/call`, { remarks: "" })).assertStatus(200);
        ({ status } = (await loading.post(`/admin/loading/${queueNum}/done`)).assertStatus(200).body);
    }
};

describe("security", () => {
    test("an admin makes a security account, and it can be switched to and from another role", async () => {
        const admin = await app.actingAsAdmin();

        const made = (await admin.post("/admin/users", {
            username: "jose", name: "Jose Bantay", password: "security-password", role: "security",
        })).assertStatus(201).body;
        assert.equal(made.role, "security");

        const sales = (await admin.patch(`/admin/users/${made.id}`, { role: "sales" })).assertStatus(200).body;
        assert.equal(sales.role, "sales");
        const back = (await admin.patch(`/admin/users/${made.id}`, { role: "security" })).assertStatus(200).body;
        assert.equal(back.role, "security");
        (await admin.patch(`/admin/users/${made.id}`, { role: "guard" })).assertStatus(400);
        app.assertDatabaseHas("users", { username: "jose", role: "security" });
    });

    test("a guard sees where each customer is and what they bought, but no payment or other sales details", async () => {
        await takeOrder();
        await takeOrder({ name: "Ana Lim", purpose: "Tire", invoices: [{ invoiceNo: "TB-77", type: "Tire" }] });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading("Pedro Garcia");
        await loadAndFinish(maria, pedro, 1);
        // a ticket taken before invoices lists its items instead
        app.db.prepare("INSERT INTO order_items (order_id, position, item, qty, color) VALUES (2, 0, 'Tire 185/65', 4, NULL)").run();
        // the cashier's, which the guard still doesn't see
        app.db.prepare("UPDATE orders SET payment_status = 'Vale' WHERE id = 1").run();
        const guard = await app.actingAsSecurity();

        const [juan, ana] = (await guard.get("/admin/security")).assertStatus(200).body;

        assert.equal(juan.queueNum, 1);
        assert.equal(juan.status, "done");
        assert.equal(juan.handedOver, true);
        assert.deepEqual(juan.invoices, [{ invoiceNo: "449765", type: "Roofings" }, { invoiceNo: "2231", type: "Steel" }]);
        assert.equal(juan.loaded.by.name, "Pedro Garcia");
        assert.ok(juan.loaded.at);
        assert.ok(juan.servedAt);
        assert.equal(ana.status, "pending");
        assert.deepEqual(ana.orders, [{ item: "Tire 185/65", qty: 4 }]);
        for (const hidden of ["paymentStatus", "salesman", "runner", "receiver", "checkers", "salesTimeIn", "edits"]) {
            assert.equal(juan[hidden], undefined, `${hidden} is a sales detail`);
        }
    });

    test("Customer Reports and deleted tickets are left off", async () => {
        await takeOrder();
        await app.client().post("/orders", {
            name: "Liza Cruz", purpose: "Customer Report", orders: [], concern: "The roofing is leaking.",
        });
        await takeOrder({ name: "Deleted Customer" });
        (await (await app.actingAsAdmin()).delete("/admin/orders/3")).assertStatus(204);

        const listed = (await (await app.actingAsSecurity()).get("/admin/security")).assertStatus(200).body;

        assert.deepEqual(listed.map((o) => o.name), ["Juan Dela Cruz"]);
    });

    test("a guard can only look and check: no queue, calling, changing, sheet, history or accounts", async () => {
        await takeOrder();
        const guard = await app.actingAsSecurity();

        (await guard.get("/admin/order-status")).assertStatus(200);
        (await guard.get("/auth/me")).assertStatus(200);
        (await guard.patch("/admin/me", { firstName: "Jose", surname: "Bantay" })).assertStatus(200);
        const refused = [
            ["get", "/admin/orders"],
            ["get", "/admin/orders/1"],
            ["put", "/admin/orders/1", order({ salesman: "Someone" })],
            ["patch", "/admin/orders/1", { status: "done" }],
            ["post", "/admin/orders/1/call"],
            ["post", "/admin/orders/1/handover"],
            ["post", "/admin/loading/1/call"],
            ["get", "/admin/order-sheet"],
            ["patch", "/admin/order-sheet/1", { runner: "Someone" }],
            ["get", "/admin/history"],
            ["get", "/admin/me/stats"],
            ["get", "/admin/users"],
            ["delete", "/admin/orders/1"],
        ];
        for (const [method, path, body] of refused) (await guard[method](path, body)).assertStatus(403);
        app.assertDatabaseHas("orders", { queue_num: 1, status: "pending", salesman: "Maria Santos", runner: "" });
    });

    test("only guards and admins have the Security page", async () => {
        await takeOrder();

        (await (await app.actingAsAdmin()).get("/admin/security")).assertStatus(200);
        (await (await app.actingAsSales()).get("/admin/security")).assertStatus(403);
        (await (await app.actingAsLoading()).get("/admin/security")).assertStatus(403);
        (await app.client().get("/admin/security")).assertStatus(401);
    });
});

// the security check at the gate: the order's last stage before Done
describe("security check", () => {
    const check = (staff, queueNum, body) => staff.post(`/admin/security/${queueNum}/check`, body);

    test("every finished order waits at the security check: after loading, and after a sales counter", async () => {
        await takeOrder();
        await takeOrder({ name: "Ana Lim", purpose: "Tire", invoices: [{ invoiceNo: "TB-77", type: "Tire" }] });
        await app.client().post("/orders", {
            name: "Liza Cruz", purpose: "Customer Report", orders: [], concern: "The roofing is leaking.",
        });
        const maria = await app.actingAsSales();
        await loadAndFinish(maria, await app.actingAsLoading(), 1);
        (await maria.post("/admin/orders/2/call")).assertStatus(200);
        (await maria.patch("/admin/orders/2", { status: "done" })).assertStatus(200);
        (await maria.post("/admin/orders/3/call")).assertStatus(200);
        (await maria.patch("/admin/orders/3", { status: "done" })).assertStatus(200);

        const board = (await maria.get("/admin/order-status")).assertStatus(200).body;

        assert.deepEqual(board.map((o) => [o.name, o.status, o.security]), [
            ["Juan Dela Cruz", "done", "waiting"],
            ["Ana Lim", "done", "waiting"],
            // a concern, with nothing to take out
            ["Liza Cruz", "done", undefined],
        ]);
        // the counters' points are theirs as before
        app.assertDatabaseCount("serves", 3);
    });

    test("the guard verifies what the customer leaves with, and the order is done", async () => {
        await takeOrder();
        await loadAndFinish(await app.actingAsSales(), await app.actingAsLoading(), 1);
        const guard = await app.actingAsSecurity();

        const verified = (await check(guard, 1, { result: "verified" })).assertStatus(200).body;

        assert.equal(verified.security, "verified");
        assert.equal(verified.securityCheck.result, "verified");
        assert.equal(verified.securityCheck.by.name, "Jose Bantay");
        assert.ok(verified.securityCheck.at);
        assert.equal(verified.securityCheck.note, undefined);
        app.assertDatabaseHas("security_checks", { order_id: 1, user_id: guard.account.id, result: "verified" });
        app.assertDatabaseHas("orders", { queue_num: 1, security_pending: 0 });
        // once only
        const again = (await check(guard, 1, { result: "verified" })).assertStatus(409).body;
        assert.equal(again.message, "Jose Bantay has already checked this order.");
    });

    test("a report of something missing, over the quantity or stolen says what, and the order is done", async () => {
        for (const name of ["Juan Dela Cruz", "Ana Lim", "Rico Reyes"]) await takeOrder({ name });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        for (const queueNum of [1, 2, 3]) await loadAndFinish(maria, pedro, queueNum);
        const guard = await app.actingAsSecurity();

        (await check(guard, 1, { result: "missing" })).assertStatus(400);
        (await check(guard, 1, { result: "missing", note: "   " })).assertStatus(400);
        (await check(guard, 1, { result: "lost", note: "Gone" })).assertStatus(400);
        (await check(guard, 1, { result: "missing", note: "x".repeat(301) })).assertStatus(400);
        const missing = (await check(guard, 1, { result: "missing", note: "  One long span sheet short  " })).assertStatus(200).body;
        (await check(guard, 2, { result: "over", note: "2 more angle bars than invoice 2231" })).assertStatus(200);
        (await check(guard, 3, { result: "stolen", note: "A gutter hidden under the tarp" })).assertStatus(200);

        assert.equal(missing.security, "reported");
        assert.deepEqual({ ...missing.securityCheck, at: undefined }, {
            result: "missing", note: "One long span sheet short", by: { name: "Jose Bantay" }, at: undefined,
        });
        app.assertDatabaseCount("security_checks", 3);
        // admins see the report on the order
        const [juan] = (await (await app.actingAsAdmin()).get("/admin/orders")).assertStatus(200).body;
        assert.equal(juan.securityCheck.note, "One long span sheet short");
        assert.equal(juan.security, "reported");
    });

    test("an order that isn't finished yet can't be checked", async () => {
        await takeOrder();
        const guard = await app.actingAsSecurity();

        const early = (await check(guard, 1, { result: "verified" })).assertStatus(409).body;
        assert.equal(early.message, "This order isn't at the security check yet.");
        (await check(guard, 9, { result: "verified" })).assertStatus(404);
        app.assertDatabaseCount("security_checks", 0);
    });

    test("only guards and admins check orders", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        await loadAndFinish(maria, pedro, 1);

        (await check(maria, 1, { result: "verified" })).assertStatus(403);
        (await check(pedro, 1, { result: "verified" })).assertStatus(403);
        (await check(app.client(), 1, { result: "verified" })).assertStatus(401);
        (await check(await app.actingAsAdmin(), 1, { result: "verified" })).assertStatus(200);
    });

    test("reopening a checked order means a new check, and the report is kept", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();
        await loadAndFinish(maria, await app.actingAsLoading(), 1);
        const guard = await app.actingAsSecurity();
        (await check(guard, 1, { result: "missing", note: "One sheet short" })).assertStatus(200);

        const reopened = (await maria.patch("/admin/orders/1", { status: "returning" })).assertStatus(200).body;
        assert.equal(reopened.security, undefined);
        assert.equal(reopened.securityCheck, undefined);
        const done = (await maria.patch("/admin/orders/1", { status: "done" })).assertStatus(200).body;

        assert.equal(done.security, "waiting");
        app.assertDatabaseHas("security_checks", { order_id: 1, result: "missing", note: "One sheet short" });
        (await check(guard, 1, { result: "verified" })).assertStatus(200);
        app.assertDatabaseCount("security_checks", 2);
    });
});
