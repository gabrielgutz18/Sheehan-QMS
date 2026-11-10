// the loading crew by area: an admin sets each loading account to Roofings, Steel or Logistics on Accounts, and the
// Loading tab there groups the crew by it; it only shows who works where, so the crew stays one shared line
// run: npm test -- --test-name-pattern="loading area"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { CREW_AREAS } from "../../src/data/loadingAreas.js";
import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

const account = (overrides = {}) => ({
    username: "pedro",
    name: "Pedro Garcia",
    password: "password1",
    role: "loading",
    ...overrides,
});

describe("a loading member's loading area", () => {
    test("the crew's areas are Roofings, Steel and Logistics", () => {
        assert.deepEqual(CREW_AREAS, ["Roofings", "Steel", "Logistics"]);
    });

    test("an admin makes a loading account at an area, or with none yet", async () => {
        const admin = await app.actingAsAdmin();
        const pedro = (await admin.post("/admin/users", account({ loadingArea: "Steel" }))).assertStatus(201).body;
        const ben = (await admin.post("/admin/users", account({ username: "ben", name: "Ben Cruz" }))).assertStatus(
            201,
        ).body;

        assert.equal(pedro.loadingArea, "Steel");
        assert.equal(ben.loadingArea, "");
        app.assertDatabaseHas("users", { username: "pedro", loading_area: "Steel" });
        const listed = (await admin.get("/admin/users")).assertStatus(200).body;
        assert.equal(listed.find((a) => a.username === "pedro").loadingArea, "Steel");
    });

    test("an area off the list is refused, and any other kind of account never gets one", async () => {
        const admin = await app.actingAsAdmin();
        (await admin.post("/admin/users", account({ loadingArea: "Service" }))).assertStatus(400);
        const maria = (
            await admin.post("/admin/users", account({ username: "maria", role: "sales", loadingArea: "Roofings" }))
        ).assertStatus(201).body;

        assert.equal(maria.loadingArea, "");
        (await admin.patch(`/admin/users/${maria.id}`, { loadingArea: "Roofings" })).assertStatus(400);
    });

    test("an admin moves someone to another area, and a move off the loading crew clears it", async () => {
        const admin = await app.actingAsAdmin();
        const pedro = (await admin.post("/admin/users", account({ loadingArea: "Roofings" }))).assertStatus(201).body;

        const moved = (await admin.patch(`/admin/users/${pedro.id}`, { loadingArea: "Logistics" })).assertStatus(
            200,
        ).body;
        assert.equal(moved.loadingArea, "Logistics");
        (await admin.patch(`/admin/users/${pedro.id}`, { loadingArea: "Hardware" })).assertStatus(400);
        const unset = (await admin.patch(`/admin/users/${pedro.id}`, { loadingArea: "" })).assertStatus(200).body;
        assert.equal(unset.loadingArea, "");

        await admin.patch(`/admin/users/${pedro.id}`, { loadingArea: "Steel" });
        const service = (await admin.patch(`/admin/users/${pedro.id}`, { role: "service" })).assertStatus(200).body;
        assert.equal(service.loadingArea, "");
    });

    test("a member signed in sees their own area, and it doesn't stop them calling at another", async () => {
        const admin = await app.actingAsAdmin();
        (await admin.post("/admin/users", account({ loadingArea: "Roofings" }))).assertStatus(201);
        const pedro = app.client();
        const me = (await pedro.post("/auth/login", { username: "pedro", password: "password1" })).assertStatus(
            200,
        ).body;
        assert.equal(me.loadingArea, "Roofings");

        const maria = await app.actingAsSales();
        (
            await app.client().post("/orders", {
                name: "Juan Dela Cruz",
                purpose: "Steel",
                orders: [],
                invoices: [{ invoiceNo: "101", type: "Steel" }],
                salesman: "Maria Santos",
                team: "GIGA",
                pickupDate: null,
            })
        ).assertStatus(201);
        (await maria.post("/admin/orders/1/handover")).assertStatus(200);
        assert.equal((await pedro.post("/admin/loading/1/call")).assertStatus(200).body.loadingArea, "Steel");
    });

    test("a developer can set the area too, as they manage accounts", async () => {
        const developer = await app.actingAsDeveloper();
        const pedro = (await developer.post("/admin/users", account({ loadingArea: "Logistics" }))).assertStatus(
            201,
        ).body;
        assert.equal(pedro.loadingArea, "Logistics");
    });
});

describe("the Loading page's Crew tab", () => {
    const crewOf = async (browser) => (await browser.get("/admin/loading/crew")).assertStatus(200).body;

    test("loading staff see the whole crew with each one's area, themselves marked", async () => {
        const admin = await app.actingAsAdmin();
        (
            await admin.post("/admin/users", account({ username: "ben", name: "Ben Cruz", loadingArea: "Steel" }))
        ).assertStatus(201);
        (
            await admin.post(
                "/admin/users",
                account({ username: "lito", name: "Lito Reyes", loadingArea: "Logistics" }),
            )
        ).assertStatus(201);
        (
            await admin.post("/admin/users", account({ username: "maria", name: "Maria Santos", role: "sales" }))
        ).assertStatus(201);
        const pedro = await app.actingAsLoading("Pedro Garcia");
        (await admin.patch(`/admin/users/${pedro.account.id}`, { loadingArea: "Roofings" })).assertStatus(200);

        const crew = await crewOf(pedro);
        const byName = Object.fromEntries(crew.map((m) => [m.name, m]));

        assert.deepEqual(Object.keys(byName).sort(), ["Ben Cruz", "Lito Reyes", "Pedro Garcia"]);
        assert.equal(byName["Ben Cruz"].loadingArea, "Steel");
        assert.equal(byName["Lito Reyes"].loadingArea, "Logistics");
        assert.equal(byName["Pedro Garcia"].loadingArea, "Roofings");
        assert.equal(byName["Pedro Garcia"].you, true);
        assert.equal(byName["Ben Cruz"].you, false);
        // signed in just now, so online; the others never have
        assert.equal(byName["Pedro Garcia"].online, true);
        assert.equal(byName["Ben Cruz"].online, false);
        assert.equal(crew[0].name, "Pedro Garcia");
        // only what a coworker may see
        assert.deepEqual(Object.keys(byName["Ben Cruz"]).sort(), [
            "id",
            "lastSeen",
            "loadingArea",
            "name",
            "online",
            "photo",
            "you",
        ]);
    });

    test("a switched-off account leaves the crew", async () => {
        const admin = await app.actingAsAdmin();
        const ben = (await admin.post("/admin/users", account({ username: "ben", name: "Ben Cruz" }))).assertStatus(
            201,
        ).body;
        (await admin.patch(`/admin/users/${ben.id}`, { disabled: true })).assertStatus(200);

        assert.deepEqual(
            (await crewOf(admin)).map((m) => m.name),
            [],
        );
    });

    test("only the loading crew and admins have it", async () => {
        await crewOf(await app.actingAsAdmin());
        for (const other of [
            await app.actingAsSales(),
            await app.actingAsService(),
            await app.actingAsSecurity(),
            await app.actingAsCashier(),
            await app.actingAsDeveloper(),
        ]) {
            (await other.get("/admin/loading/crew")).assertStatus(403);
        }
    });
});
