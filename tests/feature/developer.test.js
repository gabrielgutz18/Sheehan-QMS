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

    test("staff see the developer team, online ones first, and who has gone offline", async () => {
        const sales = await app.actingAsSales();
        const ana = await app.actingAsDeveloper("Ana Dev");
        const ben = await app.actingAsDeveloper("Ben Dev");
        const cara = await app.actingAsDeveloper("Cara Dev");
        const admin = await app.actingAsAdmin();

        // Ana signed out, Ben last used the app ten minutes ago, Cara is using it now; a switched-off one isn't listed
        (await ana.post("/auth/logout")).assertStatus(204);
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        app.db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(tenMinutesAgo, ben.account.id);
        const dan = await app.actingAsDeveloper("Dan Dev");
        (await admin.patch(`/admin/users/${dan.account.id}`, { disabled: true })).assertStatus(200);

        const team = (await sales.get("/admin/developers")).assertStatus(200).body;

        assert.deepEqual(team.map((d) => [d.name, d.online]), [
            ["Cara Dev", true],
            ["Ana Dev", false],
            ["Ben Dev", false],
        ]);
        assert.equal(team.find((d) => d.name === "Ben Dev").lastSeen, tenMinutesAgo);
        // the developers see their team too
        assert.equal((await cara.get("/admin/developers")).assertStatus(200).body.length, 3);
    });

    test("a developer sees every other staff member with who's online, for the Staff list by department", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        const developer = await app.actingAsDeveloper();
        await app.actingAsDeveloper("Other Dev");
        (await loading.patch("/admin/me", { firstName: "Pedro", surname: "Garcia", department: "Roofings" })).assertStatus(200);
        (await loading.post("/auth/logout")).assertStatus(204);

        const staff = (await developer.get("/admin/staff-presence")).assertStatus(200).body;

        // the built-in admin too, but no developers; online ones first
        assert.deepEqual(staff.map((s) => [s.name, s.role, s.online]), [
            ["admin", "admin", true],
            ["Maria Santos", "sales", true],
            ["Pedro Garcia", "loading", false],
        ]);
        assert.equal(staff.find((s) => s.role === "loading").department, "Roofings");

        // only the developers have it
        (await sales.get("/admin/staff-presence")).assertStatus(403);
        (await (await app.actingAsAdmin()).get("/admin/staff-presence")).assertStatus(403);
    });

    test("a developer can write to someone first, and the list says which developer answered last", async () => {
        const sales = await app.actingAsSales();
        const ana = await app.actingAsDeveloper("Ana Dev");
        const ben = await app.actingAsDeveloper("Ben Dev");

        (await ana.post(`/admin/chats/${sales.account.id}`, { body: "Is the printer working again?" })).assertStatus(201);

        const [chat] = (await ben.get("/admin/chats")).assertStatus(200).body;
        assert.equal(chat.staff.id, sales.account.id);
        assert.deepEqual(chat.last.from, { id: ana.account.id, name: "Ana Dev" });
        assert.equal(chat.last.fromStaff, false);
        assert.deepEqual((await sales.get("/admin/messages")).body.map((m) => m.from.name), ["Ana Dev"]);
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

    // the start of a PNG file, which is all the server checks before keeping it
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("picture")]);

    test("staff and developers send pictures, with or without a caption", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();

        const shot = (await sales.upload(`/admin/messages/image?body=${encodeURIComponent("  The screen says this  ")}`, png, "image/png"))
            .assertStatus(201).body;
        assert.equal(shot.image, true);
        assert.equal(shot.body, "The screen says this");
        assert.equal((await sales.post("/admin/messages", { body: "Help" })).assertStatus(201).body.image, false);

        const [chat] = (await developer.get("/admin/chats")).body;
        assert.equal(chat.last.image, false);
        const answer = (await developer.upload(`/admin/chats/${sales.account.id}/image`, png, "image/png")).assertStatus(201).body;
        assert.deepEqual([answer.image, answer.body, answer.fromStaff], [true, "", false]);
        const { last } = (await developer.get("/admin/chats")).body[0];
        assert.deepEqual([last.image, last.body], [true, ""]);

        // the picture itself, for the staff member whose conversation it is and for the developers
        const fromSales = (await sales.get(`/chat-images/${shot.id}`)).assertStatus(200).body;
        assert.deepEqual(fromSales, png);
        (await developer.get(`/chat-images/${answer.id}`)).assertStatus(200);
    });

    test("a picture is shown only in its own conversation, and must be a real picture", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        const developer = await app.actingAsDeveloper();

        const shot = (await sales.upload("/admin/messages/image", png, "image/png")).assertStatus(201).body;
        (await cashier.get(`/chat-images/${shot.id}`)).assertStatus(404);
        (await app.client().get(`/chat-images/${shot.id}`)).assertStatus(401);
        // a text message has no picture
        const text = (await sales.post("/admin/messages", { body: "Hi" })).body;
        (await developer.get(`/chat-images/${text.id}`)).assertStatus(404);

        (await sales.upload("/admin/messages/image", Buffer.from("not a picture"), "image/png")).assertStatus(400);
        (await sales.upload("/admin/messages/image", png, "image/gif")).assertStatus(415);
        (await sales.upload(`/admin/messages/image?body=${"x".repeat(1001)}`, png, "image/png")).assertStatus(400);
        (await sales.upload("/admin/messages/image", Buffer.alloc(5 * 1024 * 1024 + 1), "image/png")).assertStatus(413);
        // each side sends where it writes
        (await developer.upload("/admin/messages/image", png, "image/png")).assertStatus(403);
        (await sales.upload(`/admin/chats/${sales.account.id}/image`, png, "image/png")).assertStatus(403);
        (await developer.upload(`/admin/chats/${developer.account.id}/image`, png, "image/png")).assertStatus(404);

        app.assertDatabaseCount("messages", 2);
    });
});
