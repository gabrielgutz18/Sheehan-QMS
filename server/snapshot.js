// a seeder made from the app's current state, to try it on another computer (e.g. at home) with the same
// staff, tickets, concerns, points, photos and settings, like a Laravel seeder generated from the real database
//
//   npm run snapshot          saves this computer's data folder to seeders/snapshot.json
//                             (an uploaded display video is copied to seeders/videos/)
//   npm run seed:snapshot     loads seeders/snapshot.json into this computer's data folder; the snapshot's
//                             day becomes today, so its queue is today's queue
//       -- --keep-dates       keep the real dates instead (the tickets land in History)
//       -- --replace          swap out a database that already has tickets or accounts (it's backed up first)
//
// seeders/ is in .gitignore: a snapshot holds staff password hashes and customers' names and orders, so carry
// it yourself (USB stick, your own drive), never through git or chat; this script holds no data and is committed
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DB_FILE, openDatabase, resolveDataDir, transaction } from './db.js';

export const SNAPSHOT_FILE = fileURLToPath(new URL('../seeders/snapshot.json', import.meta.url));

// bumped if the file's layout ever changes, so an old snapshot is refused instead of half-loaded
const FORMAT = 1;
// parents before children, so the foreign keys hold while loading; sign-ins (sessions) aren't carried
const TABLES = ["users", "orders", "order_items", "order_invoices", "order_edits", "serves", "queue_counters", "settings"];
const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, "0");
// YYYY-MM-DD by the local clock, the way the server dates tickets
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / DAY_MS);
const stamp = (d) =>
    `${localDate(d)}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;

// every column that holds a time, by how it's stored, so the whole snapshot can move forward by whole days
const SHIFT = {
    day: (day, days) => {
        const [y, m, d] = day.split("-").map(Number);
        return localDate(new Date(y, m - 1, d + days));
    },
    iso: (iso, days) => new Date(Date.parse(iso) + days * DAY_MS).toISOString(),
    ms: (ms, days) => ms + days * DAY_MS,
};
const TIME_COLUMNS = {
    users: { created_at: "iso", disabled_at: "iso" },
    orders: {
        queue_date: "day", original_date: "day",
        created_at: "iso", deleted_at: "iso", restored_at: "iso", called_at: "ms", handed_over_at: "iso",
        loaded_at: "iso",
    },
    order_edits: { edited_at: "iso" },
    serves: { queue_date: "day", served_at: "iso" },
    queue_counters: { queue_date: "day" },
};

// a snapshot taken before 011_order_invoices.sql has one invoice number on each ticket; like the migration, it
// becomes the ticket's first invoice, typed with its type of order when it has only one
const INVOICES_MIGRATION = "011_order_invoices.sql";
const withInvoices = ({ tables, migrations }) => {
    if (migrations.includes(INVOICES_MIGRATION)) return tables;
    const orders = tables.orders ?? [];
    return {
        ...tables,
        orders: orders.map((o) => Object.fromEntries(Object.entries(o).filter(([column]) => column !== "invoice_no"))),
        order_invoices: orders.filter((o) => o.invoice_no).map((o) => ({
            order_id: o.id, position: 0, invoice_no: o.invoice_no, type: o.purpose.includes(",") ? "" : o.purpose,
        })),
    };
};

const shiftRow = (table, row, days) => {
    if (!days) return row;
    const shifted = { ...row };
    for (const [column, kind] of Object.entries(TIME_COLUMNS[table] ?? {})) {
        if (shifted[column] != null) shifted[column] = SHIFT[kind](shifted[column], days);
    }
    return shifted;
};

// the uploaded display video's file name, or null when there's none (or the video is a link)
const uploadedVideo = (settingsRows) => {
    const row = settingsRows.find((s) => s.key === "video");
    const video = row ? JSON.parse(row.value) : null;
    return video?.kind === "file" ? basename(video.file) : null;
};

// reads the whole data folder into one file; safe while the app is running
export function saveSnapshot(dataDir, file = SNAPSHOT_FILE) {
    const source = join(dataDir, DB_FILE);
    if (!existsSync(source)) throw new Error(`No database at ${source}. Start the app once to create it.`);

    const db = new DatabaseSync(source);
    let tables, migrations;
    try {
        // one read, so a ticket saved at the same moment is either all in or not at all
        db.exec("BEGIN");
        tables = Object.fromEntries(TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
        migrations = db.prepare("SELECT name FROM schema_migrations ORDER BY name").all().map((r) => r.name);
        db.exec("COMMIT");
    } finally {
        db.close();
    }

    // profile photos ride along inside the file; they're small squares
    const photos = {};
    for (const { photo } of tables.users) {
        const path = photo && join(dataDir, "photos", basename(photo));
        if (path && existsSync(path)) photos[photo] = readFileSync(path).toString("base64");
    }

    mkdirSync(dirname(file), { recursive: true });
    // the display video can be up to 200 MB, so it's copied beside the file instead
    const video = uploadedVideo(tables.settings);
    const videoFrom = video && join(dataDir, "videos", video);
    const videoCopied = Boolean(videoFrom && existsSync(videoFrom));
    if (videoCopied) {
        mkdirSync(join(dirname(file), "videos"), { recursive: true });
        copyFileSync(videoFrom, join(dirname(file), "videos", video));
    }

    const now = new Date();
    const snapshot = { format: FORMAT, takenAt: now.toISOString(), takenOn: localDate(now), migrations, tables, photos };
    writeFileSync(file, JSON.stringify(snapshot, null, 1));
    return { file, snapshot, video: videoCopied ? video : null };
}

// replaces this data folder's accounts, tickets, points and settings with the snapshot's
// returns { days it was moved forward, the backup folder (if there was data to replace), warnings }
export function loadSnapshot(dataDir, file = SNAPSHOT_FILE, { replace = false, keepDates = false } = {}) {
    if (!existsSync(file)) throw new Error(`No snapshot at ${file}. Make one with npm run snapshot and copy it here.`);
    const snapshot = JSON.parse(readFileSync(file, "utf8"));
    if (snapshot.format !== FORMAT) throw new Error("This snapshot was made by a different version of the app.");

    // creates the database, or brings its tables up to date
    const db = openDatabase(dataDir);
    try {
        const applied = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((r) => r.name));
        const missing = snapshot.migrations.filter((name) => !applied.has(name));
        if (missing.length) {
            throw new Error(`This copy of the app is older than the snapshot (it lacks ${missing.join(", ")}). Pull the latest code first.`);
        }

        // a fresh install has nothing but the built-in admin
        const tickets = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
        const accounts = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
        const hasData = tickets > 0 || accounts > 1;
        if (hasData && !replace) {
            throw new Error(`The database in ${dataDir} already has ${tickets} tickets and ${accounts} accounts. ` +
                "Run again with --replace to swap them for the snapshot (they're backed up first).");
        }
        let backup = null;
        if (hasData) {
            backup = join(dataDir, "backups", `before-snapshot_${stamp(new Date())}`);
            mkdirSync(backup, { recursive: true });
            db.exec(`VACUUM INTO '${join(backup, DB_FILE).replaceAll("'", "''")}'`);
        }

        const days = keepDates ? 0 : daysBetween(snapshot.takenOn, localDate(new Date()));
        const tables = withInvoices(snapshot);
        transaction(db, () => {
            for (const table of ["sessions", ...TABLES.toReversed()]) db.exec(`DELETE FROM ${table}`);
            for (const table of TABLES) {
                const rows = tables[table] ?? [];
                if (!rows.length) continue;
                // column names come from the file, so only ones this table really has are let into the SQL
                const known = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
                const columns = Object.keys(rows[0]);
                const unknown = columns.find((column) => !known.has(column));
                if (unknown) throw new Error(`The snapshot's ${table}.${unknown} isn't in this database.`);
                const insert = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`);
                for (const row of rows) {
                    const shifted = shiftRow(table, row, days);
                    insert.run(...columns.map((column) => shifted[column]));
                }
            }
        });

        const warnings = [];
        mkdirSync(join(dataDir, "photos"), { recursive: true });
        for (const [name, base64] of Object.entries(snapshot.photos ?? {})) {
            writeFileSync(join(dataDir, "photos", basename(name)), Buffer.from(base64, "base64"));
        }
        const video = uploadedVideo(snapshot.tables.settings ?? []);
        if (video) {
            const from = join(dirname(file), "videos", video);
            if (existsSync(from)) {
                mkdirSync(join(dataDir, "videos"), { recursive: true });
                copyFileSync(from, join(dataDir, "videos", video));
            } else {
                warnings.push(`The display video (${video}) wasn't next to the snapshot in videos/, so the display has no video.`);
            }
        }
        return { snapshot, days, backup, warnings };
    } finally {
        db.close();
    }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const describe = ({ tables, photos }) => {
    const days = new Set(tables.orders.map((o) => o.queue_date)).size;
    return `${plural(tables.users.length, "staff account")}, ${plural(tables.orders.length, "ticket")} ` +
        `from ${plural(days, "day")}, ${plural(tables.serves.length, "point")} served, ` +
        `${plural(Object.keys(photos ?? {}).length, "photo")}`;
};

