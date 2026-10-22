// the Loading page: each loading account is on a crew (Roofings, Steel); an order can go to several crews. A sales
// counter serves the customer first and hands them over to loading; then each crew calls the customer to its area,
// one at a time, and marks its part done; the order is done when every crew is
// run: npm test            only these: npm test -- --test-name-pattern="loading"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order for both crews; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings, Steel",
    orders: [],
    invoiceNo: "2223",
    salesman: "Maria Santos",
    paymentStatus: "Paid",
    team: "Roofings, Steel",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// a sales counter and a crew member on each team
const staff = async () => ({
    maria: await app.actingAsSales(),
    pedro: await app.actingAsLoading("Pedro Garcia", "Roofings"),
    rico: await app.actingAsLoading("Rico Steel", "Steel"),
});

// the sales counter serves the customer, then hands them over to loading (to the order's own teams, or these)
const handOver = async (sales, queueNum, body = {}) => {
    (await sales.post(`/admin/orders/${queueNum}/call`)).assertStatus(200);
    return (await sales.post(`/admin/orders/${queueNum}/handover`, body)).assertStatus(200).body;
};

describe("loading", () => {
    test("a crew calls the customer to its area, and the display says where to go", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);

        const called = (await pedro.post("/admin/loading/1/call", { remarks: "Please proceed to Roofings" }))
            .assertStatus(200).body;

        assert.equal(called.status, "serving");
        assert.equal(called.servingTeam, "Roofings");
        assert.equal(called.servedBy.name, "Pedro Garcia");
        const { serving } = (await app.client().get("/queue")).assertStatus(200).body;
        assert.equal(serving[0].remarks, "Please proceed to Roofings");
        app.assertDatabaseHas("orders", { queue_num: 1, serving_team: "Roofings", teams_done: "" });
    });

    test("while one crew is serving the customer, the other has to wait", async () => {
        await takeOrder();
        const { maria, pedro, rico } = await staff();
        await handOver(maria, 1);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);

        const refused = (await rico.post("/admin/loading/1/call")).assertStatus(409).body;

        assert.equal(refused.message, "Please wait until Roofings finishes.");
        app.assertDatabaseHas("orders", { queue_num: 1, serving_team: "Roofings", served_by: pedro.account.id });
        // the same crew can call them again
        (await pedro.post("/admin/loading/1/call", { remarks: "Roofings, gate 2" })).assertStatus(200);
    });

    test("a customer called back to a sales counter can't be called by a crew either", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        (await maria.post("/admin/orders/1/call")).assertStatus(200);

        const refused = (await pedro.post("/admin/loading/1/call")).assertStatus(409).body;

        assert.equal(refused.message, "Please wait until Maria Santos finishes.");
    });

    test("when one crew is done the customer waits for the next, and the last crew finishes the order", async () => {
        await takeOrder();
        const { maria, pedro, rico } = await staff();
        await handOver(maria, 1);
        await pedro.post("/admin/loading/1/call", { remarks: "Please proceed to Roofings" });

        const half = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(half.status, "pending");
        assert.equal(half.teamsDone, "Roofings");
        assert.equal(half.servingTeam, undefined);
        assert.equal(half.servedBy, undefined);
        // Roofings' message doesn't follow the customer to Steel
        app.assertDatabaseHas("orders", { queue_num: 1, remarks: "", serving_team: null });
        (await pedro.post("/admin/loading/1/call")).assertStatus(409);

        (await rico.post("/admin/loading/1/call", { remarks: "Please proceed to Steel" })).assertStatus(200);
        const finished = (await rico.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(finished.status, "done");
        assert.equal(finished.teamsDone, "Roofings, Steel");
        // the point is the sales counter's, from the handover
        app.assertDatabaseCount("serves", 1);
        app.assertDatabaseHas("serves", { user_id: maria.account.id });
    });

    test("between crews the display keeps the customer as Please wait until the next crew calls them", async () => {
        await takeOrder();
        // someone else called earlier, still at a counter
        await takeOrder({ name: "George Kalos", team: "" });
        const { maria, pedro, rico } = await staff();
        (await maria.post("/admin/orders/2/call", { remarks: "Please proceed to cashier" })).assertStatus(200);
        await handOver(maria, 1);
        await pedro.post("/admin/loading/1/call", { remarks: "Please proceed to Roofings" });
        const board = async () => (await app.client().get("/queue")).assertStatus(200).body;

        await pedro.post("/admin/loading/1/done");

        // still the headline, with no remarks (the display shows "Please wait"), and not back in line
        const between = await board();
        assert.deepEqual(between.serving.map((o) => [o.name, o.remarks]),
            [["Juan Dela Cruz", ""], ["George Kalos", "Please proceed to cashier"]]);
        assert.deepEqual(between.upcoming, []);

        // sending them back from Steel keeps them waiting for Steel, without Steel's message
        await rico.post("/admin/loading/1/call", { remarks: "Please proceed to Steel" });
        assert.equal((await board()).serving[0].remarks, "Please proceed to Steel");
        await rico.post("/admin/loading/1/back");
        assert.equal((await board()).serving[0].remarks, "");

        await rico.post("/admin/loading/1/call", { remarks: "Please proceed to Steel" });
        await rico.post("/admin/loading/1/done");
        assert.deepEqual((await board()).serving.map((o) => o.name), ["George Kalos"]);
    });

    test("either crew can go first, and teams done stay in the order's own order", async () => {
        await takeOrder();
        const { maria, pedro, rico } = await staff();
        await handOver(maria, 1);

        await rico.post("/admin/loading/1/call");
        await rico.post("/admin/loading/1/done");
        await pedro.post("/admin/loading/1/call");
        const finished = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(finished.status, "done");
        assert.equal(finished.teamsDone, "Roofings, Steel");
    });

    test("back to waiting lets the other crew call them", async () => {
        await takeOrder();
        const { maria, pedro, rico } = await staff();
        await handOver(maria, 1);
        await pedro.post("/admin/loading/1/call");

        const back = (await pedro.post("/admin/loading/1/back")).assertStatus(200).body;

        assert.equal(back.status, "pending");
        assert.equal(back.teamsDone, undefined);
        (await rico.post("/admin/loading/1/call")).assertStatus(200);
        // only the crew serving them can finish or send them back
        (await pedro.post("/admin/loading/1/done")).assertStatus(409);
        (await pedro.post("/admin/loading/1/back")).assertStatus(409);
    });

    test("a crew only sees today's orders sales has handed over to it; admins and sales staff see them all", async () => {
        await takeOrder({ name: "Ana Reyes", team: "Roofings" });
        await takeOrder({ name: "Pedro Santos", team: "Steel" });
        await takeOrder({ name: "Juan Dela Cruz", team: "Roofings, Steel" });
        await takeOrder({ name: "Liza Mendoza", team: "" });
        // still at the sales counter
        await takeOrder({ name: "Carlo Bautista", team: "Roofings" });
        const { maria, pedro, rico } = await staff();
        for (const queueNum of [1, 2, 3]) await handOver(maria, queueNum);
        const names = async (account) => (await account.get("/admin/orders")).assertStatus(200).body.map((o) => o.name);

        assert.deepEqual(await names(pedro), ["Ana Reyes", "Juan Dela Cruz"]);
        assert.deepEqual(await names(rico), ["Pedro Santos", "Juan Dela Cruz"]);
        assert.equal((await names(await app.actingAsAdmin())).length, 5);
        assert.equal((await names(maria)).length, 5);
    });

    test("a crew only calls orders that go to it", async () => {
        await takeOrder({ team: "Steel" });
        const { maria, pedro } = await staff();
        await handOver(maria, 1);

        const refused = (await pedro.post("/admin/loading/1/call")).assertStatus(409).body;

        assert.equal(refused.message, "This order doesn't go to Roofings.");
        (await pedro.post("/admin/loading/9/call")).assertStatus(404);
    });

    test("an admin calls for whichever crew they pick; sales staff use their own counter", async () => {
        await takeOrder();
        const admin = await app.actingAsAdmin();
        const { maria } = await staff();
        await handOver(maria, 1);

        (await admin.post("/admin/loading/1/call", {})).assertStatus(400);
        const called = (await admin.post("/admin/loading/1/call", { team: "Steel" })).assertStatus(200).body;
        assert.equal(called.servingTeam, "Steel");
        (await maria.post("/admin/loading/1/done")).assertStatus(403);
    });

    test("reopening a finished order puts the customer back in line for every crew", async () => {
        await takeOrder({ team: "Roofings" });
        const { maria, pedro } = await staff();
        await handOver(maria, 1);
        await pedro.post("/admin/loading/1/call");
        await pedro.post("/admin/loading/1/done");

        const reopened = (await maria.patch("/admin/orders/1", { status: "returning" })).assertStatus(200).body;

        assert.equal(reopened.teamsDone, undefined);
        assert.equal(reopened.handedOver.by.id, maria.account.id);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);
        // the sales counter keeps the point from the handover
        app.assertDatabaseHas("serves", { user_id: maria.account.id });
    });

    test("orders go to one or more crews from the list", async () => {
        const desk = app.client();

        (await desk.post("/orders", order({ team: "Roofings, Tires" }))).assertStatus(400);
        (await desk.post("/orders", order({ team: "Roofings, Roofings" }))).assertStatus(400);
        (await desk.post("/orders", order({ team: "Steel" }))).assertStatus(201);
        (await desk.post("/orders", order({ team: "" }))).assertStatus(201);
    });
});

