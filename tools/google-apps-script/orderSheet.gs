/**
 * The Order sheet in Google Sheets, in the format of the sheet itself.
 *
 * The queue server (server/googleSheet.js) sends the orders that changed every few seconds; this web app adds a row for
 * a new order or updates the row of one it already has, found by its APP ID (a hidden column).
 *
 * The format is yours: the columns are found by their header names, so they can be in any order, with title rows above
 * them and columns of your own between them. A new row copies the format of the first row under the headers. On an
 * empty tab, the script makes the loading schedule's layout itself.
 *
 * Your edits stay: a cell someone typed over is left alone, even when the order changes in the app. Clear the cell and
 * the app fills it in again. The sheet doesn't send anything back: an edit here doesn't change the order in the app.
 *
 * Setup (once):
 *   1. Open the spreadsheet → Extensions → Apps Script, and paste this file in.
 *   2. Fill in SYNC_TOKEN below with any long random text; the same text goes in GOOGLE_SHEET_TOKEN in the server's .env.
 *   3. Set SHEET_NAME to your tab's name. If its headers take two rows, set HEADER_ROWS to 2.
 *   4. Run setupSheet once from the editor (pick it in the toolbar, press Run) and allow access to the spreadsheet.
 *      The log lists the columns it found, and the ones it didn't.
 *   5. Deploy → New deployment → Web app: Execute as "Me", Who has access "Anyone". Copy the Web app URL (it ends in
 *      /exec) into GOOGLE_SHEET_URL in the server's .env, then restart the server. Every order is sent again then.
 *   After changing this file, Deploy → Manage deployments → edit → Version: New version, or the old code keeps running.
 *
 * Changed the format of the first row and want the others to match? Run formatAllRows from the editor.
 */

// the spreadsheet the orders go to; left empty, the spreadsheet this script is attached to
const SPREADSHEET_URL = "";
// the tab the orders go in; made with the schedule's layout if it isn't there
const SHEET_NAME = "ORDER SHEET";
// must match GOOGLE_SHEET_TOKEN in the server's .env; anyone without it is turned away
const SYNC_TOKEN = "";
// how many rows the headers take; the first of them has the names, and the orders start right after the last
const HEADER_ROWS = 1;

// the columns, left to right as in the loading schedule; key is the field the server sends (none: typed in the sheet,
// never written by the app); also: other header names it's found by; sub, width, bold, yellow, color and align are only
// for the layout made on an empty tab; a bare "TIME IN" goes to the sales column first and to loading's after it
const COLUMNS = [
    { key: "date", header: "DATE", width: 90 },
    { key: "que", header: "QUE", also: ["QUEUE", "TICKET"], width: 70 },
    { key: "team", header: "TEAM", width: 70 },
    { key: "salesman", header: "SALESMAN", width: 115 },
    { key: "assistedBy", header: "ASSISTED BY", width: 115 },
    // care of: who the customer sent, or the trucking ("c/o JERRY ARAGON")
    { key: null, header: "", width: 200, align: "left" },
    { key: "customer", header: "CUSTOMER'S NAME", also: ["CUSTOMER NAME", "CUSTOMER"], width: 330, align: "left" },
    { key: "roofing", header: "ROOFING", stacked: true, width: 110 },
    { key: "construction", header: "CONSTRUCTION & HARDWARE", stacked: true, width: 110 },
    { key: "tba", header: "TBA", stacked: true, width: 110 },
    { key: "chassis", header: "CHASSIS", stacked: true, width: 110 },
    { key: "others", header: "OTHERS", stacked: true, width: 110 },
    { key: "terms", header: "TERMS", width: 65, bold: true },
    { key: "salesTimeIn", header: "TIME IN", sub: "(sales)", also: ["TIME IN"], width: 65, bold: true, yellow: true },
    { key: "salesTimeOut", header: "TIME OUT", sub: "(sales)", also: ["TIME OUT"], width: 65, bold: true, yellow: true },
    { key: "runner", header: "RUNNER", sub: "(sales)", also: ["RUNNER"], width: 100, bold: true, color: "#ff0000" },
    { key: "receiver", header: "RECEIVER", sub: "(loading / inventory)", also: ["RECEIVER"], width: 100, bold: true },
    { key: "loadingTimeIn", header: "TIME IN", sub: "(loading / inventory)", also: ["TIME IN"], width: 80, bold: true, yellow: true },
    { key: "loadingTimeOut", header: "TIME OUT", sub: "(loading / inventory)", also: ["TIME OUT"], width: 80, bold: true, yellow: true },
    { key: "status", header: "STATUS", width: 110 },
    { key: "doubleCheckedBy", header: "DOUBLE CHECKED BY", width: 110 },
    { key: null, header: "REMARKS", width: 330, align: "left" },
];

