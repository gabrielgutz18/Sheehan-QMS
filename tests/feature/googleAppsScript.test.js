// the Apps Script that writes the Google sheet (tools/google-apps-script/orderSheet.gs), run against a small stand-in for
// Google's spreadsheet services, since the real ones only exist at Google: it follows the format of the sheet it's given,
// and leaves what people typed alone
// run: npm test            only these: npm test -- --test-name-pattern="apps script"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';

const TOKEN = "test-token";
const source = readFileSync(new URL('../../tools/google-apps-script/orderSheet.gs', import.meta.url), 'utf8')
    .replace('const SYNC_TOKEN = "";', `const SYNC_TOKEN = "${TOKEN}";`);

// the cells as text, with what the script did to their format; a formatting call nothing here checks just chains on
class FakeSheet {
    constructor(name, grid = [], maxRows = 1000, maxColumns = 26) {
        this.name = name;
        this.grid = grid.map((row) => [...row]);
        this.maxRows = maxRows;
        this.maxColumns = maxColumns;
        this.hidden = [];
        this.copied = [];
        this.plainText = [];
    }

    // what the cell shows: a "'" in front only marks it as text
    cell(row, column) {
        return (this.grid[row - 1]?.[column - 1] ?? "").replace(/^'/, "");
    }

    write(row, column, value) {
        while (this.grid.length < row) this.grid.push([]);
        this.grid[row - 1][column - 1] = String(value);
    }

    getName() { return this.name; }
    getParent() { return { getUrl: () => "https://sheet" }; }
    getMaxRows() { return this.maxRows; }
    getMaxColumns() { return this.maxColumns; }
    getLastRow() {
        for (let row = this.grid.length; row > 0; row -= 1) if (this.grid[row - 1].some(Boolean)) return row;
        return 0;
    }
    getLastColumn() { return Math.max(0, ...this.grid.map((row) => row.reduce((last, cell, i) => (cell ? i + 1 : last), 0))); }
    getFilter() { return this.filter ?? null; }
    hideColumns(column) { this.hidden.push(column); }
    insertRowsAfter(_after, count) { this.maxRows += count; }
    insertColumnsAfter(_after, count) { this.maxColumns += count; }
    setRowHeight() {}
    setFrozenRows() {}
    setColumnWidth() {}
    deleteRows(row, count) { this.grid.splice(row - 1, count); }
    getRange(row, column, rows = 1, columns = 1) { return fakeRange(this, row, column, rows, columns); }
}

// like the real one, it can only sort by a column it covers
const fakeFilter = (sheet, row, column, rows, columns, criteria = {}) => ({
    getRange: () => ({ getRow: () => row, getColumn: () => column, getNumRows: () => rows, getNumColumns: () => columns }),
    getColumnFilterCriteria: (at) => criteria[at] ?? null,
    setColumnFilterCriteria: (at, criterion) => {
        criteria[at] = criterion;
    },
    remove: () => {
        sheet.filter = null;
    },
    sort: (by) => {
        assert.ok(by >= column && by < column + columns, `the filter covers columns ${column} to ${column + columns - 1}, not ${by}`);
        fakeRange(sheet, row + 1, column, rows - 1, columns).sort({ column: by });
    },
});

const fakeRange = (sheet, row, column, rows, columns) => {
    assert.ok(rows > 0 && columns > 0, `a range needs at least one row and column, got ${rows} × ${columns}`);
    const area = (read) => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (__, c) => read(row + r, column + c)));
    const range = new Proxy({
        getDisplayValues: () => area((r, c) => sheet.cell(r, c)),
        getRow: () => row,
        setValue: (value) => {
            sheet.write(row, column, value);
            return range;
        },
        setValues: (values) => {
            values.forEach((cells, r) => cells.forEach((value, c) => sheet.write(row + r, column + c, value)));
            return range;
        },
        setRichTextValues: (values) => {
            values.forEach((cells, r) => cells.forEach((rich, c) => sheet.write(row + r, column + c, rich.text)));
            return range;
        },
        setNumberFormat: (format) => {
            sheet.plainText.push({ row, rows, format });
            return range;
        },
        copyTo: (target) => {
            sheet.copied.push({ from: row, to: target.getRow() });
        },
        sort: ({ column: by }) => {
            const key = (cells) => cells[by - column] ?? "";
            const sorted = area((r, c) => sheet.cell(r, c))
                .sort((a, b) => (key(a) === "") - (key(b) === "") || key(a).localeCompare(key(b)));
            range.setValues(sorted);
        },
        createFilter: () => {
            sheet.filter = fakeFilter(sheet, row, column, rows, columns);
            return sheet.filter;
        },
    }, { get: (known, name) => known[name] ?? (() => range) });
    return range;
};

