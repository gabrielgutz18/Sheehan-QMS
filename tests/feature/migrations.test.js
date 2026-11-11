// bringing an existing database up to date: each migration runs once, and one that rebuilds a table keeps
// every row in it and in the tables that point at it
// run: npm test -- --test-name-pattern="migration"
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, mock, test } from "node:test";

import { DB_FILE, openDatabase } from "../../server/db.js";

const MIGRATIONS_DIR = new URL("../../server/migrations/", import.meta.url);

let dataDir;

beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "sheehan-migrate-"));
});

afterEach(() => rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

// a database as an older version of the app left it: the migrations before `upTo`, applied and recorded
const databaseBefore = (upTo) => {
    const db = new DatabaseSync(join(dataDir, DB_FILE));
    db.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const file of readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql") && f < upTo)
        .sort()) {
        db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), "utf8"));
        db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
            file,
            new Date().toISOString(),
        );
    }
    return db;
};

// 033 rebuilds order_edits, so an edit typed in the Google sheet can have no staff account
test("an edit can come with no account, and the edits already kept stay with who saved them", () => {
    const old = databaseBefore("033");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, created_at)
            VALUES (5, '2026-10-20', 1, 'Juan Dela Cruz', 'Roofings', 'pending', '2026-10-20T09:00:00.000Z');
        INSERT INTO order_edits (id, order_id, user_id, sales_team, changes, edited_at)
            VALUES (7, 5, 1, 'GIGA', '["runner"]', '2026-10-20T09:30:00.000Z');
    `);
    assert.throws(
        () => old.exec(`INSERT INTO order_edits (order_id, user_id, changes, edited_at) VALUES (5, NULL, '[]', 'x')`),
        /NOT NULL/,
    );
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const kept = db.prepare("SELECT * FROM order_edits WHERE id = 7").get();
        assert.deepEqual(
            { ...kept },
            {
                id: 7,
                order_id: 5,
                user_id: 1,
                sales_team: "GIGA",
                changes: '["runner"]',
                edited_at: "2026-10-20T09:30:00.000Z",
            },
        );

        db.prepare(
            `INSERT INTO order_edits (order_id, user_id, changes, edited_at) VALUES (5, NULL, '["team"]', 'x')`,
        ).run();

        // an account given must still be a real one, and the edits still go with their order
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO order_edits (order_id, user_id, changes, edited_at) VALUES (5, 99, '[]', 'x')`,
                    )
                    .run(),
            /FOREIGN KEY/,
        );
        db.prepare("DELETE FROM orders WHERE id = 5").run();
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_edits").get().n, 0);
        assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'order_edits_order'").get());
    } finally {
        db.close();
    }
});

// 034 adds the mark that stops one row of the Google sheet making two tickets
test("a row of the Google sheet can only be one ticket, and tickets from the app need no mark", () => {
    const old = databaseBefore("034");
    old.exec(`
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, created_at)
            VALUES (5, '2026-10-20', 1, 'Juan Dela Cruz', 'Roofings', 'pending', '2026-10-20T09:00:00.000Z'),
                   (6, '2026-10-20', 2, 'Ana Reyes', 'Roofings', 'pending', '2026-10-20T09:00:00.000Z'),
                   (7, '2026-10-20', 3, 'Ben Cruz', 'Roofings', 'pending', '2026-10-20T09:00:00.000Z');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE sheet_key IS NULL").get().n, 3);
        db.prepare("UPDATE orders SET sheet_key = 'row-1' WHERE id = 5").run();
        assert.throws(() => db.prepare("UPDATE orders SET sheet_key = 'row-1' WHERE id = 6").run(), /UNIQUE/);
        db.prepare("UPDATE orders SET sheet_key = 'row-2' WHERE id = 6").run();
    } finally {
        db.close();
    }
});

// 006 rebuilds orders (returning customers) and 007 rebuilds users (loading staff)
test("rebuilding orders and users keeps every ticket, its items, its point and sign-ins", () => {
    const old = databaseBefore("006");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, remarks, created_at, called_at, served_by)
            VALUES (5, '2026-10-20', 1, 'Juan Dela Cruz', 'Roofings', 'done', 'Counter 2', '2026-10-20T09:00:00.000Z', 1, 1);
        INSERT INTO order_items (order_id, position, item, qty, color) VALUES (5, 0, 'Long span', 4, 'red');
        INSERT INTO serves (order_id, user_id, queue_date, served_at) VALUES (5, 1, '2026-10-20', '2026-10-20T09:30:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 1, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const order = db.prepare("SELECT name, status, remarks, served_by FROM orders WHERE id = 5").get();
        assert.deepEqual({ ...order }, { name: "Juan Dela Cruz", status: "done", remarks: "Counter 2", served_by: 1 });
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_items WHERE order_id = 5").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM serves WHERE order_id = 5").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1").get().n, 1);
        assert.equal(db.prepare("SELECT name FROM users WHERE id = 1").get().name, "Maria Santos");

        db.prepare("UPDATE orders SET status = 'returning' WHERE id = 5").run();
        db.prepare("UPDATE users SET role = 'loading' WHERE id = 1").run();
        assert.throws(() => db.prepare("UPDATE users SET role = 'driver' WHERE id = 1").run(), /CHECK constraint/);
        assert.throws(() => db.prepare("UPDATE orders SET status = 'lost' WHERE id = 5").run(), /CHECK constraint/);

        // foreign keys are back on once the migrations are done: deleting a ticket still takes its items with it
        db.prepare("DELETE FROM orders WHERE id = 5").run();
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_items").get().n, 0);
        assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    } finally {
        db.close();
    }
});

// 008 adds the sales details from Customer order, 010 handing over to loading, 012 the runner, 013 the receiver and
// sales times, 014 the checkers, 015 the one shared loading line
test("older tickets keep their items and get empty sales details", () => {
    const old = databaseBefore("008");
    old.exec(`
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, created_at)
            VALUES (5, '2026-10-20', 1, 'Juan Dela Cruz', 'Roofings', '2026-10-20T09:00:00.000Z');
        INSERT INTO order_items (order_id, position, item, qty, color) VALUES (5, 0, 'Long span', 4, 'red');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const order = db.prepare("SELECT salesman, payment_status, team, pickup_date FROM orders WHERE id = 5").get();
        assert.deepEqual({ ...order }, { salesman: "", payment_status: "", team: "", pickup_date: null });
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_invoices WHERE order_id = 5").get().n, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_items WHERE order_id = 5").get().n, 1);
        assert.equal(db.prepare("SELECT at_loading FROM orders WHERE id = 5").get().at_loading, 0);
        // still with sales until a counter hands them over
        const handover = db.prepare("SELECT handed_over_by, handed_over_at FROM orders WHERE id = 5").get();
        assert.deepEqual({ ...handover }, { handed_over_by: null, handed_over_at: null });
        // the customer collects the items themselves
        assert.equal(db.prepare("SELECT runner FROM orders WHERE id = 5").get().runner, "");
        // no receiver or sales times on a ticket taken before they were asked for
        const staffOnly = db.prepare("SELECT receiver, sales_time_in, sales_time_out FROM orders WHERE id = 5").get();
        assert.deepEqual({ ...staffOnly }, { receiver: "", sales_time_in: "", sales_time_out: "" });
        // no checkers yet: the ticket has blank lines for them
        assert.equal(db.prepare("SELECT checkers FROM orders WHERE id = 5").get().checkers, "");
    } finally {
        db.close();
    }
});

