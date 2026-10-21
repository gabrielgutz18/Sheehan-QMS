// the life of a queue ticket, through the same API the kiosk, the display and the counters use:
// taken at the kiosk → waiting → called (serving) → done, and the ways back: reopen, send back, delete, restore
// run: npm test            only some: npm test -- --test-name-pattern="restoring"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { bootApp, localDay, ticket } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// a customer at the kiosk takes a ticket; returns it
const takeTicket = async (overrides) => (await app.client().post("/orders", ticket(overrides))).assertStatus(201).body;

const accountIn = async (admin, id) => (await admin.get("/admin/users")).assertStatus(200).body.find((a) => a.id === id);

describe("taking a ticket", () => {
    test("the kiosk hands out numbers from 1 and the customer waits in line", async () => {
        const kiosk = app.client();

        const first = (await kiosk.post("/orders", ticket())).assertStatus(201).body;
        const second = (await kiosk.post("/orders", ticket({ name: "Ana Reyes", purpose: "Tire" }))).assertStatus(201).body;

        assert.equal(first.queueNum, 1);
        assert.equal(second.queueNum, 2);
        assert.equal(first.status, "pending");
        assert.equal(first.servedBy, undefined);
        assert.deepEqual(first.orders, [{ item: "Long span", qty: 4, color: "red" }]);
        app.assertDatabaseHas("orders", { queue_date: localDay(), queue_num: 1, status: "pending", served_by: null });
        app.assertDatabaseCount("order_items", 2);
    });

    test("the display lists waiting numbers without what they ordered", async () => {
        await takeTicket();

        const { serving, upcoming } = (await app.client().get("/queue")).assertStatus(200).body;

        assert.deepEqual(serving, []);
        assert.deepEqual(upcoming, [{ queueNum: 1, name: "Juan Dela Cruz", purpose: "Roofings" }]);
    });

    test("a bad order is turned away without using up a number", async () => {
        const kiosk = app.client();

        (await kiosk.post("/orders", ticket({ orders: [] }))).assertStatus(400);
        (await kiosk.post("/orders", ticket({ name: "  " }))).assertStatus(400);
        (await kiosk.post("/orders", ticket({ orders: [{ item: "Long span", qty: 1, color: "purple" }] }))).assertStatus(400);
        (await kiosk.post("/orders", ticket({ orders: [{ item: "Long span", qty: 0 }] }))).assertStatus(400);

        app.assertDatabaseCount("orders", 0);
        assert.equal((await takeTicket()).queueNum, 1);
    });

    test("the customer can change their order while they wait", async () => {
        await takeTicket();

        const changed = (await app.client().put("/orders/1", ticket({ orders: [{ item: "Gutter", qty: 2 }] })))
            .assertStatus(200).body;

        assert.deepEqual(changed.orders, [{ item: "Gutter", qty: 2 }]);
        app.assertDatabaseHas("order_items", { item: "Gutter", qty: 2, color: null });
        app.assertDatabaseMissing("order_items", { item: "Long span" });
    });
});

describe("serving a ticket", () => {
    test("calling a ticket puts it on the display for the staff member who called it", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();

        const called = (await maria.post("/admin/orders/1/call", { remarks: "Counter 2" })).assertStatus(200).body;

        assert.equal(called.status, "serving");
        assert.deepEqual(called.servedBy, { id: maria.account.id, name: "Maria Santos", photo: null });
        assert.equal(called.servedAt, undefined);
        assert.equal(called.remarks, "Counter 2");
        assert.equal(typeof called.calledAt, "number");

        const { serving, upcoming } = (await app.client().get("/queue")).body;
        assert.deepEqual(serving.map((s) => [s.queueNum, s.remarks]), [[1, "Counter 2"]]);
        assert.deepEqual(upcoming, []);

        const admin = await app.actingAsAdmin();
        assert.equal((await accountIn(admin, maria.account.id)).servingNow, 1);
    });

    test("the latest call headlines the display, and a recall moves it back to the top", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        await takeTicket({ name: "Ana Reyes" });

        await maria.post("/admin/orders/1/call", { remarks: "Counter 2" });
        await sleep(5);
        await maria.post("/admin/orders/2/call", { remarks: "Counter 2" });
        assert.deepEqual((await app.client().get("/queue")).body.serving.map((s) => s.queueNum), [2, 1]);

        await sleep(5);
        (await maria.post("/admin/orders/1/call", { remarks: "Last call" })).assertStatus(200);
        const { serving } = (await app.client().get("/queue")).body;
        assert.deepEqual(serving.map((s) => [s.queueNum, s.remarks]), [[1, "Last call"], [2, "Counter 2"]]);
    });

    test("whoever calls the ticket last is the one serving it", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        const admin = await app.actingAsAdmin();

        await maria.post("/admin/orders/1/call");
        const taken = (await admin.post("/admin/orders/1/call")).assertStatus(200).body;

        assert.equal(taken.servedBy.id, admin.account.id);
        assert.equal((await accountIn(admin, maria.account.id)).servingNow, 0);
    });

    test("sending a customer back to waiting frees the counter", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        await maria.post("/admin/orders/1/call");

        const waiting = (await maria.patch("/admin/orders/1", { status: "pending" })).assertStatus(200).body;

        assert.equal(waiting.status, "pending");
        assert.equal(waiting.servedBy, undefined);
        assert.deepEqual((await app.client().get("/queue")).body.upcoming.map((u) => u.queueNum), [1]);
        app.assertDatabaseCount("serves", 0);
    });
});

