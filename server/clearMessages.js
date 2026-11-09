// erases every chat for good: the developer chat (messages), SheeChat (direct_messages) and the pictures sent in them;
// the reports staff filed through Message developer (concerns) are a record of the work, not a chat, and they stay
// a copy of the database and the pictures is saved in the backups folder first, and nothing is erased if that fails;
// safe to run while the app is running, and whatever is sent after it is kept
// run: npm run clear:messages                           says how much there is, and changes nothing
//      npm run clear:messages -- --yes                  erases it all
//      npm run clear:messages -- --yes --no-backup      erases it all and keeps no copy
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { DB_FILE, backupStamp, openDatabase, resolveBackupsDir, resolveDataDir, transaction } from "./db.js";

const IMAGES_FOLDER = "chat-images";

const pictureFiles = (dataDir) => {
    const folder = join(dataDir, IMAGES_FOLDER);
    return existsSync(folder) ? readdirSync(folder) : [];
};

// not openDatabase on its own: that would make an empty database for a mistyped DATA_DIR and report nothing to erase;
// it does bring the tables up to date, as the next restart would, so an erased message's number is never used again
const openExisting = (dataDir) => {
    const source = join(dataDir, DB_FILE);
    if (!existsSync(source)) throw new Error(`No database at ${source}. Check DATA_DIR in .env.`);
    return openDatabase(dataDir);
};

const countIn = (db, table) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
const countAll = (db, dataDir) => ({
    developerChat: countIn(db, "messages"),
    sheeChat: countIn(db, "direct_messages"),
    pictures: pictureFiles(dataDir).length,
});

/** @param {string} dataDir */
export function countMessages(dataDir) {
    const db = openExisting(dataDir);
    try {
        return countAll(db, dataDir);
    } finally {
        db.close();
    }
}

// the pictures nothing points at any more, including ones left behind by a message erased some other way; a picture in
// a message sent since the tables were emptied stays
const removePictures = (db, dataDir) => {
    const inUse = new Set(
        db
            .prepare(
                "SELECT image FROM messages WHERE image IS NOT NULL UNION SELECT image FROM direct_messages WHERE image IS NOT NULL",
            )
            .all()
            .map((row) => row.image),
    );
    for (const file of pictureFiles(dataDir)) {
        if (!inUse.has(file)) rmSync(join(dataDir, IMAGES_FOLDER, file), { force: true });
    }
};

// deleting a row only marks its space as free, so the words stay readable in the file until it's rewritten
const compact = (db) => {
    try {
        db.exec("VACUUM");
        return !db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get().busy;
    } catch (err) {
        console.error(`Couldn't compact the database: ${err.message}`);
        return false;
    }
};

// returns { erased: how many of each, backup: its folder or null, compacted: false if the file still has to be rewritten }
/**
 * @param {string} dataDir
 * @param {{ backupsDir: string, keepCopy?: boolean }} options
 */
export function clearMessages(dataDir, { backupsDir, keepCopy = true }) {
    const db = openExisting(dataDir);
    try {
        const erased = countAll(db, dataDir);
        let backup = null;
        if (keepCopy && erased.developerChat + erased.sheeChat + erased.pictures > 0) {
            backup = join(backupsDir, `${backupStamp(new Date())}_before-clear-messages`);
            mkdirSync(backup, { recursive: true });
            db.exec(`VACUUM INTO '${join(backup, DB_FILE).replaceAll("'", "''")}'`);
            const pictures = join(dataDir, IMAGES_FOLDER);
            if (existsSync(pictures)) cpSync(pictures, join(backup, IMAGES_FOLDER), { recursive: true });
        }

        transaction(db, () => {
            db.exec("DELETE FROM messages");
            db.exec("DELETE FROM direct_messages");
        });
        removePictures(db, dataDir);
        return { erased, backup, compacted: compact(db) };
    } finally {
        db.close();
    }
}

const describe = ({ developerChat, sheeChat, pictures }) =>
    `${developerChat} developer chat message(s), ${sheeChat} SheeChat message(s), ${pictures} picture file(s)`;

function main() {
    const flags = process.argv.slice(2);
    const unknown = flags.find((flag) => flag !== "--yes" && flag !== "--no-backup");
    if (unknown) {
        console.error(`Unknown option ${unknown}. Use --yes to erase, and --no-backup to keep no copy.`);
        process.exitCode = 1;
        return;
    }

    const dataDir = resolveDataDir(process.env.DATA_DIR);
    try {
        if (!flags.includes("--yes")) {
            console.log(`In ${dataDir}: ${describe(countMessages(dataDir))}.`);
            console.log("Nothing was changed. To erase all of it for good: npm run clear:messages -- --yes");
            return;
        }
        const { erased, backup, compacted } = clearMessages(dataDir, {
            backupsDir: resolveBackupsDir(dataDir, process.env.BACKUP_DIR),
            keepCopy: !flags.includes("--no-backup"),
        });
        console.log(`Erased ${describe(erased)} from ${dataDir}.`);
        if (backup)
            console.log(
                `A copy, which still has them, is in ${backup}. Delete that folder if they mustn't be kept at all.`,
            );
        if (!compacted) {
            console.log("The app was too busy to compact the database, so erased words can still be in its file.");
            console.log("Run this again when it's quiet to finish.");
            process.exitCode = 1;
        }
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    }
}

// run as a script (npm run clear:messages), not when the tests import it
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