// 011 moves each ticket's one invoice number into order_invoices, where a ticket can have several
test("each older ticket's invoice number becomes its first invoice, typed when it has one type of order", () => {
    const old = databaseBefore("011");
    old.exec(`
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, invoice_no, created_at) VALUES
            (1, '2026-10-21', 1, 'Juan Dela Cruz', 'Roofings', '43355521', '2026-10-21T09:00:00.000Z'),
            (2, '2026-10-21', 2, 'Ana Reyes', 'Roofings, Steel', '5566', '2026-10-21T09:05:00.000Z'),
            (3, '2026-10-21', 3, 'Pedro Santos', 'Tire', '', '2026-10-21T09:10:00.000Z');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const invoices = db
            .prepare("SELECT order_id, position, invoice_no, type FROM order_invoices ORDER BY order_id")
            .all();
        assert.deepEqual(
            invoices.map((row) => ({ ...row })),
            [
                { order_id: 1, position: 0, invoice_no: "43355521", type: "Roofings" },
                { order_id: 2, position: 0, invoice_no: "5566", type: "" },
            ],
        );
        assert.ok(
            !db
                .prepare("PRAGMA table_info(orders)")
                .all()
                .some((column) => column.name === "invoice_no"),
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 3);
    } finally {
        db.close();
    }
});

// 015: Roofings and Steel are departments, not teams; loading is one shared line, and an order's team is its sales team
test("loading crews are gone: Roofings and Steel come off the orders, and a customer at a crew stays at loading", () => {
    const old = databaseBefore("015");
    old.exec(`
        INSERT INTO users (id, username, name, role, team, password_hash, created_at)
            VALUES (1, 'pedro', 'Pedro Garcia', 'loading', 'Roofings', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, team, status, serving_team, teams_done, served_by, created_at) VALUES
            (1, '2026-10-24', 1, 'Juan Dela Cruz', 'Roofings, Steel', 'Roofings, Steel', 'serving', 'Steel', 'Roofings', 1, '2026-10-24T09:00:00.000Z'),
            (2, '2026-10-24', 2, 'Ana Reyes', 'Roofings', 'Roofings, GIGA', 'pending', NULL, '', NULL, '2026-10-24T09:05:00.000Z'),
            (3, '2026-10-24', 3, 'Pedro Santos', 'Tire', 'MEGA', 'done', NULL, '', NULL, '2026-10-24T09:10:00.000Z'),
            (4, '2026-10-24', 4, 'Liza Mendoza', 'Steel', '', 'serving', NULL, '', 1, '2026-10-24T09:15:00.000Z');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const orders = db.prepare("SELECT id, team, status, at_loading FROM orders ORDER BY id").all();
        assert.deepEqual(
            orders.map((row) => ({ ...row })),
            [
                { id: 1, team: "", status: "serving", at_loading: 1 },
                { id: 2, team: "GIGA", status: "pending", at_loading: 0 },
                { id: 3, team: "MEGA", status: "done", at_loading: 0 },
                { id: 4, team: "", status: "serving", at_loading: 0 },
            ],
        );
        const columns = (table) =>
            db
                .prepare(`PRAGMA table_info(${table})`)
                .all()
                .map((column) => column.name);
        assert.ok(!columns("orders").includes("serving_team"));
        assert.ok(!columns("orders").includes("teams_done"));
        assert.ok(!columns("users").includes("team"));
        assert.equal(db.prepare("SELECT role FROM users WHERE id = 1").get().role, "loading");
    } finally {
        db.close();
    }
});

// 016: loading isn't serving; an order loading already finished goes back to the sales staff member who handed it over
test("an order loading has finished is served by the sales counter again, and loaded by the loading staff member", () => {
    const old = databaseBefore("016");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at) VALUES
            (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z'),
            (2, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, served_by, handed_over_by, created_at) VALUES
            (1, '2026-10-24', 1, 'Juan Dela Cruz', 'Roofings', 'done', 2, 1, '2026-10-24T09:00:00.000Z'),
            (2, '2026-10-24', 2, 'Ana Reyes', 'Roofings', 'serving', 2, 1, '2026-10-24T09:05:00.000Z'),
            (3, '2026-10-24', 3, 'Pedro Santos', 'Tire', 'done', 1, NULL, '2026-10-24T09:10:00.000Z');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const orders = db.prepare("SELECT id, served_by, loaded_by, loaded_at FROM orders ORDER BY id").all();
        assert.deepEqual(
            orders.map((row) => ({ ...row })),
            [
                { id: 1, served_by: 1, loaded_by: 2, loaded_at: null },
                // still at loading, and an order that never went to loading
                { id: 2, served_by: 2, loaded_by: null, loaded_at: null },
                { id: 3, served_by: 1, loaded_by: null, loaded_at: null },
            ],
        );
    } finally {
        db.close();
    }
});

