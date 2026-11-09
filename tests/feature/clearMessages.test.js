// npm run clear:messages: every chat erased for good, from the tables, the pictures folder and the database file itself
// run: npm test -- --test-name-pattern="clear"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, test } from "node:test";

import { clearMessages, countMessages } from "../../server/clearMessages.js";
import { DB_FILE } from "../../server/db.js";
import { bootApp } from "../support/testApp.js";

const SCRIPT = fileURLToPath(new URL("../../server/clearMessages.js", import.meta.url));
const SECRET = "the-gate-code-is-4417";
const SENT = "2026-11-09T08:00:00.000Z";

let app;
let backupsDir;
let sales;
let loading;
let pictures;

beforeEach(async () => {
    app = await bootApp();
    backupsDir = join(tmpdir(), `sheehan-clear-${process.pid}-${Date.now()}`);
    sales = await app.actingAsSales();
    loading = await app.actingAsLoading();
    pictures = join(app.dataDir, "chat-images");
    mkdirSync(pictures, { recursive: true });
});

afterEach(async () => {
    await app.close();
    rmSync(backupsDir, { recursive: true, force: true });
});

// a day's chatting: SheeChat text and a picture, and a developer chat with a picture and a report's card
const chatting = async () => {
    (await sales.post(`/admin/sheechat/${loading.account.id}`, { body: SECRET })).assertStatus(201);
    writeFileSync(join(pictures, "dm.jpg"), "picture bytes");
    writeFileSync(join(pictures, "dev.jpg"), "picture bytes");
    app.db
        .prepare(
            "INSERT INTO direct_messages (sender_id, recipient_id, body, image, sent_at) VALUES (?, ?, '', 'dm.jpg', ?)",
        )
        .run(sales.account.id, loading.account.id, SENT);
    const insert = app.db.prepare(`INSERT INTO messages (staff_id, sender_id, body, image, sent_at, kind, concern_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run(sales.account.id, sales.account.id, SECRET, "dev.jpg", SENT, "text", null);
    const { lastInsertRowid } = app.db
        .prepare(
            `INSERT INTO concerns (staff_id, kind, area, details, impact, created_at, updated_at)
        VALUES (?, 'bug', 'Cashier', 'The page is blank', 'minor', ?, ?)`,
        )
        .run(sales.account.id, SENT, SENT);
    insert.run(sales.account.id, sales.account.id, "Report filed", null, SENT, "report", lastInsertRowid);
};

const rows = (table) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test("clearing erases both chats and their pictures, and leaves the reports and accounts", async () => {
    await chatting();
    writeFileSync(join(pictures, "left-behind.jpg"), "a picture no message points at");

    const { erased, compacted } = clearMessages(app.dataDir, { backupsDir });

    assert.deepEqual(erased, { developerChat: 2, sheeChat: 2, pictures: 3 });
    assert.equal(compacted, true);
    assert.equal(rows("messages"), 0);
    assert.equal(rows("direct_messages"), 0);
    assert.deepEqual(readdirSync(pictures), []);
    assert.equal(rows("concerns"), 1);
    assert.deepEqual((await sales.get(`/admin/sheechat/${loading.account.id}`)).assertStatus(200).body, []);
    (await sales.get("/auth/me")).assertStatus(200);
});

test("clearing leaves nothing readable in the database file", async () => {
    await chatting();
    const contents = () =>
        [DB_FILE, `${DB_FILE}-wal`]
            .map((name) => join(app.dataDir, name))
            .filter(existsSync)
            .map((file) => readFileSync(file).toString("latin1"))
            .join("");
    assert.ok(contents().includes(SECRET));

    clearMessages(app.dataDir, { backupsDir });

    assert.ok(!contents().includes(SECRET));
});

test("clearing saves a copy of the messages and pictures first", async () => {
    await chatting();

    const { backup } = clearMessages(app.dataDir, { backupsDir });

    const copy = new DatabaseSync(join(backup, DB_FILE));
    try {
        assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM messages").get().n, 2);
        assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM direct_messages").get().n, 2);
    } finally {
        copy.close();
    }
    assert.deepEqual(readdirSync(join(backup, "chat-images")).sort(), ["dev.jpg", "dm.jpg"]);
});

test("nothing is erased when the copy can't be saved", async () => {
    await chatting();
    // a file where the backups folder should go
    writeFileSync(backupsDir, "in the way");

    assert.throws(() => clearMessages(app.dataDir, { backupsDir }));

    assert.equal(rows("messages"), 2);
    assert.equal(rows("direct_messages"), 2);
    assert.equal(readdirSync(pictures).length, 2);
});

test("clearing can keep no copy, and with nothing to erase saves none", async () => {
    await chatting();
    assert.equal(clearMessages(app.dataDir, { backupsDir, keepCopy: false }).backup, null);
    assert.equal(existsSync(backupsDir), false);

    assert.equal(clearMessages(app.dataDir, { backupsDir }).backup, null);
    assert.equal(existsSync(backupsDir), false);
});

test("a message sent after clearing gets a number never used before", async () => {
    const first = (await sales.post(`/admin/sheechat/${loading.account.id}`, { body: "Before" })).assertStatus(
        201,
    ).body;
    clearMessages(app.dataDir, { backupsDir, keepCopy: false });

    const next = (await sales.post(`/admin/sheechat/${loading.account.id}`, { body: "After" })).assertStatus(201).body;

    assert.ok(next.id > first.id);
});

test("counting changes nothing", async () => {
    await chatting();
    assert.deepEqual(countMessages(app.dataDir), { developerChat: 2, sheeChat: 2, pictures: 2 });
    assert.equal(rows("messages"), 2);
});

test("a mistyped data folder is refused, and no database is made there", () => {
    const missing = join(tmpdir(), `sheehan-clear-missing-${process.pid}`);
    assert.throws(() => clearMessages(missing, { backupsDir }), /No database/);
    assert.equal(existsSync(missing), false);
});

const runScript = (...args) => {
    const env = { ...process.env, DATA_DIR: app.dataDir, BACKUP_DIR: backupsDir };
    return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: "utf8" });
};

test("the script only erases when told --yes", async () => {
    await chatting();

    const look = runScript();
    assert.equal(look.status, 0);
    assert.match(look.stdout, /2 developer chat message\(s\), 2 SheeChat message\(s\), 2 picture file\(s\)/);
    assert.equal(rows("messages"), 2);

    const erase = runScript("--yes");
    assert.equal(erase.status, 0, erase.stderr);
    assert.match(erase.stdout, /A copy, which still has them/);
    assert.equal(rows("messages"), 0);
    assert.equal(rows("direct_messages"), 0);
});

test("the script refuses an option it doesn't know, and erases nothing", async () => {
    await chatting();

    const result = runScript("--yes", "--no-backups");

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown option --no-backups/);
    assert.equal(rows("messages"), 2);
});
