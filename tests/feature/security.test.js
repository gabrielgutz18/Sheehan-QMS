// the Security page: the guards at the gate, the last stage, check the products and quantities a customer leaves with;
// they see where every customer is today and what they bought, with no payment or other sales details, and can't
// call, change or save anything but their own account
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
    paymentStatus: "Vale",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// the sales counter serves the customer and hands them over; the loading crew calls them and finishes loading
const loadAndFinish = async (sales, loading, queueNum) => {
    (await sales.post(`/admin/orders/${queueNum}/call`)).assertStatus(200);
    (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200);
    (await loading.post(`/admin/loading/${queueNum}/call`, { remarks: "" })).assertStatus(200);
    (await loading.post(`/admin/loading/${queueNum}/done`)).assertStatus(200);
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

    test("a guard can only look: no queue, calling, changing, sheet, history or accounts", async () => {
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
