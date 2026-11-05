// the Apps Script that writes the Google sheet (tools/google-apps-script/orderSheet.gs), run against a small stand-in for
// Google's spreadsheet services, since the real ones only exist at Google: it follows the format of the sheet it's given,
// and leaves what people typed alone
// run: npm test            only these: npm test -- --test-name-pattern="apps script"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';

import { createSheetSync } from '../../server/googleSheet.js';
import { ticketFromSheet } from '../../server/sheetTicket.js';
import { changedDetails, editVerb, wasCreatedInSheet } from '../../src/admin/data/orderEdits.js';
import { bootApp } from '../support/testApp.js';

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
        this.notes = new Map();
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
    deleteColumn(column) { this.grid.forEach((cells) => cells.splice(column - 1, 1)); }
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
        getNotes: () => area((r, c) => sheet.notes.get(`${r}:${c}`) ?? ""),
        setNote: (note) => {
            sheet.notes.set(`${row}:${column}`, note);
            return range;
        },
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
            // like the real one, it moves what's in the cells as it is, a "'" in front too
            const sorted = area((r, c) => sheet.grid[r - 1]?.[c - 1] ?? "")
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
    let marks = 0;
    const context = vm.createContext({
        Utilities: { getUuid: () => `mark-${marks += 1}` },
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

// the script answering the server's own requests, in place of Google
const bootWithFetch = () => {
    const script = boot();
    return {
        ...script,
        fetch: async (_url, init) => Response.json(script.post(JSON.parse(init.body))),
    };
};

// an order as the server lists it (toHistory's shape), for the sync on the server's side
const syncedOrder = (id) => ({
    id,
    date: "2026-11-04",
    queueNum: id,
    name: `Customer ${id}`,
    purpose: "Roofings",
    status: "pending",
    createdAt: new Date(2026, 10, 4, 8, 16).toISOString(),
    invoices: [],
    areas: [],
    team: "GIGA",
    runner: "Boy Reyes",
    receiver: "",
});

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
        assert.equal(sheet.cell(1, 24), "APP ID");
        assert.equal(sheet.cell(2, 24), "1");
        assert.deepEqual(sheet.hidden, [24, 25, 26, 27]);
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

        // cleared, it stays cleared until that goes back to the app too
        sheet.write(3, RUNNER, "");
        script.post({ rows: [order(1, { runner: "App Runner" })] });
        assert.equal(sheet.cell(3, RUNNER), "");
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
        // its 9, plus TYPE OF ORDER and the script's 4
        assert.equal(sheet.getFilter().getRange().getNumColumns(), 14);
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
        assert.equal(sheet.cell(5, NAME), "");
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

    describe("what's typed in the sheet, going back to the app", () => {
        // the schedule's own layout, which has the Team, Runner and Receiver columns
        const DATE_CELL = 1, QUE_CELL = 2, TEAM = 3, CUSTOMER = 7, ROOFING = 8, TERMS = 13, RUNNER_AT = 16, RECEIVER_AT = 17, STATUS_CELL = 20, APP_LAST_AT = 26;
        const typedOn = () => {
            const script = boot();
            script.post({ rows: [order(1), order(2)] });
            return { script, sheet: script.sheet() };
        };

        test("nobody typed anything: there's nothing to send back", () => {
            const { script } = typedOn();
            assert.deepEqual(script.post({ pull: true }).edits, []);
        });

        test("it sends back what was typed", () => {
            const { script, sheet } = typedOn();
            sheet.write(2, TEAM, "MEGA");
            sheet.write(3, RUNNER_AT, "  Typed Runner ");
            sheet.write(3, RECEIVER_AT, "Typed Receiver");

            assert.deepEqual(script.post({ pull: true }).edits, [
                { id: "1", key: "team", value: "MEGA" },
                { id: "2", key: "runner", value: "Typed Runner" },
                { id: "2", key: "receiver", value: "Typed Receiver" },
            ]);
        });

        test("a cleared cell goes back too, as an empty one", () => {
            const { script, sheet } = typedOn();
            sheet.write(2, RUNNER_AT, "");
            assert.deepEqual(script.post({ pull: true }).edits, [{ id: "1", key: "runner", value: "" }]);
        });

        test("every column goes back: the customer, terms and invoices too", () => {
            const { script, sheet } = typedOn();
            sheet.write(2, CUSTOMER, "Typed Customer");
            sheet.write(2, TERMS, "Vale");
            sheet.write(2, ROOFING, "449765\n449999");
            assert.deepEqual(script.post({ pull: true }).edits, [
                { id: "1", key: "customer", value: "Typed Customer" },
                { id: "1", key: "roofing", value: "449765\n449999" },
                { id: "1", key: "terms", value: "Vale" },
            ]);
        });

        test("DATE, QUE and STATUS run the queue: typed over, they go straight back, and nothing is sent", () => {
            const { script, sheet } = typedOn();
            sheet.write(2, DATE_CELL, "Jan-01-20");
            sheet.write(2, QUE_CELL, "Z 99");
            sheet.write(2, STATUS_CELL, "Done");

            assert.deepEqual(script.post({ pull: true }).edits, []);

            assert.equal(sheet.cell(2, DATE_CELL), "Nov-04-26");
            assert.equal(sheet.cell(2, QUE_CELL), "R 01");
            assert.equal(sheet.cell(2, STATUS_CELL), "Waiting");
        });

        test("spaces around a value don't count as typing", () => {
            const { script, sheet } = typedOn();
            sheet.write(2, TEAM, " GIGA ");
            assert.deepEqual(script.post({ pull: true }).edits, []);
        });

        test("a row copied with its hidden id doesn't send a second, conflicting edit", () => {
            const { script, sheet } = typedOn();
            sheet.grid[3] = [...sheet.grid[1]];
            sheet.write(4, RUNNER_AT, "On the copy");
            assert.deepEqual(script.post({ pull: true }).edits, []);
        });

        test("a row typed in by hand, or from before the script kept what it wrote, sends nothing", () => {
            const { script, sheet } = typedOn();
            sheet.write(4, CUSTOMER, "Typed by hand");
            sheet.write(4, RUNNER_AT, "Someone");
            sheet.write(3, APP_LAST_AT, "");
            sheet.write(3, RUNNER_AT, "Typed on an old row");
            assert.deepEqual(script.post({ pull: true }).edits, []);
        });

        test("a sheet with no such column sends nothing for it", () => {
            const sheet = new FakeSheet("ORDER SHEET", [["CUSTOMER'S NAME", "RUNNER"]]);
            const script = boot(sheet);
            script.post({ rows: [order(1)] });
            sheet.write(2, 2, "Typed Runner");
            assert.deepEqual(script.post({ pull: true }).edits, [{ id: "1", key: "runner", value: "Typed Runner" }]);
        });

        test("a refused value gets a note on its cell, and keeps what was typed", () => {
            const { script, sheet } = typedOn();
            sheet.write(2, TEAM, "NOT A TEAM");

            script.post({ refused: [{ id: "1", key: "team", problem: "it isn't a sales team" }] });

            assert.match(sheet.notes.get(`2:${TEAM}`), /Not saved in the system: it isn't a sales team/);
            assert.equal(sheet.cell(2, TEAM), "NOT A TEAM");
        });

        test("a note about an order that's gone is skipped", () => {
            const { script } = typedOn();
            assert.equal(script.post({ refused: [{ id: "99", key: "team", problem: "no" }] }).ok, true);
        });

        test("the note goes once the cell matches the app again, and a note someone wrote stays", () => {
            const { script, sheet } = typedOn();
            sheet.write(2, TEAM, "NOT A TEAM");
            script.post({ refused: [{ id: "1", key: "team", problem: "it isn't a sales team" }] });
            sheet.notes.set(`3:${TEAM}`, "their own note");

            sheet.write(2, TEAM, "GIGA");
            script.post({ pull: true });

            assert.equal(sheet.notes.get(`2:${TEAM}`), "");
            assert.equal(sheet.notes.get(`3:${TEAM}`), "their own note");
        });

        // the real script on one side and the real sync on the other, with the app's orders as a plain list
        describe("with the server's sync", () => {
            const connected = () => {
                const script = bootWithFetch();
                const orders = new Map([[1, syncedOrder(1)], [2, syncedOrder(2)]]);
                const applied = [];
                const sync = createSheetSync({
                    url: "https://example.test/exec", token: TOKEN, log: { log() {}, error() {} },
                    listOrders: () => [...orders.values()],
                    fetch: script.fetch,
                    applyEdit: ({ id, key, value }) => {
                        if (key === "team" && value === "NOT A TEAM") return "it isn't a sales team";
                        applied.push([id, key, value]);
                        // the app keeps a team in the list's own spelling
                        orders.set(Number(id), { ...orders.get(Number(id)), [key]: key === "team" ? value.toUpperCase() : value });
                        return "";
                    },
                });
                return { sync, orders, applied, sheet: () => script.sheet() };
            };

            test("an edit reaches the app once, and the cell then follows the app again", async () => {
                const { sync, orders, applied, sheet } = connected();
                await sync.syncOnce();

                sheet().write(2, RUNNER_AT, "Typed Runner");
                await sync.syncOnce();
                assert.deepEqual(applied, [["1", "runner", "Typed Runner"]]);
                assert.equal(orders.get(1).runner, "Typed Runner");
                assert.equal(sheet().cell(2, RUNNER_AT), "Typed Runner");

                // it isn't taken for a new edit
                await sync.syncOnce();
                assert.equal(applied.length, 1);

                // changed in the app afterwards, the cell takes the new value instead of keeping the typed one
                orders.set(1, { ...orders.get(1), runner: "App Runner" });
                await sync.syncOnce();
                assert.equal(sheet().cell(2, RUNNER_AT), "App Runner");
                assert.equal(applied.length, 1);
            });

            test("a change made in the app never comes back as an edit from the sheet", async () => {
                const { sync, orders, applied, sheet } = connected();
                await sync.syncOnce();

                orders.set(1, { ...orders.get(1), receiver: "App Receiver" });
                await sync.syncOnce();
                await sync.syncOnce();

                assert.deepEqual(applied, []);
                assert.equal(sheet().cell(2, RECEIVER_AT), "App Receiver");
            });

            test("a cleared cell empties it in the app too, and stays empty", async () => {
                const { sync, orders, sheet } = connected();
                await sync.syncOnce();

                sheet().write(2, RUNNER_AT, "");
                await sync.syncOnce();
                await sync.syncOnce();

                assert.equal(orders.get(1).runner, "");
                assert.equal(sheet().cell(2, RUNNER_AT), "");
            });

            test("a team in other letters is taken as the team, and the cell is tidied", async () => {
                const { sync, orders, sheet } = connected();
                await sync.syncOnce();

                sheet().write(2, TEAM, "mega");
                await sync.syncOnce();
                await sync.syncOnce();

                assert.equal(orders.get(1).team, "MEGA");
                assert.equal(sheet().cell(2, TEAM), "MEGA");
            });

            test("a refused value leaves the app alone and marks the cell, and fixing it clears the mark", async () => {
                const { sync, orders, applied, sheet } = connected();
                await sync.syncOnce();

                sheet().write(2, TEAM, "NOT A TEAM");
                await sync.syncOnce();
                assert.deepEqual(applied, []);
                assert.equal(orders.get(1).team, "GIGA");
                assert.equal(sheet().cell(2, TEAM), "NOT A TEAM");
                assert.match(sheet().notes.get(`2:${TEAM}`), /it isn't a sales team/);

                sheet().write(2, TEAM, "MEGA");
                await sync.syncOnce();
                await sync.syncOnce();
                assert.equal(orders.get(1).team, "MEGA");
                assert.equal(sheet().notes.get(`2:${TEAM}`), "");
            });
        });
    });

    describe("a ticket started in the sheet", () => {
        // the schedule's own layout
        const DATE_AT = 1, QUE_AT = 2, TEAM_AT = 3, SALESMAN_AT = 4, CUSTOMER_AT = 7, ROOFING_AT = 8, CONSTRUCTION_AT = 9;
        const TERMS_AT = 13, SALES_IN_AT = 14, RUNNER_AT = 16, TYPE_AT = 23, APP_ID_AT = 24;

        const until = async (done, what) => {
            for (let tries = 0; tries < 400; tries += 1) {
                if (await done()) return;
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
            assert.fail(`never happened: ${what}`);
        };

        // the real API, syncing every few milliseconds with the real script on a stand-in sheet; breakFetch can make one
        // request fail, or lose its answer
        const connected = async (t, breakFetch = () => "") => {
            const script = bootWithFetch();
            const fetch = async (url, init) => {
                const body = JSON.parse(init.body);
                const broken = breakFetch(body);
                if (broken === "before") throw new Error("the request never got there");
                const answer = await script.fetch(url, init);
                if (broken === "after") throw new Error("the answer got lost");
                return answer;
            };
            const app = await bootApp({ googleSheet: {
                url: "https://example.test/exec", token: TOKEN, fetch, intervalMs: 5, log: { log() {}, error() {} },
            } });
            t.after(() => app.close());
            const sales = await app.actingAsSales();
            await until(() => script.sheet(), "the sheet's layout");

            const sheet = () => script.sheet();
            const rowOf = (name) => sheet().grid.findIndex((cells) => cells[CUSTOMER_AT - 1] === name) + 1;
            // the first empty row, the way a person would pick one
            const typeRow = (cells) => {
                const row = (sheet().grid.findIndex((_, i) => i > 0 && !sheet().cell(i + 1, CUSTOMER_AT) && !sheet().cell(i + 1, APP_ID_AT)) + 1) || sheet().grid.length + 1;
                for (const [column, value] of Object.entries(cells)) sheet().write(row, Number(column), value);
                return row;
            };
            const tickets = async () => (await sales.get("/admin/order-sheet")).assertStatus(200).body;
            const ticketNamed = async (name) => (await tickets()).find((o) => o.name === name);
            return { app, sales, sheet, rowOf, typeRow, tickets, ticketNamed };
        };
        const filled = (name, extra = {}) => ({
            [CUSTOMER_AT]: name, [TYPE_AT]: "Roofings", [ROOFING_AT]: "450000", ...extra,
        });
        // long enough for the sync to have gone round several times
        const severalSyncs = () => new Promise((resolve) => setTimeout(resolve, 80));

        test("a row with what it needs becomes a ticket with nothing to tick, and the row is filled in from it", async (t) => {
            const { sheet, rowOf, typeRow, ticketNamed } = await connected(t);

            typeRow(filled("Sheet Customer", {
                [TYPE_AT]: "steel, roofings", [CONSTRUCTION_AT]: "450001", [ROOFING_AT]: "450000\n450002",
                [SALESMAN_AT]: "Amado", [TEAM_AT]: "giga", [RUNNER_AT]: "Remz",
            }));
            await until(() => ticketNamed("Sheet Customer"), "the ticket");

            const ticket = await ticketNamed("Sheet Customer");
            // in the list's order and spelling, as every ticket is
            assert.equal(ticket.purpose, "Roofings, Steel");
            assert.deepEqual(ticket.invoices.map(({ invoiceNo, type }) => [invoiceNo, type]), [
                ["450000", "Roofings"], ["450002", "Roofings"], ["450001", "Steel"],
            ]);
            assert.equal(ticket.salesman, "Amado");
            assert.equal(ticket.team, "GIGA");
            assert.equal(ticket.runner, "Remz");
            assert.equal(ticket.status, "pending");
            assert.equal(ticket.isToday, true);
            assert.match(ticket.salesTimeIn, /^\d{2}:\d{2}$/);
            assert.equal(ticket.edits[0].by.name, "Google sheet");
            assert.deepEqual(ticket.edits[0].changes, ["createdInSheet"]);

            await until(() => sheet().cell(rowOf("Sheet Customer"), APP_ID_AT), "the row filled in");
            const row = rowOf("Sheet Customer");
            assert.equal(sheet().cell(row, APP_ID_AT), String(ticket.id));
            assert.equal(sheet().cell(row, QUE_AT), `RS ${String(ticket.queueNum).padStart(2, "0")}`);
            assert.match(sheet().cell(row, DATE_AT), /^[A-Z][a-z]{2}-\d{2}-\d{2}$/);
            assert.equal(sheet().cell(row, TEAM_AT), "GIGA");
            assert.equal(sheet().cell(row, TYPE_AT), "Roofings, Steel");
            assert.match(sheet().cell(row, SALES_IN_AT), /^\d{4}H$/);
        });

        test("one row makes one ticket and stays one row, however many syncs go by", async (t) => {
            const { sheet, typeRow, tickets, ticketNamed } = await connected(t);

            typeRow(filled("Only Once"));
            await until(() => ticketNamed("Only Once"), "the ticket");
            await severalSyncs();

            assert.equal((await tickets()).filter((o) => o.name === "Only Once").length, 1);
            assert.equal(sheet().grid.filter((cells) => cells[CUSTOMER_AT - 1] === "Only Once").length, 1);
        });

        test("a row with no type of order is left alone, like the old rows typed in by hand, with no note", async (t) => {
            const { sheet, rowOf, typeRow, tickets } = await connected(t);

            const row = typeRow(filled("Old Hand Typed Row", { [TYPE_AT]: "" }));
            await severalSyncs();

            assert.deepEqual(await tickets(), []);
            assert.equal(sheet().cell(rowOf("Old Hand Typed Row"), APP_ID_AT), "");
            assert.equal(sheet().notes.get(`${row}:${TYPE_AT}`), undefined);
        });

        test("a row that's wrong makes no ticket and says why on its type of order, and fixing it is all it takes", async (t) => {
            const { sheet, typeRow, tickets, ticketNamed } = await connected(t);

            const row = typeRow(filled("Needs Fixing", { [ROOFING_AT]: "" }));
            await until(() => sheet().notes.get(`${row}:${TYPE_AT}`), "the note");
            assert.match(sheet().notes.get(`${row}:${TYPE_AT}`), /^No ticket made: it has no invoice number/);
            assert.deepEqual(await tickets(), []);

            sheet().write(row, ROOFING_AT, "450000");
            await until(() => ticketNamed("Needs Fixing"), "the ticket");
            await until(() => sheet().notes.get(`${row}:${TYPE_AT}`) === "", "the note gone");
        });

        test("clearing the type of a wrong row takes its note off", async (t) => {
            const { sheet, typeRow } = await connected(t);

            const row = typeRow(filled("Changed Mind", { [ROOFING_AT]: "" }));
            await until(() => sheet().notes.get(`${row}:${TYPE_AT}`), "the note");

            sheet().write(row, TYPE_AT, "");
            await until(() => sheet().notes.get(`${row}:${TYPE_AT}`) === "", "the note gone");
        });

        test("if the answer to the sheet is lost after the ticket is made, no second ticket or row appears", async (t) => {
            let losses = 2;
            const { sheet, rowOf, typeRow, tickets, ticketNamed } = await connected(t, (body) => {
                if (!body.created || losses === 0) return "";
                losses -= 1;
                return losses === 1 ? "before" : "after";
            });

            typeRow(filled("Lost Answer"));
            await until(() => ticketNamed("Lost Answer"), "the ticket");
            await until(() => sheet().cell(rowOf("Lost Answer"), APP_ID_AT), "the row filled in");
            await severalSyncs();

            assert.equal(losses, 0);
            assert.equal((await tickets()).filter((o) => o.name === "Lost Answer").length, 1);
            assert.equal(sheet().grid.filter((cells) => cells[CUSTOMER_AT - 1] === "Lost Answer").length, 1);
        });

        test("a ticket deleted in the app before its row heard back isn't made again", async (t) => {
            let block = true;
            const { app, sheet, typeRow, tickets, ticketNamed } = await connected(t, (body) => (body.created && block ? "before" : ""));

            const row = typeRow(filled("Deleted Meanwhile"));
            await until(() => ticketNamed("Deleted Meanwhile"), "the ticket");
            const { queueNum } = await ticketNamed("Deleted Meanwhile");
            (await (await app.actingAsAdmin()).delete(`/admin/orders/${queueNum}`)).assertStatus(204);
            block = false;

            await until(() => /was deleted/.test(sheet().notes.get(`${row}:${TYPE_AT}`) ?? ""), "the note");
            assert.deepEqual(await tickets(), []);
        });

        test("terms count as who set the payment, and the mark in QUE makes a priority order", async (t) => {
            const { sales, typeRow, ticketNamed } = await connected(t);

            typeRow(filled("Priority Paid", { [TERMS_AT]: "paid", [QUE_AT]: "*" }));
            await until(() => ticketNamed("Priority Paid"), "the ticket");

            const ticket = await ticketNamed("Priority Paid");
            assert.equal(ticket.paymentStatus, "Paid");
            assert.equal(ticket.priority, true);
            const { body: payments } = (await sales.get("/admin/payments")).assertStatus(200);
            assert.equal(payments.find((o) => o.id === ticket.id).paymentChange.by.name, "Google sheet");
        });

        test("an order taken in the app afterwards goes right under the rows", async (t) => {
            const { app, rowOf, sheet, typeRow, ticketNamed } = await connected(t);

            typeRow(filled("From The Sheet"));
            await until(() => ticketNamed("From The Sheet"), "the ticket");
            (await app.client().post("/orders", {
                name: "From The App", purpose: "Roofings", orders: [], invoices: [{ invoiceNo: "450009", type: "Roofings" }],
            })).assertStatus(201);
            await until(() => rowOf("From The App") > 0, "the app's row");

            assert.equal(rowOf("From The Sheet"), 2);
            assert.equal(rowOf("From The App"), 3);
            assert.equal(sheet().cell(3, APP_ID_AT) !== "", true);
        });

        test("the CREATE TICKET column from the last version comes off the tab, and its unticked boxes with it", () => {
            const sheet = new FakeSheet("ORDER SHEET", [
                ["CUSTOMER'S NAME", "CREATE TICKET", "RUNNER"],
                ["", "FALSE", ""],
                ["", "FALSE", ""],
            ]);
            const script = boot(sheet);

            script.post({ rows: [order(1)] });

            assert.equal(sheet.cell(1, 2), "RUNNER");
            // right under the headers, not below the boxes
            assert.equal(sheet.cell(2, 1), "Customer 1");
            assert.equal(sheet.cell(2, 2), "Boy Reyes");
        });

        test("what's typed in the sheet reaches the real order: terms, customer, invoices, tidied the way the app keeps them", async (t) => {
            const { sheet, rowOf, typeRow, ticketNamed } = await connected(t);
            typeRow(filled("Typed Over"));
            await until(() => rowOf("Typed Over") && sheet().cell(rowOf("Typed Over"), APP_ID_AT), "the row filled in");
            await severalSyncs();
            const row = rowOf("Typed Over");

            sheet().write(row, TERMS_AT, "vale");
            sheet().write(row, ROOFING_AT, "450000, 450003");
            sheet().write(row, CUSTOMER_AT, "New Name");
            await until(async () => (await ticketNamed("New Name"))?.paymentStatus === "Vale", "the terms");

            const ticket = await ticketNamed("New Name");
            assert.deepEqual(ticket.invoices.map(({ invoiceNo }) => invoiceNo), ["450000", "450003"]);
            assert.equal(ticket.edits[0].by.name, "Google sheet");
            // each cell ends up the way the app keeps it, and stops counting as typed
            await until(() => sheet().cell(row, TERMS_AT) === "Vale", "the terms tidied");
            await until(() => sheet().cell(row, ROOFING_AT) === "450000\n450003", "the invoices tidied");
            const edits = ticket.edits.length;
            await severalSyncs();
            assert.equal((await ticketNamed("New Name")).edits.length, edits);
        });

        test("a value the system can't take gets a note on its cell, and the order stays as it was", async (t) => {
            const { sheet, rowOf, typeRow, ticketNamed } = await connected(t);
            typeRow(filled("Wrong Terms"));
            await until(() => rowOf("Wrong Terms") && sheet().cell(rowOf("Wrong Terms"), APP_ID_AT), "the row filled in");
            await severalSyncs();
            const row = rowOf("Wrong Terms");

            sheet().write(row, TERMS_AT, "Maybe");
            await until(() => sheet().notes.get(`${row}:${TERMS_AT}`), "the note");

            assert.match(sheet().notes.get(`${row}:${TERMS_AT}`), /^Not saved in the system: "Maybe" isn't one of the terms/);
            assert.equal(sheet().cell(row, TERMS_AT), "Maybe");
            assert.ok(!(await ticketNamed("Wrong Terms")).paymentStatus);
        });

        test("a column added in the sheet joins the Order sheet, with what's typed in it", async (t) => {
            const { sales, sheet, rowOf, typeRow, ticketNamed } = await connected(t);
            typeRow(filled("With A Plate"));
            await until(() => rowOf("With A Plate") && sheet().cell(rowOf("With A Plate"), APP_ID_AT), "the row filled in");
            await severalSyncs();

            const column = sheet().grid[0].length + 1;
            sheet().write(1, column, "Plate no:");
            sheet().write(rowOf("With A Plate"), column, "ABC 123");
            await until(async () => (await ticketNamed("With A Plate")).sheetCells?.["c:PLATE NO"] === "ABC 123", "the cell");

            const { body: columns } = (await sales.get("/admin/order-sheet/columns")).assertStatus(200);
            // the schedule's own REMARKS is one too, since the app had no column for it
            assert.deepEqual(columns.map(({ key, name }) => [key, name]), [["c:REMARKS", "REMARKS"], ["c:PLATE NO", "Plate no"]]);
        });

        test("a column added on the Order sheet appears in the sheet, and taken off it stays there, no longer synced", async (t) => {
            const { sales, sheet, rowOf, typeRow, ticketNamed } = await connected(t);
            typeRow(filled("Both Ways"));
            await until(() => rowOf("Both Ways") && sheet().cell(rowOf("Both Ways"), APP_ID_AT), "the row filled in");
            const { id: orderId } = await ticketNamed("Both Ways");

            const { body: added } = (await sales.post("/admin/order-sheet/columns", { name: "Truck" })).assertStatus(201);
            await until(() => sheet().grid[0].includes("Truck"), "the column");
            const column = sheet().grid[0].indexOf("Truck") + 1;

            (await sales.patch(`/admin/order-sheet/${orderId}`, { [added.key]: "Isuzu" })).assertStatus(200);
            await until(() => sheet().cell(rowOf("Both Ways"), column) === "Isuzu", "the cell");

            (await sales.delete(`/admin/order-sheet/columns/${added.id}`)).assertStatus(204);
            sheet().write(rowOf("Both Ways"), column, "Typed After");
            await severalSyncs();

            // not brought back by the sheet, and what's typed there is left alone
            assert.deepEqual((await sales.get("/admin/order-sheet/columns")).assertStatus(200).body.map(({ name }) => name), ["REMARKS"]);
            assert.equal((await ticketNamed("Both Ways")).sheetCells[added.key], "Isuzu");
            assert.equal(sheet().cell(rowOf("Both Ways"), column), "Typed After");
        });

        test("once it's a ticket, its row works like any other: a typed runner goes back", async (t) => {
            const { sheet, rowOf, typeRow, ticketNamed } = await connected(t);

            typeRow(filled("Then Edited"));
            await until(async () => rowOf("Then Edited") && sheet().cell(rowOf("Then Edited"), APP_ID_AT), "the row filled in");
            await severalSyncs();

            sheet().write(rowOf("Then Edited"), RUNNER_AT, "Typed After");
            await until(async () => (await ticketNamed("Then Edited")).runner === "Typed After", "the runner");
        });

        describe("reading the row", () => {
            const row = (overrides) => ({ customer: "Juan", purpose: "Roofings", roofing: "450000", ...overrides });

            test("each invoice takes the type its column has on this ticket", () => {
                const { order } = ticketFromSheet(row({
                    purpose: "Hardwares, Battery", roofing: "", construction: "1", tba: "2, 3", others: "4",
                }));
                assert.equal(order.purpose, "Hardwares, Battery");
                assert.deepEqual(order.invoices, [
                    { invoiceNo: "1", type: "Hardwares" },
                    { invoiceNo: "2", type: "Battery" },
                    { invoiceNo: "3", type: "Battery" },
                    // Others has no type of its own
                    { invoiceNo: "4", type: "Hardwares" },
                ]);
            });

            test("times are read as the sheet writes them, or as a person might", () => {
                assert.equal(ticketFromSheet(row({ salesTimeIn: "0734H" })).order.salesTimeIn, "07:34");
                assert.equal(ticketFromSheet(row({ salesTimeOut: "7:34" })).order.salesTimeOut, "07:34");
                assert.equal(ticketFromSheet(row()).order.salesTimeIn, "");
            });

            test("two stars are a TBA priority order", () => {
                const { order } = ticketFromSheet(row({ que: "**" }));
                assert.deepEqual([order.priority, order.tbaPriority], [false, true]);
            });

            for (const [what, overrides, problem] of [
                ["no name", { customer: "  " }, /customer's name is empty/],
                ["no type", { purpose: "" }, /type of order is empty/],
                ["a type not on the list", { purpose: "Roofings, Lumber" }, /"Lumber" isn't a type of order/],
                ["no invoice", { roofing: "" }, /no invoice number/],
                ["an invoice under another department", { tba: "9" }, /invoice 9 is under TBA.*Tire or Battery/],
                ["a team not on the list", { team: "ZZZ" }, /"ZZZ" isn't a sales team/],
                ["terms not on the list", { terms: "Maybe" }, /"Maybe" isn't one of the terms/],
                ["a time that isn't one", { salesTimeIn: "2560H" }, /"2560H" isn't a time in/],
            ]) {
                test(`${what} is refused, with the reason`, () => {
                    assert.match(ticketFromSheet(row(overrides)).problem, problem);
                });
            }
        });

        test("the order says it was created in the sheet, rather than listing a change", () => {
            const made = { changes: ["createdInSheet", "paymentStatus"] };
            assert.equal(wasCreatedInSheet(made), true);
            assert.equal(editVerb(made), "Created in");
            assert.equal(changedDetails(made.changes), "Payment status");
            assert.equal(editVerb({ changes: ["runner"] }), "Edited by");
        });
    });
});
