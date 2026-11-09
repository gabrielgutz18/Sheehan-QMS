// Drop account on the Accounts page: gone for good for admins and developers, with the tickets still saying who did the
// work and the chats showing "Deleted account"
// run: npm test -- --test-name-pattern="drop"
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { bootApp, ticket } from "../support/testApp.js";

const DELETED = "Deleted account";

let app;
let admin;
let maria;
let pedro;

beforeEach(async () => {
    app = await bootApp();
    admin = await app.actingAsAdmin();
    maria = await app.actingAsSales();
    pedro = await app.actingAsLoading();
});

afterEach(() => app.close());

const switchOff = async (account) =>
    (await admin.patch(`/admin/users/${account.id}`, { disabled: true })).assertStatus(200);
const drop = async (account, by = admin) => {
    await switchOff(account);
    return by.delete(`/admin/users/${account.id}`);
};

test("an account has to be switched off before it can be dropped", async () => {
    (await admin.delete(`/admin/users/${maria.account.id}`)).assertStatus(409);
    assert.equal(app.db.prepare("SELECT dropped_at FROM users WHERE id = ?").get(maria.account.id).dropped_at, null);
});

test("a dropped account can't sign in, leaves Accounts, and frees its username and employee ID", async () => {
    app.db.prepare("UPDATE users SET employee_id = 'E-7' WHERE id = ?").run(maria.account.id);

    (await drop(maria.account)).assertStatus(204);

    const accounts = (await admin.get("/admin/users")).assertStatus(200).body;
    assert.equal(
        accounts.some((a) => a.id === maria.account.id),
        false,
    );
    (await app.client().post("/auth/login", { username: "maria.santos", password: "sales-password" })).assertStatus(
        401,
    );
    (await maria.get("/auth/me")).assertStatus(401);
    app.assertDatabaseCount("sessions", 0, { user_id: maria.account.id });

    const again = { username: "maria.santos", name: "Maria Reyes", password: "new-password-1", role: "sales" };
    (await admin.post("/admin/users", again)).assertStatus(201);
    app.db.prepare("UPDATE users SET employee_id = 'E-7' WHERE username = ?").run(again.username);
});

test("dropping erases the photos and details, and keeps only the name", async () => {
    const photos = join(app.dataDir, "photos");
    writeFileSync(join(photos, "m.jpg"), "photo");
    writeFileSync(join(photos, "m-cover.jpg"), "cover");
    app.db
        .prepare(
            `UPDATE users SET photo = 'm.jpg', cover_photo = 'm-cover.jpg', middle_name = 'Cruz', department = 'Roofings',
        sales_team = 'GIGA', last_seen = 1 WHERE id = ?`,
        )
        .run(maria.account.id);

    (await drop(maria.account)).assertStatus(204);

    const row = app.db.prepare("SELECT * FROM users WHERE id = ?").get(maria.account.id);
    assert.equal(row.name, "Maria Santos");
    assert.deepEqual(
        [row.first_name, row.middle_name, row.surname, row.department, row.sales_team],
        ["", "", "", "", ""],
    );
    assert.deepEqual([row.photo, row.cover_photo, row.employee_id, row.last_seen], [null, null, null, null]);
    assert.ok(row.dropped_at);
    assert.equal(existsSync(join(photos, "m.jpg")), false);
    assert.equal(existsSync(join(photos, "m-cover.jpg")), false);
});

test("a ticket the dropped person worked on still has their name, and their points stay", async () => {
    const order = (await maria.post("/orders", ticket({ salesman: "Maria Santos" }))).assertStatus(201).body;
    (await maria.post(`/admin/orders/${order.queueNum}/handover`)).assertStatus(200);

    (await drop(maria.account)).assertStatus(204);

    const saved = (await admin.get(`/admin/orders/${order.queueNum}`)).assertStatus(200).body;
    assert.equal(saved.handedOver.by.name, "Maria Santos");
    app.assertDatabaseCount("serves", 1, { user_id: maria.account.id });
});

