/**
 * The Order sheet in Google Sheets, laid out like the loading schedule sales keeps there.
 *
 * The queue server (server/googleSheet.js) sends the orders that changed every few seconds; this web app adds a row
 * for a new order (at the bottom, oldest first) or rewrites the row of one it already has, found by its APP ID (a
 * hidden column). Orders deleted in the app are taken out. The c/o column (F) and REMARKS are typed in the sheet
 * itself: the app never writes them, so what you type there stays.
 *
 * Setup (once):
 *   1. Open the spreadsheet → Extensions → Apps Script, and paste this file in (or create a standalone project).
 *   2. Fill in SPREADSHEET_URL and SYNC_TOKEN below. SYNC_TOKEN is any long random text; the same text goes in
 *      GOOGLE_SHEET_TOKEN in the server's .env.
 *   3. Run setupSheet once from the editor (pick it in the toolbar, press Run) and allow access to the spreadsheet.
 *      It makes the ORDER SHEET tab with its headers.
 *   4. Deploy → New deployment → Web app: Execute as "Me", Who has access "Anyone". Copy the Web app URL (it ends in
 *      /exec) into GOOGLE_SHEET_URL in the server's .env, then restart the server.
 *   After changing this file, Deploy → Manage deployments → edit → Version: New version, or the old code keeps running.
 */

// the spreadsheet the orders go to; left empty, the spreadsheet this script is attached to
const SPREADSHEET_URL = "";
// the tab the orders go in; made with its headers if it isn't there
const SHEET_NAME = "ORDER SHEET";
// must match GOOGLE_SHEET_TOKEN in the server's .env; anyone without it is turned away
const SYNC_TOKEN = "";

// left to right, as in the loading schedule; key is the field the server sends (none: typed in the sheet, never
// written by the app); sub is the header's second line, in italics; time headers are yellow, as in the schedule
const COLUMNS = [
    { key: "date", header: "DATE", width: 90 },
    { key: "que", header: "QUE", width: 70 },
    { key: "team", header: "TEAM", width: 70 },
    { key: "salesman", header: "SALESMAN", width: 115 },
    { key: "assistedBy", header: "ASSISTED BY:", width: 115 },
    // care of: who the customer sent, or the trucking ("c/o JERRY ARAGON")
    { key: null, header: "", width: 200, align: "left" },
    { key: "customer", header: "CUSTOMER'S NAME", width: 330, align: "left" },
    { key: "roofing", header: "ROOFING", width: 110 },
    { key: "construction", header: "CONSTRUCTION & HARDWARE", width: 110 },
    { key: "tba", header: "TBA", width: 110 },
    { key: "chassis", header: "CHASSIS", width: 110 },
    { key: "others", header: "OTHERS", width: 110 },
    { key: "terms", header: "TERMS", width: 65, bold: true },
    { key: "salesTimeIn", header: "TIME IN", sub: "(sales)", width: 65, bold: true, yellow: true },
    { key: "salesTimeOut", header: "TIME OUT", sub: "(sales)", width: 65, bold: true, yellow: true },
    { key: "runner", header: "RUNNER", sub: "(sales)", width: 100, bold: true, color: "#ff0000" },
    { key: "receiver", header: "RECEIVER", sub: "(loading / inventory)", width: 100, bold: true },
    { key: "loadingTimeIn", header: "TIME IN", sub: "(loading / inventory)", width: 80, bold: true, yellow: true },
    { key: "loadingTimeOut", header: "TIME OUT", sub: "(loading / inventory)", width: 80, bold: true, yellow: true },
    { key: "status", header: "STATUS", width: 110 },
    { key: "doubleCheckedBy", header: "DOUBLE CHECKED BY:", width: 110 },
    { key: null, header: "REMARKS", width: 330, align: "left" },
    // the order's id in the app, so its row is found again; hidden
    { key: "id", header: "APP ID", width: 60, hidden: true },
];