// the script, booted on one spreadsheet; post() sends what the queue server sends
const boot = (...sheets) => {
    const book = {
        getSheetByName: (name) => sheets.find((sheet) => sheet.getName() === name) ?? null,
        insertSheet: (name) => {
            sheets.push(new FakeSheet(name));
            return sheets.at(-1);
        },
    };
    const richText = () => {
        const rich = { setText: (text) => Object.assign(rich, { text }), setTextStyle: () => rich, build: () => rich };
        return rich;
    };
    const style = () => {
        const built = { setItalic: () => built, setBold: () => built, build: () => built };
        return built;
    };
    const logs = [];
    const context = vm.createContext({
        SpreadsheetApp: {
            getActiveSpreadsheet: () => book,
            flush() {},
            newRichTextValue: richText,
            newTextStyle: style,
            BorderStyle: { SOLID: "solid" },
            CopyPasteType: { PASTE_FORMAT: "format" },
        },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        ContentService: {
            MimeType: { JSON: "json" },
            createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
        },
        Logger: { log: (line) => logs.push(line) },
    });
    vm.runInContext(source, context);
    return {
        logs,
        sheet: () => book.getSheetByName("ORDER SHEET"),
        setup: () => context.setupSheet(),
        formatAll: () => context.formatAllRows(),
        post: (payload, token = TOKEN) =>
            JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ token, ...payload }) } }).text),
    };
};

const order = (id, overrides = {}) => ({
    id: String(id),
    date: "Nov-04-26",
    que: `R ${String(id).padStart(2, "0")}`,
    team: "GIGA",
    salesman: "Maria Santos",
    assistedBy: "",
    customer: `Customer ${id}`,
    roofing: "449765\n449767",
    construction: "",
    tba: "",
    chassis: "",
    others: "",
    terms: "Paid",
    salesTimeIn: "0816H",
    salesTimeOut: "",
    runner: "Boy Reyes",
    receiver: "",
    loadingTimeIn: "",
    loadingTimeOut: "",
    status: "Waiting",
    doubleCheckedBy: "",
    sortKey: `0 2026-11-04 ${String(id).padStart(4, "0")}`,
    ...overrides,
});

// a sheet someone made themselves: a title above the headers, their own order and a column of their own
const ownSheet = () => new FakeSheet("ORDER SHEET", [
    ["SHEEHAN LOADING SCHEDULE"],
    ["Customer Name", "Que", "My notes", "Runner", "Date", "Time In", "Time Out", "Time In", "Time Out"],
]);
const NAME = 1, QUE = 2, NOTES = 3, RUNNER = 4, DATE = 5, SALES_IN = 6, SALES_OUT = 7, LOADING_IN = 8;

