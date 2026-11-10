// Chassis is one of the loading crew's areas, beside Roofings, Steel and Logistics (src/data/loadingAreas.js), no longer
// a department of its own: a customer who bought a Chassis is called to Chassis from the Loading page by anyone on the
// crew, and one who bought a Tire too goes to Service and Chassis in turn, one at a time
// run: npm test            only these: npm test -- --test-name-pattern="Chassis"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order for a Tire and a Chassis; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Tire, Chassis",
    orders: [],
    invoices: [
        { invoiceNo: "601", type: "Tire" },
        { invoiceNo: "602", type: "Chassis" },
    ],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});
const only = (type) => ({ purpose: type, invoices: [{ invoiceNo: "2223", type }] });

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// a sales counter, two on the loading crew (Carlos works at Chassis) and someone at Service
const staff = async () => {
    const carlos = await app.actingAsLoading("Carlos Tsasis");
    await (await app.actingAsAdmin()).patch(`/admin/users/${carlos.account.id}`, { loadingArea: "Chassis" });
    return {
        maria: await app.actingAsSales(),
        pedro: await app.actingAsLoading("Pedro Garcia"),
        tony: await app.actingAsService("Tony Gulong"),
        carlos,
    };
};

const handOver = async (sales, queueNum) => {
    return (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200).body;
};
const areasOf = (o) => o.areas.map(({ name, loaded }) => [name, loaded?.by.name]);

describe("Chassis", () => {
    test("a Chassis is loaded at Chassis by the loading crew, not Service", async () => {
        await takeOrder(only("Chassis"));
        const { maria, tony, carlos } = await staff();
        await handOver(maria, 1);

        (await tony.post("/admin/service/1/call")).assertStatus(409);
        assert.equal((await carlos.post("/admin/loading/1/call")).assertStatus(200).body.loadingArea, "Chassis");
        const started = (await carlos.post("/admin/loading/1/start", { area: "Chassis" })).assertStatus(200).body;
        assert.ok(started.loadingStartedAt);
        const done = (await carlos.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(done.status, "done");
        assert.equal(done.loaded.by.name, "Carlos Tsasis");
        assert.deepEqual(areasOf(done), [["Chassis", "Carlos Tsasis"]]);
        assert.equal(done.security, "waiting");
    });

    test("an order for a Tire and a Chassis is loaded at Service and Chassis in turn, then it's done", async () => {
        await takeOrder();
        const { maria, tony, carlos } = await staff();
        await handOver(maria, 1);

        (await tony.post("/admin/service/1/start", { area: "Service" })).assertStatus(200);
        // a customer is in one place at a time
        assert.equal(
            (await carlos.post("/admin/loading/1/call")).assertStatus(409).body.message,
            "Please wait until Tony Gulong finishes.",
        );
        (await carlos.post("/admin/loading/1/start", { area: "Chassis" })).assertStatus(409);
        const serviceDone = (await tony.post("/admin/service/1/done")).assertStatus(200).body;
        assert.equal(serviceDone.status, "pending");

        // nothing left for Service; the crew loads the Chassis straight away, no call needed
        (await tony.post("/admin/service/1/call")).assertStatus(409);
        (await carlos.post("/admin/loading/1/start", { area: "Chassis" })).assertStatus(200);
        const finished = (await carlos.post("/admin/loading/1/done")).assertStatus(200).body;
        assert.equal(finished.status, "done");
        assert.deepEqual(areasOf(finished), [
            ["Chassis", "Carlos Tsasis"],
            ["Service", "Tony Gulong"],
        ]);
    });

    test("a Roofings and Chassis order stays with the loading crew, one area after the other", async () => {
        await takeOrder({
            purpose: "Roofings, Chassis",
            invoices: [
                { invoiceNo: "701", type: "Roofings" },
                { invoiceNo: "702", type: "Chassis" },
            ],
        });
        const { maria, pedro, carlos } = await staff();
        await handOver(maria, 1);

        // the next area is Roofings, but the crew can call them to Chassis first
        assert.equal((await pedro.post("/admin/loading/1/call")).assertStatus(200).body.loadingArea, "Roofings");
        (await carlos.post("/admin/loading/1/call", { area: "Chassis" })).assertStatus(200);
        (await carlos.post("/admin/loading/1/start", { area: "Chassis" })).assertStatus(200);
        assert.equal(
            (await pedro.post("/admin/loading/1/call", { area: "Roofings" })).assertStatus(409).body.message,
            "Chassis is loading this truck. Please wait until it finishes.",
        );
        assert.equal((await carlos.post("/admin/loading/1/done")).assertStatus(200).body.status, "pending");

        (await pedro.post("/admin/loading/1/start", { area: "Roofings" })).assertStatus(200);
        const finished = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;
        assert.equal(finished.status, "done");
        assert.deepEqual(areasOf(finished), [
            ["Roofings", "Pedro Garcia"],
            ["Chassis", "Carlos Tsasis"],
        ]);
    });

    test("the loading crew sees the handed-over orders with a Chassis; the old Chassis routes are gone", async () => {
        await takeOrder({ name: "Ana Reyes", ...only("Tire") });
        await takeOrder({ name: "Liza Mendoza", ...only("Chassis") });
        await takeOrder({ name: "Carmela Cruz" });
        // still at the sales counter
        await takeOrder({ name: "Carlo Bautista", ...only("Chassis") });
        const { maria, tony, carlos } = await staff();
        for (const queueNum of [1, 2, 3]) await handOver(maria, queueNum);
        const names = async (account) => (await account.get("/admin/orders")).assertStatus(200).body.map((o) => o.name);

        assert.deepEqual(await names(carlos), ["Liza Mendoza", "Carmela Cruz"]);
        assert.deepEqual(await names(tony), ["Ana Reyes", "Carmela Cruz"]);
        (await carlos.post("/admin/service/1/call")).assertStatus(403);
        (await tony.post("/admin/loading/2/call")).assertStatus(403);
        (await carlos.post("/admin/chassis/2/call")).assertStatus(403);
        (await (await app.actingAsAdmin()).post("/admin/chassis/2/call")).assertStatus(404);
        (await (await app.actingAsAdmin()).get("/admin/department-history/chassis")).assertStatus(404);
    });

    test("there's no Chassis role any more: Chassis staff are loading accounts set to the Chassis area", async () => {
        const admin = await app.actingAsAdmin();
        const refused = (
            await admin.post("/admin/users", {
                username: "carlos",
                name: "Carlos Tsasis",
                password: "password1",
                role: "chassis",
            })
        ).assertStatus(400).body;
        assert.match(refused.message, /^Pick admin, sales, loading, service, hardware/);

        const created = (
            await admin.post("/admin/users", {
                username: "carlos",
                name: "Carlos Tsasis",
                password: "password1",
                role: "loading",
                loadingArea: "Chassis",
            })
        ).assertStatus(201).body;
        assert.equal(created.role, "loading");
        app.assertDatabaseHas("users", { username: "carlos", role: "loading", loading_area: "Chassis" });

        const tony = await app.actingAsService("Tony Gulong");
        (await admin.patch(`/admin/users/${tony.account.id}`, { role: "chassis" })).assertStatus(400);
    });
});
