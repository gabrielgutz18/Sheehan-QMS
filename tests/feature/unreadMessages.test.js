// the message pop-ups: every staff page asks what's been written to the person signed in and not opened yet, across
// SheeChat and the developer chat, and asking must never mark anything as read
// run: npm test            only these: npm test -- --test-name-pattern="unread messages"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// the start of a PNG file, which is all the server checks before keeping it
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("picture")]);

describe("unread messages", () => {
    test("a SheeChat conversation shows its newest unopened message and how many, until it's opened", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();

        (await sales.post(`/admin/sheechat/${loading.account.id}`, { body: "Truck 2 is here." })).assertStatus(201);
        const newest = (await sales.post(`/admin/sheechat/${loading.account.id}`, { body: "At Roofings." })).assertStatus(201).body;

        const [popup, ...others] = (await loading.get("/admin/unread-messages")).assertStatus(200).body;
        assert.deepEqual(others, []);
        assert.equal(popup.kind, "sheechat");
        assert.equal(popup.id, newest.id);
        assert.equal(popup.body, "At Roofings.");
        assert.equal(popup.image, false);
        assert.equal(popup.unread, 2);
        assert.equal(popup.from.id, sales.account.id);
        assert.equal(popup.from.name, "Maria Santos");
        assert.equal(popup.from.disabled, false);

        // asking again reads nothing, so it's all still there, and still unread on their list
        assert.equal((await loading.get("/admin/unread-messages")).body[0].unread, 2);
        assert.equal((await loading.get("/admin/sheechat")).body[0].unread, 2);

        // nothing for the one who wrote it
        assert.deepEqual((await sales.get("/admin/unread-messages")).assertStatus(200).body, []);

        // opening the conversation is what reads it
        (await loading.get(`/admin/sheechat/${sales.account.id}`)).assertStatus(200);
        assert.deepEqual((await loading.get("/admin/unread-messages")).body, []);
    });

    test("a picture counts, with its caption as the message", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();

        (await sales.upload(`/admin/sheechat/${loading.account.id}/image?body=The%20dent`, png, "image/png")).assertStatus(201);

        const [popup] = (await loading.get("/admin/unread-messages")).body;
        assert.equal(popup.image, true);
        assert.equal(popup.body, "The dent");
    });

    test("a developer's answer shows for the staff member, as one conversation, until they open it", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();

        (await sales.post("/admin/messages", { body: "The printer is stuck." })).assertStatus(201);
        assert.deepEqual((await sales.get("/admin/unread-messages")).body, []);

        (await developer.post(`/admin/chats/${sales.account.id}`, { body: "Restart it." })).assertStatus(201);
        (await developer.post(`/admin/chats/${sales.account.id}`, { body: "Then try again." })).assertStatus(201);

        const [popup, ...others] = (await sales.get("/admin/unread-messages")).assertStatus(200).body;
        assert.deepEqual(others, []);
        assert.equal(popup.kind, "developer");
        assert.equal(popup.body, "Then try again.");
        assert.equal(popup.unread, 2);
        assert.equal(popup.from.name, "Dev Coder");

        (await sales.get("/admin/messages")).assertStatus(200);
        assert.deepEqual((await sales.get("/admin/unread-messages")).body, []);
    });

    test("what staff write shows for every developer, until any of them opens it", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        const developer = await app.actingAsDeveloper();
        const another = await app.actingAsDeveloper("Ana Dev");

        (await sales.post("/admin/messages", { body: "The printer is stuck." })).assertStatus(201);
        (await cashier.post("/admin/messages", { body: "Payments page is slow." })).assertStatus(201);

        const asked = (await developer.get("/admin/unread-messages")).assertStatus(200).body;
        assert.deepEqual(asked.map((m) => [m.kind, m.from.name, m.body, m.unread]), [
            ["staff", "Rosa Bayad", "Payments page is slow.", 1],
            ["staff", "Maria Santos", "The printer is stuck.", 1],
        ]);
        assert.equal((await another.get("/admin/unread-messages")).body.length, 2);

        // a developer's own answer is nothing to them
        (await developer.post(`/admin/chats/${sales.account.id}`, { body: "Restart it." })).assertStatus(201);
        assert.equal((await another.get("/admin/unread-messages")).body.length, 2);

        (await developer.get(`/admin/chats/${sales.account.id}`)).assertStatus(200);
        assert.deepEqual((await another.get("/admin/unread-messages")).body.map((m) => m.from.name), ["Rosa Bayad"]);
    });

    test("one person's conversations aren't shown to anyone else, newest first across both chats", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        const guard = await app.actingAsSecurity();
        const developer = await app.actingAsDeveloper();

        (await guard.post(`/admin/sheechat/${sales.account.id}`, { body: "For sales." })).assertStatus(201);
        (await developer.post(`/admin/chats/${sales.account.id}`, { body: "Answer for sales." })).assertStatus(201);

        assert.deepEqual((await sales.get("/admin/unread-messages")).body.map((m) => [m.kind, m.body]), [
            ["developer", "Answer for sales."],
            ["sheechat", "For sales."],
        ]);
        assert.deepEqual((await cashier.get("/admin/unread-messages")).assertStatus(200).body, []);
        // SheeChat isn't the developers' to see
        assert.deepEqual((await developer.get("/admin/unread-messages")).body, []);
    });

    test("every role may ask, and it needs a sign-in", async () => {
        for (const staff of [
            await app.actingAsAdmin(),
            await app.actingAsLoading(),
            await app.actingAsTba(),
            await app.actingAsChassis(),
            await app.actingAsHardware(),
            await app.actingAsSecurity(),
            await app.actingAsInventory(),
        ]) {
            (await staff.get("/admin/unread-messages")).assertStatus(200);
        }
        (await app.client().get("/admin/unread-messages")).assertStatus(401);
    });
});
