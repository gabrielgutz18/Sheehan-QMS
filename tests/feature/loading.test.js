// the Loading page: one shared loading line (Roofings and Steel are departments, not teams). A sales counter serves
// the customer first and hands them over to loading; then any loading account calls the customer, marks them done or
// sends them back to waiting; the order keeps its sales team throughout
// run: npm test            only these: npm test -- --test-name-pattern="loading"
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
    invoices: [{ invoiceNo: "2223", type: "Roofings" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// a sales counter and two people on the loading crew
const staff = async () => ({
    maria: await app.actingAsSales(),
    pedro: await app.actingAsLoading("Pedro Garcia"),
    rico: await app.actingAsLoading("Rico Steel"),
});

// after the ticket and the talk, the sales counter hands the customer over to loading (sales don't call them)
const handOver = async (sales, queueNum) => {
    return (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200).body;
};

describe("loading", () => {
    test("the loading crew calls the customer, and the display says where to go", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);

        const called = (await pedro.post("/admin/loading/1/call", { remarks: "Please proceed to Roofings" }))
            .assertStatus(200).body;

        assert.equal(called.status, "serving");
        assert.equal(called.atLoading, true);
        assert.equal(called.servedBy.name, "Pedro Garcia");
        // still the sales team's order
        assert.equal(called.team, "GIGA");
        const { serving } = (await app.client().get("/queue")).assertStatus(200).body;
        assert.equal(serving[0].remarks, "Please proceed to Roofings");
        app.assertDatabaseHas("orders", { queue_num: 1, at_loading: 1, team: "GIGA" });
    });

    test("anyone on the loading crew can call again, finish or send back a customer the crew is serving", async () => {
        // loaded in one area, so Done finishes it
        await takeOrder({ purpose: "Roofings", invoices: [{ invoiceNo: "2223", type: "Roofings" }] });
        const { maria, pedro, rico } = await staff();
        await handOver(maria, 1);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);

        const again = (await rico.post("/admin/loading/1/call", { remarks: "Please proceed to Roofings" })).assertStatus(200).body;
        assert.equal(again.servedBy.name, "Rico Steel");

        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        const finished = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;
        assert.equal(finished.status, "done");
        assert.equal(finished.atLoading, undefined);
        // whoever pressed Done loaded it; the point is the sales counter's, from the handover
        assert.equal(finished.loaded.by.name, "Pedro Garcia");
        app.assertDatabaseCount("serves", 1);
        app.assertDatabaseHas("serves", { user_id: maria.account.id });

        const refused = (await rico.post("/admin/loading/1/call")).assertStatus(409).body;
        assert.equal(refused.message, "Loading has already finished this order.");
        // nor can an admin call them back to a counter once it's loaded
        (await (await app.actingAsAdmin()).post("/admin/orders/1/call")).assertStatus(409);
        app.assertDatabaseHas("orders", { queue_num: 1, status: "done", loaded_by: pedro.account.id });
    });

    test("loading isn't serving: Done means the order is loaded, and it stays served by the sales counter", async () => {
        await takeOrder({ purpose: "Roofings", invoices: [{ invoiceNo: "2223", type: "Roofings" }] });
        const { maria, pedro } = await staff();
        const handed = await handOver(maria, 1);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);

        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        const loaded = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(loaded.status, "done");
        assert.equal(loaded.servedBy.name, "Maria Santos");
        // when the sales counter served them: the handover
        assert.equal(loaded.servedAt, handed.handedOver.at);
        assert.equal(loaded.loaded.by.name, "Pedro Garcia");
        assert.ok(loaded.loaded.at);
        app.assertDatabaseHas("orders", { queue_num: 1, served_by: maria.account.id, loaded_by: pedro.account.id });
        // it's the sales counter's customer served, not loading's
        assert.equal((await maria.get("/admin/me/stats?period=day")).assertStatus(200).body.totals.today, 1);
        const users = (await (await app.actingAsAdmin()).get("/admin/users")).assertStatus(200).body;
        assert.equal(users.find((u) => u.name === "Pedro Garcia").servedToday, 0);
    });

    test("an admin marking a customer at loading Done records the loading staff member as loading it", async () => {
        await takeOrder();
        const admin = await app.actingAsAdmin();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);

        const done = (await admin.patch("/admin/orders/1", { status: "done" })).assertStatus(200).body;

        assert.equal(done.servedBy.name, "Maria Santos");
        assert.equal(done.loaded.by.name, "Pedro Garcia");
    });

    test("a customer an admin calls back to a counter can't be called by loading", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        const admin = await app.actingAsAdmin();
        await handOver(maria, 1);
        (await admin.post("/admin/orders/1/call")).assertStatus(200);

        const refused = (await pedro.post("/admin/loading/1/call")).assertStatus(409).body;

        assert.equal(refused.message, `Please wait until ${admin.account.name} finishes.`);
        (await pedro.post("/admin/loading/1/done")).assertStatus(409);
    });

    test("back to waiting puts them back in line for loading, without the call's message on the display", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        await pedro.post("/admin/loading/1/call", { remarks: "Please proceed to Steel" });
        const board = async () => (await app.client().get("/queue")).assertStatus(200).body;

        const back = (await pedro.post("/admin/loading/1/back")).assertStatus(200).body;

        assert.equal(back.status, "pending");
        assert.equal(back.atLoading, undefined);
        assert.deepEqual((await board()).serving, []);
        assert.deepEqual((await board()).upcoming.map((o) => o.name), ["Juan Dela Cruz"]);
        // only a customer loading is serving can be finished or sent back
        (await pedro.post("/admin/loading/1/done")).assertStatus(409);
        (await pedro.post("/admin/loading/1/back")).assertStatus(409);
    });

    test("every loading account sees all of today's orders sales has handed over; admins and sales see them all", async () => {
        const only = (type) => ({ purpose: type, invoices: [{ invoiceNo: "2223", type }] });
        await takeOrder({ name: "Ana Reyes", ...only("Roofings") });
        await takeOrder({ name: "Pedro Santos", ...only("Steel") });
        await takeOrder({ name: "Liza Mendoza", ...only("Tire"), team: "" });
        // still at the sales counter
        await takeOrder({ name: "Carlo Bautista", ...only("Roofings") });
        const { maria, pedro, rico } = await staff();
        for (const queueNum of [1, 2, 3]) await handOver(maria, queueNum);
        const names = async (account) => (await account.get("/admin/orders")).assertStatus(200).body.map((o) => o.name);

        assert.deepEqual(await names(pedro), ["Ana Reyes", "Pedro Santos", "Liza Mendoza"]);
        assert.deepEqual(await names(rico), ["Ana Reyes", "Pedro Santos", "Liza Mendoza"]);
        assert.equal((await names(await app.actingAsAdmin())).length, 4);
        assert.equal((await names(maria)).length, 4);
        (await pedro.post("/admin/loading/9/call")).assertStatus(404);
    });

    test("an admin can work the Loading page too; sales staff use their own counter", async () => {
        await takeOrder();
        const admin = await app.actingAsAdmin();
        const { maria } = await staff();
        await handOver(maria, 1);

        const called = (await admin.post("/admin/loading/1/call", {})).assertStatus(200).body;
        assert.equal(called.atLoading, true);
        (await maria.post("/admin/loading/1/done")).assertStatus(403);
        (await admin.post("/admin/loading/1/start")).assertStatus(200);
        (await admin.post("/admin/loading/1/done")).assertStatus(200);
    });

    test("reopening a finished order puts the customer back in line for loading", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        // Roofings, then Steel
        for (let i = 0; i < 2; i++) {
            (await pedro.post("/admin/loading/1/call")).assertStatus(200);
            (await pedro.post("/admin/loading/1/start")).assertStatus(200);
            (await pedro.post("/admin/loading/1/done")).assertStatus(200);
        }

        const reopened = (await maria.patch("/admin/orders/1", { status: "returning" })).assertStatus(200).body;

        assert.equal(reopened.handedOver.by.id, maria.account.id);
        // it isn't loaded any more, in either area
        assert.equal(reopened.loaded, undefined);
        assert.deepEqual(reopened.areas, [{ name: "Roofings" }, { name: "Steel" }]);
        app.assertDatabaseHas("orders", { queue_num: 1, loaded_by: null, loaded_at: null });
        app.assertDatabaseCount("order_loads", 0);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);
        // the sales counter keeps the point from the handover
        app.assertDatabaseHas("serves", { user_id: maria.account.id });
    });
});