// 017: each account gets its own sales team (none yet), and each order a list of edits (empty yet)
test("accounts start with no sales team and orders with no edits, and an order's edits go with it", () => {
    const old = databaseBefore("017");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, created_at)
            VALUES (1, '2026-10-24', 1, 'Juan Dela Cruz', 'Roofings', 'pending', '2026-10-24T09:00:00.000Z');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        assert.equal(db.prepare("SELECT sales_team FROM users WHERE id = 1").get().sales_team, "");
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_edits").get().n, 0);

        db.prepare(
            `INSERT INTO order_edits (order_id, user_id, sales_team, changes, edited_at)
            VALUES (1, 1, 'GIGA', '["runner"]', '2026-10-24T09:30:00.000Z')`,
        ).run();
        db.prepare("DELETE FROM orders WHERE id = 1").run();
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_edits").get().n, 0);
    } finally {
        db.close();
    }
});

// 018 rebuilds users (security guards): every account keeps its details, sign-ins, points, edits and orders
test("rebuilding users for security accounts keeps every account, sign-in, point and edit", () => {
    const old = databaseBefore("018");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA'),
                   (2, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z', NULL, 'Roofings', NULL, '');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, served_by, handed_over_by, loaded_by, created_at)
            VALUES (1, '2026-10-24', 1, 'Juan Dela Cruz', 'Roofings', 'done', 1, 1, 2, '2026-10-24T09:00:00.000Z');
        INSERT INTO serves (order_id, user_id, queue_date, served_at) VALUES (1, 1, '2026-10-24', '2026-10-24T09:30:00.000Z');
        INSERT INTO order_edits (order_id, user_id, sales_team, changes, edited_at)
            VALUES (1, 1, 'GIGA', '["runner"]', '2026-10-24T09:20:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 1, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const users = db
            .prepare("SELECT id, role, employee_id, department, photo, sales_team FROM users ORDER BY id")
            .all();
        assert.deepEqual(
            users.map((row) => ({ ...row })),
            [
                {
                    id: 1,
                    role: "sales",
                    employee_id: "E-1",
                    department: "Sales",
                    photo: "user-1.jpg",
                    sales_team: "GIGA",
                },
                { id: 2, role: "loading", employee_id: null, department: "Roofings", photo: null, sales_team: "" },
            ],
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM serves WHERE user_id = 1").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_edits WHERE user_id = 1").get().n, 1);
        assert.deepEqual(
            { ...db.prepare("SELECT served_by, loaded_by FROM orders WHERE id = 1").get() },
            { served_by: 1, loaded_by: 2 },
        );

        db.prepare(
            `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('jose', 'Jose Bantay', 'security', 'x', '2026-10-27T08:00:00.000Z')`,
        ).run();
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('guard', 'Someone', 'guard', 'x', '2026-10-27T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        // still one employee ID per person, and one account per username
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('MARIA', 'Maria Again', 'sales', 'x', '2026-10-27T08:00:00.000Z')`,
                    )
                    .run(),
            /UNIQUE/,
        );
    } finally {
        db.close();
    }
});

// 019: loading area by area, and the security check; orders already done stay done, with nothing to check
test("orders finished before the security check stay done, and the new tables follow their orders", () => {
    const old = databaseBefore("019");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, handed_over_by, loaded_by, created_at)
            VALUES (1, '2026-10-24', 1, 'Juan Dela Cruz', 'Roofings, Steel', 'done', 1, 1, '2026-10-24T09:00:00.000Z');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const order = db
            .prepare("SELECT status, loading_area, security_pending, security_check_id FROM orders WHERE id = 1")
            .get();
        assert.deepEqual(
            { ...order },
            { status: "done", loading_area: "", security_pending: 0, security_check_id: null },
        );
        db.prepare(
            "INSERT INTO order_loads (order_id, area, loaded_by, loaded_at) VALUES (1, 'Roofings', 1, '2026-10-24T09:30:00.000Z')",
        ).run();
        assert.throws(
            () =>
                db
                    .prepare(
                        "INSERT INTO order_loads (order_id, area, loaded_by, loaded_at) VALUES (1, 'Roofings', 1, 'x')",
                    )
                    .run(),
            /UNIQUE/,
        );
        db.prepare(
            "INSERT INTO security_checks (order_id, user_id, result, note, checked_at) VALUES (1, 1, 'missing', 'One sheet short', 'x')",
        ).run();
        assert.throws(
            () =>
                db
                    .prepare(
                        "INSERT INTO security_checks (order_id, user_id, result, checked_at) VALUES (1, 1, 'lost', 'x')",
                    )
                    .run(),
            /CHECK/,
        );
        db.prepare("DELETE FROM orders WHERE id = 1").run();
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_loads").get().n, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM security_checks").get().n, 0);
    } finally {
        db.close();
    }
});

// 020 rebuilds users again (cashiers): every account keeps its details and everything that points at it, the loaded
// areas and security checks from 019 included
test("rebuilding users for cashier accounts keeps every account, sign-in, edit, loaded area and security check", () => {
    const old = databaseBefore("020");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA'),
                   (2, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z', NULL, 'Roofings', NULL, ''),
                   (3, 'jose', 'Jose Bantay', 'security', 'x', '2026-10-20T08:00:00.000Z', NULL, '', NULL, '');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, served_by, handed_over_by, loaded_by, created_at)
            VALUES (1, '2026-10-24', 1, 'Juan Dela Cruz', 'Roofings', 'done', 1, 1, 2, '2026-10-24T09:00:00.000Z');
        INSERT INTO order_edits (order_id, user_id, sales_team, changes, edited_at)
            VALUES (1, 1, 'GIGA', '["paymentStatus"]', '2026-10-24T09:20:00.000Z');
        INSERT INTO order_loads (order_id, area, loaded_by, loaded_at) VALUES (1, 'Roofings', 2, '2026-10-24T09:30:00.000Z');
        INSERT INTO security_checks (id, order_id, user_id, result, note, checked_at)
            VALUES (1, 1, 3, 'verified', '', '2026-10-24T09:40:00.000Z');
        UPDATE orders SET security_check_id = 1 WHERE id = 1;
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 3, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const users = db.prepare("SELECT id, role, employee_id, sales_team FROM users ORDER BY id").all();
        assert.deepEqual(
            users.map((row) => ({ ...row })),
            [
                { id: 1, role: "sales", employee_id: "E-1", sales_team: "GIGA" },
                { id: 2, role: "loading", employee_id: null, sales_team: "" },
                { id: 3, role: "security", employee_id: null, sales_team: "" },
            ],
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 3").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_edits WHERE user_id = 1").get().n, 1);
        assert.equal(db.prepare("SELECT loaded_by FROM order_loads WHERE order_id = 1").get().loaded_by, 2);
        assert.equal(db.prepare("SELECT user_id FROM security_checks WHERE id = 1").get().user_id, 3);
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        db.prepare(
            `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('rosa', 'Rosa Bayad', 'cashier', 'x', '2026-10-27T08:00:00.000Z')`,
        ).run();
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('teller', 'Someone', 'teller', 'x', '2026-10-27T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
        // a staff member who loaded an area or checked an order can't be removed out from under it
        assert.throws(() => db.prepare("DELETE FROM users WHERE id = 3").run(), /FOREIGN KEY/);
    } finally {
        db.close();
    }
});

// 021 rebuilds users again (the Hardware department): every account keeps its role, details and what points at it
test("rebuilding users for hardware accounts keeps every account, sign-in, loaded area and security check", () => {
    const old = databaseBefore("021");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA'),
                   (2, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z', NULL, 'Roofings', NULL, ''),
                   (3, 'jose', 'Jose Bantay', 'security', 'x', '2026-10-20T08:00:00.000Z', NULL, '', NULL, ''),
                   (4, 'rosa', 'Rosa Bayad', 'cashier', 'x', '2026-10-27T08:00:00.000Z', NULL, '', NULL, '');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, served_by, handed_over_by, loaded_by, created_at)
            VALUES (1, '2026-10-24', 1, 'Juan Dela Cruz', 'Roofings', 'done', 1, 1, 2, '2026-10-24T09:00:00.000Z');
        INSERT INTO order_loads (order_id, area, loaded_by, loaded_at) VALUES (1, 'Roofings', 2, '2026-10-24T09:30:00.000Z');
        INSERT INTO security_checks (id, order_id, user_id, result, note, checked_at)
            VALUES (1, 1, 3, 'verified', '', '2026-10-24T09:40:00.000Z');
        UPDATE orders SET security_check_id = 1 WHERE id = 1;
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 4, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const roles = db.prepare("SELECT id, role FROM users ORDER BY id").all();
        assert.deepEqual(
            roles.map((row) => ({ ...row })),
            [
                { id: 1, role: "sales" },
                { id: 2, role: "loading" },
                { id: 3, role: "security" },
                { id: 4, role: "cashier" },
            ],
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 4").get().n, 1);
        assert.equal(db.prepare("SELECT loaded_by FROM order_loads WHERE order_id = 1").get().loaded_by, 2);
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        db.prepare(
            `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('ben', 'Ben Martillo', 'hardware', 'x', '2026-10-28T08:00:00.000Z')`,
        ).run();
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('teller', 'Someone', 'teller', 'x', '2026-10-28T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
    } finally {
        db.close();
    }
});

// 025 rebuilds users again (the TBA department): every account keeps its role, details, when it was last seen and
// what points at it, its messages included
test("rebuilding users for TBA accounts keeps every account, sign-in, last seen, loaded area and message", () => {
    const old = databaseBefore("025");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team, last_seen)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA', 1761800000000),
                   (2, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z', NULL, 'Roofings', NULL, '', NULL),
                   (3, 'dev', 'Dev Coder', 'developer', 'x', '2026-10-29T08:00:00.000Z', NULL, '', NULL, '', NULL);
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, served_by, handed_over_by, loaded_by, created_at)
            VALUES (1, '2026-10-24', 1, 'Juan Dela Cruz', 'Roofings', 'done', 1, 1, 2, '2026-10-24T09:00:00.000Z');
        INSERT INTO order_loads (order_id, area, loaded_by, loaded_at) VALUES (1, 'Roofings', 2, '2026-10-24T09:30:00.000Z');
        INSERT INTO messages (staff_id, sender_id, body, sent_at) VALUES (1, 3, 'Fixed it', '2026-10-29T10:00:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 1, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const maria = db
            .prepare("SELECT role, employee_id, photo, sales_team, last_seen FROM users WHERE id = 1")
            .get();
        assert.deepEqual(
            { ...maria },
            { role: "sales", employee_id: "E-1", photo: "user-1.jpg", sales_team: "GIGA", last_seen: 1761800000000 },
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1").get().n, 1);
        assert.equal(db.prepare("SELECT loaded_by FROM order_loads WHERE order_id = 1").get().loaded_by, 2);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender_id = 3").get().n, 1);
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        db.prepare(
            `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('tony', 'Tony Gulong', 'service', 'x', '2026-10-30T08:00:00.000Z')`,
        ).run();
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('teller', 'Someone', 'teller', 'x', '2026-10-30T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
    } finally {
        db.close();
    }
});

// 029 rebuilds users again (the inventory department): every account keeps its role, details, when it was last seen
// and what points at it, its developer chat and SheeChat messages included
test("rebuilding users for inventory accounts keeps every account, sign-in, last seen and message", () => {
    const old = databaseBefore("029");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team, last_seen)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA', 1761800000000),
                   (2, 'tony', 'Tony Gulong', 'tba', 'x', '2026-10-30T08:00:00.000Z', NULL, '', NULL, '', NULL),
                   (3, 'dev', 'Dev Coder', 'developer', 'x', '2026-10-29T08:00:00.000Z', NULL, '', NULL, '', NULL);
        INSERT INTO messages (staff_id, sender_id, body, sent_at) VALUES (1, 3, 'Fixed it', '2026-10-29T10:00:00.000Z');
        INSERT INTO direct_messages (sender_id, recipient_id, body, sent_at) VALUES (1, 2, 'Battery ready?', '2026-10-31T10:00:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 1, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const maria = db
            .prepare("SELECT role, employee_id, photo, sales_team, last_seen FROM users WHERE id = 1")
            .get();
        assert.deepEqual(
            { ...maria },
            { role: "sales", employee_id: "E-1", photo: "user-1.jpg", sales_team: "GIGA", last_seen: 1761800000000 },
        );
        assert.equal(db.prepare("SELECT role FROM users WHERE id = 2").get().role, "service");
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender_id = 3").get().n, 1);
        assert.equal(
            db.prepare("SELECT COUNT(*) AS n FROM direct_messages WHERE sender_id = 1 AND recipient_id = 2").get().n,
            1,
        );
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        db.prepare(
            `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('ines', 'Ines Bodega', 'inventory', 'x', '2026-10-31T08:00:00.000Z')`,
        ).run();
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('teller', 'Someone', 'teller', 'x', '2026-10-31T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
    } finally {
        db.close();
    }
});

test("accounts start with no cover photo, and keep their profile photo", () => {
    const old = databaseBefore("032");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, photo)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-29T08:00:00.000Z', 'user-1.jpg');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const maria = db.prepare("SELECT photo, cover_photo FROM users WHERE id = 1").get();
        assert.deepEqual({ ...maria }, { photo: "user-1.jpg", cover_photo: null });
    } finally {
        db.close();
    }
});

// 031 rebuilds users again (the Chassis department): every account keeps its role, details, when it was last seen
// and what points at it, its developer chat and SheeChat messages included
test("rebuilding users for chassis accounts keeps every account, sign-in, last seen and message", () => {
    const old = databaseBefore("031");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team, last_seen)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA', 1761800000000),
                   (2, 'ines', 'Ines Bodega', 'inventory', 'x', '2026-10-31T08:00:00.000Z', NULL, '', NULL, '', NULL),
                   (3, 'dev', 'Dev Coder', 'developer', 'x', '2026-10-29T08:00:00.000Z', NULL, '', NULL, '', NULL);
        INSERT INTO messages (staff_id, sender_id, body, sent_at) VALUES (1, 3, 'Fixed it', '2026-10-29T10:00:00.000Z');
        INSERT INTO direct_messages (sender_id, recipient_id, body, sent_at) VALUES (1, 2, 'Stock ready?', '2026-10-31T10:00:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 1, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const maria = db
            .prepare("SELECT role, employee_id, photo, sales_team, last_seen FROM users WHERE id = 1")
            .get();
        assert.deepEqual(
            { ...maria },
            { role: "sales", employee_id: "E-1", photo: "user-1.jpg", sales_team: "GIGA", last_seen: 1761800000000 },
        );
        assert.equal(db.prepare("SELECT role FROM users WHERE id = 2").get().role, "inventory");
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender_id = 3").get().n, 1);
        assert.equal(
            db.prepare("SELECT COUNT(*) AS n FROM direct_messages WHERE sender_id = 1 AND recipient_id = 2").get().n,
            1,
        );
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        // a Chassis account itself is 046's to check: it turns them into loading ones
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('teller', 'Someone', 'teller', 'x', '2026-10-31T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
    } finally {
        db.close();
    }
});
test("035 adds the sheet's own columns and typed cells, and an order's cells go with it", () => {
    const db = openDatabase(dataDir);
    try {
        db.exec("PRAGMA foreign_keys = ON");
        const { lastInsertRowid: id } = db
            .prepare(
                `INSERT INTO orders (queue_date, queue_num, name, purpose, status, created_at)
            VALUES ('2026-11-05', 1, 'Ana', 'Steel', 'pending', '2026-11-05T01:00:00Z')`,
            )
            .run();
        db.prepare(
            "INSERT INTO sheet_columns (key, name, created_at) VALUES ('c:TRUCK', 'Truck', '2026-11-05T01:00:00Z')",
        ).run();
        db.prepare("INSERT INTO sheet_cells (order_id, cell, value) VALUES (?, 'c:TRUCK', 'Isuzu')").run(id);

        assert.throws(() =>
            db.prepare("INSERT INTO sheet_columns (key, name, created_at) VALUES ('c:TRUCK', 'truck', 'x')").run(),
        );
        db.prepare("DELETE FROM orders WHERE id = ?").run(id);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sheet_cells").get().n, 0);
    } finally {
        db.close();
    }
});

// 036 rebuilds serves, so a point stays when Purge erases the ticket it was for
test("036 keeps every point, and a purged ticket's point stays with no ticket", () => {
    const old = databaseBefore("036");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, created_at, served_by)
            VALUES (5, '2026-11-05', 1, 'Ana', 'Steel', 'done', '2026-11-05T01:00:00Z', 1);
        INSERT INTO serves (id, order_id, user_id, queue_date, served_at)
            VALUES (9, 5, 1, '2026-11-05', '2026-11-05T01:30:00Z');
    `);
    old.close();

    const db = openDatabase(dataDir);
    try {
        assert.deepEqual(
            { ...db.prepare("SELECT order_id, user_id, queue_date FROM serves WHERE id = 9").get() },
            { order_id: 5, user_id: 1, queue_date: "2026-11-05" },
        );

        // a checked order: its gate check points back at it, and goes with it
        db.prepare(
            "INSERT INTO security_checks (id, order_id, user_id, result, checked_at) VALUES (3, 5, 1, 'verified', 'x')",
        ).run();
        db.prepare("UPDATE orders SET security_check_id = 3, deleted_at = 'x' WHERE id = 5").run();
        db.prepare("DELETE FROM orders WHERE id = 5").run();

        assert.equal(db.prepare("SELECT order_id FROM serves WHERE id = 9").get().order_id, null);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM security_checks").get().n, 0);
        // a ticket's visit can still only earn one point
        const { lastInsertRowid: id } = db
            .prepare(
                `INSERT INTO orders (queue_date, queue_num, name, purpose, status, created_at)
            VALUES ('2026-11-06', 1, 'Ben', 'Steel', 'done', 'x')`,
            )
            .run();
        const addPoint = db.prepare(
            "INSERT INTO serves (order_id, user_id, queue_date, served_at) VALUES (?, 1, '2026-11-06', 'x')",
        );
        addPoint.run(id);
        assert.throws(() => addPoint.run(id));
    } finally {
        db.close();
    }
});

// 037 adds who made each ticket and who is assisting its customer; a ticket from before has no maker, so anyone in
// sales still hands it over
test("037 leaves the tickets already taken with no maker and no one assisting", () => {
    const old = databaseBefore("037");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, created_at)
            VALUES (5, '2026-11-06', 1, 'Ana', 'Steel', 'pending', '2026-11-06T01:00:00Z');
    `);
    old.close();

    const db = openDatabase(dataDir);
    try {
        assert.deepEqual(
            { ...db.prepare("SELECT created_by, assisted_by FROM orders WHERE id = 5").get() },
            { created_by: null, assisted_by: null },
        );
        db.prepare("UPDATE orders SET created_by = 1, assisted_by = 1 WHERE id = 5").run();
        assert.deepEqual(
            { ...db.prepare("SELECT created_by, assisted_by FROM orders WHERE id = 5").get() },
            { created_by: 1, assisted_by: 1 },
        );
    } finally {
        db.close();
    }
});

// 038 makes sign-ins last a week from last use, up to 30 days from signing in; one open from before was made to last
// 8 hours, so it started 8 hours before it ends
test("038 dates the sign-ins already open from when they began", () => {
    const old = databaseBefore("038");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 1, 1800000000000);
    `);
    old.close();

    const db = openDatabase(dataDir);
    try {
        assert.deepEqual(
            { ...db.prepare("SELECT expires, created_at FROM sessions WHERE sid_hash = 'abc'").get() },
            { expires: 1800000000000, created_at: 1800000000000 - 8 * 60 * 60 * 1000 },
        );
    } finally {
        db.close();
    }
});

