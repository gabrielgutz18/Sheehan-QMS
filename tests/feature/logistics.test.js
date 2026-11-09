// the Logistics page: Logistics (Plain Sheet, Stainless Steel, Insulations) is its own department, working like the
// loading crew for its own area (src/data/loadingAreas.js). A sales counter hands the customer over just the same; a
// customer who bought one of its products is called to Logistics from the Logistics page, and one who bought steel or a
// Tire too goes to each department in turn, one at a time
// run: npm test            only these: npm test -- --test-name-pattern="Logistics"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { invoicesByColumn } from "../../src/admin/data/sheetColumns.js";
import formatQueueNum from "../../src/data/queueNum.js";
import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

const PRODUCTS = ["Plain Sheet", "Stainless Steel", "Insulations"];

// an order from Customer order; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Plain Sheet",
    orders: [],
    invoices: [{ invoiceNo: "701", type: "Plain Sheet" }],
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
    test("each of its products is loaded at Logistics, by the Logistics department, then goes to the gate", async () => {
        for (const type of PRODUCTS) await takeOrder({ purpose: type, invoices: [{ invoiceNo: `7-${type}`, type }] });
        const { maria, pedro, lito } = await staff();

        for (const queueNum of [1, 2, 3]) {
            await handOver(maria, queueNum);
            // not the loading crew's
            (await pedro.post(`/admin/loading/${queueNum}/call`)).assertStatus(409);
            assert.equal(
                (await lito.post(`/admin/logistics/${queueNum}/call`)).assertStatus(200).body.loadingArea,
                "Logistics",
            );
            const started = (await lito.post(`/admin/logistics/${queueNum}/start`, { area: "Logistics" })).assertStatus(
                200,
            ).body;
            assert.ok(started.loadingStartedAt);
            const done = (await lito.post(`/admin/logistics/${queueNum}/done`)).assertStatus(200).body;

            assert.equal(done.status, "done");
            assert.deepEqual(areasOf(done), [["Logistics", "Lito Reyes"]]);
            assert.equal(done.security, "waiting");
        }
    });

    test("an order for Steel, Plain Sheet and a Tire goes to Steel, then Logistics, then Service, one at a time", async () => {
        await takeOrder({
            purpose: "Steel, Tire, Plain Sheet",
            invoices: [
                { invoiceNo: "101", type: "Steel" },
                { invoiceNo: "601", type: "Tire" },
                { invoiceNo: "701", type: "Plain Sheet" },
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
        await takeOrder({
            name: "Liza Mendoza",
            purpose: "Insulations",
            invoices: [{ invoiceNo: "2", type: "Insulations" }],
        });
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

    test("History has one list per product, and only its own department may read it", async () => {
        await takeOrder({
            name: "Sheet Buyer",
            purpose: "Plain Sheet",
            invoices: [{ invoiceNo: "701", type: "Plain Sheet" }],
        });
        await takeOrder({
            name: "Steel Buyer",
            purpose: "Stainless Steel",
            invoices: [{ invoiceNo: "702", type: "Stainless Steel" }],
        });
        const { maria, pedro, lito } = await staff();
        for (const queueNum of [1, 2]) await handOver(maria, queueNum);
        const rows = async (list) =>
            (await lito.get(`/admin/department-history/logistics?list=${encodeURIComponent(list)}`))
                .assertStatus(200)
                .body.rows.map((r) => r.name);

        assert.deepEqual(await rows("Plain Sheet"), ["Sheet Buyer"]);
        assert.deepEqual(await rows("Stainless Steel"), ["Steel Buyer"]);
        assert.deepEqual(await rows("Insulations"), []);
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

    test("its products have their ticket letters and sit under Construction & hardware on the sheet", () => {
        assert.equal(formatQueueNum(1, "Plain Sheet"), "PS 01");
        assert.equal(formatQueueNum(2, "Stainless Steel"), "SS 02");
        assert.equal(formatQueueNum(3, "Insulations"), "I 03");

        const columns = invoicesByColumn({
            purpose: "Plain Sheet, Stainless Steel, Insulations",
            invoices: [
                { invoiceNo: "701", type: "Plain Sheet" },
                { invoiceNo: "702", type: "Stainless Steel" },
                { invoiceNo: "703", type: "Insulations" },
            ],
        });
        assert.deepEqual(columns.construction, ["701", "702", "703"]);
        assert.deepEqual(columns.others, []);
    });
});