describe("finishing a ticket", () => {
    test("marking it done marks it served by that person, with the time, and gives them one point", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        await maria.post("/admin/orders/1/call");

        const done = (await maria.patch("/admin/orders/1", { status: "done" })).assertStatus(200).body;

        assert.equal(done.status, "done");
        assert.deepEqual(done.servedBy, { id: maria.account.id, name: "Maria Santos", photo: null });
        assert.ok(Date.now() - Date.parse(done.servedAt) < 60_000, `servedAt ${done.servedAt} should be just now`);
        const [listed] = (await maria.get("/admin/orders")).assertStatus(200).body;
        assert.equal(listed.servedAt, done.servedAt);
        app.assertDatabaseHas("serves", { user_id: maria.account.id, queue_date: localDay() });
        assert.deepEqual((await app.client().get("/queue")).body, { serving: [], upcoming: [] });

        const { totals } = (await maria.get("/admin/me/stats?period=day")).assertStatus(200).body;
        assert.equal(totals.today, 1);
        assert.equal(totals.total, 1);

        const admin = await app.actingAsAdmin();
        assert.equal((await admin.get("/admin/stats?period=day")).body.servedToday, 1);
        assert.equal((await accountIn(admin, maria.account.id)).servedToday, 1);
    });

    test("marking it done twice still counts once", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        await maria.post("/admin/orders/1/call");

        (await maria.patch("/admin/orders/1", { status: "done" })).assertStatus(200);
        (await maria.patch("/admin/orders/1", { status: "done" })).assertStatus(200);

        app.assertDatabaseCount("serves", 1);
    });

    test("reopening a done ticket takes the point back", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        await maria.post("/admin/orders/1/call");
        await maria.patch("/admin/orders/1", { status: "done" });

        const reopened = (await maria.patch("/admin/orders/1", { status: "pending" })).assertStatus(200).body;

        assert.equal(reopened.status, "pending");
        assert.equal(reopened.servedBy, undefined);
        assert.equal(reopened.servedAt, undefined);
        app.assertDatabaseCount("serves", 0);
        assert.equal((await maria.get("/admin/me/stats?period=day")).body.totals.today, 0);
    });

    test("a ticket nobody called earns its point for whoever marks it done", async () => {
        await takeTicket();
        const admin = await app.actingAsAdmin();

        const done = (await admin.patch("/admin/orders/1", { status: "done" })).assertStatus(200).body;

        assert.equal(done.servedBy.id, admin.account.id);
        app.assertDatabaseHas("serves", { user_id: admin.account.id });
    });
});

describe("a returning customer", () => {
    test("a served customer who comes back is in line again, tagged on the display, with nobody serving them", async () => {
        await takeTicket();
        await takeTicket({ name: "Ana Reyes" });
        const maria = await app.actingAsSales();
        await maria.post("/admin/orders/1/call");
        await maria.patch("/admin/orders/1", { status: "done" });

        const returning = (await maria.patch("/admin/orders/1", { status: "returning" })).assertStatus(200).body;

        assert.equal(returning.status, "returning");
        assert.equal(returning.servedBy, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, status: "returning", served_by: null });
        const { serving, upcoming } = (await app.client().get("/queue")).body;
        assert.deepEqual(serving, []);
        assert.deepEqual(upcoming, [
            { queueNum: 1, name: "Juan Dela Cruz", purpose: "Roofings", returning: true },
            { queueNum: 2, name: "Ana Reyes", purpose: "Roofings" },
        ]);
    });

    test("their visit still earns one point, for whoever finishes it", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        const admin = await app.actingAsAdmin();
        await maria.post("/admin/orders/1/call");
        await maria.patch("/admin/orders/1", { status: "done" });

        await maria.patch("/admin/orders/1", { status: "returning" });
        app.assertDatabaseCount("serves", 0);

        const called = (await admin.post("/admin/orders/1/call")).assertStatus(200).body;
        assert.equal(called.status, "serving");
        await admin.patch("/admin/orders/1", { status: "done" });
        app.assertDatabaseCount("serves", 1);
        app.assertDatabaseHas("serves", { user_id: admin.account.id });
    });
});