// 039 adds concern reports: the messages already sent stay plain text messages, linked to no report
test("039 keeps every message as a text message with no report, and adds the reports table", () => {
    const old = databaseBefore("039");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO messages (id, staff_id, sender_id, body, sent_at) VALUES (4, 1, 1, 'The printer is stuck.', 'x');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();
    try {
        assert.deepEqual(
            { ...db.prepare("SELECT body, kind, concern_id FROM messages WHERE id = 4").get() },
            { body: "The printer is stuck.", kind: "text", concern_id: null },
        );
        db.prepare(
            `
            INSERT INTO concerns (staff_id, kind, area, details, impact, created_at, updated_at)
            VALUES (1, 'bug', 'Loading', 'Start does nothing', 'blocking', 'x', 'x')`,
        ).run();
        assert.deepEqual(
            { ...db.prepare("SELECT status, status_note, extra, status_by FROM concerns").get() },
            { status: "open", status_note: "", extra: "", status_by: null },
        );
        assert.throws(
            () =>
                db.exec(`
            INSERT INTO concerns (staff_id, kind, area, details, impact, created_at, updated_at)
            VALUES (1, 'wish', 'x', 'x', 'low', 'x', 'x')`),
            /CHECK/,
        );
    } finally {
        db.close();
    }
});

