// the gates of the loading yards: a customer called to Roofings is told Gate Y (Yero), one called to Steel Gate B
// (Bakalan), on the display under the number, on a line of its own, and by the announcer
// run: npm test            only these: npm test -- --test-name-pattern="gate"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { spokenGate, splitGate } from "../../src/data/callNote.js";
import { proceedTo } from "../../src/data/loadingAreas.js";
import { quickRemarksFor } from "../../src/admin/data/loadingAreas.js";
import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

describe("loading gates", () => {
    test("Roofings is at Gate Y: Yero and Steel at Gate B: Bakalan; other areas have no gate", () => {
        assert.equal(proceedTo("Roofings"), "Please proceed to Roofings (Gate Y: Yero)");
        assert.equal(proceedTo("Steel"), "Please proceed to Steel (Gate B: Bakalan)");
        assert.equal(proceedTo("Logistics"), "Please proceed to Logistics");
        assert.equal(proceedTo("Hardware"), "Please proceed to Hardware");
        // the call dialog's one-tap messages carry them too
        assert.deepEqual(
            quickRemarksFor("loading")
                .map(({ text }) => text)
                .slice(0, 2),
            ["Please proceed to Roofings (Gate Y: Yero)", "Please proceed to Steel (Gate B: Bakalan)"],
        );
    });

    test("the display puts the gate on its own line, and the announcer says it", () => {
        assert.deepEqual(splitGate("Please proceed to Roofings (Gate Y: Yero)"), [
            "Please proceed to Roofings",
            "(Gate Y: Yero)",
        ]);
        assert.deepEqual(splitGate("Please proceed to Window 1"), ["Please proceed to Window 1", ""]);
        // a note someone typed with brackets of their own stays as it is
        assert.deepEqual(splitGate("Bring the receipt (pink copy)"), ["Bring the receipt (pink copy)", ""]);
        assert.equal(
            spokenGate("Please proceed to Steel (Gate B: Bakalan)"),
            "Please proceed to Steel, Gate B, Bakalan",
        );
        assert.equal(spokenGate("Please wait"), "Please wait");
    });

    test("Start loading with no call tells the display the gate", async () => {
        await app
            .client()
            .post("/orders", {
                name: "Juan Dela Cruz",
                purpose: "Roofings",
                orders: [],
                invoices: [{ invoiceNo: "449765", type: "Roofings" }],
                salesman: "Maria Santos",
                team: "GIGA",
                pickupDate: null,
            })
            .then((r) => r.assertStatus(201));
        const maria = await app.actingAsSales();
        const pedro = await app.actingAsLoading();
        (await maria.post("/admin/orders/1/handover")).assertStatus(200);

        (await pedro.post("/admin/loading/1/start", { area: "Roofings" })).assertStatus(200);
        const { serving } = (await app.client().get("/queue")).assertStatus(200).body;
        assert.equal(serving[0].remarks, "Please proceed to Roofings (Gate Y: Yero)");
    });
});
