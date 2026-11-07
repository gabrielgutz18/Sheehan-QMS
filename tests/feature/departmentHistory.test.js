// a department's History tab: every order sales handed over to it, one list at a time (Roofings, Steel; Tire, Battery;
// Chassis; Hardware), each row with only that list's invoices and its area's load, so a crew never sees another's part
// run: npm test            only these: npm test -- --test-name-pattern="department history"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// an order from Customer order for Hardwares; pass any field to change it
const order = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Hardwares",
    orders: [],
    invoices: [{ invoiceNo: "H-1", type: "Hardwares" }],
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", order(overrides))).assertStatus(201).body;
const handOver = async (sales, queueNum) => (await sales.post(`/admin/orders/${queueNum}/handover`)).assertStatus(200);
// the truck is at the area, then Done there
const load = async (crew, department, queueNum, area) => {
    (await crew.post(`/admin/${department}/${queueNum}/start`, { area })).assertStatus(200);
    return (await crew.post(`/admin/${department}/${queueNum}/done`)).assertStatus(200).body;
};
const history = (who, department, query = "") => who.get(`/admin/department-history/${department}${query}`);
const rowsOf = async (who, department, query) => (await history(who, department, query)).assertStatus(200).body.rows;

describe("department history", () => {
    test("each crew sees its own department's history, and no one else's", async () => {
        const admin = await app.actingAsAdmin();
        const ben = await app.actingAsHardware();
        const pedro = await app.actingAsLoading();

        (await history(ben, "hardware")).assertStatus(200);
        (await history(ben, "loading")).assertStatus(403);
        (await history(pedro, "hardware")).assertStatus(403);
        for (const other of [
            await app.actingAsSales(),
            await app.actingAsSecurity(),
            await app.actingAsCashier(),
            await app.actingAsInventory(),
            await app.actingAsDeveloper(),
        ]) {
            (await history(other, "hardware")).assertStatus(403);
        }
        for (const department of ["loading", "tba", "chassis", "hardware"])
            (await history(admin, department)).assertStatus(200);
        (await history(admin, "nowhere")).assertStatus(404);
    });

    test("only orders handed over and not deleted are listed, and Customer Reports never", async () => {
        await takeOrder();
        await takeOrder({ name: "Ana Reyes" });
        await takeOrder({ name: "Liza Mendoza" });
        await app
            .client()
            .post("/orders", { name: "Rosa Cruz", purpose: "Customer Report", concern: "Leaking at the joints." })
            .then((r) => r.assertStatus(201));
        const maria = await app.actingAsSales();
        const admin = await app.actingAsAdmin();
        await handOver(maria, 1);
        await handOver(maria, 3);
        (await admin.delete("/admin/orders/3")).assertStatus(204);

        const rows = await rowsOf(admin, "hardware");
        assert.deepEqual(
            rows.map((r) => r.queueNum),
            [1],
        );
        for (const department of ["loading", "tba", "chassis"]) assert.deepEqual(await rowsOf(admin, department), []);
    });

    test("an order shows in every list it has a type of, with only that list's part", async () => {
        await takeOrder({
            purpose: "Roofings, Tire, Steel, Hardwares",
            invoices: [
                { invoiceNo: "R-1", type: "Roofings" },
                { invoiceNo: "T-1", type: "Tire" },
                { invoiceNo: "S-1", type: "Steel" },
                { invoiceNo: "H-1", type: "Hardwares" },
            ],
        });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        const ben = await app.actingAsHardware();
        const tony = await app.actingAsTba();
        await handOver(maria, 1);
        await load(pedro, "loading", 1, "Roofings");

        const [hardware] = await rowsOf(ben, "hardware");
        assert.deepEqual(hardware.invoices, [{ invoiceNo: "H-1", type: "Hardwares" }]);
        assert.equal(hardware.loaded, null);
        assert.equal(hardware.handedOver.by.name, "Maria Santos");
        assert.equal(hardware.name, "Juan Dela Cruz");
        assert.equal(hardware.purpose, "Roofings, Tire, Steel, Hardwares");

        const [roofings] = await rowsOf(pedro, "loading");
        assert.deepEqual(roofings.invoices, [{ invoiceNo: "R-1", type: "Roofings" }]);
        assert.equal(roofings.loaded.by.name, "Pedro Garcia");
        assert.equal(roofings.loaded.by.id, pedro.account.id);

        const [steel] = await rowsOf(pedro, "loading", "?list=Steel");
        assert.deepEqual(steel.invoices, [{ invoiceNo: "S-1", type: "Steel" }]);
        assert.equal(steel.loaded, null);

        const [tire] = await rowsOf(tony, "tba", "?list=Tire");
        assert.deepEqual(tire.invoices, [{ invoiceNo: "T-1", type: "Tire" }]);
        assert.deepEqual(await rowsOf(tony, "tba", "?list=Battery"), []);

        for (const row of [hardware, roofings, steel, tire]) {
            for (const key of ["paymentStatus", "salesman", "edits", "orders"]) assert.equal(key in row, false, key);
        }
    });

    test("Roofings takes Roofings Accessories, and Steel takes neither", async () => {
        await takeOrder({
            purpose: "Roofings Accessories",
            invoices: [{ invoiceNo: "RA-1", type: "Roofings Accessories" }],
        });
        await takeOrder({
            purpose: "Roofings, Steel, Roofings Accessories",
            invoices: [
                { invoiceNo: "R-2", type: "Roofings" },
                { invoiceNo: "S-2", type: "Steel" },
                { invoiceNo: "RA-2", type: "Roofings Accessories" },
            ],
        });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        await handOver(maria, 1);
        await handOver(maria, 2);

        const roofings = await rowsOf(pedro, "loading", "?list=Roofings");
        assert.deepEqual(
            roofings.map((r) => [r.queueNum, r.invoices.map((i) => i.invoiceNo)]),
            [
                [2, ["R-2", "RA-2"]],
                [1, ["RA-1"]],
            ],
        );
        const steel = await rowsOf(pedro, "loading", "?list=Steel");
        assert.deepEqual(
            steel.map((r) => [r.queueNum, r.invoices.map((i) => i.invoiceNo)]),
            [[2, ["S-2"]]],
        );
    });

    test("Tire and Battery share TBA's load", async () => {
        await takeOrder({
            purpose: "Tire, Battery",
            invoices: [
                { invoiceNo: "T-3", type: "Tire" },
                { invoiceNo: "B-3", type: "Battery" },
            ],
        });
        const maria = await app.actingAsSales();
        const tony = await app.actingAsTba();
        await handOver(maria, 1);
        await load(tony, "tba", 1, "TBA");

        const [tire] = await rowsOf(tony, "tba", "?list=Tire");
        const [battery] = await rowsOf(tony, "tba", "?list=Battery");
        assert.deepEqual(
            tire.invoices.map((i) => i.invoiceNo),
            ["T-3"],
        );
        assert.deepEqual(
            battery.invoices.map((i) => i.invoiceNo),
            ["B-3"],
        );
        assert.equal(tire.loaded.by.name, "Tony Gulong");
        assert.equal(battery.loaded.by.name, "Tony Gulong");
        // Tire is TBA's first list
        assert.deepEqual(
            (await rowsOf(tony, "tba")).map((r) => r.invoices[0].invoiceNo),
            ["T-3"],
        );
    });

    test("an invoice with no type shows in every list the order is in", async () => {
        // only an older ticket has one: Customer order types every invoice now
        await takeOrder({ purpose: "Roofings, Steel", invoices: [{ invoiceNo: "X-1", type: "Roofings" }] });
        app.db.prepare("UPDATE order_invoices SET type = ''").run();
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        await handOver(maria, 1);

        for (const list of ["Roofings", "Steel"]) {
            const [row] = await rowsOf(pedro, "loading", `?list=${list}`);
            assert.deepEqual(row.invoices, [{ invoiceNo: "X-1", type: "" }], list);
        }
    });

    test("a guard sending the order back shows on that area's list only", async () => {
        await takeOrder({
            purpose: "Roofings, Steel",
            invoices: [
                { invoiceNo: "R-4", type: "Roofings" },
                { invoiceNo: "S-4", type: "Steel" },
            ],
        });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        await handOver(maria, 1);
        await load(pedro, "loading", 1, "Roofings");
        assert.equal((await load(pedro, "loading", 1, "Steel")).status, "done");
        const guard = await app.actingAsSecurity();
        (
            await guard.post("/admin/security/1/check", {
                result: "missing",
                note: "One long span short",
                returnTo: "Roofings",
            })
        ).assertStatus(200);

        const [roofings] = await rowsOf(pedro, "loading", "?list=Roofings");
        assert.equal(roofings.loaded, null);
        assert.equal(roofings.sentBack.result, "missing");
        assert.equal(roofings.sentBack.note, "One long span short");
        assert.equal(roofings.sentBack.by.name, "Jose Bantay");
        const [steel] = await rowsOf(pedro, "loading", "?list=Steel");
        assert.equal(steel.loaded.by.name, "Pedro Garcia");
        assert.equal(steel.sentBack, null);
    });

    test("an order from before the areas is under Roofings, with who finished it", async () => {
        await takeOrder({ purpose: "Roofings", invoices: [{ invoiceNo: "OLD-1", type: "Roofings" }] });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        await handOver(maria, 1);
        // an older ticket: a type of order no area loads, finished before order_loads kept each area
        app.db
            .prepare("UPDATE orders SET purpose = 'Old stock', loaded_by = ?, loaded_at = '2026-01-05T02:00:00.000Z'")
            .run(pedro.account.id);
        app.db.prepare("UPDATE order_invoices SET type = ''").run();

        const [roofings] = await rowsOf(pedro, "loading");
        assert.equal(roofings.queueNum, 1);
        assert.deepEqual(roofings.loaded, {
            by: { id: pedro.account.id, name: "Pedro Garcia" },
            at: "2026-01-05T02:00:00.000Z",
        });
        assert.deepEqual(
            roofings.invoices.map((i) => i.invoiceNo),
            ["OLD-1"],
        );
        assert.deepEqual(await rowsOf(pedro, "loading", "?list=Steel"), []);
    });

    test("an unknown list is refused", async () => {
        const pedro = await app.actingAsLoading();
        const ben = await app.actingAsHardware();
        (await history(pedro, "loading", "?list=Hardware")).assertStatus(400);
        (await history(ben, "hardware", "?list=Steel")).assertStatus(400);
    });
});