// 042 marks dropped accounts; every account already there is still in use
test("042 leaves every account in use, and a dropped one still credits its tickets", () => {
    const old = databaseBefore("042");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, disabled_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', 'x', NULL), (2, 'jun', 'Jun Reyes', 'loading', 'x', 'x', 'off');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();
    try {
        assert.deepEqual(
            db
                .prepare("SELECT id, dropped_at FROM users ORDER BY id")
                .all()
                .map((u) => ({ ...u })),
            [
                { id: 1, dropped_at: null },
                { id: 2, dropped_at: null },
            ],
        );
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
        db.close();
    }
});

// 041 rebuilds both chat tables so that a number, once given to a message, is never given to another
test("041 keeps every message with its number, and a number isn't used again once the messages are erased", () => {
    const old = databaseBefore("041");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z'),
                   (2, 'jun', 'Jun Reyes', 'loading', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO concerns (id, staff_id, kind, area, details, impact, created_at, updated_at)
            VALUES (3, 1, 'bug', 'Loading', 'Start does nothing', 'blocking', 'x', 'x');
        INSERT INTO messages (id, staff_id, sender_id, body, sent_at, read_at, image, kind, concern_id)
            VALUES (40, 1, 1, 'Report', 'sent', 'read', 'a.jpg', 'report', 3);
        INSERT INTO direct_messages (id, sender_id, recipient_id, body, image, sent_at, read_at)
            VALUES (50, 1, 2, 'Truck 2', 'b.jpg', 'sent', 'read');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();
    try {
        assert.deepEqual(
            { ...db.prepare("SELECT * FROM messages").get() },
            {
                id: 40,
                staff_id: 1,
                sender_id: 1,
                body: "Report",
                sent_at: "sent",
                read_at: "read",
                image: "a.jpg",
                kind: "report",
                concern_id: 3,
            },
        );
        assert.deepEqual(
            { ...db.prepare("SELECT * FROM direct_messages").get() },
            {
                id: 50,
                sender_id: 1,
                recipient_id: 2,
                body: "Truck 2",
                image: "b.jpg",
                sent_at: "sent",
                read_at: "read",
            },
        );
        for (const index of ["messages_staff", "direct_messages_pair", "direct_messages_unread"]) {
            assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = ?").get(index), index);
        }

        db.exec("DELETE FROM messages; DELETE FROM direct_messages");
        const nextMessage = db
            .prepare("INSERT INTO messages (staff_id, sender_id, body, sent_at) VALUES (1, 1, 'New', 'x')")
            .run();
        const nextDirect = db
            .prepare("INSERT INTO direct_messages (sender_id, recipient_id, body, sent_at) VALUES (1, 2, 'New', 'x')")
            .run();
        assert.equal(Number(nextMessage.lastInsertRowid), 41);
        assert.equal(Number(nextDirect.lastInsertRowid), 51);

        // the rebuilt tables still check who a message is from, and still go with the account
        assert.throws(
            () =>
                db
                    .prepare(
                        "INSERT INTO direct_messages (sender_id, recipient_id, body, sent_at) VALUES (9, 2, 'x', 'x')",
                    )
                    .run(),
            /FOREIGN KEY/,
        );
        db.prepare("DELETE FROM users WHERE id = 1").run();
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages").get().n, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM direct_messages").get().n, 0);
    } finally {
        db.close();
    }
});

