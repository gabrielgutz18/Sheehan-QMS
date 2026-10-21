// the app's SQLite database: one file, queue.db, in the data folder, created on first start
// schema changes live in server/migrations as numbered .sql files; each runs once, in order, so a new
// install starts with every table and an existing database is brought up to date without losing data
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

export const DB_FILE = 'queue.db';

// DATA_DIR from .env, relative to the project; data/ in the project by default
// (resolved here, not from the working directory, which is System32 when run as a Windows service)
export const resolveDataDir = (dir) => resolve(PROJECT_ROOT, dir || 'data');

// runs fn inside one transaction: everything is saved, or nothing is
export function transaction(db, fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

function migrate(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TEXT NOT NULL
    )`);
    const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name));
    const pending = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql') && !applied.has(file)).sort();
    if (pending.length === 0) return;

    // foreign keys are off while migrations run, so one can rebuild a table (the only way SQLite changes a CHECK)
    // without its DROP TABLE cascading into the rows that point at it; each is checked before it commits instead
    // (SQLite ignores this pragma inside a transaction, so it's set around them)
    db.exec('PRAGMA foreign_keys = OFF');
    try {
        for (const file of pending) {
            const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
            transaction(db, () => {
                db.exec(sql);
                const broken = db.prepare('PRAGMA foreign_key_check').all();
                if (broken.length) throw new Error(`Migration ${file} left ${broken.length} row(s) pointing at nothing`);
                db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
            });
            console.log(`Database: applied migration ${file}`);
        }
    } finally {
        db.exec('PRAGMA foreign_keys = ON');
    }
}

export function openDatabase(dataDir) {
    mkdirSync(dataDir, { recursive: true });
    const db = new DatabaseSync(join(dataDir, DB_FILE));
    db.exec(`
        PRAGMA journal_mode = WAL;   -- display screens keep reading while an order is being saved
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;  -- wait for another writer instead of failing straight away
    `);
    migrate(db);
    return db;
}
