// Recall on the Loading, Service and Hardware pages: a customer whose area was already done can be called back to it,
// e.g. they got the wrong receipt or the wrong order; any time today, even after the gate checked them, with a reason;
// only that area is loaded again, the others stay loaded, and the order goes through the security check again
// run: npm test            only these: npm test -- --test-name-pattern="Recall"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings",
    orders: [],
    invoices: [{ invoiceNo: "1", type: "Roofings" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const ROOFINGS_AND_STEEL = {
    purpose: "Roofings, Steel",
    invoices: [
        { invoiceNo: "1", type: "Roofings" },
        { invoiceNo: "101", type: "Steel" },
    ],
};

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;
const loadAt = async (crew, area, department = "loading") => {
    (await crew.post(`/admin/${department}/1/start`, { area })).assertStatus(200);
    return (await crew.post(`/admin/${department}/1/done`)).assertStatus(200).body;
};
const loadedAreas = (o) => o.areas.map(({ name, loaded }) => [name, Boolean(loaded)]);

describe("Recall", () => {
    let pedro;

    beforeEach(async () => {
        pedro = await app.actingAsLoading("Pedro Garcia");
    });

    // ticket 1, handed over and loaded at every one of its areas
    const loadedOrder = async (overrides) => {
        await takeOrder(overrides);
        (await (await app.actingAsSales()).post("/admin/orders/1/handover")).assertStatus(200);
        let done;
        for (const area of overrides?.purpose?.split(", ") ?? ["Roofings"]) done = await loadAt(pedro, area);
        return done;
    };

    test("calls a done customer straight back to the area, even after the gate verified them, with the reason", async () => {
        await loadedOrder();
        const guard = await app.actingAsSecurity();
        (await guard.post("/admin/security/1/check", { result: "verified" })).assertStatus(200);

        const back = (
            await pedro.post("/admin/loading/1/recall", { area: "Roofings", reason: "  Wrong receipt " })
        ).assertStatus(200).body;

        assert.equal(back.status, "serving");
        assert.equal(back.loadingArea, "Roofings");
        assert.equal(back.remarks, "Please proceed to Roofings (Gate Y: Yero)");
        assert.equal(back.servedBy.name, "Pedro Garcia");
        assert.equal(back.security, undefined);
        assert.deepEqual(loadedAreas(back), [["Roofings", false]]);
        assert.equal(back.recalled.area, "Roofings");
        assert.equal(back.recalled.reason, "Wrong receipt");
        assert.equal(back.recalled.by.name, "Pedro Garcia");
        assert.ok(back.recalled.at);

        // the display calls them again
        const display = (await app.client().get("/queue")).assertStatus(200).body;
        assert.ok(JSON.stringify(display).includes("Please proceed to Roofings"));
    });

    test("once the area is loaded again the order is done and waits for a new security check", async () => {
        await loadedOrder();
        const guard = await app.actingAsSecurity();
        (await guard.post("/admin/security/1/check", { result: "verified" })).assertStatus(200);
        (await pedro.post("/admin/loading/1/recall", { area: "Roofings", reason: "Wrong order" })).assertStatus(200);

        const lito = await app.actingAsLoading("Lito Reyes");
        const done = await loadAt(lito, "Roofings");

        assert.equal(done.status, "done");
        assert.equal(done.security, "waiting");
        assert.deepEqual(loadedAreas(done), [["Roofings", true]]);
        assert.equal(done.areas[0].loaded.by.name, "Lito Reyes");
        // the recall stays on the order for the rest of the visit
        assert.equal(done.recalled.reason, "Wrong order");
        (await guard.post("/admin/security/1/check", { result: "verified" })).assertStatus(200);
    });

    test("only the recalled area is loaded again; the others stay loaded", async () => {
        await loadedOrder(ROOFINGS_AND_STEEL);

        const back = (
            await pedro.post("/admin/loading/1/recall", { area: "Steel", reason: "Wrong receipt" })
        ).assertStatus(200).body;

        assert.deepEqual(loadedAreas(back), [
            ["Roofings", true],
            ["Steel", false],
        ]);
        assert.equal(back.remarks, "Please proceed to Steel (Gate B: Bakalan)");
        assert.equal((await loadAt(pedro, "Steel")).status, "done");
    });

    test("a customer still waiting for their next area can be recalled to one already done", async () => {
        await takeOrder(ROOFINGS_AND_STEEL);
        (await (await app.actingAsSales()).post("/admin/orders/1/handover")).assertStatus(200);
        await loadAt(pedro, "Roofings");

        const back = (
            await pedro.post("/admin/loading/1/recall", { area: "Roofings", reason: "Missing item" })
        ).assertStatus(200).body;
        assert.equal(back.loadingArea, "Roofings");

        // done there again, they go back in line for Steel
        const after = await loadAt(pedro, "Roofings");
        assert.equal(after.status, "pending");
        assert.deepEqual(loadedAreas(after), [
            ["Roofings", true],
            ["Steel", false],
        ]);
    });

    test("needs an area this department already did, and a reason", async () => {
        await takeOrder(ROOFINGS_AND_STEEL);
        (await (await app.actingAsSales()).post("/admin/orders/1/handover")).assertStatus(200);
        await loadAt(pedro, "Roofings");

        // Steel isn't done yet: Call is for that
        const notDone = (
            await pedro.post("/admin/loading/1/recall", { area: "Steel", reason: "Wrong receipt" })
        ).assertStatus(400).body;
        assert.match(notDone.message, /Roofings/);
        (await pedro.post("/admin/loading/1/recall", { area: "Roofings" })).assertStatus(400);
        (await pedro.post("/admin/loading/1/recall", { area: "Roofings", reason: "   " })).assertStatus(400);
        (await pedro.post("/admin/loading/1/recall", { area: "Roofings", reason: "x".repeat(121) })).assertStatus(400);
        (await pedro.post("/admin/loading/1/recall", { reason: "Wrong receipt" })).assertStatus(400);

        // the order is as it was
        const [row] = (await pedro.get("/admin/orders")).assertStatus(200).body;
        assert.equal(row.status, "pending");
        assert.equal(row.recalled, undefined);
    });

    test("another department can't recall an area that isn't its own", async () => {
        await loadedOrder();
        const tony = await app.actingAsService();

        (await tony.post("/admin/service/1/recall", { area: "Roofings", reason: "Wrong receipt" })).assertStatus(400);
        (await tony.post("/admin/loading/1/recall", { area: "Roofings", reason: "Wrong receipt" })).assertStatus(403);
        // sales hand customers over, they don't load them
        const ana = await app.actingAsSales("Ana Cruz");
        (await ana.post("/admin/loading/1/recall", { area: "Roofings", reason: "Wrong receipt" })).assertStatus(403);
    });

    test("waits while someone else has the customer, one place at a time", async () => {
        await loadedOrder(ROOFINGS_AND_STEEL);
        (await pedro.post("/admin/loading/1/recall", { area: "Steel", reason: "Wrong receipt" })).assertStatus(200);

        const lito = await app.actingAsLoading("Lito Reyes");
        const busy = (
            await lito.post("/admin/loading/1/recall", { area: "Roofings", reason: "Wrong order" })
        ).assertStatus(409).body;
        assert.equal(busy.message, "Please wait until Pedro Garcia finishes.");
    });

    test("an order sales hasn't handed over has nothing to recall", async () => {
        await takeOrder();
        (await pedro.post("/admin/loading/1/recall", { area: "Roofings", reason: "Wrong receipt" })).assertStatus(409);
        (await pedro.post("/admin/loading/9/recall", { area: "Roofings", reason: "Wrong receipt" })).assertStatus(404);
    });
});
