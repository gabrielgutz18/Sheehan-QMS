import ExcelJS from 'exceljs';

import { ORDER_COLUMNS } from './orderRows.js';

// the Customer orders export as an Excel workbook: logo and company name on top, a short summary, then one row per
// ticket with who sold it, who served it, the runner, the receiver, the invoices and the rest of Customer order
// loaded only when someone exports, so the Excel library stays out of the admin bundle

const RED = "FFC8202A";
const MUTED = "FF6F6F6F";
const LINE = "FFDEDEDB";

const thin = (argb) => ({ style: "thin", color: { argb } });

// report: { title, rangeLabel, rows: from orderExportRows, fullDays: labels of days that may have more tickets }
// logo: the company logo as a data: URL
export function buildOrdersWorkbook(report, logo) {
    const { title, rangeLabel, rows, fullDays = [] } = report;
    const width = ORDER_COLUMNS.length;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sheehan Inc.";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Customer orders", {
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.columns = ORDER_COLUMNS.map(({ width: w }) => ({ width: w }));

    // letterhead: logo on the left, company name and report details beside it
    sheet.addImage(workbook.addImage({ base64: logo, extension: "png" }), {
        tl: { col: 0.1, row: 0.15 },
        ext: { width: 72, height: 72 },
    });
    const letterhead = [
        { text: "SHEEHAN INC.", font: { bold: true, size: 18 } },
        { text: title, font: { bold: true, size: 12 } },
        { text: rangeLabel, font: { size: 11, color: { argb: MUTED } } },
        {
            text: `Exported ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
            font: { size: 10, color: { argb: MUTED } },
        },
    ];
    letterhead.forEach(({ text, font }, i) => {
        const row = sheet.getRow(i + 1);
        row.height = 20;
        sheet.mergeCells(i + 1, 2, i + 1, 8);
        Object.assign(row.getCell(2), { value: text, font });
    });

    // summary
    sheet.getCell("A6").value = "Summary";
    sheet.getCell("A6").font = { bold: true, size: 12 };
    sheet.getCell("A7").value = "Orders";
    Object.assign(sheet.getCell("B7"), { value: rows.length, font: { bold: true } });
    // History gives at most 200 tickets a day, so a busier day is cut short
    if (fullDays.length) {
        sheet.mergeCells(8, 1, 8, width);
        Object.assign(sheet.getCell("A8"), {
            value: `Only the newest 200 tickets of ${fullDays.join(", ")} are listed.`,
            font: { italic: true, color: { argb: RED } },
        });
    }

    // the table
    const headerRow = 10;
    const header = sheet.getRow(headerRow);
    header.values = ORDER_COLUMNS.map((c) => c.header);
    header.height = 22;
    header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
        cell.alignment = { vertical: "middle" };
    });

    rows.forEach((values, i) => {
        const row = sheet.getRow(headerRow + 1 + i);
        row.values = ORDER_COLUMNS.map(({ key }) => values[key] ?? null);
        ORDER_COLUMNS.forEach(({ numFmt }, col) => {
            const cell = row.getCell(col + 1);
            if (numFmt) cell.numFmt = numFmt;
            cell.border = { bottom: thin(LINE) };
            cell.alignment = { vertical: "top", horizontal: "left" };
        });
    });

    // the header and the date and ticket stay in view while scrolling
    sheet.views = [{ state: "frozen", xSplit: 2, ySplit: headerRow }];
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: width } };
    return workbook;
}
