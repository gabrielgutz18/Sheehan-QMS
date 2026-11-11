// SheeChat: anyone on the staff chats with anyone else, the developers included, one conversation per pair of people,
// with pictures as in the developer chat; a problem with the system still goes to Message developer, for the whole team
// run: npm test            only these: npm test -- --test-name-pattern="SheeChat"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// the start of a PNG file, which is all the server checks before keeping it
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("picture")]);

describe("SheeChat", () => {
    test("two staff members chat, and opening the conversation reads it", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();

        const hello = (
            await sales.post(`/admin/sheechat/${loading.account.id}`, { body: "  Truck 2 is at Roofings.  " })
        ).assertStatus(201).body;
        assert.equal(hello.body, "Truck 2 is at Roofings.");
        assert.equal(hello.from.id, sales.account.id);
        assert.equal(hello.to, loading.account.id);
        assert.equal(hello.read, false);

        // the recipient sees it unread on their list
        const theirs = (await loading.get("/admin/sheechat")).assertStatus(200).body;
        assert.deepEqual(
            theirs.map((c) => [c.with.name, c.last.body, c.last.mine, c.unread]),
            [["Maria Santos", "Truck 2 is at Roofings.", false, 1]],
        );

        // opening it reads it, and they answer
        const thread = (await loading.get(`/admin/sheechat/${sales.account.id}`)).assertStatus(200).body;
        assert.deepEqual(
            thread.map((m) => m.body),
            ["Truck 2 is at Roofings."],
        );
        assert.equal((await loading.get("/admin/sheechat")).body[0].unread, 0);
        (await loading.post(`/admin/sheechat/${sales.account.id}`, { body: "On it." })).assertStatus(201);

        // the sender sees both, oldest first, and that theirs was seen
        const mine = (await sales.get(`/admin/sheechat/${loading.account.id}`)).assertStatus(200).body;
        assert.deepEqual(
            mine.map((m) => [m.body, m.from.id === sales.account.id, m.read]),
            [
                ["Truck 2 is at Roofings.", true, true],
                ["On it.", false, true],
            ],
        );
        assert.deepEqual(
            (await sales.get("/admin/sheechat")).body.map((c) => [c.with.name, c.last.body, c.last.mine]),
            [["Pedro Garcia", "On it.", false]],
        );
        app.assertDatabaseHas("direct_messages", {
            sender_id: loading.account.id,
            recipient_id: sales.account.id,
            body: "On it.",
        });
    });

    test("each person sees only their own conversations, newest first", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        const guard = await app.actingAsSecurity();

        (await sales.post(`/admin/sheechat/${cashier.account.id}`, { body: "Is 4335 paid?" })).assertStatus(201);
        (await sales.post(`/admin/sheechat/${guard.account.id}`, { body: "Customer 5 is coming out." })).assertStatus(
            201,
        );

        assert.deepEqual(
            (await sales.get("/admin/sheechat")).body.map((c) => c.with.name),
            ["Jose Bantay", "Rosa Bayad"],
        );
        assert.deepEqual(
            (await cashier.get("/admin/sheechat")).body.map((c) => c.with.name),
            ["Maria Santos"],
        );
        // the guard can't open the sales and cashier conversation: theirs with the cashier is empty
        assert.deepEqual((await guard.get(`/admin/sheechat/${cashier.account.id}`)).body, []);
    });

    test("the People list has everyone but you, the developers too", async () => {
        const admin = await app.actingAsAdmin();
        const sales = await app.actingAsSales();
        await app.actingAsService();
        const developer = await app.actingAsDeveloper();

        const people = (await sales.get("/admin/sheechat/people")).assertStatus(200).body;
        assert.deepEqual(
            people.map((p) => p.name).toSorted(),
            [admin.account.name, "Tony Gulong", developer.account.name].toSorted(),
        );
        assert.ok(people.every((p) => "online" in p && "role" in p));
    });

    test("a developer sees every department on People, and chats with staff and the other developers alike", async () => {
        const sales = await app.actingAsSales();
        const loading = await app.actingAsLoading();
        const developer = await app.actingAsDeveloper();
        const another = await app.actingAsDeveloper("Ana Dev");

        assert.deepEqual(
            (await developer.get("/admin/sheechat/people")).assertStatus(200).body.map((p) => p.name).toSorted(),
            // the built-in admin too
            ["Ana Dev", "admin", loading.account.name, sales.account.name].toSorted(),
        );

        // with another developer
        const hello = (
            await developer.post(`/admin/sheechat/${another.account.id}`, { body: "Deploy at noon?" })
        ).assertStatus(201).body;
        assert.equal(hello.to, another.account.id);
        assert.deepEqual(
            (await another.get("/admin/unread-messages")).body.map((m) => [m.kind, m.body]),
            [["sheechat", "Deploy at noon?"]],
        );

        // with the staff, both ways, between the two of them only: no other developer sees it
        (await developer.post(`/admin/sheechat/${sales.account.id}`, { body: "Is the printer fixed?" })).assertStatus(201);
        (await sales.post(`/admin/sheechat/${developer.account.id}`, { body: "Yes, thanks!" })).assertStatus(201);
        assert.deepEqual(
            (await sales.get("/admin/sheechat")).body.map((c) => [c.with.name, c.unread]),
            [[developer.account.name, 1]],
        );
        assert.deepEqual(
            (await developer.get(`/admin/sheechat/${sales.account.id}`)).body.map((m) => m.body),
            ["Is the printer fixed?", "Yes, thanks!"],
        );
        assert.deepEqual(
            (await another.get("/admin/sheechat")).body.map((c) => c.with.name),
            [developer.account.name],
        );
        (await sales.get(`/admin/sheechat/${developer.account.id}/profile`)).assertStatus(200);
        (await developer.get(`/admin/sheechat/${loading.account.id}/profile`)).assertStatus(200);
    });

    test("nobody chats with themselves, or someone who isn't there", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();

        (await developer.post(`/admin/sheechat/${developer.account.id}`, { body: "Hi" })).assertStatus(404);
        (await sales.post(`/admin/sheechat/${sales.account.id}`, { body: "Hi" })).assertStatus(404);
        (await sales.post("/admin/sheechat/9999", { body: "Hi" })).assertStatus(404);
        (await app.client().get("/admin/sheechat")).assertStatus(401);
        app.assertDatabaseCount("direct_messages", 0);
    });

    test("an empty or too long message isn't sent", async () => {
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();

        (await sales.post(`/admin/sheechat/${cashier.account.id}`, { body: "   " })).assertStatus(400);
        (await sales.post(`/admin/sheechat/${cashier.account.id}`, { body: "x".repeat(1001) })).assertStatus(400);
        app.assertDatabaseCount("direct_messages", 0);
    });

    test("someone switched off can't be sent messages, but the conversation can still be read", async () => {
        const admin = await app.actingAsAdmin();
        const sales = await app.actingAsSales();
        const cashier = await app.actingAsCashier();
        (await sales.post(`/admin/sheechat/${cashier.account.id}`, { body: "Before" })).assertStatus(201);

        (await admin.patch(`/admin/users/${cashier.account.id}`, { disabled: true })).assertStatus(200);

        (await sales.post(`/admin/sheechat/${cashier.account.id}`, { body: "After" })).assertStatus(409);
        assert.deepEqual(
            (await sales.get(`/admin/sheechat/${cashier.account.id}`)).assertStatus(200).body.map((m) => m.body),
            ["Before"],
        );
        assert.equal((await sales.get("/admin/sheechat")).body[0].with.disabled, true);
    });

    test("a picture is sent, and only the two people in the conversation can see it", async () => {
        const sales = await app.actingAsSales();
        const hardware = await app.actingAsHardware();
        const cashier = await app.actingAsCashier();
        const developer = await app.actingAsDeveloper();

        const shot = (
            await sales.upload(
                `/admin/sheechat/${hardware.account.id}/image?body=${encodeURIComponent(" This bolt ")}`,
                png,
                "image/png",
            )
        ).assertStatus(201).body;
        assert.equal(shot.image, true);
        assert.equal(shot.body, "This bolt");

        assert.deepEqual((await hardware.get(`/sheechat-images/${shot.id}`)).assertStatus(200).body, png);
        (await sales.get(`/sheechat-images/${shot.id}`)).assertStatus(200);
        (await cashier.get(`/sheechat-images/${shot.id}`)).assertStatus(404);
        (await developer.get(`/sheechat-images/${shot.id}`)).assertStatus(404);
        (await app.client().get(`/sheechat-images/${shot.id}`)).assertStatus(401);

        assert.deepEqual((await hardware.get("/admin/sheechat")).body[0].last, {
            body: "This bolt",
            image: true,
            sentAt: shot.sentAt,
            mine: false,
        });

        (
            await sales.upload(
                `/admin/sheechat/${hardware.account.id}/image`,
                Buffer.from("not a picture"),
                "image/png",
            )
        ).assertStatus(400);
        (await sales.upload(`/admin/sheechat/${hardware.account.id}/image`, png, "image/gif")).assertStatus(415);
    });
});
