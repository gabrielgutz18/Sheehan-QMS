// copies the database, the uploaded display video, staff photos and chat pictures into <BACKUP_DIR>/<date_time>/ (default:
// backups/ in the data folder), keeping the newest KEEP backups; safe to run while the app is running
// run: npm run backup   (on the server, schedule it daily with Windows Task Scheduler and set
// BACKUP_DIR to another drive, so a failed disk doesn't take the backups with it)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { DB_FILE, resolveDataDir } from './db.js';

const KEEP = 14;

const dataDir = resolveDataDir(process.env.DATA_DIR);
const source = join(dataDir, DB_FILE);
if (!existsSync(source)) {
    console.error(`No database at ${source}. Start the app once to create it.`);
    process.exit(1);
}

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupsDir = process.env.BACKUP_DIR ? resolveDataDir(process.env.BACKUP_DIR) : join(dataDir, "backups");
const target = join(backupsDir, stamp);
mkdirSync(target, { recursive: true });

// VACUUM INTO writes a consistent copy even while orders are being saved
const db = new DatabaseSync(source);
db.exec(`VACUUM INTO '${join(target, DB_FILE).replaceAll("'", "''")}'`);
db.close();

// uploaded files: the display video, staff profile photos and pictures sent in the chat
for (const folder of ["videos", "photos", "chat-images"]) {
    const from = join(dataDir, folder);
    if (existsSync(from)) cpSync(from, join(target, folder), { recursive: true });
}

const old = readdirSync(backupsDir).sort().slice(0, -KEEP);
for (const name of old) rmSync(join(backupsDir, name), { recursive: true, force: true });

console.log(`Backup saved to ${target}${old.length ? ` (removed ${old.length} old)` : ""}`);