// a ticket for several types of order is loaded in each of their areas in turn (src/data/loadingAreas.js): Done
// finishes the area the crew called the customer to, and only the last one finishes loading
describe("loading area by area", () => {
    test("an order for Roofings and Steel is loaded at Roofings, then Steel, then it's done", async () => {
        await takeOrder();
        const { maria, pedro, rico } = await staff();
        await handOver(maria, 1);

        const atRoofings = (await pedro.post("/admin/loading/1/call", { remarks: "Please proceed to Roofings" }))
            .assertStatus(200).body;
        assert.equal(atRoofings.loadingArea, "Roofings");
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        const roofingsDone = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;

        // back in line for loading, waiting for Steel
        assert.equal(roofingsDone.status, "pending");
        assert.equal(roofingsDone.handedOver.by.id, maria.account.id);
        assert.equal(roofingsDone.loadingArea, undefined);
        assert.equal(roofingsDone.loaded, undefined);
        assert.deepEqual(roofingsDone.areas.map(({ name, loaded }) => [name, loaded?.by.name]), [
            ["Roofings", "Pedro Garcia"],
            ["Steel", undefined],
        ]);
        assert.deepEqual((await pedro.get("/admin/orders")).assertStatus(200).body.map((o) => o.queueNum), [1]);

        // the next call is to Steel, by anyone on the crew, and Done there finishes loading
        const atSteel = (await rico.post("/admin/loading/1/call", { remarks: "Please proceed to Steel" })).assertStatus(200).body;
        assert.equal(atSteel.loadingArea, "Steel");
        (await rico.post("/admin/loading/1/start")).assertStatus(200);
        const finished = (await rico.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(finished.status, "done");
        assert.equal(finished.loaded.by.name, "Rico Steel");
        assert.deepEqual(finished.areas.map(({ name, loaded }) => [name, loaded?.by.name]), [
            ["Roofings", "Pedro Garcia"],
            ["Steel", "Rico Steel"],
        ]);
        app.assertDatabaseCount("order_loads", 2, { order_id: 1 });
        // the point is still the sales counter's, from the handover
        app.assertDatabaseCount("serves", 1);
    });

    test("the crew can call them to another of their areas first, but not to one that's done or not theirs", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);

        const atSteel = (await pedro.post("/admin/loading/1/call", { area: "Steel" })).assertStatus(200).body;
        assert.equal(atSteel.loadingArea, "Steel");
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        (await pedro.post("/admin/loading/1/done")).assertStatus(200);

        const steelAgain = (await pedro.post("/admin/loading/1/call", { area: "Steel" })).assertStatus(400).body;
        assert.equal(steelAgain.message, "Call them to an area this order still needs: Roofings.");
        (await pedro.post("/admin/loading/1/call", { area: "TBA" })).assertStatus(400);
        // with no area, the call is to the one left
        assert.equal((await pedro.post("/admin/loading/1/call")).assertStatus(200).body.loadingArea, "Roofings");
    });

    test("back to waiting keeps the areas already loaded", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        await pedro.post("/admin/loading/1/call");
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        await pedro.post("/admin/loading/1/done");
        await pedro.post("/admin/loading/1/call");

        const back = (await pedro.post("/admin/loading/1/back")).assertStatus(200).body;

        assert.equal(back.status, "pending");
        assert.equal(back.loadingArea, undefined);
        assert.deepEqual(back.areas.map(({ name, loaded }) => [name, Boolean(loaded)]), [["Roofings", true], ["Steel", false]]);
    });

    test("Tire and Chassis are both loaded at TBA, in one go", async () => {
        await takeOrder({
            purpose: "Tire, Chassis", invoices: [{ invoiceNo: "601", type: "Tire" }, { invoiceNo: "602", type: "Chassis" }],
        });
        const { maria, pedro } = await staff();
        await handOver(maria, 1);

        assert.equal((await pedro.post("/admin/loading/1/call")).assertStatus(200).body.loadingArea, "TBA");
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        const done = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(done.status, "done");
        assert.deepEqual(done.areas.map(({ name }) => name), ["TBA"]);
    });
});

