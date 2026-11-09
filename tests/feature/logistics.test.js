// the Logistics page: Logistics is its own department, working like the loading crew for its own area
// (src/data/loadingAreas.js). Its orders come in as one tentative type, "For Logistics", with tickets starting LA. A
// sales counter hands the customer over just the same; a customer with a For Logistics order is called from the Logistics
// page, and one who bought steel or a Tire too goes to each department in turn, one at a time
// run: npm test            only these: npm test -- --test-name-pattern="Logistics"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { invoicesByColumn } from "../../src/admin/data/sheetColumns.js";
import { HISTORY_LISTS } from "../../src/data/loadingAreas.js";
import purpose from "../../src/data/purpose.js";
import formatQueueNum from "../../src/data/queueNum.js";
import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "For Logistics",
    orders: [],
    invoices: [{ invoiceNo: "701", type: "For Logistics" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;

// a sales counter, someone on the loading crew, someone at Logistics and someone at Service
const staff = async () => ({
    maria: await app.actingAsSales(),
    pedro: await app.actingAsLoading("Pedro Garcia"),
    lito: await app.actingAsLogistics("Lito Reyes"),
    tony: await app.actingAsService("Tony Gulong"),
});

const handOver = async (sales, queueNum) =>
    (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200).body;
const areasOf = (o) => o.areas.map(({ name, loaded }) => [name, loaded?.by.name]);

describe("Logistics", () => {
    test("a For Logistics order is loaded at Logistics, by the Logistics department, then goes to the gate", async () => {
        await takeOrder();
        const { maria, pedro, lito } = await staff();
        await handOver(maria, 1);

        // not the loading crew's
        (await pedro.post("/admin/loading/1/call")).assertStatus(409);
        assert.equal((await lito.post("/admin/logistics/1/call")).assertStatus(200).body.loadingArea, "Logistics");
        const started = (await lito.post("/admin/logistics/1/start", { area: "Logistics" })).assertStatus(200).body;
        assert.ok(started.loadingStartedAt);
        const done = (await lito.post("/admin/logistics/1/done")).assertStatus(200).body;

        assert.equal(done.status, "done");
        assert.deepEqual(areasOf(done), [["Logistics", "Lito Reyes"]]);
        assert.equal(done.security, "waiting");
    });

    test("an order for Steel, For Logistics and a Tire goes to Steel, then Logistics, then Service, one at a time", async () => {
        await takeOrder({
            purpose: "Steel, Tire, For Logistics",
            invoices: [
                { invoiceNo: "101", type: "Steel" },
                { invoiceNo: "601", type: "Tire" },
                { invoiceNo: "701", type: "For Logistics" },
            ],
        });
        const { maria, pedro, lito, tony } = await staff();
        await handOver(maria, 1);

        (await pedro.post("/admin/loading/1/start", { area: "Steel" })).assertStatus(200);
        // a customer is in one place at a time
        assert.equal(
            (await lito.post("/admin/logistics/1/call")).assertStatus(409).body.message,
            "Please wait until Pedro Garcia finishes.",
        );
        assert.equal((await pedro.post("/admin/loading/1/done")).assertStatus(200).body.status, "pending");

        (await lito.post("/admin/logistics/1/start", { area: "Logistics" })).assertStatus(200);
        (await tony.post("/admin/service/1/start", { area: "Service" })).assertStatus(409);
        assert.equal((await lito.post("/admin/logistics/1/done")).assertStatus(200).body.status, "pending");

        (await tony.post("/admin/service/1/start", { area: "Service" })).assertStatus(200);
        const finished = (await tony.post("/admin/service/1/done")).assertStatus(200).body;
        assert.equal(finished.status, "done");
        assert.deepEqual(areasOf(finished), [
            ["Steel", "Pedro Garcia"],
            ["Logistics", "Lito Reyes"],
            ["Service", "Tony Gulong"],
        ]);
    });

    test("its accounts see only the handed-over orders it has a part in; its routes are its own", async () => {
        await takeOrder({ name: "Ana Reyes", purpose: "Roofings", invoices: [{ invoiceNo: "1", type: "Roofings" }] });
        await takeOrder({ name: "Liza Mendoza", invoices: [{ invoiceNo: "2", type: "For Logistics" }] });
        // still at the sales counter
        await takeOrder({ name: "Carlo Bautista" });
        const { maria, pedro, lito } = await staff();
        for (const queueNum of [1, 2]) await handOver(maria, queueNum);
        const names = async (account) => (await account.get("/admin/orders")).assertStatus(200).body.map((o) => o.name);

        assert.deepEqual(await names(pedro), ["Ana Reyes"]);
        assert.deepEqual(await names(lito), ["Liza Mendoza"]);
        (await lito.get("/admin/order-status")).assertStatus(200);
        (await lito.post("/admin/loading/1/call")).assertStatus(403);
        (await lito.post("/admin/service/2/call")).assertStatus(403);
        (await pedro.post("/admin/logistics/2/call")).assertStatus(403);
        (await maria.post("/admin/logistics/2/call")).assertStatus(403);
        (await lito.get("/admin/security")).assertStatus(403);
        // an admin can work it too
        (await (await app.actingAsAdmin()).post("/admin/logistics/2/call")).assertStatus(200);
    });

    test("History has the one For Logistics list, and only its own department may read it", async () => {
        await takeOrder({ name: "Ana Reyes", invoices: [{ invoiceNo: "701", type: "For Logistics" }] });
        await takeOrder({ name: "Liza Mendoza", invoices: [{ invoiceNo: "702", type: "For Logistics" }] });
        const { maria, pedro, lito } = await staff();
        for (const queueNum of [1, 2]) await handOver(maria, queueNum);
        const rows = async (list) =>
            (await lito.get(`/admin/department-history/logistics?list=${encodeURIComponent(list)}`))
                .assertStatus(200)
                .body.rows.map((r) => r.name)
                .sort();

        assert.deepEqual(
            HISTORY_LISTS.logistics.map((list) => list.name),
            ["For Logistics"],
        );
        assert.deepEqual(await rows("For Logistics"), ["Ana Reyes", "Liza Mendoza"]);
        (await pedro.get("/admin/department-history/logistics")).assertStatus(403);
    });

    test("an admin can make an account Logistics staff, or move one there", async () => {
        const admin = await app.actingAsAdmin();
        const created = (
            await admin.post("/admin/users", {
                username: "lito",
                name: "Lito Reyes",
                password: "password1",
                role: "logistics",
            })
        ).assertStatus(201).body;
        assert.equal(created.role, "logistics");

        const pedro = await app.actingAsLoading("Pedro Garcia");
        const moved = (await admin.patch(`/admin/users/${pedro.account.id}`, { role: "logistics" })).assertStatus(
            200,
        ).body;
        assert.equal(moved.role, "logistics");
        app.assertDatabaseHas("users", { username: "lito", role: "logistics" });
    });

    test("For Logistics tickets start LA, alone or after another type's letters", () => {
        assert.equal(formatQueueNum(1, "For Logistics"), "LA 01");
        assert.equal(formatQueueNum(2, "Steel, For Logistics"), "SLA 02");
    });

    test("For Logistics is the only way an order reaches Logistics on Customer order", () => {
        const types = purpose.map((type) => type.name);

        assert.ok(types.includes("For Logistics"));
        for (const removed of ["Plain Sheet", "Stainless Steel", "Insulations"]) assert.ok(!types.includes(removed), removed);
    });

    test("its invoices sit under Construction & hardware on the sheet", () => {
        const columns = invoicesByColumn({
            purpose: "For Logistics",
            invoices: [{ invoiceNo: "701", type: "For Logistics" }],
        });

        assert.deepEqual(columns.construction, ["701"]);
        assert.deepEqual(columns.others, []);
    });
});
