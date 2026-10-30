// the Hardware page: the Hardware department works like the loading crew, for its own area (src/data/loadingAreas.js).
// A sales counter hands the customer over just the same; a customer who bought Hardwares is called to Hardware from
// the Hardware page, and one who bought roofing too goes to the loading crew and Hardware in turn, one at a time
// run: npm test            only these: npm test -- --test-name-pattern="hardware"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order for Roofings and Hardwares; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings, Hardwares",
    orders: [],
    invoices: [{ invoiceNo: "2223", type: "Roofings" }, { invoiceNo: "2224", type: "Hardwares" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});
const only = (type) => ({ purpose: type, invoices: [{ invoiceNo: "2223", type }] });

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// a sales counter, someone on the loading crew and someone at Hardware
const staff = async () => ({
    maria: await app.actingAsSales(),
    pedro: await app.actingAsLoading("Pedro Garcia"),
    ben: await app.actingAsHardware("Ben Martillo"),
});

const handOver = async (sales, queueNum) => {
    return (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200).body;
};
const areasOf = (o) => o.areas.map(({ name, loaded }) => [name, loaded?.by.name]);

describe("hardware", () => {
    test("Hardwares are loaded at Hardware, by the Hardware department, and Done there finishes the order", async () => {
        await takeOrder(only("Hardwares"));
        const { maria, ben } = await staff();
        await handOver(maria, 1);

        const called = (await ben.post("/admin/hardware/1/call", { remarks: "Please proceed to Hardware" })).assertStatus(200).body;
        assert.equal(called.status, "serving");
        assert.equal(called.atLoading, true);
        assert.equal(called.loadingArea, "Hardware");
        assert.equal(called.servedBy.name, "Ben Martillo");
        assert.equal((await app.client().get("/queue")).assertStatus(200).body.serving[0].remarks, "Please proceed to Hardware");

        (await ben.post("/admin/hardware/1/start")).assertStatus(200);
        const done = (await ben.post("/admin/hardware/1/done")).assertStatus(200).body;

        assert.equal(done.status, "done");
        assert.equal(done.servedBy.name, "Maria Santos");
        assert.equal(done.loaded.by.name, "Ben Martillo");
        assert.equal(done.security, "waiting");
        assert.deepEqual(areasOf(done), [["Hardware", "Ben Martillo"]]);
        app.assertDatabaseCount("serves", 1);
        app.assertDatabaseHas("serves", { user_id: maria.account.id });
    });

    test("the loading crew can't call a customer who only bought Hardwares, nor Hardware one who bought none", async () => {
        await takeOrder(only("Hardwares"));
        await takeOrder({ name: "Ana Reyes", ...only("Roofings") });
        await takeOrder({ name: "Liza Mendoza" });
        const { maria, pedro, ben } = await staff();
        for (const queueNum of [1, 2, 3]) await handOver(maria, queueNum);

        assert.equal((await pedro.post("/admin/loading/1/call")).assertStatus(409).body.message,
            "There's nothing left for Loading on this order.");
        assert.equal((await ben.post("/admin/hardware/2/call")).assertStatus(409).body.message,
            "There's nothing left for Hardware on this order.");
        // nor call them to the other department's area
        (await pedro.post("/admin/loading/3/call", { area: "Hardware" })).assertStatus(400);
        (await ben.post("/admin/hardware/3/call", { area: "Roofings" })).assertStatus(400);
    });

    test("an order for Roofings and Hardwares is loaded at Roofings, then Hardware, then it's done", async () => {
        await takeOrder();
        const { maria, pedro, ben } = await staff();
        await handOver(maria, 1);

        assert.equal((await pedro.post("/admin/loading/1/call")).assertStatus(200).body.loadingArea, "Roofings");
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        const roofingsDone = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;

        // back in line, for Hardware now
        assert.equal(roofingsDone.status, "pending");
        assert.equal(roofingsDone.loaded, undefined);
        assert.deepEqual(areasOf(roofingsDone), [["Roofings", "Pedro Garcia"], ["Hardware", undefined]]);
        (await pedro.post("/admin/loading/1/call")).assertStatus(409);

        assert.equal((await ben.post("/admin/hardware/1/call")).assertStatus(200).body.loadingArea, "Hardware");
        (await ben.post("/admin/hardware/1/start")).assertStatus(200);
        const finished = (await ben.post("/admin/hardware/1/done")).assertStatus(200).body;

        assert.equal(finished.status, "done");
        assert.equal(finished.loaded.by.name, "Ben Martillo");
        assert.deepEqual(areasOf(finished), [["Roofings", "Pedro Garcia"], ["Hardware", "Ben Martillo"]]);
        app.assertDatabaseCount("order_loads", 2, { order_id: 1 });
    });

    test("Hardware can go first: the customer then waits for the loading crew", async () => {
        await takeOrder();
        const { maria, pedro, ben } = await staff();
        await handOver(maria, 1);

        (await ben.post("/admin/hardware/1/call")).assertStatus(200);
        (await ben.post("/admin/hardware/1/start")).assertStatus(200);
        const hardwareDone = (await ben.post("/admin/hardware/1/done")).assertStatus(200).body;
        assert.equal(hardwareDone.status, "pending");
        assert.deepEqual(areasOf(hardwareDone), [["Roofings", undefined], ["Hardware", "Ben Martillo"]]);

        (await pedro.post("/admin/loading/1/call")).assertStatus(200);
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        const finished = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;
        assert.equal(finished.status, "done");
        assert.equal(finished.loaded.by.name, "Pedro Garcia");
    });

    test("a customer is in one place at a time: while one department has them, the other can't call or finish them", async () => {
        await takeOrder();
        const { maria, pedro, ben } = await staff();
        await handOver(maria, 1);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);

        assert.equal((await ben.post("/admin/hardware/1/call")).assertStatus(409).body.message,
            "Please wait until Pedro Garcia finishes.");
        assert.equal((await ben.post("/admin/hardware/1/done")).assertStatus(409).body.message,
            "Hardware isn't serving this customer.");
        (await ben.post("/admin/hardware/1/back")).assertStatus(409);

        // once loading sends them back, Hardware may call them
        (await pedro.post("/admin/loading/1/back")).assertStatus(200);
        (await ben.post("/admin/hardware/1/call")).assertStatus(200);
        (await pedro.post("/admin/loading/1/call")).assertStatus(409);
    });

    test("each department's accounts see only the handed-over orders it has a part in; their routes are their own", async () => {
        await takeOrder({ name: "Ana Reyes", ...only("Roofings") });
        await takeOrder({ name: "Grace Torres", ...only("Hardwares") });
        await takeOrder({ name: "Carmela Cruz" });
        // still at the sales counter
        await takeOrder({ name: "Carlo Bautista", ...only("Hardwares") });
        const { maria, pedro, ben } = await staff();
        for (const queueNum of [1, 2, 3]) await handOver(maria, queueNum);
        const names = async (account) => (await account.get("/admin/orders")).assertStatus(200).body.map((o) => o.name);

        assert.deepEqual(await names(pedro), ["Ana Reyes", "Carmela Cruz"]);
        assert.deepEqual(await names(ben), ["Grace Torres", "Carmela Cruz"]);
        (await ben.get("/admin/order-status")).assertStatus(200);
        // the loading crew's page isn't Hardware's, and the other way round; nor are sales' routes
        (await ben.post("/admin/loading/1/call")).assertStatus(403);
        (await pedro.post("/admin/hardware/2/call")).assertStatus(403);
        (await maria.post("/admin/hardware/2/call")).assertStatus(403);
        (await ben.post("/admin/orders/4/call")).assertStatus(403);
        (await ben.get("/admin/security")).assertStatus(403);
        // an admin can work either
        (await (await app.actingAsAdmin()).post("/admin/hardware/2/call")).assertStatus(200);
    });

    test("an admin can make an account Hardware staff, or move one there", async () => {
        const admin = await app.actingAsAdmin();
        const created = (await admin.post("/admin/users", {
            username: "ben", name: "Ben Martillo", password: "password1", role: "hardware",
        })).assertStatus(201).body;
        assert.equal(created.role, "hardware");

        const pedro = await app.actingAsLoading("Pedro Garcia");
        const moved = (await admin.patch(`/admin/users/${pedro.account.id}`, { role: "hardware" })).assertStatus(200).body;
        assert.equal(moved.role, "hardware");
    });
});