// a station loads one truck at a time: the crew calls the customer to an area, presses Loading once the truck is
// there, and Done once it's loaded; while Roofings is loading, Steel waits
describe("loading at a station", () => {
    test("Done needs Loading first, and Loading is pressed once", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        const called = (await pedro.post("/admin/loading/1/call")).assertStatus(200).body;
        assert.equal(called.loadingStartedAt, undefined);

        const early = (await pedro.post("/admin/loading/1/done")).assertStatus(409).body;
        assert.equal(early.message, "Press Loading once the truck is at Roofings, then Done when it's loaded.");
        const started = (await pedro.post("/admin/loading/1/start")).assertStatus(200).body;
        assert.ok(started.loadingStartedAt);
        assert.equal(started.loadingArea, "Roofings");
        const twice = (await pedro.post("/admin/loading/1/start")).assertStatus(409).body;
        assert.equal(twice.message, "Roofings is already loading this truck.");
        // the Order status board shows it too
        const [onBoard] = (await pedro.get("/admin/order-status")).assertStatus(200).body;
        assert.equal(onBoard.loadingStartedAt, started.loadingStartedAt);
    });

    test("once Roofings is loading, the customer can't be called to Steel until Roofings is done", async () => {
        await takeOrder();
        const { maria, pedro, rico } = await staff();
        await handOver(maria, 1);
        (await pedro.post("/admin/loading/1/call", { area: "Roofings" })).assertStatus(200);
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);

        const steel = (await rico.post("/admin/loading/1/call", { area: "Steel" })).assertStatus(409).body;
        assert.equal(steel.message, "Roofings is loading this truck. Please wait until it finishes.");
        app.assertDatabaseHas("orders", { queue_num: 1, loading_area: "Roofings" });
        // calling again to Roofings keeps it loading there
        const again = (await pedro.post("/admin/loading/1/call", { area: "Roofings" })).assertStatus(200).body;
        assert.ok(again.loadingStartedAt);

        (await pedro.post("/admin/loading/1/done")).assertStatus(200);
        const atSteel = (await rico.post("/admin/loading/1/call", { area: "Steel" })).assertStatus(200).body;
        assert.equal(atSteel.loadingArea, "Steel");
        // Steel has only called them; its truck isn't loading yet
        assert.equal(atSteel.loadingStartedAt, undefined);
    });

    test("before Loading the crew can still send the truck to another area, and back to waiting stops loading", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        (await pedro.post("/admin/loading/1/call", { area: "Roofings" })).assertStatus(200);
        assert.equal((await pedro.post("/admin/loading/1/call", { area: "Steel" })).assertStatus(200).body.loadingArea, "Steel");
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);

        const back = (await pedro.post("/admin/loading/1/back")).assertStatus(200).body;
        assert.equal(back.loadingStartedAt, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, loading_started_at: null });
        (await pedro.post("/admin/loading/1/call", { area: "Roofings" })).assertStatus(200);
    });
});