// the script's own columns, hidden, added after the sheet's last column if they aren't there: the order's id in the app,
// where its row goes ("0 2026-10-29 0003": the group, the day, the number; see sortKey in server/googleSheet.js), and
// what the app last wrote in the row, which is how an edit is told from the app's own value
const APP_ID = "APP ID";
const APP_SORT = "APP SORT";
const APP_LAST = "APP LAST";
const APP_COLUMNS = [APP_ID, APP_SORT, APP_LAST];

const HEADER_BG = "#000000";
const HEADER_YELLOW = "#ffff00";
// how far down a title above the headers can push them
const HEADER_SEARCH_ROWS = 20;
// spare rows added when the sheet runs out, so it doesn't grow on every new order
const SPARE_ROWS = 500;

// the server's rows: { token, rows: [{ id, date, que, ... }] } adds or updates, { token, remove: [ids] } takes deleted
// orders out, and { token, keep: [ids] } takes out every app row not listed (after the server restarts)
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
    try {
        lock.waitLock(30000);
        const sheet = orderSheet_();
        const layout = layoutOf_(sheet);
        const result = { ok: true, added: 0, updated: 0, kept: 0, removed: 0 };
        if (Array.isArray(body.rows) && upsertRows_(sheet, layout, body.rows, result)) sortRows_(sheet, layout);
        if (Array.isArray(body.remove)) {
            const remove = new Set(body.remove.map(String));
            result.removed += deleteRowsWhere_(sheet, layout, (id) => remove.has(id));
        }
        if (Array.isArray(body.keep)) {
            const keep = new Set(body.keep.map(String));
            result.removed += deleteRowsWhere_(sheet, layout, (id) => !keep.has(id));
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

// run once from the editor: asks for access to the spreadsheet, and says which columns it found
function setupSheet() {
    const sheet = orderSheet_();
    const layout = layoutOf_(sheet);
    const fields = COLUMNS.filter((column) => column.key);
    const missing = fields.filter((column) => !layout.columns[column.key]).map(labelOf_);
    const found = fields.filter((column) => layout.columns[column.key])
        .map((column) => `${labelOf_(column)} in column ${layout.columns[column.key]}`);
    Logger.log(`Ready: "${sheet.getName()}" in ${sheet.getParent().getUrl()}`);
    Logger.log(`The headers are in row ${layout.headerRow}, and the orders start in row ${layout.dataRow}.`);
    Logger.log(`Found: ${found.join(", ")}`);
    Logger.log(missing.length ? `Not found, so not written: ${missing.join(", ")}` : "Every column was found.");
}

// run from the editor: every order's row takes the format of the first one, and stays plain text
function formatAllRows() {
    const sheet = orderSheet_();
    const layout = layoutOf_(sheet);
    const count = sheet.getLastRow() - layout.dataRow;
    if (count > 0) formatLikeFirstRow_(sheet, layout, layout.dataRow + 1, count);
}

function reply_(answer) {
    return ContentService.createTextOutput(JSON.stringify(answer)).setMimeType(ContentService.MimeType.JSON);
}

function spreadsheet_() {
    return SPREADSHEET_URL ? SpreadsheetApp.openByUrl(SPREADSHEET_URL) : SpreadsheetApp.getActiveSpreadsheet();
}

// the orders' tab; an empty one gets the schedule's layout, and one with anything in it is left as it is
function orderSheet_() {
    const book = spreadsheet_();
    const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) layOut_(sheet);
    return sheet;
}

// "Time In\n(Sales)" and "TIME IN (sales):" are the same header
const normalized_ = (text) => String(text).replace(/\s+/g, " ").replace(/’/g, "'").trim().replace(/:$/, "").toUpperCase();
// names come from the public kiosk too, and Sheets would run "=IMPORTXML(...)" as a formula: the "'" in front makes it
// text, and it doesn't show in the cell
const asText_ = (text) => (/^[=+\-@]/.test(text) ? `'${text}` : text);
const labelOf_ = (column) => (column.sub ? `${column.header} ${column.sub}` : column.header);
const namesOf_ = (column) => [labelOf_(column), ...(column.also || [])].map(normalized_);

// where everything is in this sheet: { headerRow, dataRow, width, columns: { [key]: column number }, app: { [name]:
// column number } }; the header row is the one with the customer's name in it
function layoutOf_(sheet) {
    const rows = sheet.getRange(1, 1, Math.min(HEADER_SEARCH_ROWS, sheet.getLastRow()), sheet.getLastColumn()).getDisplayValues();
    const customer = namesOf_(COLUMNS.find((column) => column.key === "customer"));
    const index = rows.findIndex((cells) => cells.some((cell) => customer.includes(normalized_(cell))));
    if (index < 0) throw new Error(`Can't find the headers in "${SHEET_NAME}": no column is named CUSTOMER'S NAME.`);

    const headers = rows[index].map(normalized_);
    const columns = {};
    const fields = COLUMNS.filter((column) => column.key);
    // the exact names first, so "TIME IN (LOADING / INVENTORY)" isn't taken by a bare TIME IN's turn
    for (const exact of [true, false]) {
        headers.forEach((header, i) => {
            if (!header || Object.values(columns).includes(i + 1)) return;
            const field = fields.find((column) => !columns[column.key] &&
                (exact ? normalized_(labelOf_(column)) === header : namesOf_(column).includes(header)));
            if (field) columns[field.key] = i + 1;
        });
    }

    const app = {};
    let last = headers.length;
    for (const name of APP_COLUMNS) {
        const at = headers.indexOf(name);
        app[name] = at >= 0 ? at + 1 : (last += 1);
        if (at < 0) addAppColumn_(sheet, index + 1, app[name], name);
    }
    return { headerRow: index + 1, dataRow: index + 1 + HEADER_ROWS, width: last, columns, app };
}

function addAppColumn_(sheet, headerRow, column, name) {
    if (column > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), column - sheet.getMaxColumns());
    sheet.getRange(headerRow, column).setValue(name);
    sheet.hideColumns(column);
}