const ID_COLUMN = COLUMNS.findIndex((column) => column.key === "id") + 1;
// the runs of columns the app writes, [first, last] (1-based), so a row is rewritten without touching the typed ones
const APP_RUNS = COLUMNS.reduce((runs, column, i) => {
    if (!column.key) return runs;
    const last = runs[runs.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else runs.push([i + 1, i + 1]);
    return runs;
}, []);
const HEADER_BG = "#000000";
const HEADER_YELLOW = "#ffff00";
// spare rows added when the sheet runs out, so it doesn't grow on every new order
const SPARE_ROWS = 500;

// the server's rows: { token, rows: [{ id, date, que, ... }] } adds or updates, { token, remove: [ids] } takes
// deleted orders out, and { token, keep: [ids] } takes out every app row not listed (after the server restarts)
function doPost(e) {
    let body;
    try {
        body = JSON.parse(e.postData.contents);
    } catch (err) {
        return reply_({ ok: false, error: "The request isn't JSON." });
    }
    if (!SYNC_TOKEN || body.token !== SYNC_TOKEN) return reply_({ ok: false, error: "Wrong token." });

    // one request at a time, so two can't add the same order twice
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        const sheet = orderSheet_();
        const result = { ok: true, added: 0, updated: 0, removed: 0 };
        if (Array.isArray(body.rows)) upsertRows_(sheet, body.rows, result);
        if (Array.isArray(body.remove)) {
            const remove = new Set(body.remove.map(String));
            result.removed += deleteRowsWhere_(sheet, (id) => remove.has(id));
        }
        if (Array.isArray(body.keep)) {
            const keep = new Set(body.keep.map(String));
            result.removed += deleteRowsWhere_(sheet, (id) => !keep.has(id));
        }
        SpreadsheetApp.flush();
        return reply_(result);
    } catch (err) {
        return reply_({ ok: false, error: String((err && err.message) || err) });
    } finally {
        lock.releaseLock();
    }
}

// opening the web app's link in a browser says it's running, and nothing else
function doGet() {
    return reply_({ ok: true, sheet: SHEET_NAME });
}

// run once from the editor: makes the tab with its headers (and asks for access to the spreadsheet)
function setupSheet() {
    const sheet = orderSheet_();
    Logger.log(`Ready: "${sheet.getName()}" in ${sheet.getParent().getUrl()}`);
}

function reply_(answer) {
    return ContentService.createTextOutput(JSON.stringify(answer)).setMimeType(ContentService.MimeType.JSON);
}

function spreadsheet_() {
    return SPREADSHEET_URL ? SpreadsheetApp.openByUrl(SPREADSHEET_URL) : SpreadsheetApp.getActiveSpreadsheet();
}

// the orders' tab, made and laid out the first time
function orderSheet_() {
    const book = spreadsheet_();
    let sheet = book.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = book.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) layOut_(sheet);
    return sheet;
}

// the header row, as in the schedule: black, white bold capitals, the time headers yellow, the second line in italics
function layOut_(sheet) {
    const header = sheet.getRange(1, 1, 1, COLUMNS.length);
    header.setRichTextValues([COLUMNS.map((column) => {
        const text = column.sub ? `${column.header}\n${column.sub}` : column.header;
        const rich = SpreadsheetApp.newRichTextValue().setText(text);
        if (column.sub) {
            const italic = SpreadsheetApp.newTextStyle().setItalic(true).setBold(true).build();
            rich.setTextStyle(column.header.length + 1, text.length, italic);
        }
        return rich.build();
    })]);
    header
        .setBackground(HEADER_BG)
        .setFontColors([COLUMNS.map((column) => (column.yellow ? HEADER_YELLOW : "#ffffff"))])
        .setFontWeight("bold")
        .setFontFamily("Arial")
        .setFontSize(11)
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle")
        .setWrap(true);
    sheet.setRowHeight(1, 60);
    sheet.setFrozenRows(1);
    COLUMNS.forEach((column, i) => sheet.setColumnWidth(i + 1, column.width));
    COLUMNS.forEach((column, i) => {
        if (column.hidden) sheet.hideColumns(i + 1);
    });
    if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).createFilter();
}

