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

test("the returning-customer migration keeps every ticket, its items and its point", () => {
    const old = databaseBefore("006");
    old.exec(`
        INSERT INTO users (id, username, name, role, password_hash, created_at)
            VALUES (1, 'maria', 'Maria Santos', 'sales', 'x', '2026-10-20T08:00:00.000Z');
        INSERT INTO orders (id, queue_date, queue_num, name, purpose, status, remarks, created_at, called_at, served_by)
            VALUES (5, '2026-10-20', 1, 'Juan Dela Cruz', 'Roofings', 'done', 'Counter 2', '2026-10-20T09:00:00.000Z', 1, 1);
        INSERT INTO order_items (order_id, position, item, qty, color) VALUES (5, 0, 'Long span', 4, 'red');
        INSERT INTO serves (order_id, user_id, queue_date, served_at) VALUES (5, 1, '2026-10-20', '2026-10-20T09:30:00.000Z');
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

        db.prepare("UPDATE orders SET status = 'returning' WHERE id = 5").run();
        assert.throws(() => db.prepare("UPDATE orders SET status = 'lost' WHERE id = 5").run(), /CHECK constraint/);

        // foreign keys are back on once the migrations are done: deleting a ticket still takes its items with it
        db.prepare("DELETE FROM orders WHERE id = 5").run();
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_items").get().n, 0);
        assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    } finally {
        db.close();
    }
});