describe("handing over to loading", () => {
    test("sales serves the customer first, and the crews can call them once they're handed over", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();

        const tooSoon = (await pedro.post("/admin/loading/1/call")).assertStatus(409).body;
        assert.equal(tooSoon.message, "Sales hasn't handed this customer over yet.");
        assert.deepEqual((await pedro.get("/admin/orders")).assertStatus(200).body, []);

        (await maria.post("/admin/orders/1/call", { remarks: "Please proceed to Window 1" })).assertStatus(200);
        const handed = (await maria.post("/admin/orders/1/handover")).assertStatus(200).body;

        // back in line, for the crews now, without the counter's remarks
        assert.equal(handed.status, "pending");
        assert.equal(handed.team, "Roofings, Steel");
        assert.equal(handed.remarks, "");
        assert.equal(handed.servedBy, undefined);
        assert.equal(handed.handedOver.by.name, "Maria Santos");
        assert.ok(handed.handedOver.at);
        // it counts as the sales counter's customer served
        app.assertDatabaseHas("serves", { user_id: maria.account.id });
        assert.equal((await maria.get("/admin/me/stats?period=day")).assertStatus(200).body.totals.today, 1);

        assert.equal((await pedro.get("/admin/orders")).assertStatus(200).body.length, 1);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);
    });

    test("the teams can be picked again at the counter, and at least one is needed", async () => {
        await takeOrder({ team: "" });
        const { maria } = await staff();
        (await maria.post("/admin/orders/1/call")).assertStatus(200);

        (await maria.post("/admin/orders/1/handover")).assertStatus(400);
        (await maria.post("/admin/orders/1/handover", { team: "" })).assertStatus(400);
        (await maria.post("/admin/orders/1/handover", { team: "Roofings, Tires" })).assertStatus(400);
        const handed = (await maria.post("/admin/orders/1/handover", { team: "Steel" })).assertStatus(200).body;

        assert.equal(handed.team, "Steel");
        app.assertDatabaseHas("orders", { queue_num: 1, team: "Steel", handed_over_by: maria.account.id });
    });

    test("only a customer being served can be handed over, and only once", async () => {
        await takeOrder();
        const { maria } = await staff();

        const notServed = (await maria.post("/admin/orders/1/handover")).assertStatus(409).body;
        assert.equal(notServed.message, "Serve the customer first, then hand them over.");

        await handOver(maria, 1);
        const again = (await maria.post("/admin/orders/1/handover")).assertStatus(409).body;
        assert.equal(again.message, "This customer is already with loading.");
        (await maria.post("/admin/orders/9/handover")).assertStatus(404);
        app.assertDatabaseCount("serves", 1);
    });

    test("loading staff can't hand customers over", async () => {
        await takeOrder();
        const { maria, pedro } = await staff();
        (await maria.post("/admin/orders/1/call")).assertStatus(200);

        (await pedro.post("/admin/orders/1/handover")).assertStatus(403);
        app.assertDatabaseHas("orders", { queue_num: 1, handed_over_by: null });
    });

    test("a deleted ticket that's restored starts again at the sales counter", async () => {
        await takeOrder();
        const admin = await app.actingAsAdmin();
        const { maria } = await staff();
        await handOver(maria, 1);
        (await admin.delete("/admin/orders/1")).assertStatus(204);
        const { id } = app.db.prepare("SELECT id FROM orders WHERE queue_num = 1").get();

        (await admin.post(`/admin/history/${id}/restore`)).assertStatus(200);

        app.assertDatabaseHas("orders", { id, status: "pending", handed_over_by: null, handed_over_at: null });
    });
});

describe("loading teams on accounts", () => {
    test("a loading account needs a team, and the admin can move it to another", async () => {
        const admin = await app.actingAsAdmin();
        const account = { username: "pedro", name: "Pedro Garcia", password: "password1", role: "loading" };

        (await admin.post("/admin/users", account)).assertStatus(400);
        (await admin.post("/admin/users", { ...account, team: "Tires" })).assertStatus(400);
        const created = (await admin.post("/admin/users", { ...account, team: "Roofings" })).assertStatus(201).body;
        assert.equal(created.team, "Roofings");

        const moved = (await admin.patch(`/admin/users/${created.id}`, { team: "Steel" })).assertStatus(200).body;
        assert.equal(moved.team, "Steel");
        (await admin.patch(`/admin/users/${created.id}`, { team: "Tires" })).assertStatus(400);

        // a sales account has no team
        const sales = (await admin.patch(`/admin/users/${created.id}`, { role: "sales" })).assertStatus(200).body;
        assert.equal(sales.team, null);
    });

    test("signing in tells the page which team the account is on", async () => {
        const pedro = await app.actingAsLoading("Pedro Garcia", "Steel");

        assert.equal((await pedro.get("/auth/me")).assertStatus(200).body.team, "Steel");
    });
});