// 040 renames the TBA department to Service: its accounts, the customer at its area, what it has loaded and a guard's
// send-back all move over; a TBA priority order keeps its mark
test("040 turns TBA accounts and areas into Service, and leaves everything else as it was", () => {
    const old = databaseBefore("040");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team, last_seen, cover_photo)
            VALUES (1, 'tony', 'Tony Gulong', 'tba', 'x', '2026-10-30T08:00:00.000Z', 'E-1', 'Tires', 'user-1.jpg', '', 1761800000000, 'cover-1.jpg'),
                   (2, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z', NULL, 'Roofings', NULL, '', NULL, NULL),
                   (3, 'guard', 'Gina Guard', 'security', 'x', '2026-10-20T08:00:00.000Z', NULL, '', NULL, '', NULL, NULL);
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, loading_area, tba_priority, created_at)
            VALUES (1, '2026-11-09', 1, 'At TBA now', 'Tire', 'pending', 'TBA', 1, '2026-11-09T09:00:00.000Z'),
                   (2, '2026-11-09', 2, 'At Roofings now', 'Roofings', 'pending', 'Roofings', 0, '2026-11-09T09:00:00.000Z');
        INSERT INTO order_loads (order_id, area, loaded_by, loaded_at)
            VALUES (1, 'TBA', 1, '2026-11-09T09:30:00.000Z'),
                   (2, 'Roofings', 2, '2026-11-09T09:30:00.000Z');
        INSERT INTO security_checks (id, order_id, user_id, result, note, checked_at, returned_to)
            VALUES (1, 1, 3, 'missing', 'Short one tire', '2026-11-09T10:00:00.000Z', 'TBA'),
                   (2, 2, 3, 'missing', 'Short one sheet', '2026-11-09T10:00:00.000Z', 'Roofings');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 1, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const tony = db
            .prepare("SELECT role, employee_id, photo, last_seen, cover_photo FROM users WHERE id = 1")
            .get();
        assert.deepEqual(
            { ...tony },
            {
                role: "service",
                employee_id: "E-1",
                photo: "user-1.jpg",
                last_seen: 1761800000000,
                cover_photo: "cover-1.jpg",
            },
        );
        assert.equal(db.prepare("SELECT role FROM users WHERE id = 2").get().role, "loading");
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1").get().n, 1);

        assert.deepEqual(
            db
                .prepare("SELECT loading_area, tba_priority FROM orders ORDER BY id")
                .all()
                .map((o) => ({ ...o })),
            [
                { loading_area: "Service", tba_priority: 1 },
                { loading_area: "Roofings", tba_priority: 0 },
            ],
        );
        assert.deepEqual(
            db
                .prepare("SELECT area FROM order_loads ORDER BY order_id")
                .all()
                .map((l) => l.area),
            ["Service", "Roofings"],
        );
        assert.deepEqual(
            db
                .prepare("SELECT returned_to FROM security_checks ORDER BY id")
                .all()
                .map((c) => c.returned_to),
            ["Service", "Roofings"],
        );
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('old', 'Old Role', 'tba', 'x', '2026-11-09T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
    } finally {
        db.close();
    }
});