describe("deleting and restoring", () => {
    test("a deleted ticket leaves the queue and the display but stays in History", async () => {
        await takeTicket();
        const admin = await app.actingAsAdmin();

        (await admin.delete("/admin/orders/1")).assertStatus(204);

        assert.deepEqual((await admin.get("/admin/orders")).body, []);
        assert.deepEqual((await app.client().get("/queue")).body, { serving: [], upcoming: [] });
        (await admin.get("/admin/orders/1")).assertStatus(404);

        const history = (await admin.get("/admin/history?deleted=1")).assertStatus(200).body;
        assert.equal(history.length, 1);
        assert.equal(history[0].queueNum, 1);
        assert.ok(history[0].deletedAt);

        // its number is never handed out again
        assert.equal((await takeTicket()).queueNum, 2);
    });

    test("restoring today's ticket puts it back in line with the same number", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        await maria.post("/admin/orders/1/call");
        const admin = await app.actingAsAdmin();
        await admin.delete("/admin/orders/1");
        const [{ id }] = (await admin.get("/admin/history?deleted=1")).body;

        const restored = (await maria.post(`/admin/history/${id}/restore`)).assertStatus(200).body;

        assert.equal(restored.queueNum, 1);
        assert.equal(restored.status, "pending");
        assert.equal(restored.servedBy, undefined);
        assert.equal(restored.servedAt, undefined);
        assert.deepEqual((await app.client().get("/queue")).body.upcoming.map((u) => u.queueNum), [1]);
        (await maria.post(`/admin/history/${id}/restore`)).assertStatus(409);
    });

    test("a ticket from an earlier day comes back with today's next number and keeps that day's point", async () => {
        await takeTicket();
        const admin = await app.actingAsAdmin();
        // yesterday's ticket 7, served by the admin; the API only makes tickets for today, so it goes straight in
        const yesterday = localDay(1);
        const { lastInsertRowid: id } = app.db
            .prepare(`INSERT INTO orders (queue_date, queue_num, name, purpose, status, created_at, served_by)
                      VALUES (?, 7, 'Pedro Reyes', 'Steel', 'done', ?, ?)`)
            .run(yesterday, `${yesterday}T09:00:00.000Z`, admin.account.id);
        app.db.prepare("INSERT INTO order_items (order_id, position, item, qty) VALUES (?, 0, 'Angle bar', 3)").run(id);
        app.db.prepare("INSERT INTO serves (order_id, user_id, queue_date, served_at) VALUES (?, ?, ?, ?)")
            .run(id, admin.account.id, yesterday, `${yesterday}T09:30:00.000Z`);

        const restored = (await admin.post(`/admin/history/${id}/restore`)).assertStatus(200).body;

        assert.equal(restored.queueNum, 2);
        assert.equal(restored.status, "pending");
        assert.deepEqual(restored.orders, [{ item: "Angle bar", qty: 3 }]);
        app.assertDatabaseHas("orders", { id, queue_date: localDay(), original_date: yesterday, original_num: 7 });

        // today's visit earns its own point; yesterday's stays
        await admin.post("/admin/orders/2/call");
        await admin.patch("/admin/orders/2", { status: "done" });
        app.assertDatabaseCount("serves", 2, { order_id: id });
    });
});

describe("who can do what", () => {
    test("customers can't call or finish tickets", async () => {
        await takeTicket();
        const stranger = app.client();

        (await stranger.post("/admin/orders/1/call")).assertStatus(401);
        (await stranger.patch("/admin/orders/1", { status: "done" })).assertStatus(401);
        app.assertDatabaseHas("orders", { queue_num: 1, status: "pending" });
    });

    test("staff requests without the app's header are refused", async () => {
        await takeTicket();

        const res = await fetch(app.url("/admin/orders/1/call"), { method: "POST" });

        assert.equal(res.status, 403);
    });

    test("sales staff can serve tickets but not delete them", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();

        (await maria.delete("/admin/orders/1")).assertStatus(403);
        (await maria.post("/admin/orders/1/call")).assertStatus(200);
    });

    test("sales staff can set any status, not just admins", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();

        for (const status of ["serving", "done", "returning", "pending"]) {
            const saved = (await maria.patch("/admin/orders/1", { status })).assertStatus(200).body;
            assert.equal(saved.status, status);
        }
        (await maria.get("/admin/orders")).assertStatus(200);
    });

    test("a switched-off account is signed out and can't serve", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();
        const admin = await app.actingAsAdmin();

        (await admin.patch(`/admin/users/${maria.account.id}`, { disabled: true })).assertStatus(200);

        (await maria.post("/admin/orders/1/call")).assertStatus(401);
    });

    test("unknown tickets, statuses and over-long remarks are refused", async () => {
        await takeTicket();
        const maria = await app.actingAsSales();

        (await maria.patch("/admin/orders/99", { status: "done" })).assertStatus(404);
        (await maria.post("/admin/orders/99/call")).assertStatus(404);
        (await maria.patch("/admin/orders/1", { status: "lost" })).assertStatus(400);
        (await maria.post("/admin/orders/1/call", { remarks: "x".repeat(121) })).assertStatus(400);
        app.assertDatabaseHas("orders", { queue_num: 1, status: "pending", served_by: null });
    });
});
