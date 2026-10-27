// Edited by: only signed-in admin and sales staff can change an order's details on Customer order, and every save that
// changes something is kept with who saved it, their own sales team at the time, when, and what changed; staff see
// them on the order, newest first
// run: npm test -- --test-name-pattern="edited by|sales team"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { bootApp, localDay, ticket } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

const takeTicket = async (overrides) => (await app.client().post("/orders", ticket(overrides))).assertStatus(201).body;

// a sales staff member whose sales team the admin has set on Accounts
const salesOnTeam = async (name, team) => {
    const desk = await app.actingAsSales(name);
    (await (await app.actingAsAdmin()).patch(`/admin/users/${desk.account.id}`, { team })).assertStatus(200);
    return desk;
};

// an ISO 8601 time from the last few seconds
const isJustNow = (iso) => Math.abs(Date.now() - Date.parse(iso)) < 10_000;

describe("edited by", () => {
    test("only signed-in admin and sales staff can save an order's details", async () => {
        await takeTicket();
        const changed = ticket({ runner: "Boy Reyes" });

        // the old route that took a save from anyone is gone
        (await app.client().put("/orders/1", changed)).assertStatus(404);
        (await app.client().put("/admin/orders/1", changed)).assertStatus(401);
        (await (await app.actingAsLoading()).put("/admin/orders/1", changed)).assertStatus(403);
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "" });
        app.assertDatabaseCount("order_edits", 0);

        (await (await app.actingAsSales()).put("/admin/orders/1", changed)).assertStatus(200);
        (await (await app.actingAsAdmin()).put("/admin/orders/1", ticket({ runner: "Ana Cruz" }))).assertStatus(200);
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "Ana Cruz" });
        app.assertDatabaseCount("order_edits", 2);
    });

    test("a save that changes something is kept with who saved it, their sales team, when and what changed", async () => {
        await takeTicket();
        const maria = await salesOnTeam("Maria Santos", "GIGA");

        const saved = (await maria.put("/admin/orders/1", ticket({ runner: "Boy Reyes" }))).assertStatus(200).body;

        assert.equal(saved.runner, "Boy Reyes");
        assert.equal(saved.edits.length, 1);
        const [edit] = saved.edits;
        assert.deepEqual(edit.by, { id: maria.account.id, name: "Maria Santos", photo: null });
        assert.equal(edit.team, "GIGA");
        assert.deepEqual(edit.changes, ["runner"]);
        assert.ok(isJustNow(edit.at), `edited at ${edit.at}`);
        app.assertDatabaseHas("order_edits", { user_id: maria.account.id, sales_team: "GIGA", changes: '["runner"]' });
    });

    test("every edit is kept, newest first, and staff see them on Orders, the ticket and History", async () => {
        await takeTicket();
        const maria = await salesOnTeam("Maria Santos", "GIGA");
        const admin = await app.actingAsAdmin();

        await maria.put("/admin/orders/1", ticket({ runner: "Boy Reyes" }));
        await admin.put("/admin/orders/1", ticket({ runner: "Boy Reyes", receiver: "Ana Cruz", orders: [{ item: "Gutter", qty: 2 }] }));

        const [listed] = (await maria.get("/admin/orders")).assertStatus(200).body;
        assert.deepEqual(listed.edits.map((e) => [e.by.name, e.team, e.changes]), [
            // the admin has no sales team, so the edit has none
            ["admin", undefined, ["receiver", "items"]],
            ["Maria Santos", "GIGA", ["runner"]],
        ]);
        const opened = (await maria.get("/admin/orders/1")).assertStatus(200).body;
        assert.deepEqual(opened.edits, listed.edits);
        const [inHistory] = (await maria.get(`/admin/history?day=${localDay()}`)).assertStatus(200).body;
        assert.deepEqual(inHistory.edits, listed.edits);
    });

    test("a save that changes nothing isn't an edit", async () => {
        await takeTicket();

        const saved = (await (await app.actingAsSales()).put("/admin/orders/1", ticket())).assertStatus(200).body;

        assert.equal(saved.edits, undefined);
        app.assertDatabaseCount("order_edits", 0);
    });

    test("an edit keeps the team its editor was on when they saved it", async () => {
        await takeTicket();
        const maria = await salesOnTeam("Maria Santos", "GIGA");
        await maria.put("/admin/orders/1", ticket({ runner: "Boy Reyes" }));

        // she moves to another team, then edits again
        (await (await app.actingAsAdmin()).patch(`/admin/users/${maria.account.id}`, { team: "MEGA" })).assertStatus(200);
        const saved = (await maria.put("/admin/orders/1", ticket({ runner: "Boy Reyes", salesman: "Maria Santos" })))
            .assertStatus(200).body;

        assert.deepEqual(saved.edits.map((e) => [e.team, e.changes]), [["MEGA", ["salesman"]], ["GIGA", ["runner"]]]);
    });
});

describe("sales team", () => {
    test("an admin gives an account a sales team from the list, changes it or takes it away", async () => {
        const admin = await app.actingAsAdmin();

        const made = (await admin.post("/admin/users", {
            username: "gabriel", name: "Gabriel Gutierrez", password: "sales-password", role: "sales", team: "GIGA",
        })).assertStatus(201).body;
        assert.equal(made.team, "GIGA");
        app.assertDatabaseHas("users", { username: "gabriel", sales_team: "GIGA" });

        // a department isn't a sales team
        (await admin.patch(`/admin/users/${made.id}`, { team: "Roofings" })).assertStatus(400);
        (await admin.post("/admin/users", {
            username: "pedro", name: "Pedro Garcia", password: "sales-password", team: "Steel",
        })).assertStatus(400);

        assert.equal((await admin.patch(`/admin/users/${made.id}`, { team: "ULTRA" })).assertStatus(200).body.team, "ULTRA");
        assert.equal((await admin.patch(`/admin/users/${made.id}`, { team: "" })).assertStatus(200).body.team, "");
    });

    test("staff see their own sales team, and only an admin can change it", async () => {
        const maria = await salesOnTeam("Maria Santos", "TERA");

        assert.equal((await maria.get("/auth/me")).assertStatus(200).body.team, "TERA");
        (await maria.patch(`/admin/users/${maria.account.id}`, { team: "GIGA" })).assertStatus(403);
    });
});
