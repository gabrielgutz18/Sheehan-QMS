// bringing an existing database up to date: each migration runs once, and one that rebuilds a table keeps
// every row in it and in the tables that point at it
// run: npm test -- --test-name-pattern="migration"
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { DB_FILE, openDatabase } from '../../server/db.js';

const MIGRATIONS_DIR = new URL('../../server/migrations/', import.meta.url);

let dataDir;

beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "sheehan-migrate-"));
});

afterEach(() => rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

// a database as an older version of the app left it: the migrations before `upTo`, applied and recorded
const databaseBefore = (upTo) => {
    const db = new DatabaseSync(join(dataDir, DB_FILE));
    db.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && f < upTo).sort()) {
        db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), "utf8"));
        db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
    }
    return db;
};

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

// 008 adds the sales details from Customer order, 009 the loading teams, 010 handing over to loading, 012 the runner,
// 013 the receiver and sales times
test("older tickets keep their items and get empty sales details and loading teams", () => {
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
        const loading = db.prepare("SELECT serving_team, teams_done FROM orders WHERE id = 5").get();
        assert.deepEqual({ ...loading }, { serving_team: null, teams_done: "" });
        assert.ok(db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "team"));
        // still with sales until a counter hands them over
        const handover = db.prepare("SELECT handed_over_by, handed_over_at FROM orders WHERE id = 5").get();
        assert.deepEqual({ ...handover }, { handed_over_by: null, handed_over_at: null });
        // the customer collects the items themselves
        assert.equal(db.prepare("SELECT runner FROM orders WHERE id = 5").get().runner, "");
        // no receiver or sales times on a ticket taken before they were asked for
        const staffOnly = db.prepare("SELECT receiver, sales_time_in, sales_time_out FROM orders WHERE id = 5").get();
        assert.deepEqual({ ...staffOnly }, { receiver: "", sales_time_in: "", sales_time_out: "" });
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
        const invoices = db.prepare("SELECT order_id, position, invoice_no, type FROM order_invoices ORDER BY order_id").all();
        assert.deepEqual(invoices.map((row) => ({ ...row })), [
            { order_id: 1, position: 0, invoice_no: "43355521", type: "Roofings" },
            { order_id: 2, position: 0, invoice_no: "5566", type: "" },
        ]);
        assert.ok(!db.prepare("PRAGMA table_info(orders)").all().some((column) => column.name === "invoice_no"));
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 3);
    } finally {
        db.close();
    }
});