describe("handing over to loading", () => {
    test("after the ticket and the talk sales hands the customer over, without calling them, and loading calls them", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();

        const tooSoon = (await pedro.post("/admin/loading/1/call")).assertStatus(409).body;
        assert.equal(tooSoon.message, "Sales hasn't handed this customer over yet.");
        assert.deepEqual((await pedro.get("/admin/orders")).assertStatus(200).body, []);

        const handed = (await maria.post("/admin/orders/1/handover")).assertStatus(200).body;

        // in line, for loading now, never on the display before; still the sales team's order
        assert.equal(handed.status, "pending");
        assert.equal(handed.team, "GIGA");
        assert.equal(handed.calledAt, undefined);
        assert.equal(handed.servedBy, undefined);
        assert.equal(handed.handedOver.by.name, "Maria Santos");
        assert.ok(handed.handedOver.at);
        // it counts as the sales counter's customer served
        app.assertDatabaseHas("serves", { user_id: maria.account.id });
        assert.equal((await maria.get("/admin/me/stats?period=day")).assertStatus(200).body.totals.today, 1);

        assert.equal((await pedro.get("/admin/orders")).assertStatus(200).body.length, 1);
        const called = (await pedro.post("/admin/loading/1/call", { remarks: "Please proceed to Roofings" })).assertStatus(200).body;
        assert.equal(called.servedBy.name, "Pedro Garcia");
        assert.deepEqual((await app.client().get("/queue")).body.serving.map((c) => c.remarks), ["Please proceed to Roofings"]);
    });

    test("a customer an admin is serving at a counter can be handed over too", async () => {
        await takeOrder();
        const { maria } = await staff();
        (await (await app.actingAsAdmin()).post("/admin/orders/1/call", { remarks: "Window 1" })).assertStatus(200);

        const handed = (await maria.post("/admin/orders/1/handover")).assertStatus(200).body;

        assert.equal(handed.status, "pending");
        assert.equal(handed.remarks, "");
        assert.equal(handed.servedBy, undefined);
    });

    test("there's no team to pick: an order with no sales team is handed over just the same", async () => {
        await takeOrder({ team: "" });
        const { maria } = await staff();

        const handed = await handOver(maria, 1);

        assert.equal(handed.team, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, team: "", handed_over_by: maria.account.id });
    });

    test("a customer is handed over once, and not once they're done", async () => {
        await takeOrder();
        await takeOrder({ name: "Ana Reyes" });
        const { maria } = await staff();

        await handOver(maria, 1);
        const again = (await maria.post("/admin/orders/1/handover")).assertStatus(409).body;
        assert.equal(again.message, "This customer is already with loading.");
        (await maria.post("/admin/orders/9/handover")).assertStatus(404);

        (await maria.patch("/admin/orders/2", { status: "done" })).assertStatus(200);
        const done = (await maria.post("/admin/orders/2/handover")).assertStatus(409).body;
        assert.equal(done.message, "This order is already done.");
        app.assertDatabaseHas("orders", { queue_num: 2, handed_over_by: null });
        app.assertDatabaseCount("serves", 2);
    });

    test("loading staff can't hand customers over", async () => {
        await takeOrder();
        const { pedro } = await staff();

        (await pedro.post("/admin/orders/1/handover")).assertStatus(403);
        app.assertDatabaseHas("orders", { queue_num: 1, handed_over_by: null });
    });

    test("a deleted ticket that's restored starts again at the sales counter", async () => {
        await takeOrder();
        const admin = await app.actingAsAdmin();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);
        (await admin.delete("/admin/orders/1")).assertStatus(204);
        const { id } = app.db.prepare("SELECT id FROM orders WHERE queue_num = 1").get();

        (await admin.post(`/admin/history/${id}/restore`)).assertStatus(200);

        app.assertDatabaseHas("orders", { id, status: "pending", handed_over_by: null, handed_over_at: null, at_loading: 0 });
    });
});

describe("sales teams", () => {
    test("an order has one sales team from the list, or none; Roofings and Steel aren't teams", async () => {
        const desk = app.client();

        (await desk.post("/orders", order({ team: "MEGA" }))).assertStatus(201);
        (await desk.post("/orders", order({ team: "" }))).assertStatus(201);
        (await desk.post("/orders", order({ team: "Roofings" }))).assertStatus(400);
        (await desk.post("/orders", order({ team: "Steel" }))).assertStatus(400);
        (await desk.post("/orders", order({ team: "GIGA, MEGA" }))).assertStatus(400);
    });

    test("loading accounts aren't on a team", async () => {
        const admin = await app.actingAsAdmin();
        const created = (await admin.post("/admin/users", {
            username: "pedro", name: "Pedro Garcia", password: "password1", role: "loading",
        })).assertStatus(201).body;

        // no loading crew; an account's own sales team (users.sales_team) is only for marking edits, and this one has none
        assert.equal(created.team, "");
        assert.ok(!app.db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "team"));
    });
});