// the schedule's layout, on an empty tab: black headers in white bold capitals, the time headers yellow, each second
// line in italics, and the first row's format for the orders to copy
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
    sheet.getRange(1 + HEADER_ROWS, 1, 1, COLUMNS.length)
        .setFontFamily("Arial")
        .setFontSize(11)
        .setVerticalAlignment("middle")
        .setWrap(true)
        .setHorizontalAlignments([COLUMNS.map((column) => column.align || "center")])
        .setFontWeights([COLUMNS.map((column) => (column.bold ? "bold" : "normal"))])
        .setFontColors([COLUMNS.map((column) => column.color || "#000000")])
        .setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
    if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).createFilter();
}

// the first order row's format on these rows; the first row itself keeps the format it was given
function formatLikeFirstRow_(sheet, layout, first, count) {
    if (first > layout.dataRow) {
        sheet.getRange(layout.dataRow, 1, 1, layout.width)
            .copyTo(sheet.getRange(first, 1, count, layout.width), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }
    // plain text before the values go in, or Sheets turns "450353" and "Oct-24-26" into numbers and dates
    sheet.getRange(first, 1, count, layout.width).setNumberFormat("@");
    // several invoice numbers go one above the other
    for (const column of COLUMNS) {
        if (column.stacked && layout.columns[column.key]) sheet.getRange(first, layout.columns[column.key], count, 1).setWrap(true);
    }
}

// what to write in a row the sheet already has: current is what's in its cells, last what the app last wrote there
// (none on a row from before it was kept), and next what the app has now, each { [key]: text }; a cell that isn't
// empty and isn't what the app last wrote was typed by someone, so it's left alone; an empty one is the app's again
function mergeRow_(current, last, next) {
    const writes = {};
    const kept = [];
    for (const key of Object.keys(next)) {
        const cell = current[key] ?? "";
        if (cell === next[key]) continue;
        if (last && cell !== "" && cell !== (last[key] ?? "")) kept.push(key);
        else writes[key] = next[key];
    }
    return { writes, kept };
}

// the row as the app has it, { [key]: text }, with only the columns this sheet has
function valuesOf_(layout, row) {
    const values = {};
    for (const key of Object.keys(layout.columns)) values[key] = row[key] == null ? "" : String(row[key]);
    return values;
}

const parseLast_ = (text) => {
    try {
        return text ? JSON.parse(text) : null;
    } catch (err) {
        return null;
    }
};

// each row the server sent: updated in place when the sheet has it, added at the bottom when it doesn't; whether the
// rows need sorting again
function upsertRows_(sheet, layout, rows, result) {
    const lastRow = Math.max(sheet.getLastRow(), layout.dataRow - 1);
    const existing = lastRow >= layout.dataRow
        ? sheet.getRange(layout.dataRow, 1, lastRow - layout.dataRow + 1, layout.width).getDisplayValues()
        : [];
    const idAt = layout.app[APP_ID] - 1;
    // APP ID -> its row (1-based) and what's in it now
    const byId = new Map();
    existing.forEach((cells, i) => {
        if (cells[idAt]) byId.set(cells[idAt], { row: layout.dataRow + i, cells });
    });

    const added = [];
    let moved = false;
    for (const row of rows) {
        const id = String(row.id);
        const next = valuesOf_(layout, row);
        const found = byId.get(id);
        if (!found) {
            added.push(newRowCells_(layout, id, row, next));
            // a second row for the same order in one request is taken as the first's
            byId.set(id, { row: lastRow + added.length, cells: added[added.length - 1] });
            continue;
        }

        const current = {};
        for (const key of Object.keys(next)) current[key] = found.cells[layout.columns[key] - 1];
        const { writes, kept } = mergeRow_(current, parseLast_(found.cells[layout.app[APP_LAST] - 1]), next);
        for (const key of Object.keys(writes)) sheet.getRange(found.row, layout.columns[key]).setValue(asText_(writes[key]));
        result.kept += kept.length;

        const sort = String(row.sortKey ?? "");
        const lastText = JSON.stringify(next);
        const sorted = found.cells[layout.app[APP_SORT] - 1] !== sort;
        const noted = found.cells[layout.app[APP_LAST] - 1] !== lastText;
        if (sorted) sheet.getRange(found.row, layout.app[APP_SORT]).setValue(sort);
        if (noted) sheet.getRange(found.row, layout.app[APP_LAST]).setValue(lastText);
        if (sorted) moved = true;
        if (Object.keys(writes).length || sorted) result.updated += 1;
    }

    if (added.length) {
        const first = lastRow + 1;
        const needed = first + added.length - 1 - sheet.getMaxRows();
        if (needed > 0) {
            sheet.insertRowsAfter(sheet.getMaxRows(), needed + SPARE_ROWS);
            stretchFilter_(sheet, layout);
        }
        formatLikeFirstRow_(sheet, layout, first, added.length);
        sheet.getRange(first, 1, added.length, layout.width).setValues(added);
        result.added += added.length;
    }
    return moved || added.length > 0;
}

function newRowCells_(layout, id, row, values) {
    const cells = new Array(layout.width).fill("");
    for (const key of Object.keys(values)) cells[layout.columns[key] - 1] = asText_(values[key]);
    cells[layout.app[APP_ID] - 1] = id;
    cells[layout.app[APP_SORT] - 1] = String(row.sortKey ?? "");
    cells[layout.app[APP_LAST] - 1] = JSON.stringify(values);
    return cells;
}

// every row in APP SORT order, so all the priority orders are together below the regular ones, then the TBA ones;
// whole rows move, typed columns too; a row typed in by hand (no APP SORT) goes to the bottom
function sortRows_(sheet, layout) {
    const lastRow = sheet.getLastRow();
    if (lastRow <= layout.dataRow) return;
    const column = layout.app[APP_SORT];
    const filter = sheet.getFilter();
    // the filter's own sort leaves the header where it is and sorts the rows it hides as well, but only a filter that
    // starts right above the orders has nothing else in its way, and it can only sort by a column it covers
    if (filter && filter.getRange().getRow() === layout.dataRow - 1) {
        stretchFilter_(sheet, layout);
        sheet.getFilter().sort(column, true);
    } else {
        sheet.getRange(layout.dataRow, 1, lastRow - layout.dataRow + 1, layout.width).sort({ column, ascending: true });
    }
}

// a filter covers the rows and columns it was made over, so once rows or the script's columns are added past them it's
// made again over all of them, with the same filters people had picked
function stretchFilter_(sheet, layout) {
    const filter = sheet.getFilter();
    if (!filter) return;
    const range = filter.getRange();
    const top = range.getRow();
    const left = range.getColumn();
    const rows = sheet.getMaxRows() - top + 1;
    const columns = Math.max(range.getNumColumns(), layout.width - left + 1);
    if (range.getNumRows() >= rows && range.getNumColumns() >= columns) return;
    const criteria = [];
    for (let i = 0; i < range.getNumColumns(); i += 1) criteria.push(filter.getColumnFilterCriteria(left + i));
    filter.remove();
    const stretched = sheet.getRange(top, left, rows, columns).createFilter();
    criteria.forEach((criterion, i) => {
        if (criterion) stretched.setColumnFilterCriteria(left + i, criterion);
    });
}

// takes out the app's rows whose APP ID matches (rows typed in by hand, with no APP ID, are left alone); bottom up, a
// run of neighbouring rows at a time; how many were taken out
function deleteRowsWhere_(sheet, layout, matches) {
    const lastRow = sheet.getLastRow();
    if (lastRow < layout.dataRow) return 0;
    const ids = sheet.getRange(layout.dataRow, layout.app[APP_ID], lastRow - layout.dataRow + 1, 1).getDisplayValues().map((cells) => cells[0]);
    let removed = 0;
    for (let i = ids.length - 1; i >= 0; i -= 1) {
        if (!ids[i] || !matches(ids[i])) continue;
        let start = i;
        while (start > 0 && ids[start - 1] && matches(ids[start - 1])) start -= 1;
        sheet.deleteRows(layout.dataRow + start, i - start + 1);
        removed += i - start + 1;
        i = start;
    }
    return removed;
}
