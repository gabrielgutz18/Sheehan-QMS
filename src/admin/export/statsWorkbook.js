import ExcelJS from 'exceljs';

// the sales report as an Excel workbook: logo and company name on top, a short summary,
// then one row per day (or hour / month) with a column per product and a total row
// loaded only when someone exports, so the Excel library stays out of the admin bundle

const RED = "FFC8202A";
const MUTED = "FF6F6F6F";
const LINE = "FFDEDEDB";
const NUMBER = "#,##0";

const thin = (argb) => ({ style: "thin", color: { argb } });

// report: {
//   title, rangeLabel, productLabel, columnLabel ("Date" / "Hour" / "Month"),
//   columns: product names, rows: [{ label, values: [qty per column], tickets }], servedToday
// }
// logo: the company logo as a data: URL
export function buildStatsWorkbook(report, logo) {
    const { title, rangeLabel, productLabel, columnLabel, columns, rows, servedToday } = report;
    // one product already is the total; several get a Total qty column
    const showTotal = columns.length > 1;
    const headers = [columnLabel, ...columns, ...(showTotal ? ["Total qty"] : []), "Tickets"];
    const width = headers.length;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sheehan Inc.";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Sales", {
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.columns = headers.map((_, i) => ({ width: i === 0 ? 24 : 14 }));

    // letterhead: logo on the left, company name and report details beside it
    sheet.addImage(workbook.addImage({ base64: logo, extension: "png" }), {
        tl: { col: 0.1, row: 0.15 },
        ext: { width: 72, height: 72 },
    });
    const letterhead = [
        { text: "SHEEHAN INC.", font: { bold: true, size: 18 } },
        { text: title, font: { bold: true, size: 12 } },
        { text: `${rangeLabel}  ·  ${productLabel}`, font: { size: 11, color: { argb: MUTED } } },
        {
            text: `Exported ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
            font: { size: 10, color: { argb: MUTED } },
        },
    ];
    letterhead.forEach(({ text, font }, i) => {
        const row = sheet.getRow(i + 1);
        row.height = 20;
        sheet.mergeCells(i + 1, 2, i + 1, Math.max(width, 4));
        Object.assign(row.getCell(2), { value: text, font });
    });

    // summary
    const totalQty = rows.reduce((sum, r) => sum + r.values.reduce((a, b) => a + b, 0), 0);
    const totalTickets = rows.reduce((sum, r) => sum + r.tickets, 0);
    sheet.getCell("A6").value = "Summary";
    sheet.getCell("A6").font = { bold: true, size: 12 };
    [
        ["Served today", servedToday],
        ["Total quantity ordered", totalQty],
        ["Tickets", totalTickets],
    ].forEach(([label, value], i) => {
        const row = sheet.getRow(7 + i);
        row.getCell(1).value = label;
        Object.assign(row.getCell(2), { value, numFmt: NUMBER, font: { bold: true } });
    });

    // the table
    const headerRow = 11;
    const header = sheet.getRow(headerRow);
    header.values = headers;
    header.height = 22;
    header.eachCell((cell, col) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
        cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "right" };
    });

    // the numbers in each row, after the label
    const numbers = rows.map(({ values, tickets }) => [
        ...values,
        ...(showTotal ? [values.reduce((a, b) => a + b, 0)] : []),
        tickets,
    ]);

    const first = headerRow + 1;
    rows.forEach(({ label }, i) => {
        const row = sheet.getRow(first + i);
        row.values = [label, ...numbers[i]];
        row.eachCell((cell, col) => {
            if (col > 1) cell.numFmt = NUMBER;
            cell.border = { bottom: thin(LINE) };
        });
    });

    // totals as formulas, so they stay right if someone edits a number in Excel
    const last = first + rows.length - 1;
    const totals = sheet.getRow(last + 1);
    totals.getCell(1).value = "Total";
    for (let col = 2; col <= width; col++) {
        const letter = sheet.getColumn(col).letter;
        const result = numbers.reduce((sum, n) => sum + n[col - 2], 0);
        totals.getCell(col).value = rows.length ? { formula: `SUM(${letter}${first}:${letter}${last})`, result } : 0;
        totals.getCell(col).numFmt = NUMBER;
    }
    totals.eachCell((cell) => {
        cell.font = { bold: true };
        cell.border = { top: thin("FF111111") };
    });

    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: width } };
    return workbook;
}
