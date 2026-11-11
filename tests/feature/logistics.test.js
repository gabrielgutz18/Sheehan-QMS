// Logistics is one of the loading crew's areas, beside Roofings and Steel (src/data/loadingAreas.js): each area loads only
// its own products, Roofings the Roofings and Roofings Accessories, Steel the steel and Logistics the Stainless orders,
// with tickets starting ST (once the For Logistics type, with tickets starting LS; migration 048 renamed it). The
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
    purpose: "Stainless",
    orders: [],
    invoices: [{ invoiceNo: "701", type: "Stainless" }],
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
                ["Logistics", ["Stainless"]],
                ["Chassis", ["Chassis"]],
            ],
        );
        assert.deepEqual(areasFor("Steel"), ["Steel"]);
        assert.deepEqual(areasFor("Roofings Accessories"), ["Roofings"]);
        assert.deepEqual(areasFor("Stainless"), ["Logistics"]);
        assert.ok(!Object.hasOwn(DEPARTMENTS, "logistics"));
    });

    test("a Stainless order is loaded at Logistics by the loading crew, then goes to the gate", async () => {
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

    test("an order for Roofings, Steel and Stainless is loaded at Roofings, then Steel, then Logistics", async () => {
        await takeOrder({
            purpose: "Roofings, Steel, Stainless",
            invoices: [
                { invoiceNo: "1", type: "Roofings" },
                { invoiceNo: "101", type: "Steel" },
                { invoiceNo: "701", type: "Stainless" },
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

    test("Loading's History has a Stainless list after Roofings and Steel, then Chassis", async () => {
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
                ["Stainless", "Logistics"],
                ["Chassis", "Chassis"],
            ],
        );
        assert.deepEqual(await rows("Stainless"), ["Ana Reyes"]);
        assert.deepEqual(await rows("Steel"), ["Carlo Bautista"]);
    });

    test("Stainless tickets start ST, alone or after another type's letters", () => {
        assert.equal(formatQueueNum(1, "Stainless"), "ST 01");
        assert.equal(formatQueueNum(2, "Steel, Stainless"), "SST 02");
        // Steel alone stays S, so the two never share a ticket's letters
        assert.equal(formatQueueNum(3, "Steel"), "S 03");
    });

    test("Stainless is the only way an order reaches Logistics on Customer order", () => {
        const types = purpose.map((type) => type.name);

        assert.ok(types.includes("Stainless"));
        for (const removed of ["For Logistics", "Plain Sheet", "Stainless Steel", "Insulations"])
            assert.ok(!types.includes(removed), removed);
    });

    test("its invoices sit under Construction & hardware on the sheet", () => {
        const columns = invoicesByColumn({
            purpose: "Stainless",
            invoices: [{ invoiceNo: "701", type: "Stainless" }],
        });

        assert.deepEqual(columns.construction, ["701"]);
        assert.deepEqual(columns.others, []);
    });
});
