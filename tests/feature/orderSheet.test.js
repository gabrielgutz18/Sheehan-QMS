// the Order sheet on Customer order: every order today with all its details, shared by every sales staff member like a
// spreadsheet; the runner and receiver are filled in there (no longer on the Order tab), and the payment status and
// sales team can be changed there too, one cell at a time, each change kept as an edit with who saved it
// run: npm test -- --test-name-pattern="order sheet"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp } from '../support/testApp.js';

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
    paymentStatus: "Vale",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", sale(overrides))).assertStatus(201).body;

const sheet = (staff, queueNum, cells) => staff.patch(`/admin/orders/${queueNum}/sheet`, cells);

describe("order sheet", () => {
    test("sales fill in the runner and receiver on the sheet, and each change is kept with who saved it", async () => {
        await takeOrder();
        const maria = await app.actingAsSales("Maria Santos");
        const ana = await app.actingAsSales("Ana Reyes");

        const withRunner = (await sheet(maria, 1, { runner: "  Boy Reyes " })).assertStatus(200).body;
        assert.equal(withRunner.runner, "Boy Reyes");
        assert.deepEqual(withRunner.edits.map((e) => [e.by.name, e.changes]), [["Maria Santos", ["runner"]]]);

        const withReceiver = (await sheet(ana, 1, { receiver: "Liza Cruz" })).assertStatus(200).body;
        assert.equal(withReceiver.runner, "Boy Reyes");
        assert.equal(withReceiver.receiver, "Liza Cruz");
        assert.deepEqual(withReceiver.edits.map((e) => [e.by.name, e.changes]), [
            ["Ana Reyes", ["receiver"]],
            ["Maria Santos", ["runner"]],
        ]);
        // everyone in sales sees the same sheet
        const [listed] = (await maria.get("/admin/orders")).assertStatus(200).body;
        assert.equal(listed.receiver, "Liza Cruz");
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "Boy Reyes", receiver: "Liza Cruz", payment_status: "Vale" });
    });

    test("the payment status and sales team are picked from their lists; the team can be taken off", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();

        const paid = (await sheet(maria, 1, { paymentStatus: "Paid", team: "MEGA" })).assertStatus(200).body;
        assert.equal(paid.paymentStatus, "Paid");
        assert.equal(paid.team, "MEGA");
        assert.deepEqual(paid.edits[0].changes, ["paymentStatus", "team"]);

        const noTeam = (await sheet(maria, 1, { team: "" })).assertStatus(200).body;
        assert.equal(noTeam.team, undefined);

        (await sheet(maria, 1, { paymentStatus: "Cash on hand" })).assertStatus(400);
        // it can be changed, not cleared
        (await sheet(maria, 1, { paymentStatus: "" })).assertStatus(400);
        (await sheet(maria, 1, { team: "Roofings" })).assertStatus(400);
        app.assertDatabaseHas("orders", { queue_num: 1, payment_status: "Paid", team: "" });
    });

    test("one cell is saved at a time, so two people on the same order don't overwrite each other", async () => {
        await takeOrder();
        const maria = await app.actingAsSales("Maria Santos");
        const ana = await app.actingAsSales("Ana Reyes");

        await Promise.all([sheet(maria, 1, { runner: "Boy Reyes" }), sheet(ana, 1, { paymentStatus: "Terms" })]);

        app.assertDatabaseHas("orders", { queue_num: 1, runner: "Boy Reyes", payment_status: "Terms", team: "GIGA" });
        app.assertDatabaseCount("order_edits", 2);
    });

    test("a cell saved as it was isn't an edit", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();

        const same = (await sheet(maria, 1, { paymentStatus: "Vale", runner: "" })).assertStatus(200).body;

        assert.equal(same.edits, undefined);
        app.assertDatabaseCount("order_edits", 0);
    });

    test("only the sheet's cells, with values it takes, and only today's orders", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();

        (await sheet(maria, 1, {})).assertStatus(400);
        (await sheet(maria, 1, { name: "Someone else" })).assertStatus(400);
        (await sheet(maria, 1, { constructor: "x" })).assertStatus(400);
        (await sheet(maria, 1, { runner: "x".repeat(61) })).assertStatus(400);
        (await sheet(maria, 1, { receiver: 5 })).assertStatus(400);
        (await sheet(maria, 9, { runner: "Boy Reyes" })).assertStatus(404);
        app.assertDatabaseHas("orders", { queue_num: 1, name: "Juan Dela Cruz", runner: "" });
        app.assertDatabaseCount("order_edits", 0);
    });

    test("admins and sales staff work on the sheet; the loading crew and customers can't", async () => {
        await takeOrder();

        (await sheet(await app.actingAsAdmin(), 1, { runner: "Boy Reyes" })).assertStatus(200);
        (await sheet(await app.actingAsLoading(), 1, { runner: "Someone" })).assertStatus(403);
        (await sheet(app.client(), 1, { runner: "Someone" })).assertStatus(401);
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "Boy Reyes" });
    });

    test("updating the ticket from the Order tab keeps the runner and receiver from the sheet", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();
        await sheet(maria, 1, { runner: "Boy Reyes", receiver: "Liza Cruz" });

        const updated = (await maria.put("/admin/orders/1", sale({ salesman: "Pedro Cruz" }))).assertStatus(200).body;

        assert.equal(updated.runner, "Boy Reyes");
        assert.equal(updated.receiver, "Liza Cruz");
        assert.deepEqual(updated.edits[0].changes, ["salesman"]);
    });
});
