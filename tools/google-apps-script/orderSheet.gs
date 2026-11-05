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
 * TEAM, RUNNER and RECEIVER work both ways: what you type there goes back to the order in the app within a few seconds,
 * and clearing the cell clears it in the app too. The app then keeps the cell up to date again. A value the app can't
 * take, like a team that isn't on its list, stays in the cell with a note saying why, and the order doesn't change.
 *
 * Every other column only comes from the app: a cell someone typed over is left alone, even when the order changes in
 * the app, and the order doesn't change. Clear the cell and the app fills it in again.
 *
 * A new ticket can start here: in an empty row, fill in the customer's name, the TYPE OF ORDER ("Roofings, Steel") and an
 * invoice number under its department, then tick CREATE TICKET. Within a few seconds the ticket is in the app with today's
 * date and next number, and the row is filled in from it. If something's missing or wrong, no ticket is made, a note on
 * the tick says why, and the ticket is made once it's fixed. The script adds those two columns if the tab doesn't have
 * them; like any other, they can be moved. A row with no tick is left alone, so a row can be typed in slowly.
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
    // for a ticket started here (see the top of this file): what it's for, and the tick that makes it
    { key: "purpose", header: "TYPE OF ORDER", also: ["ORDER TYPE"], width: 180, align: "left" },
    { key: null, header: "CREATE TICKET", width: 80 },
];
const PURPOSE_HEADER = "TYPE OF ORDER";
const TICK_HEADER = "CREATE TICKET";

// the script's own columns, hidden, added after the sheet's last column if they aren't there: the order's id in the app,
// where its row goes ("0 2026-10-29 0003": the group, the day, the number; see sortKey in server/googleSheet.js), what
// the app last wrote in the row, which is how an edit is told from the app's own value, and the mark on a row typed here
// that's been sent to become a ticket, so sending it twice can't make two
const APP_ID = "APP ID";
const APP_SORT = "APP SORT";
const APP_LAST = "APP LAST";
const APP_NEW = "APP NEW";
const APP_COLUMNS = [APP_ID, APP_SORT, APP_LAST, APP_NEW];

// the columns that go back to the app when they're typed in: the cells sales fill in on the app's own Order sheet
const TWO_WAY = ["team", "runner", "receiver"];
// starts the note on a cell the app couldn't take, which is how the script knows the note is its own to take off
const REFUSED_NOTE = "Not saved in the system: ";
// the same for a row that couldn't become a ticket, on its tick
const NO_TICKET_NOTE = "No ticket made: ";
// what counts as ticked: the tick itself, or someone typing it on a tab without tick boxes
const TICKED = /^(TRUE|YES|X)$/i;

const HEADER_BG = "#000000";
const HEADER_YELLOW = "#ffff00";
// how far down a title above the headers can push them
const HEADER_SEARCH_ROWS = 20;
// spare rows added when the sheet runs out, so it doesn't grow on every new order
const SPARE_ROWS = 500;

// the server's rows: { token, rows: [{ id, date, que, ... }] } adds or updates, { token, remove: [ids] } takes deleted
// orders out, and { token, keep: [ids] } takes out every app row not listed (after the server restarts); Google can't
// reach the server, so what's typed here goes back in an answer: { token, pull: true } gets { edits: [{ id, key, value }],
// newRows: [{ key, ticked, values }] }, { token, refused: [{ id, key, problem }] } marks the edits the app couldn't take,
// { token, refusedRows: [{ key, problem }] } the rows, and { token, created: [{ key, row }] } fills in the rows that became
// tickets
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
        if (Array.isArray(body.created) && fillCreatedRows_(sheet, layout, body.created)) sortRows_(sheet, layout);
        if (body.pull) {
            result.edits = typedEdits_(sheet, layout);
            result.newRows = ticketRows_(sheet, layout);
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

    const headerRow = index + 1;
    const dataRow = headerRow + HEADER_ROWS;
    let last = headers.length;

    // the two columns a ticket started here needs, added to a tab from before them, in the look of its other headers
    const addVisible = (name) => {
        last += 1;
        addColumn_(sheet, headerRow, last, name);
        sheet.getRange(headerRow, 1).copyFormatToRange(sheet, last, last, headerRow, headerRow);
        return last;
    };
    if (!columns.purpose) columns.purpose = addVisible(PURPOSE_HEADER);
    let tick = headers.indexOf(normalized_(TICK_HEADER)) + 1;
    if (!tick) {
        tick = addVisible(TICK_HEADER);
        addTicks_(sheet, dataRow, tick);
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
    return { headerRow, dataRow, width: last, columns, tick, app };
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
    addTicks_(sheet, 1 + HEADER_ROWS, COLUMNS.findIndex((column) => column.header === TICK_HEADER) + 1);
    if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).createFilter();
}

// tick boxes down the CREATE TICKET column; they hold FALSE, so they count as filled-in cells, see upsertRows_
function addTicks_(sheet, first, column) {
    const count = sheet.getMaxRows() - first + 1;
    if (count > 0) sheet.getRange(first, column, count, 1).insertCheckboxes();
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
        // a two-way cell the app has just taken, in the app's own spelling: "giga" becomes GIGA
        if (TWO_WAY.includes(key) && sameTyped_(key, cell, next[key])) writes[key] = next[key];
        else if (last && cell !== "" && cell !== (last[key] ?? "")) kept.push(key);
        else writes[key] = next[key];
    }
    return { writes, kept };
}

