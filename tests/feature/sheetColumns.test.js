// the Order sheet laid out like the loading schedule in Google Sheets: each invoice number under its department's
// column, one above the other, and the date, sales times and who assisted the customer written the schedule's way
// run: npm test -- --test-name-pattern="sheet layout"
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { INVOICE_COLUMNS, assistedBy, invoicesByColumn, sheetDate, sheetTime } from '../../src/admin/data/sheetColumns.js';
import purpose from '../../src/data/purpose.js';

const none = { roofing: [], construction: [], tba: [], chassis: [], others: [] };

describe("sheet layout", () => {
    test("each invoice goes under its department, several stacked in the order they were added", () => {
        const order = {
            purpose: "Roofings, Tire, Steel, Chassis",
            invoices: [
                { invoiceNo: "449765", type: "Roofings" },
                { invoiceNo: "1068725", type: "Steel" },
                { invoiceNo: "449767", type: "Roofings" },
                { invoiceNo: "450023", type: "Tire" },
                { invoiceNo: "450100", type: "Chassis" },
            ],
        };

        assert.deepEqual(invoicesByColumn(order), {
            ...none, roofing: ["449765", "449767"], construction: ["1068725"], tba: ["450023"], chassis: ["450100"],
        });
    });

    test("roofing accessories go with roofing, hardware with steel, and batteries with tires", () => {
        const order = {
            purpose: "Hardwares, Roofings Accessories, Battery",
            invoices: [
                { invoiceNo: "1", type: "Hardwares" },
                { invoiceNo: "2", type: "Roofings Accessories" },
                { invoiceNo: "3", type: "Battery" },
            ],
        };

        assert.deepEqual(invoicesByColumn(order), { ...none, roofing: ["2"], construction: ["1"], tba: ["3"] });
    });

    test("every type of order Customer order offers has a column of its own", () => {
        const placed = INVOICE_COLUMNS.flatMap((column) => column.types);
        for (const { name } of purpose) assert.ok(placed.includes(name), `${name} has no column`);
    });

    test("an older invoice with no type goes under the order's only type, or Others when it has several", () => {
        assert.deepEqual(invoicesByColumn({ purpose: "Chassis", invoices: [{ invoiceNo: "7", type: "" }] }),
            { ...none, chassis: ["7"] });
        assert.deepEqual(invoicesByColumn({ purpose: "Roofings, Steel", invoices: [{ invoiceNo: "8", type: "" }] }),
            { ...none, others: ["8"] });
        assert.deepEqual(invoicesByColumn({ purpose: "Gutters", invoices: [{ invoiceNo: "9", type: "Gutters" }] }),
            { ...none, others: ["9"] });
    });

    test("an order with no invoices leaves every column empty", () => {
        assert.deepEqual(invoicesByColumn({ purpose: "Roofings", orders: [{ item: "Long span", qty: 4 }] }), none);
    });

    test("the date and the sales times are written as on the schedule", () => {
        assert.equal(sheetDate(new Date(2026, 9, 24, 9, 5).toISOString()), "Oct-24-26");
        assert.equal(sheetDate(new Date(2027, 0, 3, 16, 0).toISOString()), "Jan-03-27");
        assert.equal(sheetTime("08:16"), "0816H");
        assert.equal(sheetTime("13:05"), "1305H");
        assert.equal(sheetTime(""), "");
        assert.equal(sheetTime(undefined), "");
    });

    test("assisted by is whoever served them at their counter, even once loading has them", () => {
        const maria = { id: 2, name: "Maria Santos" };
        const pedro = { id: 3, name: "Pedro Garcia" };

        assert.equal(assistedBy({ status: "pending" }), "");
        assert.equal(assistedBy({ status: "serving", servedBy: maria }), "Maria Santos");
        assert.equal(assistedBy({ status: "serving", atLoading: true, servedBy: pedro, handedOver: { by: maria } }), "Maria Santos");
        assert.equal(assistedBy({ status: "done", servedBy: maria, loaded: { by: pedro } }), "Maria Santos");
    });
});
