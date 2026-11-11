// the pop-up that tells a department an order is coming: today's orders staff made that aren't handed over yet, cut
// down to the department's own types of order and invoices
// run: npm test            only these: npm test -- --test-name-pattern="new orders"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

// roofing, steel and hardware on one ticket
const MIXED = {
    name: "Juan Dela Cruz",
    purpose: "Roofings, Steel, Hardwares",
    orders: [],
    invoices: [
        { invoiceNo: "449765", type: "Roofings" },
        { invoiceNo: "2231", type: "Steel" },
        { invoiceNo: "8812", type: "Hardwares" },
    ],
    salesman: "Maria Santos",
    runner: "",
    team: "GIGA",
    pickupDate: null,
};

const newOrders = async (staff) => (await staff.get("/admin/new-orders")).assertStatus(200).body;

describe("new orders", () => {
    test("each department is told only its own part of the order", async () => {
        const maria = await app.actingAsSales();
        (await maria.post("/orders", MIXED)).assertStatus(201);

        const [forLoading] = await newOrders(await app.actingAsLoading());
        assert.equal(forLoading.ticket, "RSH 01");
        assert.equal(forLoading.name, "Juan Dela Cruz");
        assert.deepEqual(forLoading.types, ["Roofings", "Steel"]);
        assert.deepEqual(forLoading.invoices, ["449765", "2231"]);

        const [forHardware] = await newOrders(await app.actingAsHardware());
        assert.deepEqual(forHardware.types, ["Hardwares"]);
        assert.deepEqual(forHardware.invoices, ["8812"]);

        assert.deepEqual(await newOrders(await app.actingAsService()), []);
    });

    test("Service is told about a Tire or Battery, the same as Loading and Hardware about theirs", async () => {
        const maria = await app.actingAsSales("Maria Santos");
        const service = await app.actingAsService();
        const sale = {
            ...MIXED,
            purpose: "Roofings, Tire, Battery",
            invoices: [
                { invoiceNo: "449765", type: "Roofings" },
                { invoiceNo: "450023", type: "Tire" },
                { invoiceNo: "450024", type: "Battery" },
            ],
        };
        (await maria.post("/orders", sale)).assertStatus(201);

        const [coming] = await newOrders(service);
        assert.deepEqual(coming.types, ["Tire", "Battery"]);
        assert.deepEqual(coming.invoices, ["450023", "450024"]);
        assert.equal(coming.handedOver, undefined);

        (await maria.post("/admin/orders/1/handover")).assertStatus(200);
        assert.equal((await newOrders(service))[0].handedOver.by, "Maria Santos");
    });

    test("Loading is told about its Stainless orders, the same as its steel", async () => {
        const maria = await app.actingAsSales("Maria Santos");
        const loading = await app.actingAsLoading();
        const sale = {
            ...MIXED,
            purpose: "Steel, Stainless",
            invoices: [
                { invoiceNo: "2231", type: "Steel" },
                { invoiceNo: "701", type: "Stainless" },
            ],
        };
        (await maria.post("/orders", sale)).assertStatus(201);

        const [coming] = await newOrders(loading);
        assert.deepEqual(coming.types, ["Steel", "Stainless"]);
        assert.deepEqual(coming.invoices, ["2231", "701"]);
        assert.equal(coming.handedOver, undefined);

        (await maria.post("/admin/orders/1/handover")).assertStatus(200);
        assert.equal((await newOrders(loading))[0].handedOver.by, "Maria Santos");
    });

    test("a ticket from the kiosk and a Customer Report aren't orders from sales", async () => {
        (await app.client().post("/orders", MIXED)).assertStatus(201);
        const report = { name: "Liza Cruz", purpose: "Customer Report", orders: [], concern: "Leaking." };
        (await (await app.actingAsSales()).post("/orders", report)).assertStatus(201);

        assert.deepEqual(await newOrders(await app.actingAsLoading()), []);
    });

    test("it's marked once sales hand it over, and goes once they finish it themselves or delete it", async () => {
        const maria = await app.actingAsSales();
        const admin = await app.actingAsAdmin();
        const loading = await app.actingAsLoading();
        for (const name of ["Handed Over", "Finished", "Deleted"]) {
            (
                await maria.post("/orders", { ...MIXED, name, invoices: [], orders: [{ item: "Long span", qty: 1 }] })
            ).assertStatus(201);
        }
        assert.equal((await newOrders(loading)).length, 3);

        (await maria.post("/admin/orders/1/handover")).assertStatus(200);
        (await maria.patch("/admin/orders/2", { status: "done" })).assertStatus(200);
        (await admin.delete("/admin/orders/3")).assertStatus(204);

        const left = await newOrders(loading);
        assert.deepEqual(
            left.map((order) => order.name),
            ["Handed Over"],
        );
        assert.ok(left[0].handedOver);
    });

    test("a hand-over says who did it and when, to each department with a part in it", async () => {
        const maria = await app.actingAsSales("Maria Santos");
        const loading = await app.actingAsLoading();
        const hardware = await app.actingAsHardware();
        (await maria.post("/orders", MIXED)).assertStatus(201);
        assert.equal((await newOrders(loading))[0].handedOver, undefined);

        (await maria.post("/admin/orders/1/handover")).assertStatus(200);

        const [forLoading] = await newOrders(loading);
        assert.equal(forLoading.handedOver.by, "Maria Santos");
        assert.ok(forLoading.handedOver.at);
        assert.deepEqual(forLoading.types, ["Roofings", "Steel"]);
        const [forHardware] = await newOrders(hardware);
        assert.equal(forHardware.handedOver.by, "Maria Santos");
        assert.deepEqual(forHardware.invoices, ["8812"]);
        assert.deepEqual(await newOrders(await app.actingAsService()), []);
    });

    test("a kiosk ticket isn't new from sales, but its hand-over still counts", async () => {
        (await app.client().post("/orders", MIXED)).assertStatus(201);
        const loading = await app.actingAsLoading();
        assert.deepEqual(await newOrders(loading), []);

        (await (await app.actingAsSales()).post("/admin/orders/1/handover")).assertStatus(200);

        assert.equal((await newOrders(loading))[0].handedOver.by, "Maria Santos");
    });

    test("only the four departments have it", async () => {
        const maria = await app.actingAsSales();
        for (const staff of [maria, await app.actingAsSecurity(), await app.actingAsCashier()]) {
            (await staff.get("/admin/new-orders")).assertStatus(403);
        }
        (await app.client().get("/admin/new-orders")).assertStatus(401);
    });
});
