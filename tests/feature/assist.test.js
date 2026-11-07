// a customer belongs to whoever made their ticket on Customer order: only they (or an admin) hand them over, and while
// they're away from their counter someone else in sales presses Assist to take the customer, which everyone sees, and
// can then hand them over themselves
// run: npm test            only these: npm test -- --test-name-pattern="assist"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order
const order = {
    name: "Juan Dela Cruz",
    purpose: "Roofings",
    orders: [],
    invoices: [{ invoiceNo: "2223", type: "Roofings" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
};

// Maria makes the ticket, and Leo and Ana are the other sales staff on the floor
const salesFloor = async () => {
    const maria = await app.actingAsSales("Maria Santos");
    const leo = await app.actingAsSales("Leo Reyes");
    const ana = await app.actingAsSales("Ana Cruz");
    (await maria.post("/orders", order)).assertStatus(201);
    return { maria, leo, ana };
};

describe("assist", () => {
    test("the ticket remembers who made it, and only they hand the customer over until someone assists", async () => {
        const { maria, leo } = await salesFloor();

        const listed = (await leo.get("/admin/orders")).assertStatus(200).body;
        assert.deepEqual(listed[0].createdBy, { id: maria.account.id, name: "Maria Santos" });

        const refused = (await leo.post("/admin/orders/1/handover")).assertStatus(403).body;
        assert.equal(refused.message, "This order is created by Maria Santos. Press Assist to hand this customer over yourself.");
        app.assertDatabaseHas("orders", { queue_num: 1, handed_over_by: null });

        const handed = (await maria.post("/admin/orders/1/handover")).assertStatus(200).body;
        assert.equal(handed.handedOver.by.name, "Maria Santos");
        app.assertDatabaseHas("serves", { user_id: maria.account.id });
    });

    test("an admin can still hand over someone else's customer", async () => {
        await salesFloor();
        const admin = await app.actingAsAdmin();

        (await admin.post("/admin/orders/1/handover")).assertStatus(200);
    });

    test("a kiosk ticket has no maker, so anyone in sales hands it over, as before", async () => {
        const { leo } = await salesFloor();
        (await app.client().post("/orders", { ...order, name: "Kiosk Customer" })).assertStatus(201);

        const kiosk = (await leo.get("/admin/orders/2")).assertStatus(200).body;
        assert.equal(kiosk.createdBy, undefined);
        (await leo.post("/admin/orders/2/handover")).assertStatus(200);
    });

    test("someone else assists the customer while the maker is away, and everyone sees who", async () => {
        const { maria, leo, ana } = await salesFloor();

        const assisted = (await leo.post("/admin/orders/1/assist")).assertStatus(200).body;
        assert.equal(assisted.assistedBy.name, "Leo Reyes");
        app.assertDatabaseHas("orders", { queue_num: 1, assisted_by: leo.account.id });

        const seen = (await maria.get("/admin/orders")).assertStatus(200).body;
        assert.equal(seen[0].assistedBy.id, leo.account.id);
        // pressing it again changes nothing
        (await leo.post("/admin/orders/1/assist")).assertStatus(200);

        // one at a time, and not the maker on their own ticket
        assert.equal((await ana.post("/admin/orders/1/assist")).assertStatus(409).body.message,
            "Leo Reyes is already assisting this customer.");
        (await maria.post("/admin/orders/1/assist")).assertStatus(409);

        // but not someone who isn't assisting
        (await ana.post("/admin/orders/1/handover")).assertStatus(403);
    });

    test("whoever assists can hand the customer over to the department, and the point is theirs", async () => {
        const { maria, leo } = await salesFloor();
        (await leo.post("/admin/orders/1/assist")).assertStatus(200);

        const handed = (await leo.post("/admin/orders/1/handover")).assertStatus(200).body;
        assert.equal(handed.handedOver.by.name, "Leo Reyes");
        assert.equal(handed.createdBy.name, "Maria Santos");
        app.assertDatabaseHas("serves", { user_id: leo.account.id });
        app.assertDatabaseMissing("serves", { user_id: maria.account.id });
    });

    test("once they stop assisting, the hand-over is the maker's again", async () => {
        const { leo } = await salesFloor();
        (await leo.post("/admin/orders/1/assist")).assertStatus(200);
        (await leo.delete("/admin/orders/1/assist")).assertStatus(200);

        (await leo.post("/admin/orders/1/handover")).assertStatus(403);
    });

    test("only the one assisting (or an admin) stops, which frees the customer for someone else", async () => {
        const { leo, ana } = await salesFloor();
        (await leo.post("/admin/orders/1/assist")).assertStatus(200);

        (await ana.delete("/admin/orders/1/assist")).assertStatus(403);
        const stopped = (await leo.delete("/admin/orders/1/assist")).assertStatus(200).body;
        assert.equal(stopped.assistedBy, undefined);

        (await ana.post("/admin/orders/1/assist")).assertStatus(200);
        (await (await app.actingAsAdmin()).delete("/admin/orders/1/assist")).assertStatus(200);
        app.assertDatabaseHas("orders", { queue_num: 1, assisted_by: null });
    });

    test("a customer already with loading can't be assisted, and keeps who assisted them", async () => {
        const { maria, leo } = await salesFloor();
        (await leo.post("/admin/orders/1/assist")).assertStatus(200);
        const handed = (await maria.post("/admin/orders/1/handover")).assertStatus(200).body;
        assert.equal(handed.assistedBy.name, "Leo Reyes");

        const late = await app.actingAsSales("Rosa Lim");
        (await late.post("/admin/orders/1/assist")).assertStatus(409);
    });

    test("a ticket made on the Order sheet is the maker's too", async () => {
        const { maria, leo } = await salesFloor();
        (await leo.post("/admin/order-sheet", { customer: "Sheet Customer", purpose: "Roofings", roofing: "3001" }))
            .assertStatus(201);

        const made = (await maria.get("/admin/orders/2")).assertStatus(200).body;
        assert.equal(made.createdBy.name, "Leo Reyes");
        (await maria.post("/admin/orders/2/handover")).assertStatus(403);
    });

    test("only sales and admins assist", async () => {
        await salesFloor();
        const loading = await app.actingAsLoading();

        (await loading.post("/admin/orders/1/assist")).assertStatus(403);
    });
});
