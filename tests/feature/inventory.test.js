// the inventory department: a kind of staff account with no work page of its own yet; it has the Order status board,
// SheeChat, Message developer and its own account, and nothing in the queue it can call, change or save
// run: npm test            only these: npm test -- --test-name-pattern="inventory"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp, ticket } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

describe("inventory", () => {
    test("an admin makes an inventory account, and a developer can too", async () => {
        const admin = await app.actingAsAdmin();
        const developer = await app.actingAsDeveloper();

        (await admin.post("/admin/users", {
            username: "ines", name: "Ines Bodega", password: "inventory-password", role: "inventory",
        })).assertStatus(201);
        (await developer.post("/admin/users", {
            username: "carlo", name: "Carlo Stock", password: "inventory-password", role: "inventory",
        })).assertStatus(201);

        app.assertDatabaseCount("users", 2, { role: "inventory" });
    });

    test("inventory has the Order status board, SheeChat, Message developer and their account", async () => {
        (await app.client().post("/orders", ticket())).assertStatus(201);
        const inventory = await app.actingAsInventory();
        const sales = await app.actingAsSales();

        assert.equal((await inventory.get("/admin/order-status")).assertStatus(200).body.length, 1);
        (await inventory.post(`/admin/sheechat/${sales.account.id}`, { body: "Long span is low." })).assertStatus(201);
        (await inventory.post("/admin/messages", { body: "Can we get a stock page?" })).assertStatus(201);
        (await inventory.patch("/admin/me", { firstName: "Ines", surname: "Bodega" })).assertStatus(200);

        // the others see them on SheeChat
        const people = (await sales.get("/admin/sheechat/people")).body;
        assert.ok(people.some((p) => p.name === "Ines Bodega" && p.role === "inventory"));
    });

    test("inventory can't call, change or see the queue's sales details", async () => {
        (await app.client().post("/orders", ticket())).assertStatus(201);
        const inventory = await app.actingAsInventory();

        for (const [method, path] of [
            ["get", "/admin/orders"],
            ["get", "/admin/payments"],
            ["get", "/admin/security"],
            ["get", "/admin/order-sheet"],
            ["get", "/admin/history"],
            ["get", "/admin/users"],
            ["post", "/admin/orders/1/call"],
            ["post", "/admin/loading/1/call"],
            ["patch", "/admin/orders/1"],
            ["delete", "/admin/orders/1"],
        ]) {
            (await inventory[method](path, {})).assertStatus(403);
        }
    });
});
