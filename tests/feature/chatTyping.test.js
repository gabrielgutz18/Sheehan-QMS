// "is typing" in a conversation: the page says you're writing every couple of seconds, it wears off by itself, and only
// the people in that conversation can see it
// run: npm test            only these: npm test -- --test-name-pattern="typing"
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

const names = (res) => res.assertStatus(200).body.map(({ name }) => name);

describe("typing on SheeChat", () => {
    test("the other person sees you typing, and you don't see yourself", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        const path = (id) => `/admin/sheechat/${id}/typing`;

        assert.deepEqual(names(await loading.get(path(sales.account.id))), []);

        (await sales.post(path(loading.account.id))).assertStatus(204);

        assert.deepEqual(names(await loading.get(path(sales.account.id))), ["Maria Santos"]);
        assert.deepEqual(names(await sales.get(path(loading.account.id))), []);
    });

    test("it stays between the two of them", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        const cashier = await app.actingAsCashier();

        (await sales.post(`/admin/sheechat/${loading.account.id}/typing`)).assertStatus(204);

        assert.deepEqual(names(await cashier.get(`/admin/sheechat/${sales.account.id}/typing`)), []);
        assert.deepEqual(names(await cashier.get(`/admin/sheechat/${loading.account.id}/typing`)), []);
    });

    test("sending the message ends it, text or picture", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        const typing = `/admin/sheechat/${loading.account.id}/typing`;
        const watching = `/admin/sheechat/${sales.account.id}/typing`;

        (await sales.post(typing)).assertStatus(204);
        (await sales.post(`/admin/sheechat/${loading.account.id}`, { body: "Truck 2 is here." })).assertStatus(201);
        assert.deepEqual(names(await loading.get(watching)), []);

        (await sales.post(typing)).assertStatus(204);
        (await sales.upload(`/admin/sheechat/${loading.account.id}/image`, png, "image/png")).assertStatus(201);
        assert.deepEqual(names(await loading.get(watching)), []);
    });

    test("it wears off when they stop, and comes back when they carry on", async (t) => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        const typing = `/admin/sheechat/${loading.account.id}/typing`;
        const watching = `/admin/sheechat/${sales.account.id}/typing`;
        // only the clock is faked: the requests themselves still need real timers
        t.mock.timers.enable({ apis: ["Date"], now: Date.now() });

        (await sales.post(typing)).assertStatus(204);
        t.mock.timers.tick(3000);
        assert.deepEqual(names(await loading.get(watching)), ["Maria Santos"]);

        t.mock.timers.tick(1000);
        assert.deepEqual(names(await loading.get(watching)), []);

        (await sales.post(typing)).assertStatus(204);
        assert.deepEqual(names(await loading.get(watching)), ["Maria Santos"]);
    });

    test("yourself, a developer, or someone who doesn't exist is not found", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();

        for (const id of [sales.account.id, developer.account.id, 9999]) {
            (await sales.get(`/admin/sheechat/${id}/typing`)).assertStatus(404);
            (await sales.post(`/admin/sheechat/${id}/typing`)).assertStatus(404);
        }
    });

    test("a developer has no typing on SheeChat", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();

        (await developer.get(`/admin/sheechat/${sales.account.id}/typing`)).assertStatus(403);
        (await developer.post(`/admin/sheechat/${sales.account.id}/typing`)).assertStatus(403);
    });
});

describe("typing with the developers", () => {
    test("a staff member and the developers see each other typing", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();

        (await sales.post("/admin/messages/typing")).assertStatus(204);
        assert.deepEqual(names(await developer.get(`/admin/chats/${sales.account.id}/typing`)), ["Maria Santos"]);
        assert.deepEqual(names(await sales.get("/admin/messages/typing")), []);

        (await developer.post(`/admin/chats/${sales.account.id}/typing`)).assertStatus(204);
        assert.deepEqual(names(await sales.get("/admin/messages/typing")), ["Dev Coder"]);
    });

    test("developers see one another answering, so two don't answer the same thing", async () => {
        const sales = await app.actingAsSales();
        const first = await app.actingAsDeveloper();
        const second = await app.actingAsDeveloper("Ana Kodigo");

        (await first.post(`/admin/chats/${sales.account.id}/typing`)).assertStatus(204);

        assert.deepEqual(names(await second.get(`/admin/chats/${sales.account.id}/typing`)), ["Dev Coder"]);
        assert.deepEqual(names(await first.get(`/admin/chats/${sales.account.id}/typing`)), []);
    });

    test("one staff member's conversation says nothing about another's", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        const developer = await app.actingAsDeveloper();

        (await developer.post(`/admin/chats/${sales.account.id}/typing`)).assertStatus(204);

        assert.deepEqual(names(await cashier.get("/admin/messages/typing")), []);
    });

    test("sending ends it, for an answer or a message, text or picture", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();
        const chat = `/admin/chats/${sales.account.id}`;

        (await sales.post("/admin/messages/typing")).assertStatus(204);
        (await sales.post("/admin/messages", { body: "The printer stopped." })).assertStatus(201);
        assert.deepEqual(names(await developer.get(`${chat}/typing`)), []);

        (await sales.post("/admin/messages/typing")).assertStatus(204);
        (await sales.upload("/admin/messages/image", png, "image/png")).assertStatus(201);
        assert.deepEqual(names(await developer.get(`${chat}/typing`)), []);

        (await developer.post(`${chat}/typing`)).assertStatus(204);
        (await developer.post(chat, { body: "Looking at it." })).assertStatus(201);
        assert.deepEqual(names(await sales.get("/admin/messages/typing")), []);

        (await developer.post(`${chat}/typing`)).assertStatus(204);
        (await developer.upload(`${chat}/image`, png, "image/png")).assertStatus(201);
        assert.deepEqual(names(await sales.get("/admin/messages/typing")), []);
    });

    test("only a developer watches a staff member's conversation, and not another developer's", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        const admin = await app.actingAsAdmin();
        const developer = await app.actingAsDeveloper();
        const other = await app.actingAsDeveloper("Ana Kodigo");

        (await cashier.get(`/admin/chats/${sales.account.id}/typing`)).assertStatus(403);
        (await cashier.post(`/admin/chats/${sales.account.id}/typing`)).assertStatus(403);
        (await admin.get(`/admin/chats/${sales.account.id}/typing`)).assertStatus(403);
        (await developer.get("/admin/messages/typing")).assertStatus(403);
        (await developer.post("/admin/messages/typing")).assertStatus(403);
        (await developer.get(`/admin/chats/${other.account.id}/typing`)).assertStatus(404);
        (await developer.post(`/admin/chats/9999/typing`)).assertStatus(404);
    });
});
