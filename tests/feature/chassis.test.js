// the Chassis page: Chassis is its own department (no longer part of TBA), working like the loading crew, TBA and
// Hardware for its own area (src/data/loadingAreas.js). A sales counter hands the customer over just the same; a
// customer who bought a Chassis is called to Chassis from the Chassis page, and one who bought a Tire too goes to TBA
// and Chassis in turn, one at a time
// run: npm test            only these: npm test -- --test-name-pattern="Chassis"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order for a Tire and a Chassis; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Tire, Chassis",
    orders: [],
    invoices: [{ invoiceNo: "601", type: "Tire" }, { invoiceNo: "602", type: "Chassis" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});
const only = (type) => ({ purpose: type, invoices: [{ invoiceNo: "2223", type }] });

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// a sales counter, someone on the loading crew, someone at TBA and someone at Chassis
const staff = async () => ({
    maria: await app.actingAsSales(),
    pedro: await app.actingAsLoading("Pedro Garcia"),
    tony: await app.actingAsTba("Tony Gulong"),
    carlos: await app.actingAsChassis("Carlos Tsasis"),
});

const handOver = async (sales, queueNum) => {
    return (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200).body;
};
const areasOf = (o) => o.areas.map(({ name, loaded }) => [name, loaded?.by.name]);

describe("Chassis", () => {
    test("a Chassis is loaded at Chassis by the Chassis department, not TBA or the loading crew", async () => {
        await takeOrder(only("Chassis"));
        const { maria, pedro, tony, carlos } = await staff();
        await handOver(maria, 1);

        (await pedro.post("/admin/loading/1/call")).assertStatus(409);
        (await tony.post("/admin/tba/1/call")).assertStatus(409);
        assert.equal((await carlos.post("/admin/chassis/1/call")).assertStatus(200).body.loadingArea, "Chassis");
        const started = (await carlos.post("/admin/chassis/1/start", { area: "Chassis" })).assertStatus(200).body;
        assert.ok(started.loadingStartedAt);
        const done = (await carlos.post("/admin/chassis/1/done")).assertStatus(200).body;

        assert.equal(done.status, "done");
        assert.equal(done.loaded.by.name, "Carlos Tsasis");
        assert.deepEqual(areasOf(done), [["Chassis", "Carlos Tsasis"]]);
        assert.equal(done.security, "waiting");
    });

    test("an order for a Tire and a Chassis is loaded at TBA, then Chassis, then it's done", async () => {
        await takeOrder();
        const { maria, tony, carlos } = await staff();
        await handOver(maria, 1);

        (await tony.post("/admin/tba/1/start", { area: "TBA" })).assertStatus(200);
        // a customer is in one place at a time
        assert.equal((await carlos.post("/admin/chassis/1/call")).assertStatus(409).body.message,
            "Please wait until Tony Gulong finishes.");
        (await carlos.post("/admin/chassis/1/start", { area: "Chassis" })).assertStatus(409);
        const tbaDone = (await tony.post("/admin/tba/1/done")).assertStatus(200).body;
        assert.equal(tbaDone.status, "pending");

        // nothing left for TBA; Chassis loads it straight away, no call needed
        (await tony.post("/admin/tba/1/call")).assertStatus(409);
        (await carlos.post("/admin/chassis/1/start", { area: "Chassis" })).assertStatus(200);
        const finished = (await carlos.post("/admin/chassis/1/done")).assertStatus(200).body;
        assert.equal(finished.status, "done");
        assert.deepEqual(areasOf(finished), [["TBA", "Tony Gulong"], ["Chassis", "Carlos Tsasis"]]);
    });

    test("Chassis accounts see only the handed-over orders with a Chassis; their routes are their own", async () => {
        await takeOrder({ name: "Ana Reyes", ...only("Tire") });
        await takeOrder({ name: "Liza Mendoza", ...only("Chassis") });
        await takeOrder({ name: "Carmela Cruz" });
        // still at the sales counter
        await takeOrder({ name: "Carlo Bautista", ...only("Chassis") });
        const { maria, pedro, tony, carlos } = await staff();
        for (const queueNum of [1, 2, 3]) await handOver(maria, queueNum);
        const names = async (account) => (await account.get("/admin/orders")).assertStatus(200).body.map((o) => o.name);

        assert.deepEqual(await names(carlos), ["Liza Mendoza", "Carmela Cruz"]);
        assert.deepEqual(await names(tony), ["Ana Reyes", "Carmela Cruz"]);
        (await carlos.get("/admin/order-status")).assertStatus(200);
        (await carlos.post("/admin/tba/1/call")).assertStatus(403);
        (await carlos.post("/admin/loading/1/call")).assertStatus(403);
        (await tony.post("/admin/chassis/2/call")).assertStatus(403);
        (await pedro.post("/admin/chassis/2/call")).assertStatus(403);
        (await maria.post("/admin/chassis/2/call")).assertStatus(403);
        (await carlos.get("/admin/security")).assertStatus(403);
        // an admin can work it too
        (await (await app.actingAsAdmin()).post("/admin/chassis/2/call")).assertStatus(200);
    });

    test("an admin can make an account Chassis staff, or move one there", async () => {
        const admin = await app.actingAsAdmin();
        const created = (await admin.post("/admin/users", {
            username: "carlos", name: "Carlos Tsasis", password: "password1", role: "chassis",
        })).assertStatus(201).body;
        assert.equal(created.role, "chassis");

        const tony = await app.actingAsTba("Tony Gulong");
        const moved = (await admin.patch(`/admin/users/${tony.account.id}`, { role: "chassis" })).assertStatus(200).body;
        assert.equal(moved.role, "chassis");
        app.assertDatabaseHas("users", { username: "carlos", role: "chassis" });
    });
});