function main() {
    const [command, ...args] = process.argv.slice(2);
    const flags = new Set(args.filter((arg) => arg.startsWith("--")));
    const fileArg = args.find((arg) => !arg.startsWith("--"));
    const file = fileArg ? resolve(fileArg) : SNAPSHOT_FILE;
    const dataDir = resolveDataDir(process.env.DATA_DIR);

    try {
        if (command === "save") {
            const { snapshot, video } = saveSnapshot(dataDir, file);
            console.log(`Saved a snapshot of ${dataDir}`);
            console.log(`  to ${file}`);
            console.log(`  ${describe(snapshot)}${video ? `, and the display video in videos/` : ""}`);
            console.log("It holds staff password hashes and customers' names, so it's left out of git (.gitignore).");
            console.log("Copy the seeders folder to the other computer yourself, then run: npm run seed:snapshot");
        } else if (command === "load") {
            const { snapshot, days, backup, warnings } = loadSnapshot(dataDir, file, {
                replace: flags.has("--replace"),
                keepDates: flags.has("--keep-dates"),
            });
            console.log(`Loaded the snapshot taken ${snapshot.takenOn} into ${dataDir}`);
            console.log(`  ${describe(snapshot)}`);
            if (days) console.log(`  moved ${plural(days, "day")} forward, so ${snapshot.takenOn}'s queue is today's queue`);
            if (backup) console.log(`  what was there before is backed up in ${backup}`);
            for (const warning of warnings) console.log(`  ${warning}`);
            console.log("Staff sign in with the same usernames and passwords as when it was taken;");
            console.log("the built-in admin uses this computer's .env. Restart the app if it's running.");
        } else {
            console.error("Use npm run snapshot (save) or npm run seed:snapshot (load).");
            process.exitCode = 1;
        }
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    }
}

// run as a script (npm run snapshot / seed:snapshot), not when the tests import it
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