// 043 rebuilds users again (the Logistics department): every account keeps its role, details and what points at it
test("043 lets an account be Logistics staff and leaves every account as it was", () => {
    const old = databaseBefore("043");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team, last_seen, cover_photo, dropped_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA', 1761800000000, 'cover-1.jpg', NULL),
                   (2, 'tony', 'Tony Gulong', 'service', 'x', '2026-10-30T08:00:00.000Z', NULL, '', NULL, '', NULL, NULL, '2026-11-09T09:00:00.000Z');
        INSERT INTO direct_messages (sender_id, recipient_id, body, sent_at) VALUES (1, 2, 'Battery ready?', '2026-10-31T10:00:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 1, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const maria = db
            .prepare("SELECT role, employee_id, photo, sales_team, last_seen, cover_photo FROM users WHERE id = 1")
            .get();
        assert.deepEqual(
            { ...maria },
            {
                role: "sales",
                employee_id: "E-1",
                photo: "user-1.jpg",
                sales_team: "GIGA",
                last_seen: 1761800000000,
                cover_photo: "cover-1.jpg",
            },
        );
        assert.deepEqual(
            { ...db.prepare("SELECT role, dropped_at FROM users WHERE id = 2").get() },
            { role: "service", dropped_at: "2026-11-09T09:00:00.000Z" },
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1").get().n, 1);
        assert.equal(
            db.prepare("SELECT COUNT(*) AS n FROM direct_messages WHERE sender_id = 1 AND recipient_id = 2").get().n,
            1,
        );
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        // a Logistics account itself is 044's to check: it turns them into loading ones
        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('teller', 'Someone', 'teller', 'x', '2026-11-09T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
    } finally {
        db.close();
    }
});

// 044 rebuilds users once more (Logistics joins the loading crew): a Logistics account becomes a loading one, with its
// sessions, chats and loaded areas, and every other account stays as it was
test("044 turns Logistics accounts into loading ones and leaves every other account as it was", () => {
    const old = databaseBefore("044");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team, last_seen, cover_photo, dropped_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA', 1761800000000, 'cover-1.jpg', NULL),
                   (2, 'lito', 'Lito Reyes', 'logistics', 'x', '2026-11-09T08:00:00.000Z', 'E-2', 'Logistics', 'user-2.jpg', '', 1762600000000, NULL, NULL),
                   (3, 'tony', 'Tony Gulong', 'service', 'x', '2026-10-30T08:00:00.000Z', NULL, '', NULL, '', NULL, NULL, '2026-11-09T09:00:00.000Z');
        INSERT INTO direct_messages (sender_id, recipient_id, body, sent_at) VALUES (2, 1, 'Plain sheets loaded', '2026-11-09T10:00:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 2, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const roles = db
            .prepare("SELECT id, role FROM users ORDER BY id")
            .all()
            .map(({ id, role }) => [id, role]);
        assert.deepEqual(roles, [
            [1, "sales"],
            [2, "loading"],
            [3, "service"],
        ]);
        assert.deepEqual(
            { ...db.prepare("SELECT employee_id, department, photo, last_seen FROM users WHERE id = 2").get() },
            { employee_id: "E-2", department: "Logistics", photo: "user-2.jpg", last_seen: 1762600000000 },
        );
        assert.equal(
            db.prepare("SELECT dropped_at FROM users WHERE id = 3").get().dropped_at,
            "2026-11-09T09:00:00.000Z",
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 2").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM direct_messages WHERE sender_id = 2").get().n, 1);
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('ben', 'Ben Cruz', 'logistics', 'x', '2026-11-10T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
    } finally {
        db.close();
    }
});

// 045 gives each account a loading area, '' for every account already there, which an admin then sets on Accounts
test("045 adds a loading area to every account, none to start with", () => {
    const old = databaseBefore("045");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z'),
                   (2, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const areas = db.prepare("SELECT id, role, loading_area FROM users ORDER BY id").all().map((r) => ({ ...r }));
        assert.deepEqual(areas, [
            { id: 1, role: "loading", loading_area: "" },
            { id: 2, role: "sales", loading_area: "" },
        ]);
    } finally {
        db.close();
    }
});

// 046 rebuilds users once more (Chassis joins the loading crew): a Chassis account becomes a loading one already set to
// the Chassis area, with its sessions and chats, and every other account stays as it was, its own area too
test("046 turns Chassis accounts into loading ones at the Chassis area and leaves every other account as it was", () => {
    const old = databaseBefore("046");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, employee_id, department, photo, sales_team, last_seen, cover_photo, dropped_at, loading_area)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'E-1', 'Sales', 'user-1.jpg', 'GIGA', 1761800000000, 'cover-1.jpg', NULL, ''),
                   (2, 'carlos', 'Carlos Tsasis', 'chassis', 'x', '2026-10-31T08:00:00.000Z', 'E-2', 'Chassis', 'user-2.jpg', '', 1762600000000, NULL, NULL, ''),
                   (3, 'pedro', 'Pedro Garcia', 'loading', 'x', '2026-10-20T08:00:00.000Z', NULL, '', NULL, '', NULL, NULL, NULL, 'Steel'),
                   (4, 'dropped.4', 'Deleted', 'chassis', 'x', '2026-10-31T08:00:00.000Z', NULL, '', NULL, '', NULL, NULL, '2026-11-09T09:00:00.000Z', '');
        INSERT INTO direct_messages (sender_id, recipient_id, body, sent_at) VALUES (2, 1, 'Chassis loaded', '2026-11-10T10:00:00.000Z');
        INSERT INTO sessions (sid_hash, user_id, expires) VALUES ('abc', 2, 4102444800000);
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const accounts = db
            .prepare("SELECT id, role, loading_area FROM users ORDER BY id")
            .all()
            .map(({ id, role, loading_area }) => [id, role, loading_area]);
        assert.deepEqual(accounts, [
            [1, "sales", ""],
            [2, "loading", "Chassis"],
            [3, "loading", "Steel"],
            // a deleted account has no area, as Delete leaves it
            [4, "loading", ""],
        ]);
        assert.deepEqual(
            { ...db.prepare("SELECT employee_id, department, photo, last_seen FROM users WHERE id = 2").get() },
            { employee_id: "E-2", department: "Chassis", photo: "user-2.jpg", last_seen: 1762600000000 },
        );
        assert.equal(db.prepare("SELECT cover_photo FROM users WHERE id = 1").get().cover_photo, "cover-1.jpg");
        assert.equal(db.prepare("SELECT dropped_at FROM users WHERE id = 4").get().dropped_at, "2026-11-09T09:00:00.000Z");
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 2").get().n, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM direct_messages WHERE sender_id = 2").get().n, 1);
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

        assert.throws(
            () =>
                db
                    .prepare(
                        `INSERT INTO users (username, name, role, password_hash, created_at)
            VALUES ('ben', 'Ben Cruz', 'chassis', 'x', '2026-11-10T08:00:00.000Z')`,
                    )
                    .run(),
            /CHECK constraint/,
        );
        assert.throws(() => db.prepare("UPDATE users SET employee_id = 'e-1' WHERE id = 2").run(), /UNIQUE/);
    } finally {
        db.close();
    }
});

