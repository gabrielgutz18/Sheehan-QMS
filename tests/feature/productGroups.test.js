// the By product tab on the Cashier page: every type of order is its own group, none merged; a ticket with several shows
// under each, with only that type's invoices, and an invoice that can't be placed goes under No product
// run: npm test            only these: npm test -- --test-name-pattern="By product"
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { NO_PRODUCT, groupsByProduct, ticketCount } from "../../src/admin/data/productGroups.js";

let nextId = 1;
const order = (purpose, invoices = []) => ({ id: nextId++, purpose, invoices });
const invoice = (invoiceNo, type) => ({ invoiceNo, type });

// the lines under one group
const linesIn = (groups, name) => groups.find((group) => group.name === name).lines;
const numbers = (line) => line.invoices.map(({ invoiceNo }) => invoiceNo);

describe("By product", () => {
    test("every type of order has its own group, in Customer order's order, then No product", () => {
        assert.deepEqual(
            groupsByProduct([]).map(({ name }) => name),
            [
                "Roofings",
                "Tire",
                "Steel",
                "Hardwares",
                "Chassis",
                "Roofings Accessories",
                "Battery",
                "For Logistics",
                NO_PRODUCT,
            ],
        );
    });

    test("similar types stay split: Roofings Accessories is not Roofings, and Battery is not Tire", () => {
        const roofing = order("Roofings", [invoice("1", "Roofings")]);
        const accessories = order("Roofings Accessories", [invoice("2", "Roofings Accessories")]);
        const battery = order("Battery", [invoice("3", "Battery")]);
        const groups = groupsByProduct([roofing, accessories, battery]);

        assert.deepEqual(
            linesIn(groups, "Roofings").map((line) => line.order),
            [roofing],
        );
        assert.deepEqual(
            linesIn(groups, "Roofings Accessories").map((line) => line.order),
            [accessories],
        );
        assert.deepEqual(
            linesIn(groups, "Battery").map((line) => line.order),
            [battery],
        );
        assert.deepEqual(linesIn(groups, "Tire"), []);
    });

    test("a ticket with several types shows under each, with only that type's invoices and what else it has", () => {
        const mixed = order("Steel, Hardwares, For Logistics", [
            invoice("101", "Steel"),
            invoice("102", "Steel"),
            invoice("201", "Hardwares"),
            invoice("301", "For Logistics"),
        ]);
        const groups = groupsByProduct([mixed]);

        const [steel] = linesIn(groups, "Steel");
        assert.equal(steel.order, mixed);
        assert.deepEqual(numbers(steel), ["101", "102"]);
        assert.deepEqual(steel.also, ["Hardwares", "For Logistics"]);

        const [hardwares] = linesIn(groups, "Hardwares");
        assert.deepEqual(numbers(hardwares), ["201"]);
        assert.deepEqual(hardwares.also, ["Steel", "For Logistics"]);
    });

    test("a ticket of one type has nothing else to mention", () => {
        const [line] = linesIn(groupsByProduct([order("Tire", [invoice("1", "Tire")])]), "Tire");
        assert.deepEqual(line.also, []);
    });

    test("an older invoice with no type goes with the order's type when it has only one", () => {
        const [line] = linesIn(groupsByProduct([order("Chassis", [invoice("9", "")])]), "Chassis");
        assert.deepEqual(numbers(line), ["9"]);
    });

    test("an invoice with no type on a ticket of several goes under No product, and the ticket stays under its types", () => {
        const mixed = order("Roofings, Steel", [invoice("1", "Roofings"), invoice("2", "")]);
        const groups = groupsByProduct([mixed]);

        assert.deepEqual(numbers(linesIn(groups, NO_PRODUCT)[0]), ["2"]);
        assert.deepEqual(linesIn(groups, NO_PRODUCT)[0].also, ["Roofings", "Steel"]);
        assert.deepEqual(numbers(linesIn(groups, "Roofings")[0]), ["1"]);
        // bought but with no invoice yet: still that type's, and No product isn't one to go and look at
        assert.deepEqual(numbers(linesIn(groups, "Steel")[0]), []);
        assert.deepEqual(linesIn(groups, "Steel")[0].also, ["Roofings"]);
    });

    test("an invoice of a type no longer taken goes under No product", () => {
        const old = order("Plain Sheet", [invoice("7", "Plain Sheet")]);
        assert.deepEqual(numbers(linesIn(groupsByProduct([old]), NO_PRODUCT)[0]), ["7"]);
    });

    test("a ticket with no type and no invoices still shows, under No product", () => {
        const empty = order("", []);
        assert.deepEqual(
            linesIn(groupsByProduct([empty]), NO_PRODUCT).map((line) => line.order),
            [empty],
        );
    });

    test("tickets keep the order they came in, newest first as on the Orders tab", () => {
        const newest = order("Steel", [invoice("2", "Steel")]);
        const older = order("Steel", [invoice("1", "Steel")]);
        assert.deepEqual(
            linesIn(groupsByProduct([newest, older]), "Steel").map((line) => line.order),
            [newest, older],
        );
    });

    test("the count is of tickets, so a mixed one counts once across the groups", () => {
        const mixed = order("Roofings, Steel", [invoice("1", "Roofings"), invoice("2", "Steel")]);
        const single = order("Tire", [invoice("3", "Tire")]);
        assert.equal(ticketCount(groupsByProduct([mixed, single])), 2);
    });
});
