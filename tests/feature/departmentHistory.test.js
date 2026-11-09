// a department's History tab: every order sales handed over to it, one list at a time (Roofings, Steel; Tire, Battery;
// Chassis; Hardware), each row with only that list's invoices and its area's load, so a crew never sees another's part
// run: npm test            only these: npm test -- --test-name-pattern="department history"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp, localDay } from "../support/testApp.js";

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
// moves today's ticket to another day, as if it had been made then
const moveTo = (queueNum, day) =>
    app.db
        .prepare("UPDATE orders SET queue_date = ? WHERE queue_date = ? AND queue_num = ?")
        .run(day, localDay(), queueNum);
const numbersOf = async (who, department, query) => (await rowsOf(who, department, query)).map((r) => r.queueNum);
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
        for (const department of ["loading", "logistics", "service", "chassis", "hardware"])
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
        // a Customer Report has no areas, so only the report rule keeps it off Roofings even once it's handed over
        app.db
            .prepare("UPDATE orders SET handed_over_by = ?, handed_over_at = ? WHERE purpose = 'Customer Report'")
            .run(maria.account.id, new Date().toISOString());

        const rows = await rowsOf(admin, "hardware");
        assert.deepEqual(
            rows.map((r) => r.queueNum),
            [1],
        );
        for (const department of ["loading", "service", "chassis"]) assert.deepEqual(await rowsOf(admin, department), []);
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
        const tony = await app.actingAsService();
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

        const [tire] = await rowsOf(tony, "service", "?list=Tire");
        assert.deepEqual(tire.invoices, [{ invoiceNo: "T-1", type: "Tire" }]);
        assert.deepEqual(await rowsOf(tony, "service", "?list=Battery"), []);

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

    test("Tire and Battery share Service's load", async () => {
        await takeOrder({
            purpose: "Tire, Battery",
            invoices: [
                { invoiceNo: "T-3", type: "Tire" },
                { invoiceNo: "B-3", type: "Battery" },
            ],
        });
        const maria = await app.actingAsSales();
        const tony = await app.actingAsService();
        await handOver(maria, 1);
        await load(tony, "service", 1, "Service");

        const [tire] = await rowsOf(tony, "service", "?list=Tire");
        const [battery] = await rowsOf(tony, "service", "?list=Battery");
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
        // Tire is Service's first list
        assert.deepEqual(
            (await rowsOf(tony, "service")).map((r) => r.invoices[0].invoiceNo),
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

    test("an R order isn't under Steel and an S order isn't under Roofings", async () => {
        await takeOrder({ purpose: "Roofings", invoices: [{ invoiceNo: "R-5", type: "Roofings" }] });
        await takeOrder({ purpose: "Steel", invoices: [{ invoiceNo: "S-6", type: "Steel" }] });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        await handOver(maria, 1);
        await handOver(maria, 2);

        assert.deepEqual(await numbersOf(pedro, "loading", "?list=Roofings"), [1]);
        assert.deepEqual(await numbersOf(pedro, "loading", "?list=Steel"), [2]);
    });

    test("a load saved before each area kept its own still says who loaded it", async () => {
        await takeOrder({ purpose: "Roofings", invoices: [{ invoiceNo: "R-7", type: "Roofings" }] });
        await takeOrder({ purpose: "Chassis", invoices: [{ invoiceNo: "C-8", type: "Chassis" }] });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        const carlos = await app.actingAsChassis();
        await handOver(maria, 1);
        await handOver(maria, 2);
        await load(pedro, "loading", 1, "Roofings");
        await load(carlos, "chassis", 2, "Chassis");
        // before areas had loads of their own only the order's Done was kept; and Chassis was loaded at Service before it
        // had its own department
        app.db.prepare("DELETE FROM order_loads WHERE area = 'Roofings'").run();
        app.db.prepare("UPDATE order_loads SET area = 'Service' WHERE area = 'Chassis'").run();

        const [roofings] = await rowsOf(pedro, "loading");
        assert.equal(roofings.loaded?.by.name, "Pedro Garcia");
        const [chassis] = await rowsOf(carlos, "chassis");
        assert.equal(chassis.loaded?.by.name, "Carlos Tsasis");
        assert.equal(chassis.loaded?.by.id, carlos.account.id);
    });

    test("an unknown list is refused", async () => {
        const pedro = await app.actingAsLoading();
        const ben = await app.actingAsHardware();
        (await history(pedro, "loading", "?list=Hardware")).assertStatus(400);
        (await history(ben, "hardware", "?list=Steel")).assertStatus(400);
    });

    test("All, one day and a range", async () => {
        for (const name of ["Ana Reyes", "Ben Cruz", "Cora Diaz"]) await takeOrder({ name });
        const maria = await app.actingAsSales();
        const ben = await app.actingAsHardware();
        for (const n of [1, 2, 3]) await handOver(maria, n);
        moveTo(2, localDay(1));
        moveTo(3, localDay(3));

        assert.deepEqual(await numbersOf(ben, "hardware"), [1, 2, 3]);
        assert.deepEqual(await numbersOf(ben, "hardware", `?from=${localDay(1)}&to=${localDay(1)}`), [2]);
        assert.deepEqual(await numbersOf(ben, "hardware", `?from=${localDay(3)}&to=${localDay(1)}`), [2, 3]);
        assert.deepEqual(await numbersOf(ben, "hardware", `?from=${localDay(1)}&to=${localDay(3)}`), [2, 3]);
        assert.deepEqual(await numbersOf(ben, "hardware", `?from=${localDay(3)}`), [3]);
        assert.deepEqual(await numbersOf(ben, "hardware", `?to=${localDay(0)}`), [1]);
    });

    test("search finds a name, a ticket number or the list's invoice", async () => {
        await takeOrder({ name: "Ana Reyes" });
        await takeOrder({
            purpose: "Roofings, Steel",
            invoices: [
                { invoiceNo: "R-777", type: "Roofings" },
                { invoiceNo: "S-888", type: "Steel" },
            ],
        });
        const maria = await app.actingAsSales();
        const ben = await app.actingAsHardware();
        const pedro = await app.actingAsLoading();
        await handOver(maria, 1);
        await handOver(maria, 2);

        assert.deepEqual(await numbersOf(ben, "hardware", "?search=ana"), [1]);
        assert.deepEqual(await numbersOf(ben, "hardware", "?search=H-1"), [1]);
        assert.deepEqual(await numbersOf(ben, "hardware", "?search=H%2001"), [1]);
        assert.deepEqual(await numbersOf(ben, "hardware", "?search=nobody"), []);
        // a search ending in digits also finds the ticket with that number, as on Orders & history, so these invoice
        // numbers end in others
        assert.deepEqual(await numbersOf(pedro, "loading", "?search=dela"), [2]);
        assert.deepEqual(await numbersOf(pedro, "loading", "?search=2"), [2]);
        assert.deepEqual(await numbersOf(pedro, "loading", "?search=R-777"), [2]);
        assert.deepEqual(await numbersOf(pedro, "loading", "?list=Steel&search=R-777"), []);
        assert.deepEqual(await numbersOf(pedro, "loading", "?list=Steel&search=S-888"), [2]);
    });

    test("a search of % or _ means those characters", async () => {
        await takeOrder({ name: "100% Hardware" });
        await takeOrder({ name: "Ana Reyes" });
        const maria = await app.actingAsSales();
        const ben = await app.actingAsHardware();
        await handOver(maria, 1);
        await handOver(maria, 2);

        assert.deepEqual(await numbersOf(ben, "hardware", "?search=%25"), [1]);
        assert.deepEqual(await numbersOf(ben, "hardware", "?search=_"), []);
    });

    test("Show more goes on where the page ended", async () => {
        await takeOrder();
        const maria = await app.actingAsSales();
        const ben = await app.actingAsHardware();
        await handOver(maria, 1);
        // 51 more handed-over orders, copied in the database: the kiosk takes only 30 new tickets a minute
        app.db.exec("CREATE TEMP TABLE copy AS SELECT * FROM orders WHERE queue_num = 1");
        for (let n = 2; n <= 52; n++) {
            app.db.prepare("UPDATE copy SET id = NULL, queue_num = ?").run(n);
            app.db.exec("INSERT INTO orders SELECT * FROM copy");
        }

        const first = (await history(ben, "hardware")).assertStatus(200).body;
        assert.equal(first.rows.length, 50);
        assert.equal(first.more, true);
        const last = first.rows.at(-1);
        const second = (await history(ben, "hardware", `?before=${last.date}:${last.queueNum}`)).assertStatus(200).body;
        assert.deepEqual(
            second.rows.map((r) => r.queueNum),
            [2, 1],
        );
        assert.equal(second.more, false);
        const ids = [...first.rows, ...second.rows].map((r) => r.id);
        assert.equal(new Set(ids).size, 52);
    });

    test("Show more keeps its place across a ticket restored to a later day", async () => {
        await takeOrder({ name: "Ana Reyes" });
        await takeOrder({ name: "Ben Cruz" });
        const maria = await app.actingAsSales();
        const admin = await app.actingAsAdmin();
        const ben = await app.actingAsHardware();
        // Ana's ticket was deleted yesterday; Ben's was handed over yesterday
        (await admin.delete("/admin/orders/1")).assertStatus(204);
        await handOver(maria, 2);
        moveTo(1, localDay(1));
        moveTo(2, localDay(1));
        // restoring it gives it today's next number, on a new day, keeping its older, smaller id
        const { id } = app.db.prepare("SELECT id FROM orders WHERE name = 'Ana Reyes'").get();
        (await admin.post(`/admin/history/${id}/restore`)).assertStatus(200);
        const restored = app.db.prepare("SELECT queue_num FROM orders WHERE id = ?").get(id);
        await handOver(maria, restored.queue_num);

        const all = await rowsOf(ben, "hardware");
        assert.deepEqual(
            all.map((r) => [r.name, r.date]),
            [
                ["Ana Reyes", localDay()],
                ["Ben Cruz", localDay(1)],
            ],
        );
        const [ana, benCruz] = all;
        assert.deepEqual(
            (await rowsOf(ben, "hardware", `?before=${ana.date}:${ana.queueNum}`)).map((r) => r.name),
            ["Ben Cruz"],
        );
        const end = (await history(ben, "hardware", `?before=${benCruz.date}:${benCruz.queueNum}`)).assertStatus(
            200,
        ).body;
        assert.deepEqual(end, { rows: [], more: false });
    });

    test("bad days and a bad before are refused", async () => {
        const ben = await app.actingAsHardware();
        assert.equal(
            (await history(ben, "hardware", "?from=2026-02-30")).assertStatus(400).body.message,
            "Pick a valid day.",
        );
        (await history(ben, "hardware", "?to=yesterday")).assertStatus(400);
        (await history(ben, "hardware", "?before=12")).assertStatus(400);
        (await history(ben, "hardware", "?before=2026-11-06:x")).assertStatus(400);
        (await history(ben, "hardware", "?before=2026-02-30:3")).assertStatus(400);
    });
});
