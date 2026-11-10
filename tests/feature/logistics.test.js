// Logistics is one of the loading crew's areas, beside Roofings and Steel (src/data/loadingAreas.js): each area loads only
// its own products, Roofings the Roofings and Roofings Accessories, Steel the steel and Logistics the plain sheets,
// stainless steel and insulation, which come in as one tentative type, "For Logistics", with tickets starting LS. The
// loading crew calls its customers from the Loading page, and one who bought from several areas goes to each in turn,
// one at a time
// run: npm test            only these: npm test -- --test-name-pattern="Logistics"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { invoicesByColumn } from "../../src/admin/data/sheetColumns.js";
import loadingAreas, { DEPARTMENTS, HISTORY_LISTS, areasFor } from "../../src/data/loadingAreas.js";
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

const handOver = async (sales, queueNum) =>
    (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200).body;
const areasOf = (o) => o.areas.map(({ name, loaded }) => [name, loaded?.by.name]);

describe("Logistics", () => {
    test("each of the loading crew's areas takes only its own products", () => {
        const loading = loadingAreas.filter((area) => area.department === "loading");

        assert.deepEqual(
            loading.map(({ name, types }) => [name, types]),
            [
                ["Roofings", ["Roofings", "Roofings Accessories"]],
                ["Steel", ["Steel"]],
                ["Logistics", ["For Logistics"]],
                ["Chassis", ["Chassis"]],
            ],
        );
        assert.deepEqual(areasFor("Steel"), ["Steel"]);
        assert.deepEqual(areasFor("Roofings Accessories"), ["Roofings"]);
        assert.deepEqual(areasFor("For Logistics"), ["Logistics"]);
        assert.ok(!Object.hasOwn(DEPARTMENTS, "logistics"));
    });

    test("a For Logistics order is loaded at Logistics by the loading crew, then goes to the gate", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading("Pedro Garcia");
        await handOver(maria, 1);

        assert.equal((await pedro.post("/admin/loading/1/call")).assertStatus(200).body.loadingArea, "Logistics");
        const started = (await pedro.post("/admin/loading/1/start", { area: "Logistics" })).assertStatus(200).body;
        assert.ok(started.loadingStartedAt);
        const done = (await pedro.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(done.status, "done");
        assert.deepEqual(areasOf(done), [["Logistics", "Pedro Garcia"]]);
        assert.equal(done.security, "waiting");
    });

    test("an order for Roofings, Steel and For Logistics is loaded at Roofings, then Steel, then Logistics", async () => {
        await takeOrder({
            purpose: "Roofings, Steel, For Logistics",
            invoices: [
                { invoiceNo: "1", type: "Roofings" },
                { invoiceNo: "101", type: "Steel" },
                { invoiceNo: "701", type: "For Logistics" },
            ],
        });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading("Pedro Garcia");
        const lito = await app.actingAsLoading("Lito Reyes");
        await handOver(maria, 1);

        for (const area of ["Roofings", "Steel"]) {
            (await pedro.post("/admin/loading/1/start", { area })).assertStatus(200);
            assert.equal((await pedro.post("/admin/loading/1/done")).assertStatus(200).body.status, "pending");
        }
        // one shared line: anyone on the crew can take the next area
        (await lito.post("/admin/loading/1/start", { area: "Logistics" })).assertStatus(200);
        const finished = (await lito.post("/admin/loading/1/done")).assertStatus(200).body;

        assert.equal(finished.status, "done");
        assert.deepEqual(areasOf(finished), [
            ["Roofings", "Pedro Garcia"],
            ["Steel", "Pedro Garcia"],
            ["Logistics", "Lito Reyes"],
        ]);
    });

    test("there's no Logistics department or kind of account any more", async () => {
        await takeOrder();
        await handOver(await app.actingAsSales(), 1);
        const admin = await app.actingAsAdmin();

        (
            await admin.post("/admin/users", {
                username: "lito",
                name: "Lito Reyes",
                password: "password1",
                role: "logistics",
            })
        ).assertStatus(400);
        (await admin.post("/admin/logistics/1/call")).assertStatus(404);
        (await admin.get("/admin/department-history/logistics")).assertStatus(404);
    });

    test("Loading's History has a For Logistics list after Roofings and Steel, then Chassis", async () => {
        await takeOrder({ name: "Ana Reyes" });
        await takeOrder({ name: "Carlo Bautista", purpose: "Steel", invoices: [{ invoiceNo: "101", type: "Steel" }] });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading("Pedro Garcia");
        for (const queueNum of [1, 2]) await handOver(maria, queueNum);
        const rows = async (list) =>
            (await pedro.get(`/admin/department-history/loading?list=${encodeURIComponent(list)}`))
                .assertStatus(200)
                .body.rows.map((r) => r.name);

        assert.deepEqual(
            HISTORY_LISTS.loading.map((list) => [list.name, list.area]),
            [
                ["Roofings", "Roofings"],
                ["Steel", "Steel"],
                ["For Logistics", "Logistics"],
                ["Chassis", "Chassis"],
            ],
        );
        assert.deepEqual(await rows("For Logistics"), ["Ana Reyes"]);
        assert.deepEqual(await rows("Steel"), ["Carlo Bautista"]);
    });

    test("For Logistics tickets start LS, alone or after another type's letters", () => {
        assert.equal(formatQueueNum(1, "For Logistics"), "LS 01");
        assert.equal(formatQueueNum(2, "Steel, For Logistics"), "SLS 02");
    });

    test("For Logistics is the only way an order reaches Logistics on Customer order", () => {
        const types = purpose.map((type) => type.name);

        assert.ok(types.includes("For Logistics"));
        for (const removed of ["Plain Sheet", "Stainless Steel", "Insulations"])
            assert.ok(!types.includes(removed), removed);
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