// rows from `first`, `count` of them, laid out like the schedule's: plain text (so "450353" and "Oct-24-26" stay as
// typed), centered except the names and notes, runner in red, wrapped so stacked invoice numbers show
function formatRows_(sheet, first, count) {
    const range = sheet.getRange(first, 1, count, COLUMNS.length);
    const each = (pick) => Array.from({ length: count }, () => COLUMNS.map(pick));
    range
        .setNumberFormat("@")
        .setFontFamily("Arial")
        .setFontSize(11)
        .setVerticalAlignment("middle")
        .setWrap(true)
        .setHorizontalAlignments(each((column) => column.align || "center"))
        .setFontWeights(each((column) => (column.bold ? "bold" : "normal")))
        .setFontColors(each((column) => column.color || "#000000"))
        .setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
}

// the server's row as the sheet's cells, left to right; "" in the typed columns, which are only written on a new row
const cellsOf_ = (row) => COLUMNS.map((column) => (column.key && row[column.key] != null ? String(row[column.key]) : ""));

// each row the server sent: rewritten in place when the sheet has it and something differs, added at the bottom when
// it doesn't
function upsertRows_(sheet, rows, result) {
    const lastRow = sheet.getLastRow();
    const existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getDisplayValues() : [];
    // APP ID -> its row (1-based) and what's in it now
    const byId = new Map();
    existing.forEach((cells, i) => {
        const id = cells[ID_COLUMN - 1];
        if (id) byId.set(id, { row: i + 2, cells });
    });

    const added = [];
    for (const row of rows) {
        const id = String(row.id);
        const cells = cellsOf_(row);
        const found = byId.get(id);
        if (!found) {
            added.push(cells);
            // a second row for the same order in one request only updates the first
            byId.set(id, { row: lastRow + added.length, cells });
            continue;
        }
        const differs = APP_RUNS.some(([from, to]) => cells.slice(from - 1, to).some((cell, i) => cell !== found.cells[from - 1 + i]));
        if (!differs) continue;
        for (const [from, to] of APP_RUNS) {
            sheet.getRange(found.row, from, 1, to - from + 1).setValues([cells.slice(from - 1, to)]);
        }
        result.updated += 1;
    }

    if (added.length) {
        const first = lastRow + 1;
        const needed = first + added.length - 1 - sheet.getMaxRows();
        if (needed > 0) {
            sheet.insertRowsAfter(sheet.getMaxRows(), needed + SPARE_ROWS);
            stretchFilter_(sheet);
        }
        // plain text before the values go in, or Sheets turns them into numbers and dates
        formatRows_(sheet, first, added.length);
        sheet.getRange(first, 1, added.length, COLUMNS.length).setValues(added);
        result.added += added.length;
    }
}

// the header's filter covers the rows it was made over, so once rows are added below them it's made again over the
// whole sheet, with the same filters people had picked
function stretchFilter_(sheet) {
    const filter = sheet.getFilter();
    if (!filter || filter.getRange().getLastRow() >= sheet.getMaxRows()) return;
    const criteria = COLUMNS.map((column, i) => filter.getColumnFilterCriteria(i + 1));
    filter.remove();
    const stretched = sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).createFilter();
    criteria.forEach((criterion, i) => {
        if (criterion) stretched.setColumnFilterCriteria(i + 1, criterion);
    });
}

// takes out the app's rows whose APP ID matches (rows typed in by hand, with no APP ID, are left alone); bottom up,
// a run of neighbouring rows at a time; how many were taken out
function deleteRowsWhere_(sheet, matches) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 0;
    const ids = sheet.getRange(2, ID_COLUMN, lastRow - 1, 1).getDisplayValues().map((cells) => cells[0]);
    let removed = 0;
    for (let i = ids.length - 1; i >= 0; i -= 1) {
        if (!ids[i] || !matches(ids[i])) continue;
        let start = i;
        while (start > 0 && ids[start - 1] && matches(ids[start - 1])) start -= 1;
        sheet.deleteRows(start + 2, i - start + 1);
        removed += i - start + 1;
        i = start;
    }
    return removed;
}