// whether what's in a two-way cell is what the app has: spaces around it don't count, since the app takes them off, and
// neither do a team's capitals, since the app takes a team in any letters and keeps it in the list's own
function sameTyped_(key, cell, app) {
    const clean = (text) => (key === "team" ? text.trim().toUpperCase() : text.trim());
    return clean(cell) === clean(app);
}

// what's been typed in the two-way cells since the app last wrote them, [{ id, key, value }], which comes down to a cell
// that isn't what the app last wrote there; empty counts, as clearing it; a row with none of the app's last values (typed
// in by hand, or from before they were kept) has nothing to compare with; a note of ours comes off a cell that's right
// again; one column at a time, since this runs every few seconds and the sheet's other columns aren't needed
function typedEdits_(sheet, layout) {
    const count = sheet.getLastRow() - layout.dataRow + 1;
    if (count <= 0) return [];
    const column = (at) => sheet.getRange(layout.dataRow, at, count, 1);
    const read = (at) => column(at).getDisplayValues().map((cells) => cells[0]);
    const ids = read(layout.app[APP_ID]);
    const lasts = read(layout.app[APP_LAST]).map(parseLast_);

    const edits = [];
    for (const key of TWO_WAY) {
        const at = layout.columns[key];
        if (!at) continue;
        const cells = read(at);
        const notes = column(at).getNotes();
        ids.forEach((id, i) => {
            if (!id || !lasts[i]) return;
            if (!sameTyped_(key, cells[i], lasts[i][key] ?? "")) {
                edits.push({ id, key, value: cells[i].trim() });
            } else if (notes[i][0].startsWith(REFUSED_NOTE)) {
                sheet.getRange(layout.dataRow + i, at).setNote("");
            }
        });
    }
    // by row, the order they're in on the sheet
    const rowOf = new Map(ids.map((id, i) => [id, i]));
    return edits.sort((a, b) => rowOf.get(a.id) - rowOf.get(b.id));
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

// the rows typed here to become tickets, [{ key, ticked, values: { [key]: text } }]: ticked ones with no ticket yet, each
// given its mark the first time; and any row with a mark, ticked or not, since its ticket may already be made and its
// answer lost; a note of ours comes off a row that's been unticked
function ticketRows_(sheet, layout) {
    const count = sheet.getLastRow() - layout.dataRow + 1;
    if (count <= 0) return [];
    const column = (at) => sheet.getRange(layout.dataRow, at, count, 1);
    const read = (at) => column(at).getDisplayValues().map((cells) => cells[0]);
    const ids = read(layout.app[APP_ID]);
    const marks = read(layout.app[APP_NEW]);
    const ticks = read(layout.tick);
    const notes = column(layout.tick).getNotes();

    const rows = [];
    ids.forEach((id, i) => {
        if (id) return;
        const at = layout.dataRow + i;
        const ticked = TICKED.test(ticks[i].trim());
        if (!ticked && notes[i][0].startsWith(NO_TICKET_NOTE)) sheet.getRange(at, layout.tick).setNote("");
        if (!ticked && !marks[i]) return;
        let key = marks[i];
        if (!key) {
            key = Utilities.getUuid();
            sheet.getRange(at, layout.app[APP_NEW]).setValue(key);
        }
        const cells = sheet.getRange(at, 1, 1, layout.width).getDisplayValues()[0];
        const values = {};
        for (const name of Object.keys(layout.columns)) values[name] = cells[layout.columns[name] - 1];
        rows.push({ key, ticked, values });
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

// a note on the tick of each row that couldn't become a ticket; it stays ticked, so fixing the row is all it takes
function markRefusedRows_(sheet, layout, refused) {
    const rows = rowsByMark_(sheet, layout);
    for (const { key, problem } of refused) {
        const at = rows.get(String(key));
        if (at) sheet.getRange(at, layout.tick).setNote(`${NO_TICKET_NOTE}${problem}`);
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
        sheet.getRange(at, layout.tick).setValue(false).setNote("");
        filled = true;
    }
    return filled;
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
    const filled = sheet.getLastRow() - layout.dataRow + 1;
    const allRows = filled > 0 ? sheet.getRange(layout.dataRow, 1, filled, layout.width).getDisplayValues() : [];
    // Sheets counts an unticked box as a filled-in cell, so the rows below the orders all look filled; new orders go
    // right after the last row with anything else in it, not at the bottom of the tick boxes
    let used = allRows.length;
    while (used > 0 && allRows[used - 1].every((cell, c) => c === layout.tick - 1 || cell === "")) used -= 1;
    const existing = allRows.slice(0, used);
    const lastRow = layout.dataRow - 1 + used;
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
            const before = sheet.getMaxRows();
            sheet.insertRowsAfter(before, needed + SPARE_ROWS);
            addTicks_(sheet, before + 1, layout.tick);
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
