// Customer order as sales staff fill it in: one or more types of order, the invoices that list the items (each with
// the type of order it's for), the runner the customer sent and the receiver (if any), the salesman, the times the
// customer came in to sales and left it (if typed in), the sales team serving them, and for a returning customer, the
// day they come back for the items; the payment status isn't theirs: only the cashier sets it
// run: npm test            only these: npm test -- --test-name-pattern="sales order"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { buildReceipt } from '../../src/admin/printing/escpos.js';
import { bootApp, localDay } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// what Customer order sends; pass any field to change it
const sale = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings, Steel",
    orders: [],
    invoices: [{ invoiceNo: "2223", type: "Roofings" }],
    salesman: "Maria Santos",
    runner: "",
    receiver: "",
    salesTimeIn: "",
    salesTimeOut: "",
    checkers: {},
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", sale(overrides))).assertStatus(201).body;

describe("sales order", () => {
    test("an order takes a number with its invoices, salesman and team, no items, and no payment status yet", async () => {
        const saved = await takeOrder({
            invoices: [{ invoiceNo: "  43355521 ", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }],
            salesman: " Maria Santos ",
        });

        assert.equal(saved.queueNum, 1);
        assert.equal(saved.purpose, "Roofings, Steel");
        assert.deepEqual(saved.orders, []);
        assert.deepEqual(saved.invoices, [{ invoiceNo: "43355521", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }]);
        assert.equal(saved.salesman, "Maria Santos");
        assert.equal(saved.paymentStatus, undefined);
        assert.equal(saved.team, "GIGA");
        assert.equal(saved.pickupDate, undefined);
        app.assertDatabaseHas("orders", {
            queue_num: 1, salesman: "Maria Santos", payment_status: "", team: "GIGA", pickup_date: null,
        });
        app.assertDatabaseHas("order_invoices", { position: 0, invoice_no: "43355521", type: "Roofings" });
        app.assertDatabaseHas("order_invoices", { position: 1, invoice_no: "5566", type: "Steel" });
        app.assertDatabaseCount("order_items", 0);
    });

    test("a returning customer's order keeps the day they come back for the items", async () => {
        const day = localDay(-3);

        const saved = await takeOrder({ pickupDate: day });

        assert.equal(saved.pickupDate, day);
        app.assertDatabaseHas("orders", { queue_num: 1, pickup_date: day });
    });

    test("a runner the customer sends to collect the items is kept with the order and shown to staff", async () => {
        const saved = await takeOrder({ runner: "  Boy Reyes " });

        assert.equal(saved.runner, "Boy Reyes");
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "Boy Reyes" });
        const [listed] = (await (await app.actingAsSales()).get("/admin/orders")).assertStatus(200).body;
        assert.equal(listed.runner, "Boy Reyes");

        // the customer collects the items themselves after all
        const cleared = (await (await app.actingAsAdmin()).put("/admin/orders/1", sale({ runner: "" }))).assertStatus(200).body;
        assert.equal(cleared.runner, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "" });
    });

    test("the receiver and the times the customer came in to sales and left it are kept and shown to staff", async () => {
        const saved = await takeOrder({ receiver: " Ana Cruz  ", salesTimeIn: "09:05", salesTimeOut: "13:40" });

        assert.equal(saved.receiver, "Ana Cruz");
        assert.equal(saved.salesTimeIn, "09:05");
        assert.equal(saved.salesTimeOut, "13:40");
        app.assertDatabaseHas("orders", {
            queue_num: 1, receiver: "Ana Cruz", sales_time_in: "09:05", sales_time_out: "13:40",
        });
        const [listed] = (await (await app.actingAsSales()).get("/admin/orders")).assertStatus(200).body;
        assert.equal(listed.receiver, "Ana Cruz");
        assert.equal(listed.salesTimeIn, "09:05");
        assert.equal(listed.salesTimeOut, "13:40");

        // left blank on Edit
        const cleared = (await (await app.actingAsAdmin()).put("/admin/orders/1", sale())).assertStatus(200).body;
        assert.equal(cleared.receiver, undefined);
        assert.equal(cleared.salesTimeIn, undefined);
        assert.equal(cleared.salesTimeOut, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, receiver: "", sales_time_in: "", sales_time_out: "" });
    });

    test("the runner, receiver and sales times are optional", async () => {
        const saved = await takeOrder({
            runner: undefined, receiver: undefined, salesTimeIn: undefined, salesTimeOut: undefined,
        });

        assert.equal(saved.runner, undefined);
        assert.equal(saved.receiver, undefined);
        assert.equal(saved.salesTimeIn, undefined);
        assert.equal(saved.salesTimeOut, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, runner: "", receiver: "", sales_time_in: "", sales_time_out: "" });
    });

    test("the checkers are kept with only the names filled in, and can be filled in later with Edit", async () => {
        const saved = await takeOrder({
            checkers: { Roofing: [" Pedro ", ""], Construction: ["", ""], "Hardware/TBA/Chassis": ["", "Ana"] },
        });

        assert.deepEqual(saved.checkers, { Roofing: ["Pedro", ""], "Hardware/TBA/Chassis": ["", "Ana"] });
        app.assertDatabaseHas("orders", {
            queue_num: 1, checkers: JSON.stringify({ Roofing: ["Pedro", ""], "Hardware/TBA/Chassis": ["", "Ana"] }),
        });

        // sales fill in the rest later, and staff see them on the order
        const desk = await app.actingAsSales();
        const later = { Roofing: ["Pedro", "Ben"], Construction: ["Carlo", ""], "Hardware/TBA/Chassis": ["", "Ana"] };
        const edited = (await desk.put("/admin/orders/1", sale({ checkers: later }))).assertStatus(200).body;
        assert.deepEqual(edited.checkers, later);
        const [listed] = (await desk.get("/admin/orders")).assertStatus(200).body;
        assert.deepEqual(listed.checkers, later);

        // all left blank again: to be written in by hand
        const cleared = (await desk.put("/admin/orders/1", sale())).assertStatus(200).body;
        assert.equal(cleared.checkers, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, checkers: "" });
    });

    test("the checkers are optional", async () => {
        const saved = await takeOrder({ checkers: undefined });

        assert.equal(saved.checkers, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, checkers: "" });
    });

    test("the ticket always has the checkers, with a line to write each one left blank on", async () => {
        const saved = await takeOrder({ checkers: { Roofing: ["Pedro", ""] } });
        const issuedAt = new Date("2026-10-24T15:20:00");

        const printed = new TextDecoder().decode(
            buildReceipt({ ...saved, queueNumber: "RS 01", issuedAt }, { columns: 32 }));

        // each of these in turn, on 58mm paper: 32 characters a line
        const blank = (round) => `${round}: ${"_".repeat(27)}\n`;
        let from = printed.indexOf("CHECKERS");
        assert.ok(from > 0, "the ticket has the checkers");
        for (const text of [
            "ROOFING", "1ST: Pedro\n", blank("2ND"),
            "CONSTRUCTION", blank("1ST"), blank("2ND"),
            "HARDWARE/TBA/CHASSIS", blank("1ST"), blank("2ND"),
        ]) {
            const at = printed.indexOf(text, from);
            assert.ok(at >= from, `the checkers go on with ${text.trim()}`);
            from = at + text.length;
        }
    });

    test("the ticket never shows the runner, receiver or sales times", async () => {
        const saved = await takeOrder({
            runner: "Boy Reyes", receiver: "Ana Cruz", salesTimeIn: "09:05", salesTimeOut: "13:40",
        });

        // issued at a time that can't be mistaken for the sales times
        const issuedAt = new Date("2026-10-24T15:20:00");
        const printed = new TextDecoder().decode(buildReceipt({ ...saved, queueNumber: "RS 01", issuedAt }));

        assert.ok(printed.includes("Juan Dela Cruz"));
        for (const hidden of ["Boy Reyes", "Ana Cruz", "09:05", "13:40", "RUNNER", "RECEIVER"]) {
            assert.ok(!printed.includes(hidden), `the ticket shows ${hidden}`);
        }
    });

    test("the team is optional", async () => {
        const saved = await takeOrder({ purpose: "Hardwares", invoices: [{ invoiceNo: "2223", type: "Hardwares" }], team: "" });

        assert.equal(saved.team, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, team: "" });
    });

    test("an order needs an invoice when it lists no items", async () => {
        const desk = app.client();

        (await desk.post("/orders", sale({ invoices: undefined }))).assertStatus(400);
        (await desk.post("/orders", sale({ invoices: [] }))).assertStatus(400);
        (await desk.post("/orders", sale({ invoices: [{ invoiceNo: "   ", type: "Roofings" }] }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        (await desk.post("/orders", sale({ invoices: undefined, orders: [{ item: "Long span", qty: 4 }] }))).assertStatus(201);
    });

    test("each invoice is for one of the order's types, and no number is listed twice", async () => {
        const desk = app.client();
        const invoices = (...list) => sale({ invoices: list });

        // Tire isn't one of this order's types, and every invoice needs one
        (await desk.post("/orders", invoices({ invoiceNo: "2223", type: "Tire" }))).assertStatus(400);
        (await desk.post("/orders", invoices({ invoiceNo: "2223" }))).assertStatus(400);
        (await desk.post("/orders", invoices({ invoiceNo: "2223", type: "" }))).assertStatus(400);
        (await desk.post("/orders", invoices({ invoiceNo: "2223", type: "Roofings" }, { invoiceNo: " 2223", type: "Steel" })))
            .assertStatus(400);
        (await desk.post("/orders", invoices("2223"))).assertStatus(400);
        (await desk.post("/orders", invoices(null))).assertStatus(400);
        (await desk.post("/orders", sale({ invoices: { invoiceNo: "2223", type: "Roofings" } }))).assertStatus(400);
        const many = Array.from({ length: 21 }, (_, i) => ({ invoiceNo: String(1000 + i), type: "Steel" }));
        (await desk.post("/orders", sale({ invoices: many }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        // two invoices can be for the same type
        (await desk.post("/orders", invoices({ invoiceNo: "2223", type: "Steel" }, { invoiceNo: "2224", type: "Steel" })))
            .assertStatus(201);
        (await desk.post("/orders", sale({ invoices: many.slice(0, 20) }))).assertStatus(201);
    });

    test("the team comes from its list, and the rest is checked too", async () => {
        const desk = app.client();

        (await desk.post("/orders", sale({ team: "Tires" }))).assertStatus(400);
        // Roofings and Steel are departments, not sales teams, and an order has one team
        (await desk.post("/orders", sale({ team: "Roofings" }))).assertStatus(400);
        (await desk.post("/orders", sale({ team: "GIGA, MEGA" }))).assertStatus(400);
        (await desk.post("/orders", sale({ invoices: [{ invoiceNo: "9".repeat(31), type: "Roofings" }] }))).assertStatus(400);
        (await desk.post("/orders", sale({ salesman: "x".repeat(61) }))).assertStatus(400);
        (await desk.post("/orders", sale({ runner: "x".repeat(61) }))).assertStatus(400);
        (await desk.post("/orders", sale({ runner: 5 }))).assertStatus(400);
        (await desk.post("/orders", sale({ receiver: "x".repeat(61) }))).assertStatus(400);
        (await desk.post("/orders", sale({ checkers: { Tires: ["Pedro", ""] } }))).assertStatus(400);
        (await desk.post("/orders", sale({ checkers: { Roofing: "Pedro" } }))).assertStatus(400);
        (await desk.post("/orders", sale({ checkers: { Roofing: ["Pedro", "Ana", "Ben"] } }))).assertStatus(400);
        (await desk.post("/orders", sale({ checkers: { Roofing: ["x".repeat(61), ""] } }))).assertStatus(400);
        (await desk.post("/orders", sale({ checkers: { Roofing: [5, ""] } }))).assertStatus(400);
        (await desk.post("/orders", sale({ checkers: [["Pedro"]] }))).assertStatus(400);
        for (const time of ["9:05", "24:00", "12:60", "noon", "09:05:30", 905]) {
            (await desk.post("/orders", sale({ salesTimeIn: time }))).assertStatus(400);
            (await desk.post("/orders", sale({ salesTimeOut: time }))).assertStatus(400);
        }
        (await desk.post("/orders", sale({ pickupDate: "2026-02-30" }))).assertStatus(400);
        (await desk.post("/orders", sale({ pickupDate: "tomorrow" }))).assertStatus(400);
        app.assertDatabaseCount("orders", 0);

        // a payment status sent with the order is the cashier's to set, so it's left out rather than refused
        for (const paymentStatus of ["Vale", "Cash", ""]) {
            (await desk.post("/orders", sale({ paymentStatus }))).assertStatus(201);
        }
        app.assertDatabaseCount("orders", 3, { payment_status: "" });
    });

    test("editing changes the details and invoices and keeps the number", async () => {
        await takeOrder({ invoices: [{ invoiceNo: "2223", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }] });
        const day = localDay(-2);
        const desk = await app.actingAsSales();

        const changed = (await desk.put("/admin/orders/1", sale({
            purpose: "Steel", invoices: [{ invoiceNo: "2563", type: "Steel" }], team: "MEGA", pickupDate: day,
        }))).assertStatus(200).body;

        assert.equal(changed.queueNum, 1);
        assert.equal(changed.purpose, "Steel");
        assert.deepEqual(changed.invoices, [{ invoiceNo: "2563", type: "Steel" }]);
        assert.equal(changed.team, "MEGA");
        assert.equal(changed.pickupDate, day);
        app.assertDatabaseCount("order_invoices", 1);

        // they took the items after all
        const cleared = (await desk.put("/admin/orders/1", sale({ pickupDate: null }))).assertStatus(200).body;
        assert.equal(cleared.pickupDate, undefined);
        app.assertDatabaseHas("orders", { queue_num: 1, pickup_date: null });
        // an invoice for a type the order no longer has is refused
        (await desk.put("/admin/orders/1", sale({ purpose: "Tire" }))).assertStatus(400);
    });

    test("the display shows the number but never the sales details", async () => {
        await takeOrder({ runner: "Boy Reyes", receiver: "Ana Cruz", salesTimeIn: "09:05", salesTimeOut: "09:40" });

        const { upcoming } = (await app.client().get("/queue")).assertStatus(200).body;

        assert.deepEqual(upcoming, [{ queueNum: 1, name: "Juan Dela Cruz", purpose: "Roofings, Steel" }]);
    });

    test("sales staff see the details and can open one ticket to edit it; loading staff can't", async () => {
        await takeOrder({ pickupDate: localDay(-1) });
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();

        const [listed] = (await maria.get("/admin/orders")).assertStatus(200).body;
        const opened = (await maria.get("/admin/orders/1")).assertStatus(200).body;

        assert.deepEqual(opened, listed);
        assert.deepEqual(opened.invoices, [{ invoiceNo: "2223", type: "Roofings" }]);
        (await maria.get("/admin/orders/2")).assertStatus(404);
        (await pedro.get("/admin/orders/1")).assertStatus(403);
    });

    test("the sales graph counts orders for each type of order, and each order once in all", async () => {
        await takeOrder({ purpose: "Roofings, Steel" });
        await takeOrder({ purpose: "Steel", invoices: [{ invoiceNo: "3001", type: "Steel" }] });
        await takeOrder({ purpose: "Tire", invoices: [{ invoiceNo: "3002", type: "Tire" }] });
        // a deleted one is left out
        await takeOrder({ purpose: "Tire", invoices: [{ invoiceNo: "3003", type: "Tire" }] });
        const admin = await app.actingAsAdmin();
        (await admin.delete("/admin/orders/4")).assertStatus(204);

        for (const period of ["day", "week", "month", "year"]) {
            const { buckets } = (await admin.get(`/admin/stats?period=${period}`)).assertStatus(200).body;
            const today = buckets.filter((b) => b.total > 0);

            assert.equal(today.length, 1, period);
            assert.equal(today[0].total, 3, period);
            assert.deepEqual(today[0].orders, { Roofings: 1, Steel: 2, Tire: 1 }, period);
        }
    });

    test("a deleted ticket keeps its invoices in History", async () => {
        await takeOrder({ invoices: [{ invoiceNo: "2223", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }] });
        const admin = await app.actingAsAdmin();
        (await admin.delete("/admin/orders/1")).assertStatus(204);

        const [ticket] = (await admin.get("/admin/history?deleted=1")).assertStatus(200).body;

        assert.deepEqual(ticket.invoices.map((i) => i.invoiceNo), ["2223", "5566"]);
    });
});
