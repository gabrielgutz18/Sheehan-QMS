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
 * Every column works both ways, except DATE, QUE and STATUS, which run the queue: what you type goes back to the order in
 * the app within a few seconds, and clearing a cell clears it in the app too, and the app then keeps the cell up to date
 * again. A value the app can't take, like a team that isn't on its list, stays in the cell with a note saying why, and the
 * order doesn't change. DATE, QUE and STATUS always go back to what the app has.
 *
 * A new ticket can start here: in an empty row, fill in the customer's name, the TYPE OF ORDER ("Roofings, Steel") and an
 * invoice number under its department. Within a few seconds the ticket is in the app with today's date and next number,
 * and the row is filled in from it. The TYPE OF ORDER is what starts it, so a row without one is left alone, like the old
 * rows typed in by hand. If something's missing or wrong, no ticket is made, a note on the TYPE OF ORDER says why, and the
 * ticket is made once it's fixed. The script adds that column if the tab doesn't have it; like any other, it can be moved.
 *
 * A column you add here with a header joins the Order sheet in the app, and one added there appears here at the far
 * right. Taken off in the app, it stays here but no longer syncs.
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
    // what a ticket is for; typing it in a new row is what makes the ticket (see the top of this file)
    { key: "purpose", header: "TYPE OF ORDER", also: ["ORDER TYPE"], width: 180, align: "left" },
];
const PURPOSE_HEADER = "TYPE OF ORDER";
// a column from an earlier version of this script; a ticket no longer needs ticking, so it's taken off the tab
const OLD_TICK_HEADER = "CREATE TICKET";

// the script's own columns, hidden, added after the sheet's last column if they aren't there: the order's id in the app,
// where its row goes ("0 2026-10-29 0003": the group, the day, the number; see sortKey in server/googleSheet.js), what
// the app last wrote in the row, which is how an edit is told from the app's own value, and the mark on a row typed here
// that's been sent to become a ticket, so sending it twice can't make two
const APP_ID = "APP ID";
const APP_SORT = "APP SORT";
const APP_LAST = "APP LAST";
const APP_NEW = "APP NEW";
const APP_COLUMNS = [APP_ID, APP_SORT, APP_LAST, APP_NEW];

// the columns that only come from the app, which run the queue: typing over one puts it back
const ONE_WAY = ["date", "que", "status"];
// a column people added; the rest of its key is its header, as normalized_ writes it
const CUSTOM_PREFIX = "c:";
// starts the note on a cell the app couldn't take, which is how the script knows the note is its own to take off
const REFUSED_NOTE = "Not saved in the system: ";
// the same for a row that couldn't become a ticket, on its TYPE OF ORDER
const NO_TICKET_NOTE = "No ticket made: ";

const HEADER_BG = "#000000";
const HEADER_YELLOW = "#ffff00";
// how far down a title above the headers can push them
const HEADER_SEARCH_ROWS = 20;
// spare rows added when the sheet runs out, so it doesn't grow on every new order
const SPARE_ROWS = 500;

// the server's rows: { token, rows: [{ id, date, que, ... }] } adds or updates, { token, remove: [ids] } takes deleted
// orders out, and { token, keep: [ids] } takes out every app row not listed (after the server restarts); Google can't
// reach the server, so what's typed here goes back in an answer: { token, pull: true } gets { edits: [{ id, key, value }],
// newRows: [{ key, ready, values }], headers: [{ key, name }] }, { token, refused: [{ id, key, problem }] } marks the edits
// the app couldn't take, { token, refusedRows: [{ key, problem }] } the rows, { token, created: [{ key, row }] } fills in
// the rows that became tickets, and { token, columns: [names] } adds columns people added in the app
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
        if (Array.isArray(body.columns)) addCustomColumns_(sheet, body.columns);
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
        if (Array.isArray(body.created) && fillCreatedRows_(sheet, layout, body.created)) sortRows_(sheet, layout);
        if (body.pull) {
            result.edits = typedEdits_(sheet, layout);
            result.newRows = ticketRows_(sheet, layout);
            result.headers = layout.custom;
        }
        if (Array.isArray(body.refused)) markRefused_(sheet, layout, body.refused);
        if (Array.isArray(body.refusedRows)) markRefusedRows_(sheet, layout, body.refusedRows);
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
// column number }, custom: [{ key, name }] }; custom is the columns people added, which go in columns too; the header row
// is the one with the customer's name in it
function layoutOf_(sheet) {
    const rows = sheet.getRange(1, 1, Math.min(HEADER_SEARCH_ROWS, sheet.getLastRow()), sheet.getLastColumn()).getDisplayValues();
    const customer = namesOf_(COLUMNS.find((column) => column.key === "customer"));
    const index = rows.findIndex((cells) => cells.some((cell) => customer.includes(normalized_(cell))));
    if (index < 0) throw new Error(`Can't find the headers in "${SHEET_NAME}": no column is named CUSTOMER'S NAME.`);

    const headers = rows[index].map(normalized_);
    const oldTick = headers.indexOf(OLD_TICK_HEADER);
    if (oldTick >= 0) {
        sheet.deleteColumn(oldTick + 1);
        return layoutOf_(sheet);
    }
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

    const headerRow = index + 1;
    const dataRow = headerRow + HEADER_ROWS;
    let last = headers.length;

    // the column a ticket started here needs, added to a tab from before it, in the look of its other headers
    if (!columns.purpose) {
        last += 1;
        addColumn_(sheet, headerRow, last, PURPOSE_HEADER);
        sheet.getRange(headerRow, 1).copyFormatToRange(sheet, last, last, headerRow, headerRow);
        columns.purpose = last;
    }

    const app = {};
    for (const name of APP_COLUMNS) {
        const at = headers.indexOf(name);
        app[name] = at >= 0 ? at + 1 : (last += 1);
        if (at < 0) {
            addColumn_(sheet, headerRow, app[name], name);
            sheet.hideColumns(app[name]);
        }
    }

    // any other column with a header is one people added; a repeated header counts once
    const known = new Set([...COLUMNS.filter((column) => column.key).flatMap(namesOf_), ...APP_COLUMNS]);
    const custom = [];
    headers.forEach((header, i) => {
        const key = CUSTOM_PREFIX + header;
        if (!header || known.has(header) || columns[key]) return;
        columns[key] = i + 1;
        custom.push({ key, name: String(rows[index][i]).replace(/\s+/g, " ").trim().replace(/:$/, "") });
    });
    return { headerRow, dataRow, width: last, columns, app, custom };
}