describe("apps script", () => {
    test("on an empty tab it makes the schedule's layout, and adds the orders under it", () => {
        const script = boot();

        const answer = script.post({ rows: [order(1)] });

        assert.equal(answer.ok, true);
        assert.equal(answer.added, 1);
        const sheet = script.sheet();
        assert.equal(sheet.cell(1, 1), "DATE");
        assert.equal(sheet.cell(1, 14), "TIME IN\n(sales)");
        assert.equal(sheet.cell(2, 1), "Nov-04-26");
        assert.equal(sheet.cell(2, 7), "Customer 1");
        assert.equal(sheet.cell(2, 8), "449765\n449767");
        // the script's own columns come after the last one, hidden
        assert.equal(sheet.cell(1, 23), "APP ID");
        assert.equal(sheet.cell(2, 23), "1");
        assert.deepEqual(sheet.hidden, [23, 24, 25]);
    });

    test("in a sheet with its own format, each value goes under its own header, and its format is left alone", () => {
        const sheet = ownSheet();
        const script = boot(sheet);

        assert.equal(script.post({ rows: [order(1), order(2)] }).added, 2);

        // row 2 has the headers, under a title that's still there
        assert.equal(sheet.cell(1, 1), "SHEEHAN LOADING SCHEDULE");
        assert.equal(sheet.cell(3, NAME), "Customer 1");
        assert.equal(sheet.cell(3, QUE), "R 01");
        assert.equal(sheet.cell(3, RUNNER), "Boy Reyes");
        assert.equal(sheet.cell(3, DATE), "Nov-04-26");
        // the first TIME IN is sales', the next is loading's
        assert.equal(sheet.cell(3, SALES_IN), "0816H");
        assert.equal(sheet.cell(3, LOADING_IN), "");
        assert.equal(sheet.cell(3, NOTES), "");
        assert.equal(sheet.cell(4, NAME), "Customer 2");
        assert.equal(sheet.copied.length, 0, "the first rows take the format already there");

        // a later order copies the format of the first order's row
        script.post({ rows: [order(3)] });
        assert.deepEqual(sheet.copied, [{ from: 3, to: 5 }]);
        // plain text goes on before the values, so numbers and dates stay as they're written
        assert.equal(sheet.plainText.at(-1).format, "@");
        assert.equal(sheet.cell(5, NAME), "Customer 3");
    });

    test("what someone typed stays when the order changes in the app, and the app's other cells still update", () => {
        const sheet = ownSheet();
        const script = boot(sheet);
        script.post({ rows: [order(1)] });

        sheet.write(3, RUNNER, "Typed Runner");
        sheet.write(3, NOTES, "call first");
        const answer = script.post({ rows: [order(1, { runner: "App Runner", customer: "Renamed", salesTimeOut: "0900H" })] });

        assert.equal(answer.kept, 1);
        assert.equal(answer.updated, 1);
        assert.equal(sheet.cell(3, RUNNER), "Typed Runner");
        assert.equal(sheet.cell(3, NOTES), "call first");
        assert.equal(sheet.cell(3, NAME), "Renamed");
        assert.equal(sheet.cell(3, SALES_OUT), "0900H");

        // sent again, as after the server restarts, it still stays
        script.post({ rows: [order(1, { runner: "App Runner" })] });
        assert.equal(sheet.cell(3, RUNNER), "Typed Runner");

        // cleared, the app fills it in again
        sheet.write(3, RUNNER, "");
        script.post({ rows: [order(1, { runner: "App Runner" })] });
        assert.equal(sheet.cell(3, RUNNER), "App Runner");
    });

    test("a row the app wrote keeps following the app when nobody typed in it", () => {
        const sheet = ownSheet();
        const script = boot(sheet);
        script.post({ rows: [order(1)] });

        const answer = script.post({ rows: [order(1, { runner: "Second Runner" })] });
        assert.equal(answer.kept, 0);
        assert.equal(sheet.cell(3, RUNNER), "Second Runner");

        script.post({ rows: [order(1, { runner: "Third Runner" })] });
        assert.equal(sheet.cell(3, RUNNER), "Third Runner");
    });

    test("sending the same row again changes nothing", () => {
        const script = boot(ownSheet());
        script.post({ rows: [order(1)] });

        const answer = script.post({ rows: [order(1)] });

        assert.deepEqual([answer.added, answer.updated, answer.kept], [0, 0, 0]);
    });

    test("priority orders go below the regular ones, with what's typed in their rows", () => {
        const sheet = ownSheet();
        const script = boot(sheet);
        script.post({ rows: [order(1, { que: "*", sortKey: "1 2026-11-04 0001" })] });
        sheet.write(3, NOTES, "stays with its order");

        script.post({ rows: [order(2)] });

        assert.equal(sheet.cell(3, NAME), "Customer 2");
        assert.equal(sheet.cell(4, NAME), "Customer 1");
        assert.equal(sheet.cell(4, QUE), "*");
        assert.equal(sheet.cell(4, NOTES), "stays with its order");
    });

    test("a row already on the sheet moves when its sort value changes, as after the sort order itself changes", () => {
        const sheet = ownSheet();
        const script = boot(sheet);
        // sorted the old way, by the day first
        script.post({ rows: [
            order(1, { que: "*", sortKey: "2026-11-03 1 0001" }),
            order(2, { sortKey: "2026-11-04 0 0002" }),
        ] });
        assert.equal(sheet.cell(3, NAME), "Customer 1");

        script.post({ rows: [
            order(1, { que: "*", sortKey: "1 2026-11-03 0001" }),
            order(2, { sortKey: "0 2026-11-04 0002" }),
        ] });

        assert.equal(sheet.cell(3, NAME), "Customer 2");
        assert.equal(sheet.cell(4, NAME), "Customer 1");
    });

    test("the layout's own filter sorts the orders too, by the script's hidden column", () => {
        const script = boot();

        const answer = script.post({ rows: [order(1, { que: "*", sortKey: "1 2026-11-04 0001" }), order(2)] });

        assert.equal(answer.ok, true, answer.error);
        const sheet = script.sheet();
        assert.equal(sheet.cell(2, 7), "Customer 2");
        assert.equal(sheet.cell(3, 7), "Customer 1");
    });

    test("a filter someone made grows over the script's columns, and keeps what they picked", () => {
        const sheet = ownSheet();
        sheet.filter = fakeFilter(sheet, 2, 1, 999, 9, { [NAME]: "only some customers" });
        const script = boot(sheet);

        const answer = script.post({ rows: [order(1, { que: "*", sortKey: "1 2026-11-04 0001" }), order(2)] });

        assert.equal(answer.ok, true, answer.error);
        assert.equal(sheet.getFilter().getRange().getNumColumns(), 12);
        assert.equal(sheet.getFilter().getColumnFilterCriteria(NAME), "only some customers");
        assert.equal(sheet.cell(3, NAME), "Customer 2");
        assert.equal(sheet.cell(4, NAME), "Customer 1");
    });

    test("a name that looks like a formula goes in as text, and isn't taken for an edit", () => {
        const sheet = ownSheet();
        const script = boot(sheet);
        const name = '=IMPORTXML("https://example.com","//a")';

        script.post({ rows: [order(1, { customer: name })] });

        assert.equal(sheet.grid[2][NAME - 1], `'${name}`);
        assert.equal(sheet.cell(3, NAME), name);

        const again = script.post({ rows: [order(1, { customer: name })] });
        assert.deepEqual([again.updated, again.kept], [0, 0]);

        script.post({ rows: [order(1, { customer: "=1+1" })] });
        assert.equal(sheet.grid[2][NAME - 1], "'=1+1");
    });

    test("deleted orders are taken out, and rows typed in by hand stay", () => {
        const sheet = ownSheet();
        const script = boot(sheet);
        script.post({ rows: [order(1), order(2), order(3)] });
        sheet.write(6, NAME, "Typed by hand");

        assert.equal(script.post({ remove: ["2"] }).removed, 1);
        assert.equal(script.post({ keep: ["1"] }).removed, 1);

        assert.equal(sheet.cell(3, NAME), "Customer 1");
        assert.equal(sheet.cell(4, NAME), "Typed by hand");
        assert.equal(sheet.getLastRow(), 4);
    });

    test("headers it can't find are skipped, and setup says which", () => {
        const sheet = new FakeSheet("ORDER SHEET", [["CUSTOMER'S NAME", "RUNNER", "SOMETHING ELSE"]]);
        const script = boot(sheet);

        script.setup();
        const answer = script.post({ rows: [order(1)] });

        assert.equal(answer.added, 1);
        assert.equal(sheet.cell(2, 1), "Customer 1");
        assert.equal(sheet.cell(2, 2), "Boy Reyes");
        assert.equal(sheet.cell(2, 3), "");
        assert.match(script.logs.join("\n"), /The headers are in row 1, and the orders start in row 2\./);
        assert.match(script.logs.join("\n"), /Not found, so not written: DATE, QUE/);
    });

    test("a sheet with no customer's name column is refused, and nothing is written", () => {
        const sheet = new FakeSheet("ORDER SHEET", [["JUST A TITLE"]]);

        const answer = boot(sheet).post({ rows: [order(1)] });

        assert.equal(answer.ok, false);
        assert.match(answer.error, /no column is named CUSTOMER'S NAME/);
        assert.equal(sheet.getLastRow(), 1);
    });

    test("every row can take the first row's format again", () => {
        const sheet = ownSheet();
        const script = boot(sheet);
        script.post({ rows: [order(1), order(2), order(3)] });

        script.formatAll();

        assert.deepEqual(sheet.copied.at(-1), { from: 3, to: 4 });
    });

    test("a wrong token is turned away", () => {
        const sheet = ownSheet();

        const answer = boot(sheet).post({ rows: [order(1)] }, "wrong");

        assert.deepEqual([answer.ok, answer.error], [false, "Wrong token."]);
        assert.equal(sheet.getLastRow(), 2);
    });
});
