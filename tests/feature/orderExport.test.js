// History's Export to Excel: every ticket of a range of days, one row each with who sold it, who served it at sales
// (even once loading has them), the sales team, the runner, the receiver, the invoices and the rest of Customer order;
// deleted tickets left out
// run: npm test            only these: npm test -- --test-name-pattern="order export"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import ExcelJS from 'exceljs';

import {
    ORDER_COLUMNS, daysBetween, excelDate, excelTime, orderExportRows,
} from '../../src/admin/export/orderRows.js';
import { buildOrdersWorkbook } from '../../src/admin/export/ordersWorkbook.js';
import { bootApp, localDay } from '../support/testApp.js';

// a 1 × 1 PNG, standing in for the logo
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

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
    invoices: [{ invoiceNo: "43355521", type: "Roofings" }, { invoiceNo: "5566", type: "Steel" }],
    salesman: "Maria Santos",
    runner: "Jose Rizal",
    receiver: "Andres Bonifacio",
    salesTimeIn: "09:05",
    salesTimeOut: "13:30",
    checkers: { Roofing: ["Pedro", "Rico"] },
    team: "GIGA",
    pickupDate: null,
    ...overrides,
});

const takeOrder = async (overrides) => (await app.client().post("/orders", sale(overrides))).assertStatus(201).body;

describe("order export", () => {
    test("each of the day's tickets is a row with its sales details and who served it, oldest first", async () => {
        await takeOrder();
        await takeOrder({
            name: "Ana Reyes", purpose: "Tire", invoices: [{ invoiceNo: "7788", type: "Tire" }],
            runner: "", receiver: "", salesTimeIn: "", salesTimeOut: "", checkers: {},
            team: "", pickupDate: localDay(-1),
        });
        await takeOrder({ name: "Deleted Customer", purpose: "Steel", invoices: [{ invoiceNo: "1", type: "Steel" }] });

        // Maria serves Juan at her counter and hands him over to loading, where Pedro takes him: he's still hers
        const maria = await app.actingAsSales("Maria Santos");
        (await maria.post("/admin/orders/1/handover")).assertStatus(200);
        const pedro = await app.actingAsLoading("Pedro Garcia");
        (await pedro.post("/admin/loading/1/call")).assertStatus(200);
        // the cashier marks Juan's as paid; Ana's isn't set yet
        (await (await app.actingAsCashier()).patch("/admin/payments/1", { paymentStatus: "Paid" })).assertStatus(200);
        const admin = await app.actingAsAdmin();
        (await admin.delete("/admin/orders/3")).assertStatus(204);

        const history = (await maria.get(`/admin/history?day=${localDay()}&search=&deleted=0`)).assertStatus(200).body;
        const rows = orderExportRows(history);

        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map((r) => r.ticket), ["RS 01", "T 02"]);
        assert.deepEqual(rows[0], {
            date: excelDate(localDay()),
            ticket: "RS 01",
            name: "Juan Dela Cruz",
            purpose: "Roofings, Steel",
            invoices: "43355521 (Roofings), 5566 (Steel)",
            salesman: "Maria Santos",
            servedBy: "Maria Santos",
            team: "GIGA",
            runner: "Jose Rizal",
            receiver: "Andres Bonifacio",
            paymentStatus: "Paid",
            salesTimeIn: excelTime("09:05"),
            salesTimeOut: excelTime("13:30"),
            checkers: "Roofing: Pedro / Rico",
            pickupDate: null,
            status: "At loading",
        });
        // one type of order: the invoice needs no type beside it; nothing filled in stays blank
        assert.equal(rows[1].invoices, "7788");
        assert.equal(rows[1].servedBy, "");
        assert.equal(rows[1].team, "");
        assert.equal(rows[1].runner, "");
        assert.equal(rows[1].paymentStatus, "");
        assert.equal(rows[1].salesTimeIn, null);
        assert.deepEqual(rows[1].pickupDate, excelDate(localDay(-1)));
        assert.equal(rows[1].status, "Waiting");
    });

    test("the days of a range, both ends included, across a month's end", () => {
        assert.deepEqual(daysBetween("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
        assert.deepEqual(daysBetween("2026-10-24", "2026-10-24"), ["2026-10-24"]);
        assert.deepEqual(daysBetween("2026-10-24", "2026-10-23"), []);
        assert.deepEqual(daysBetween("", "2026-10-23"), []);
    });

    test("days and sales times are Excel dates and times, so they sort and filter", () => {
        assert.equal(excelDate("2026-10-24").toISOString(), "2026-10-24T00:00:00.000Z");
        assert.equal(excelDate(null), null);
        assert.equal(excelTime("12:00"), 0.5);
        assert.equal(excelTime("13:30"), 13.5 / 24);
        assert.equal(excelTime(""), null);
    });

    test("the workbook has a header row of the columns and a row per ticket", async () => {
        await takeOrder();
        const admin = await app.actingAsAdmin();
        const history = (await admin.get(`/admin/history?day=${localDay()}&search=&deleted=0`)).assertStatus(200).body;
        const report = { title: "Customer orders", rangeLabel: "24 Oct 2026", rows: orderExportRows(history), fullDays: ["24 Oct 2026"] };

        const buffer = await buildOrdersWorkbook(report, LOGO).xlsx.writeBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.getWorksheet("Customer orders");

        assert.equal(sheet.getCell("A1").value, null);
        assert.equal(sheet.getCell("B1").value, "SHEEHAN INC.");
        assert.equal(sheet.getCell("B7").value, 1);
        assert.match(sheet.getCell("A8").value, /newest 200 tickets of 24 Oct 2026/);
        assert.deepEqual(sheet.getRow(10).values.slice(1), ORDER_COLUMNS.map((c) => c.header));

        const cell = (header) => sheet.getRow(11).getCell(ORDER_COLUMNS.findIndex((c) => c.header === header) + 1);
        assert.equal(cell("Ticket").value, "RS 01");
        assert.equal(cell("Invoice no.").value, "43355521 (Roofings), 5566 (Steel)");
        assert.equal(cell("Runner").value, "Jose Rizal");
        assert.equal(cell("Receiver").value, "Andres Bonifacio");
        assert.equal(cell("Salesman").value, "Maria Santos");
        assert.deepEqual(cell("Date").value, excelDate(localDay()));
        assert.equal(cell("Date").numFmt, "d mmm yyyy");
        assert.equal(cell("Time in (sales)").numFmt, "h:mm AM/PM");
    });
});