// columns people added in the app, at the far right, in the look of the other headers
function addCustomColumns_(sheet, names) {
    const layout = layoutOf_(sheet);
    let last = layout.width;
    for (const name of names) {
        if (layout.columns[CUSTOM_PREFIX + normalized_(name)]) continue;
        last += 1;
        addColumn_(sheet, layout.headerRow, last, name);
        sheet.getRange(layout.headerRow, 1).copyFormatToRange(sheet, last, last, layout.headerRow, layout.headerRow);
    }
}

function addColumn_(sheet, headerRow, column, name) {
    if (column > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), column - sheet.getMaxColumns());
    sheet.getRange(headerRow, column).setValue(name);
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
// (none on a row from before it was kept), next what the app has now, each { [key]: text }, and took what was just typed
// in the cells the app has taken; the app's value goes in a cell that's still what the app last wrote, or that it took,
// which is how "giga" becomes GIGA; anything else was typed by someone and hasn't gone back yet, so it's left alone, an
// emptied cell too; DATE, QUE and STATUS always follow the app
function mergeRow_(current, last, next, took) {
    const writes = {};
    const kept = [];
    for (const key of Object.keys(next)) {
        const cell = current[key] ?? "";
        if (cell === next[key]) continue;
        const justTaken = took && key in took && cell.trim() === took[key];
        if (ONE_WAY.includes(key) || justTaken || !last || cell.trim() === (last[key] ?? "").trim()) writes[key] = next[key];
        else kept.push(key);
    }
    return { writes, kept };
}

// what's been typed since the app last wrote each row, [{ id, key, value }], which comes down to a cell that isn't what the
// app last wrote there; empty counts, as clearing it; a row with none of the app's last values (typed in by hand, or from
// before they were kept) has nothing to compare with, and a row copied with its hidden id counts only the first time; a
// note of ours comes off a cell that's right again, and DATE, QUE and STATUS go back to what the app has
function typedEdits_(sheet, layout) {
    const count = sheet.getLastRow() - layout.dataRow + 1;
    if (count <= 0) return [];
    const range = sheet.getRange(layout.dataRow, 1, count, layout.width);
    const notes = range.getNotes();
    const seen = new Set();
    const edits = [];
    range.getDisplayValues().forEach((cells, i) => {
        const id = cells[layout.app[APP_ID] - 1];
        const last = parseLast_(cells[layout.app[APP_LAST] - 1]);
        if (!id || !last || seen.has(id)) return;
        seen.add(id);
        for (const key of Object.keys(layout.columns)) {
            const at = layout.columns[key];
            const cell = cells[at - 1];
            // a column the app's rows have always had, on a row from before the app sent it: nothing to compare with
            if (!(key in last) && !key.startsWith(CUSTOM_PREFIX)) continue;
            const was = last[key] ?? "";
            if (ONE_WAY.includes(key)) {
                if (cell !== was) sheet.getRange(layout.dataRow + i, at).setNumberFormat("@").setValue(asText_(was));
            } else if (cell.trim() !== was.trim()) {
                edits.push({ id, key, value: cell.trim() });
            } else if (notes[i][at - 1].startsWith(REFUSED_NOTE)) {
                sheet.getRange(layout.dataRow + i, at).setNote("");
            }
        }
    });
    return edits;
}