test("SheeChat keeps the conversation and shows Deleted account, and can't be added to", async () => {
    (await maria.post(`/admin/sheechat/${pedro.account.id}`, { body: "Truck 2 is at Roofings." })).assertStatus(201);
    (await drop(maria.account)).assertStatus(204);

    const [chat] = (await pedro.get("/admin/sheechat")).assertStatus(200).body;
    assert.equal(chat.with.name, DELETED);
    assert.equal(chat.with.deleted, true);
    assert.equal(chat.with.role, "");
    assert.equal(chat.last.body, "Truck 2 is at Roofings.");

    const [message] = (await pedro.get(`/admin/sheechat/${maria.account.id}`)).assertStatus(200).body;
    assert.equal(message.from.name, DELETED);
    assert.equal(message.body, "Truck 2 is at Roofings.");

    const refused = (await pedro.post(`/admin/sheechat/${maria.account.id}`, { body: "Hello?" })).assertStatus(409);
    assert.doesNotMatch(refused.body.message, /Maria/);

    const profile = (await pedro.get(`/admin/sheechat/${maria.account.id}/profile`)).assertStatus(200).body;
    assert.equal(profile.name, DELETED);
    assert.equal(profile.deleted, true);
    assert.equal(profile.createdAt, null);
});

test("the unread pop-ups show Deleted account too", async () => {
    (await maria.post(`/admin/sheechat/${pedro.account.id}`, { body: "Are you there?" })).assertStatus(201);
    (await drop(maria.account)).assertStatus(204);

    const [unread] = (await pedro.get("/admin/unread-messages")).assertStatus(200).body;
    assert.equal(unread.from.name, DELETED);
});

test("the developer chat shows Deleted account and can't be answered", async () => {
    const developer = await app.actingAsDeveloper();
    (await maria.post("/admin/messages", { body: "The printer is stuck." })).assertStatus(201);
    (await drop(maria.account)).assertStatus(204);

    const [chat] = (await developer.get("/admin/chats")).assertStatus(200).body;
    assert.equal(chat.staff.name, DELETED);
    assert.equal(chat.staff.deleted, true);
    const [message] = (await developer.get(`/admin/chats/${maria.account.id}`)).assertStatus(200).body;
    assert.equal(message.from.name, DELETED);
    (await developer.post(`/admin/chats/${maria.account.id}`, { body: "Is it fixed?" })).assertStatus(409);
});

test("a developer can drop staff but not an admin", async () => {
    const developer = await app.actingAsDeveloper();
    (await drop(maria.account, developer)).assertStatus(204);

    const other = { username: "second.admin", name: "Second Admin", password: "second-password", role: "admin" };
    const { body: secondAdmin } = (await admin.post("/admin/users", other)).assertStatus(201);
    (await drop(secondAdmin, developer)).assertStatus(403);
    (await admin.delete(`/admin/users/${secondAdmin.id}`)).assertStatus(204);
});

test("only admins and developers can drop an account", async () => {
    await switchOff(pedro.account);
    for (const who of [maria, await app.actingAsCashier(), await app.actingAsSecurity()]) {
        (await who.delete(`/admin/users/${pedro.account.id}`)).assertStatus(403);
    }
    (await app.client().delete(`/admin/users/${pedro.account.id}`)).assertStatus(401);
    assert.equal(app.db.prepare("SELECT dropped_at FROM users WHERE id = ?").get(pedro.account.id).dropped_at, null);
});

test("nobody can drop their own account or the built-in admin", async () => {
    const developer = await app.actingAsDeveloper();
    app.db.prepare("UPDATE users SET disabled_at = 'x' WHERE id = ?").run(admin.account.id);
    (await developer.delete(`/admin/users/${admin.account.id}`)).assertStatus(403);
    app.db.prepare("UPDATE users SET disabled_at = NULL WHERE id = ?").run(admin.account.id);

    const other = await app.actingAsDeveloper("Second Dev");
    (await other.delete(`/admin/users/${other.account.id}`)).assertStatus(400);
    (await admin.delete(`/admin/users/${admin.account.id}`)).assertStatus(400);
});

test("an account can only be dropped once, and can't be changed afterwards", async () => {
    (await drop(maria.account)).assertStatus(204);
    (await admin.delete(`/admin/users/${maria.account.id}`)).assertStatus(404);
    (await admin.patch(`/admin/users/${maria.account.id}`, { disabled: false })).assertStatus(404);
    (await admin.delete("/admin/users/9999")).assertStatus(404);
});
