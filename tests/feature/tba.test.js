// the TBA page: TBA (Tire, Battery) is its own department, working like the loading crew and Hardware for its
// own area (src/data/loadingAreas.js). A sales counter hands the customer over just the same; a customer who bought a
// Tire or Battery is called to TBA from the TBA page, and one who bought roofing too goes to the loading crew
// and TBA in turn, one at a time
// run: npm test            only these: npm test -- --test-name-pattern="TBA"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order for Roofings and a Tire; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings, Tire",
    orders: [],
    invoices: [{ invoiceNo: "2223", type: "Roofings" }, { invoiceNo: "601", type: "Tire" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});
const only = (type) => ({ purpose: type, invoices: [{ invoiceNo: "2223", type }] });

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// a sales counter, someone on the loading crew and someone at TBA
const staff = async () => ({
    maria: await app.actingAsSales(),
    pedro: await app.actingAsLoading("Pedro Garcia"),
    tony: await app.actingAsTba("Tony Gulong"),
});

const handOver = async (sales, queueNum) => {
    return (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200).body;
};
const areasOf = (o) => o.areas.map(({ name, loaded }) => [name, loaded?.by.name]);

describe("TBA", () => {
    test("Tire and Battery are both loaded at TBA, in one go, by the TBA department", async () => {
        await takeOrder({
            purpose: "Tire, Battery", invoices: [{ invoiceNo: "601", type: "Tire" }, { invoiceNo: "602", type: "Battery" }],
        });
        const { maria, pedro, tony } = await staff();
        await handOver(maria, 1);

        // not the loading crew's any more
        (await pedro.post("/admin/loading/1/call")).assertStatus(409);
        assert.equal((await tony.post("/admin/tba/1/call")).assertStatus(200).body.loadingArea, "TBA");
        const started = (await tony.post("/admin/tba/1/start", { area: "TBA" })).assertStatus(200).body;
        assert.ok(started.loadingStartedAt);
        const done = (await tony.post("/admin/tba/1/done")).assertStatus(200).body;

        assert.equal(done.status, "done");
        assert.equal(done.loaded.by.name, "Tony Gulong");
        assert.deepEqual(areasOf(done), [["TBA", "Tony Gulong"]]);
        assert.equal(done.security, "waiting");
    });

    test("an order for Roofings and a Tire is loaded at Roofings, then TBA, then it's done", async () => {
        await takeOrder();
        const { maria, pedro, tony } = await staff();
        await handOver(maria, 1);

        (await pedro.post("/admin/loading/1/start", { area: "Roofings" })).assertStatus(200);
        // a customer is in one place at a time
        assert.equal((await tony.post("/admin/tba/1/call")).assertStatus(409).body.message,
            "Please wait until Pedro Garcia finishes.");
        (await tony.post("/admin/tba/1/start", { area: "TBA" })).assertStatus(409);
        const roofingsDone = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;
        assert.equal(roofingsDone.status, "pending");

        // nothing left for the loading crew; TBA loads it straight away, no call needed
        (await pedro.post("/admin/loading/1/call")).assertStatus(409);
        (await tony.post("/admin/tba/1/start", { area: "TBA" })).assertStatus(200);
        const finished = (await tony.post("/admin/tba/1/done")).assertStatus(200).body;
        assert.equal(finished.status, "done");
        assert.deepEqual(areasOf(finished), [["Roofings", "Pedro Garcia"], ["TBA", "Tony Gulong"]]);
    });

    test("each department's accounts see only the handed-over orders it has a part in; their routes are their own", async () => {
        await takeOrder({ name: "Ana Reyes", ...only("Roofings") });
        await takeOrder({ name: "Liza Mendoza", ...only("Battery") });
        await takeOrder({ name: "Carmela Cruz" });
        // still at the sales counter
        await takeOrder({ name: "Carlo Bautista", ...only("Tire") });
        const { maria, pedro, tony } = await staff();
        for (const queueNum of [1, 2, 3]) await handOver(maria, queueNum);
        const names = async (account) => (await account.get("/admin/orders")).assertStatus(200).body.map((o) => o.name);

        assert.deepEqual(await names(pedro), ["Ana Reyes", "Carmela Cruz"]);
        assert.deepEqual(await names(tony), ["Liza Mendoza", "Carmela Cruz"]);
        (await tony.get("/admin/order-status")).assertStatus(200);
        (await tony.post("/admin/loading/1/call")).assertStatus(403);
        (await tony.post("/admin/hardware/2/call")).assertStatus(403);
        (await pedro.post("/admin/tba/2/call")).assertStatus(403);
        (await maria.post("/admin/tba/2/call")).assertStatus(403);
        (await tony.get("/admin/security")).assertStatus(403);
        // an admin can work it too
        (await (await app.actingAsAdmin()).post("/admin/tba/2/call")).assertStatus(200);
    });

    test("an admin can make an account TBA staff, or move one there", async () => {
        const admin = await app.actingAsAdmin();
        const created = (await admin.post("/admin/users", {
            username: "tony", name: "Tony Gulong", password: "password1", role: "tba",
        })).assertStatus(201).body;
        assert.equal(created.role, "tba");

        const pedro = await app.actingAsLoading("Pedro Garcia");
        const moved = (await admin.patch(`/admin/users/${pedro.account.id}`, { role: "tba" })).assertStatus(200).body;
        assert.equal(moved.role, "tba");
        app.assertDatabaseHas("users", { username: "tony", role: "tba" });
    });
});