// a note on each cell the app couldn't take, saying why; what was typed stays, for whoever typed it to fix
function markRefused_(sheet, layout, refused) {
    const count = sheet.getLastRow() - layout.dataRow + 1;
    if (count <= 0) return;
    const ids = sheet.getRange(layout.dataRow, layout.app[APP_ID], count, 1).getDisplayValues().map((cells) => cells[0]);
    for (const { id, key, problem } of refused) {
        const i = ids.indexOf(String(id));
        const at = layout.columns[key];
        if (i >= 0 && at) sheet.getRange(layout.dataRow + i, at).setNote(`${REFUSED_NOTE}${problem}`);
    }
}

// the rows typed here to become tickets, [{ key, ready, values: { [key]: text } }]: ones with a TYPE OF ORDER and no ticket
// yet, each given its mark the first time; and any row with a mark, whatever its type, since its ticket may already be
// made and its answer lost; a note of ours comes off a row whose type was cleared
function ticketRows_(sheet, layout) {
    const count = sheet.getLastRow() - layout.dataRow + 1;
    if (count <= 0) return [];
    const range = sheet.getRange(layout.dataRow, 1, count, layout.width);
    const notes = range.getNotes();
    const purposeAt = layout.columns.purpose;

    const rows = [];
    range.getDisplayValues().forEach((cells, i) => {
        if (cells[layout.app[APP_ID] - 1]) return;
        const at = layout.dataRow + i;
        const ready = cells[purposeAt - 1].trim() !== "";
        let key = cells[layout.app[APP_NEW] - 1];
        if (!ready && notes[i][purposeAt - 1].startsWith(NO_TICKET_NOTE)) sheet.getRange(at, purposeAt).setNote("");
        if (!ready && !key) return;
        if (!key) {
            key = Utilities.getUuid();
            sheet.getRange(at, layout.app[APP_NEW]).setValue(key);
        }
        const values = {};
        for (const name of Object.keys(layout.columns)) values[name] = cells[layout.columns[name] - 1];
        rows.push({ key, ready, values });
    });
    return rows;
}

// row numbers by the mark on them
function rowsByMark_(sheet, layout) {
    const rows = new Map();
    const count = sheet.getLastRow() - layout.dataRow + 1;
    if (count <= 0) return rows;
    sheet.getRange(layout.dataRow, layout.app[APP_NEW], count, 1).getDisplayValues().forEach((cells, i) => {
        if (cells[0]) rows.set(cells[0], layout.dataRow + i);
    });
    return rows;
}

// a note on the TYPE OF ORDER of each row that couldn't become a ticket; fixing the row is all it takes
function markRefusedRows_(sheet, layout, refused) {
    const rows = rowsByMark_(sheet, layout);
    for (const { key, problem } of refused) {
        const at = rows.get(String(key));
        if (at) sheet.getRange(at, layout.columns.purpose).setNote(`${NO_TICKET_NOTE}${problem}`);
    }
}

// the rows that became tickets, from then on the same as any row the app wrote: every column from the app, its id and
// the rest of the script's columns, in plain text like the others; a row someone deleted meanwhile is skipped, and the
// next rows the server sends add it; whether any row needs sorting into its place
function fillCreatedRows_(sheet, layout, created) {
    const rows = rowsByMark_(sheet, layout);
    let filled = false;
    for (const { key, row } of created) {
        const at = rows.get(String(key));
        if (!at) continue;
        formatLikeFirstRow_(sheet, layout, at, 1);
        const values = valuesOf_(layout, row);
        for (const name of Object.keys(values)) sheet.getRange(at, layout.columns[name]).setValue(asText_(values[name]));
        sheet.getRange(at, layout.app[APP_ID]).setValue(String(row.id));
        sheet.getRange(at, layout.app[APP_SORT]).setValue(String(row.sortKey ?? ""));
        sheet.getRange(at, layout.app[APP_LAST]).setValue(JSON.stringify(values));
        sheet.getRange(at, layout.columns.purpose).setNote("");
        filled = true;
    }
    return filled;
}

// the row as the app has it, { [key]: text }, with only the columns this sheet has; a column of the sheet's own that the
// app doesn't have is left out, so it's never emptied
function valuesOf_(layout, row) {
    const values = {};
    for (const key of Object.keys(layout.columns)) {
        if (key.startsWith(CUSTOM_PREFIX) && !(key in row)) continue;
        values[key] = row[key] == null ? "" : String(row[key]);
    }
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
    const lastRow = sheet.getLastRow();
    const existing = lastRow >= layout.dataRow ? sheet.getRange(layout.dataRow, 1, lastRow - layout.dataRow + 1, layout.width).getDisplayValues() : [];
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
        const { writes, kept } = mergeRow_(current, parseLast_(found.cells[layout.app[APP_LAST] - 1]), next, row.took);
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