// 047 gives each account a specialization, '' for every account already there, which a developer then types on My account
test("047 adds a specialization to every account, none to start with", () => {
    const old = databaseBefore("047");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at, department)
            VALUES (1, 'dev', 'Dev Coder', 'developer', 'x', '2026-10-29T08:00:00.000Z', 'IT'),
                   (2, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z', 'Sales');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const rows = db.prepare("SELECT id, department, specialization FROM users ORDER BY id").all().map((r) => ({ ...r }));
        assert.deepEqual(rows, [
            { id: 1, department: "IT", specialization: "" },
            { id: 2, department: "Sales", specialization: "" },
        ]);
    } finally {
        db.close();
    }
});

// 048 renames the For Logistics type of order to Stainless on the orders already taken, alone or in a list, and on
// their invoices, so their tickets show ST and they stay at the Logistics area; every other order is left as it was
test("048 turns For Logistics orders and invoices into Stainless ones and leaves every other order as it was", () => {
    const old = databaseBefore("048");
    old.exec(`
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, loading_area, created_at)
            VALUES (1, '2026-11-10', 1, 'Only stainless', 'For Logistics', 'pending', 'Logistics', '2026-11-10T09:00:00.000Z'),
                   (2, '2026-11-10', 2, 'Steel and stainless', 'Steel, For Logistics', 'pending', '', '2026-11-10T09:00:00.000Z'),
                   (3, '2026-11-10', 3, 'Only steel', 'Steel', 'pending', '', '2026-11-10T09:00:00.000Z');
        INSERT INTO order_invoices (order_id, position, invoice_no, type)
            VALUES (1, 0, '701', 'For Logistics'),
                   (2, 0, '101', 'Steel'),
                   (2, 1, '702', 'For Logistics'),
                   (3, 0, '102', 'Steel');
    `);
    old.close();

    const quiet = mock.method(console, "log", () => {});
    const db = openDatabase(dataDir);
    quiet.mock.restore();

    try {
        const orders = db
            .prepare("SELECT id, purpose, loading_area FROM orders ORDER BY id")
            .all()
            .map(({ id, purpose, loading_area }) => [id, purpose, loading_area]);
        assert.deepEqual(orders, [
            [1, "Stainless", "Logistics"],
            [2, "Steel, Stainless", ""],
            [3, "Steel", ""],
        ]);
        const invoices = db
            .prepare("SELECT invoice_no, type FROM order_invoices ORDER BY invoice_no")
            .all()
            .map(({ invoice_no, type }) => [invoice_no, type]);
        assert.deepEqual(invoices, [
            ["101", "Steel"],
            ["102", "Steel"],
            ["701", "Stainless"],
            ["702", "Stainless"],
        ]);
    } finally {
        db.close();
    }
});
