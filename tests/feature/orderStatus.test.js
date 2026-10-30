// the Order status board: every staff member (admin, sales and the loading crew) sees all of today's orders and where
// each customer is, from the line to a sales counter to loading, but none of the sales details beyond the sales team
// run: npm test            only these: npm test -- --test-name-pattern="order status"
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
    runner: "Boy Reyes",
    checkers: { Roofing: ["Pedro", ""] },
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

const board = async (staff) => (await staff.get("/admin/order-status")).assertStatus(200).body;

describe("order status", () => {
    test("every staff member can see it, and customers can't", async () => {
        await takeOrder();

        for (const staff of [await app.actingAsAdmin(), await app.actingAsSales(), await app.actingAsLoading()]) {
            assert.equal((await board(staff)).length, 1);
        }
        (await app.client().get("/admin/order-status")).assertStatus(401);
    });

    test("the loading crew sees every order, not just the ones handed over", async () => {
        await takeOrder();
        await takeOrder({ name: "Ana Reyes", purpose: "Tire", invoices: [{ invoiceNo: "3001", type: "Tire" }], team: "" });
        const pedro = await app.actingAsLoading("Pedro Garcia");

        // the Loading page still only gets the customers sales has handed over
        assert.deepEqual((await pedro.get("/admin/orders")).assertStatus(200).body, []);
        assert.deepEqual((await board(pedro)).map((o) => o.name), ["Juan Dela Cruz", "Ana Reyes"]);
    });

    test("it shows where the customer is, and nothing of the sale", async () => {
        await takeOrder({ pickupDate: null });

        const [listed] = await board(await app.actingAsLoading());

        assert.deepEqual(Object.keys(listed).sort(), ["areas", "createdAt", "name", "purpose", "queueNum", "status", "team"]);
        assert.equal(listed.status, "pending");
        assert.equal(listed.team, "GIGA");
        // the areas loading will load it in, in turn
        assert.deepEqual(listed.areas, [{ name: "Roofings" }, { name: "Steel" }]);
    });

    test("it follows the customer from the sales counter through each loading area to the security check", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading("Pedro Garcia");
        const now = async () => (await board(pedro))[0];

        // in line while sales takes the ticket and talks with them (sales don't call them)
        assert.equal((await now()).status, "pending");
        assert.equal((await now()).servedBy, undefined);
        assert.equal((await now()).handedOver, undefined);

        // handed over to loading, waiting for the loading crew
        (await maria.post("/admin/orders/1/handover")).assertStatus(200);
        assert.equal((await now()).handedOver, true);
        assert.equal((await now()).status, "pending");
        assert.equal((await now()).servedBy, undefined);

        // at loading in Roofings, then waiting for Steel
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);
        assert.equal((await now()).atLoading, true);
        assert.equal((await now()).loadingArea, "Roofings");
        assert.deepEqual((await now()).servedBy, { id: pedro.account.id, name: "Pedro Garcia", photo: null });
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        (await pedro.post("/admin/loading/1/done")).assertStatus(200);
        assert.equal((await now()).status, "pending");
        assert.equal((await now()).loadingArea, undefined);
        assert.deepEqual((await now()).areas.map(({ name, loaded }) => [name, loaded?.by.name]), [
            ["Roofings", "Pedro Garcia"],
            ["Steel", undefined],
        ]);

        // at loading in Steel, then done there, and waiting for the security check; the sales team stays
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);
        assert.equal((await now()).loadingArea, "Steel");
        (await pedro.post("/admin/loading/1/start")).assertStatus(200);
        (await pedro.post("/admin/loading/1/done")).assertStatus(200);
        assert.equal((await now()).status, "done");
        assert.equal((await now()).atLoading, undefined);
        assert.equal((await now()).security, "waiting");
        assert.equal((await now()).team, "GIGA");
        // loading only loaded it: the sales counter served them
        assert.deepEqual((await now()).servedBy, { id: maria.account.id, name: "Maria Santos", photo: null });
    });

    test("it shows the photo of whoever is serving the customer, for the Dashboard's In charge list", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading("Pedro Garcia");
        app.db.prepare("UPDATE users SET photo = ? WHERE id = ?").run(`user-${pedro.account.id}.jpg`, pedro.account.id);
        (await maria.post("/admin/orders/1/handover")).assertStatus(200);
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);

        // every role sees who has the customer, sales, the guards and the cashier too
        for (const staff of [maria, await app.actingAsSecurity(), await app.actingAsCashier()]) {
            const [listed] = await board(staff);
            assert.deepEqual(listed.servedBy, { id: pedro.account.id, name: "Pedro Garcia", photo: `user-${pedro.account.id}.jpg` });
        }
    });
});
