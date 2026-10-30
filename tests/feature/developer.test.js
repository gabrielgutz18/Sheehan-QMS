// the developers: the team that builds the app; when something doesn't go well, any staff member writes to them from
// Message developer, and they answer on the Chat page; besides that they have only the Order status board and
// Accounts (where they can't make or change an admin account) and their own account
// run: npm test            only these: npm test -- --test-name-pattern="developer"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp, ticket } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

describe("developer", () => {
    test("an admin makes a developer account", async () => {
        const admin = await app.actingAsAdmin();

        const made = (await admin.post("/admin/users", {
            username: "dev", name: "Dev Coder", password: "developer-password", role: "developer",
        })).assertStatus(201).body;

        assert.equal(made.role, "developer");
        app.assertDatabaseHas("users", { username: "dev", role: "developer" });
    });

    test("a developer has the Order status board and their account, and nothing in the queue", async () => {
        (await app.client().post("/orders", ticket())).assertStatus(201);
        const developer = await app.actingAsDeveloper();

        const board = (await developer.get("/admin/order-status")).assertStatus(200).body;
        assert.equal(board.length, 1);
        (await developer.patch("/admin/me", { firstName: "Dev", surname: "Coder" })).assertStatus(200);

        for (const [method, path] of [
            ["get", "/admin/orders"],
            ["get", "/admin/payments"],
            ["get", "/admin/security"],
            ["get", "/admin/order-sheet"],
            ["get", "/admin/history"],
            ["post", "/admin/orders/1/call"],
            ["patch", "/admin/orders/1"],
            ["delete", "/admin/orders/1"],
            ["put", "/admin/video"],
        ]) {
            (await developer[method](path, {})).assertStatus(403);
        }
    });

    test("a developer makes and changes staff accounts, but not admin ones", async () => {
        const developer = await app.actingAsDeveloper();

        const made = (await developer.post("/admin/users", {
            username: "maria", name: "Maria Santos", password: "sales-password", role: "sales",
        })).assertStatus(201).body;
        (await developer.patch(`/admin/users/${made.id}`, { role: "cashier", password: "a-new-password" })).assertStatus(200);
        app.assertDatabaseHas("users", { username: "maria", role: "cashier" });
        assert.ok((await developer.get("/admin/users")).assertStatus(200).body.some((a) => a.username === "maria"));

        (await developer.post("/admin/users", {
            username: "boss", name: "New Boss", password: "admin-password", role: "admin",
        })).assertStatus(403);
        (await developer.patch(`/admin/users/${made.id}`, { role: "admin" })).assertStatus(403);
        const builtIn = app.db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
        (await developer.patch(`/admin/users/${builtIn.id}`, { name: "Someone Else" })).assertStatus(403);

        app.assertDatabaseMissing("users", { username: "boss" });
        app.assertDatabaseHas("users", { username: "maria", role: "cashier" });
    });

    test("staff write to the developers, and a developer answers on the Chat page", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        const developer = await app.actingAsDeveloper();

        const asked = (await sales.post("/admin/messages", { body: "  The printer won't print my ticket.  " })).assertStatus(201).body;
        assert.equal(asked.body, "The printer won't print my ticket.");
        assert.equal(asked.fromStaff, true);
        assert.equal(asked.from.name, "Maria Santos");
        (await cashier.post("/admin/messages", { body: "Payments page is slow." })).assertStatus(201);

        // newest first, with what nobody has read yet
        const chats = (await developer.get("/admin/chats")).assertStatus(200).body;
        assert.deepEqual(chats.map((c) => [c.staff.name, c.last.body, c.unread]), [
            ["Rosa Bayad", "Payments page is slow.", 1],
            ["Maria Santos", "The printer won't print my ticket.", 1],
        ]);

        // opening a conversation reads it
        const thread = (await developer.get(`/admin/chats/${sales.account.id}`)).assertStatus(200).body;
        assert.deepEqual(thread.map((m) => m.body), ["The printer won't print my ticket."]);
        const read = (await developer.get("/admin/chats")).body.find((c) => c.staff.id === sales.account.id);
        assert.equal(read.unread, 0);

        const answer = (await developer.post(`/admin/chats/${sales.account.id}`, { body: "Try turning it off and on." }))
            .assertStatus(201).body;
        assert.equal(answer.fromStaff, false);
        assert.equal(answer.from.role, "developer");

        // the staff member sees the answer in their own conversation, and the developer sees they've seen it
        const mine = (await sales.get("/admin/messages")).assertStatus(200).body;
        assert.deepEqual(mine.map((m) => [m.body, m.fromStaff]), [
            ["The printer won't print my ticket.", true],
            ["Try turning it off and on.", false],
        ]);
        const after = (await developer.get(`/admin/chats/${sales.account.id}`)).body;
        assert.equal(after.at(-1).read, true);

        // each staff member sees only their own
        assert.deepEqual((await cashier.get("/admin/messages")).body.map((m) => m.body), ["Payments page is slow."]);
    });

    test("an admin writes to the developers too, but can't read the Chat page", async () => {
        const admin = await app.actingAsAdmin();

        (await admin.post("/admin/messages", { body: "The display froze." })).assertStatus(201);
        (await admin.get("/admin/chats")).assertStatus(403);
        (await admin.get(`/admin/chats/${admin.account.id}`)).assertStatus(403);
    });

    test("a message needs some text, up to 1000 characters, and goes only where it should", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();

        (await sales.post("/admin/messages", { body: "   " })).assertStatus(400);
        (await sales.post("/admin/messages", { body: "x".repeat(1001) })).assertStatus(400);
        (await sales.post("/admin/messages", {})).assertStatus(400);
        (await sales.get("/admin/chats")).assertStatus(403);
        // a developer answers on the Chat page, not by writing to themselves
        (await developer.post("/admin/messages", { body: "Hello" })).assertStatus(403);
        (await developer.post(`/admin/chats/${developer.account.id}`, { body: "Hello" })).assertStatus(404);
        (await developer.post("/admin/chats/9999", { body: "Hello" })).assertStatus(404);

        app.assertDatabaseCount("messages", 0);
    });
});
