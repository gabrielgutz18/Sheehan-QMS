// the backend API, shared by the Vite dev server (npm run dev) and server/server.js (npm start)
// orders, settings, staff accounts and sign-ins are saved in a SQLite database in the data folder
// (see server/db.js), and an uploaded display video next to it in videos/, so nothing is lost on restart
// two roles: admins can do everything; sales staff only what SALES_ROUTES lists
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import { openDatabase, resolveDataDir, transaction } from './db.js';

const SESSION_COOKIE = "sid";
// each browser tab signs in on its own: the page sends its tab's id (X-Tab-Id) and the session cookie is named
// after it, so a second tab or window of the same browser isn't already signed in as someone else
const TAB_ID = /^[a-f0-9]{32}$/;
const sessionCookieName = (req) => {
    const tab = req.headers["x-tab-id"];
    return typeof tab === "string" && TAB_ID.test(tab) ? `${SESSION_COOKIE}_${tab}` : SESSION_COOKIE;
};
const readCookies = (req) => Object.fromEntries(
    (req.headers.cookie ?? "").split(/;\s*/).filter((c) => c.includes("=")).map((c) => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)]));
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
// returning: back in line after being served; like pending, it waits for a counter to call it
const ORDER_STATUSES = ["pending", "serving", "returning", "done"];
const MAX_REMARKS = 120;
// optional per-item color for roofing orders; must match src/data/roofingColors.js
const ROOFING_COLORS = ["red", "blue", "green"];
// the purpose for a concern instead of an order: no items, just the concern; must match src/data/customerReport.js
const REPORT_PURPOSE = "Customer Report";
const MAX_CONCERN = 300;
const VIDEO_EXTENSIONS = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/ogg": ".ogv",
    "video/quicktime": ".mov",
    "video/x-m4v": ".m4v",
};
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const HISTORY_LIMIT = 200;
const ANNOUNCER_REPEATS = [1, 2];
const ROLES = ["admin", "sales"];
const USERNAME = /^[a-z0-9._-]{3,32}$/i;
const MIN_PASSWORD = 8;

// what sales staff may do; every other /admin route is for admins only, so a new route is safe by default
const SALES_ROUTES = [
    ["GET", /^\/admin\/orders$/],
    ["POST", /^\/admin\/orders\/[^/]+\/call$/],
    ["PATCH", /^\/admin\/orders\/[^/]+$/],
    ["GET", /^\/admin\/history$/],
    ["POST", /^\/admin\/history\/\d+\/restore$/],
    ["GET", /^\/admin\/me\/stats$/],
    ["PUT", /^\/admin\/announcer\/volume$/],
    ["PATCH", /^\/admin\/me$/],
    ["PUT", /^\/admin\/me\/photo$/],
    ["DELETE", /^\/admin\/me\/photo$/],
];
const salesMay = (method, path) => SALES_ROUTES.some(([m, route]) => m === method && route.test(path));

// passwords are stored as scrypt$<salt>$<hash>, with a new random salt for each
const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const newSalt = () => randomBytes(16).toString("hex");
const hashPassword = async (password, salt = newSalt()) =>
    `scrypt$${salt}$${(await scryptAsync(password, salt, KEY_LENGTH)).toString("hex")}`;
const hashPasswordSync = (password, salt = newSalt()) =>
    `scrypt$${salt}$${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
const checkPassword = async (password, stored) => {
    const [, salt, hash] = stored.split("$");
    const actual = await scryptAsync(password, salt, KEY_LENGTH);
    return timingSafeEqual(actual, Buffer.from(hash, "hex"));
};
// checked when the username doesn't exist, so a wrong username takes as long as a wrong password
const NO_SUCH_USER = hashPasswordSync(randomBytes(16).toString("hex"));

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const pad2 = (n) => String(n).padStart(2, "0");

// YYYY-MM-DD by the server's clock
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// queue numbers start again at 1 each day, by the server's clock
const today = () => localDate(new Date());

const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
};

const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

// a staff member's own numbers use calendar periods: today, this week (from Monday), this month, this year
const startOfWeek = () => daysAgo((new Date().getDay() + 6) % 7);
const MY_PERIODS = {
    day: (hoursWithData) => {
        const first = Math.min(7, ...hoursWithData);
        const last = Math.max(18, ...hoursWithData);
        return Array.from({ length: last - first + 1 }, (_, i) => pad2(first + i));
    },
    week: () => Array.from({ length: 7 }, (_, i) => {
        const d = startOfWeek();
        d.setDate(d.getDate() + i);
        return localDate(d);
    }),
    month: () => {
        const now = new Date();
        const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        return Array.from({ length: days }, (_, i) => localDate(new Date(now.getFullYear(), now.getMonth(), i + 1)));
    },
    year: () => Array.from({ length: 12 }, (_, i) => `${new Date().getFullYear()}-${pad2(i + 1)}`),
};
// slots later than now: drawn on the axis, but with no line yet
const isFutureSlot = (period, key) => {
    const now = new Date();
    if (period === "day") return Number(key) > now.getHours();
    if (period === "year") return key > monthKey(now);
    return key > localDate(now);
};

// the time slots a sales period is drawn in, oldest first; keys match the bucket column of the stats queries
// day: today's hours, at least 7 AM to 6 PM (wider if tickets came in outside that)
// week / month: the last 7 / 30 days; year: the last 12 months
const STATS_PERIODS = {
    day: (hoursWithData) => {
        const first = Math.min(7, ...hoursWithData);
        const last = Math.max(18, ...hoursWithData);
        return Array.from({ length: last - first + 1 }, (_, i) => pad2(first + i));
    },
    week: () => Array.from({ length: 7 }, (_, i) => localDate(daysAgo(6 - i))),
    month: () => Array.from({ length: 30 }, (_, i) => localDate(daysAgo(29 - i))),
    year: () => Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - (11 - i));
        return monthKey(d);
    }),
};

const send = (res, status, data, headers = {}) => {
    res.writeHead(status, { ...(data !== undefined && { "Content-Type": "application/json" }), ...headers });
    res.end(data !== undefined ? JSON.stringify(data) : undefined);
};

const readBody = async (req) => {
    let raw = "";
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 100_000) throw new Error("Body too large");
    }
    return raw ? JSON.parse(raw) : {};
};

// streams an upload straight to disk instead of holding it in memory; returns its size
// a partly written file is removed if the upload is too big or breaks off
// a small upload (a profile photo) read into memory; rejects past the limit
const readBytes = async (req, limit) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) throw new Error("Body too large");
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

const saveUpload = async (req, path, limit) => {
    const partial = `${path}.part`;
    let size = 0;
    try {
        await pipeline(
            req,
            async function* (chunks) {
                for await (const chunk of chunks) {
                    size += chunk.length;
                    if (size > limit) throw new Error("Body too large");
                    yield chunk;
                }
            },
            createWriteStream(partial),
        );
        renameSync(partial, path);
        return size;
    } catch (err) {
        rmSync(partial, { force: true });
        throw err;
    }
};

const validVideoUrl = (url) => {
    if (typeof url !== "string" || url.length > 2000) return false;
    try {
        return ["http:", "https:"].includes(new URL(url).protocol);
    } catch {
        return false;
    }
};

// streams the stored file, honouring Range so the player can seek and Safari will play it
const sendVideoFile = (req, res, path, type) => {
    const total = statSync(path, { throwIfNoEntry: false })?.size;
    if (total === undefined) return send(res, 404, { message: "No uploaded video." });
    const stream = (options) => pipeline(createReadStream(path, options), res).catch(() => {
        // the screen stopped watching part-way; nothing to do
    });

    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (!range || (!range[1] && !range[2])) {
        res.writeHead(200, { "Content-Type": type, "Content-Length": total, "Accept-Ranges": "bytes" });
        return stream();
    }

    // "bytes=-500" means the last 500 bytes
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (start > end || start >= total) {
        res.writeHead(416, { "Content-Range": `bytes */${total}` });
        return res.end();
    }
    res.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
    });
    return stream({ start, end });
};

// an order lists 1-50 items; a customer report (REPORT_PURPOSE) has no items, only the concern
const validOrder = (body) =>
    typeof body.name === "string" && body.name.trim() && body.name.length <= 100 &&
    typeof body.purpose === "string" && body.purpose.length <= 100 &&
    (body.purpose === REPORT_PURPOSE ? validReport(body) : validItems(body.orders));

const validItems = (items) =>
    Array.isArray(items) && items.length > 0 && items.length <= 50 &&
    items.every((o) => typeof o.item === "string" && o.item.length <= 100 && Number.isInteger(o.qty) && o.qty > 0 &&
        (o.color === undefined || ROOFING_COLORS.includes(o.color)));

const validReport = ({ concern, orders }) =>
    typeof concern === "string" && concern.trim() !== "" && concern.trim().length <= MAX_CONCERN &&
    (orders === undefined || (Array.isArray(orders) && orders.length === 0));

// call announcements on the display; the front end fills in defaults (src/sound/sound.js)
const validAnnouncer = (s) =>
    typeof s.enabled === "boolean" &&
    typeof s.voice === "string" && s.voice.length <= 200 &&
    typeof s.lang === "string" && s.lang.length <= 35 &&
    typeof s.rate === "number" && s.rate >= 0.5 && s.rate <= 1.5 &&
    validVolume(s.volume) &&
    ANNOUNCER_REPEATS.includes(s.repeat);

// 0 (silent) to 1 (full); sales staff can change only this
function validVolume(volume) {
    return typeof volume === "number" && volume >= 0 && volume <= 1;
}

const validName = (name) => typeof name === "string" && name.trim().length >= 1 && name.trim().length <= 60;
const validPassword = (password) => typeof password === "string" && password.length >= MIN_PASSWORD && password.length <= 128;

// My account: the name in parts, plus employee ID and department
const NAME_PART_MAX = 40;
const EMPLOYEE_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,29}$/;
const DEPARTMENT_MAX = 60;

// "Maria" + "Santos" → "Maria Santos", the name shown around the app (users.name)
const displayName = (first, surname) => [first, surname].filter(Boolean).join(" ");

// a one-line name split at the first space, as admins type it on Accounts: "Maria Dela Cruz" → ["Maria", "Dela Cruz"]
const splitName = (name) => {
    const trimmed = name.trim();
    const space = trimmed.indexOf(" ");
    return space === -1 ? [trimmed, ""] : [trimmed.slice(0, space), trimmed.slice(space + 1).trim()];
};

// profile photos: the accepted types, and how each file must start, so only real pictures are kept
const PHOTO_TYPES = {
    "image/jpeg": { ext: ".jpg", isIt: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    "image/png": { ext: ".png", isIt: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    "image/webp": { ext: ".webp", isIt: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
};
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const photoType = (file) => Object.keys(PHOTO_TYPES).find((type) => PHOTO_TYPES[type].ext === extname(file));

// the signed-in account as the app sees it; never the password hash
const toMe = (row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    firstName: row.first_name,
    middleName: row.middle_name,
    surname: row.surname,
    employeeId: row.employee_id,
    department: row.department,
    // the photo's file name doubles as a version for its URL, or null
    photo: row.photo,
});

// a report keeps only its concern and an order only its items, so switching purpose on Edit drops the other
const pickOrder = ({ name, purpose, orders: items, concern }) => {
    const isReport = purpose === REPORT_PURPOSE;
    return {
        name: name.trim(),
        purpose,
        orders: isReport ? [] : items.map(({ item, qty, color }) => ({ item, qty, ...(color && { color }) })),
        concern: isReport ? concern.trim() : "",
    };
};

// a stored order in the shape the front end expects
const toOrder = (row, items) => ({
    queueNum: row.queue_num,
    name: row.name,
    purpose: row.purpose,
    orders: items.map(({ item, qty, color }) => ({ item, qty, ...(color && { color }) })),
    status: row.status,
    createdAt: row.created_at,
    ...(row.called_at !== null && { calledAt: row.called_at, remarks: row.remarks }),
    // a customer report's concern, in place of items
    ...(row.concern && { concern: row.concern }),
    // the staff member serving it, or who served it; photo is for their avatar (see photoUrl in the front end)
    ...(row.served_by !== null && { servedBy: { id: row.served_by, name: row.served_by_name, photo: row.served_by_photo } }),
    // when they marked it Done (ISO 8601)
    ...(row.status === "done" && row.served_at && { servedAt: row.served_at }),
});

// a ticket from any day for the History page; id picks it out, since numbers repeat every day
const toHistory = (row, items, todayDate) => ({
    id: row.id,
    date: row.queue_date,
    isToday: row.queue_date === todayDate,
    ...toOrder(row, items),
    deletedAt: row.deleted_at,
    restoredAt: row.restored_at,
    ...(row.original_date !== null && { originalDate: row.original_date, originalNum: row.original_num }),
});

// order rows with the staff member serving them (o. prefixes keep "name" unambiguous) and, once it's done, when
// they marked it Done: this visit's point, if the point is theirs (at most one per order and day)
const ORDER_ROW = `o.*, u.name AS served_by_name, u.photo AS served_by_photo, s.served_at
    FROM orders o
    LEFT JOIN users u ON u.id = o.served_by
    LEFT JOIN serves s ON s.order_id = o.id AND s.queue_date = o.queue_date AND s.user_id = o.served_by`;

// "%" and "_" mean "anything" in LIKE, so a search for them is escaped
const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// returns a (req, res) handler for every /api route, with close() to shut the database
// dataDir: where queue.db and uploaded videos are kept (DATA_DIR in .env; data/ by default)
// adminUsername / adminPassword: the built-in admin from .env, created or updated at every start
export function createApi({ adminUsername, adminPassword, dataDir }) {
    const dir = resolveDataDir(dataDir);
    const videosDir = join(dir, "videos");
    const photosDir = join(dir, "photos");
    mkdirSync(videosDir, { recursive: true });
    mkdirSync(photosDir, { recursive: true });
    const db = openDatabase(dir);

    const sql = {
        nextQueueNum: db.prepare(`
            INSERT INTO queue_counters (queue_date, last_num) VALUES (?, 1)
            ON CONFLICT (queue_date) DO UPDATE SET last_num = last_num + 1
            RETURNING last_num`),
        insertOrder: db.prepare(
            "INSERT INTO orders (queue_date, queue_num, name, purpose, concern, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
        updateOrder: db.prepare("UPDATE orders SET name = ?, purpose = ?, concern = ? WHERE id = ?"),
        setStatus: db.prepare(`
            UPDATE orders SET status = :status, called_at = :calledAt, remarks = :remarks, served_by = :servedBy
            WHERE id = :id`),
        // a point for the staff member who served this visit; reopening the ticket takes it back
        addPoint: db.prepare(`
            INSERT INTO serves (order_id, user_id, queue_date, served_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (order_id, queue_date) DO NOTHING`),
        removePoint: db.prepare("DELETE FROM serves WHERE order_id = ? AND queue_date = ?"),
        // deleted tickets stay in the database for History and are left out everywhere else
        deleteOrder: db.prepare("UPDATE orders SET deleted_at = ? WHERE id = ?"),
        findOrder: db.prepare(`SELECT ${ORDER_ROW} WHERE o.queue_date = ? AND o.queue_num = ? AND o.deleted_at IS NULL`),
        findById: db.prepare(`SELECT ${ORDER_ROW} WHERE o.id = ?`),
        dayOrders: db.prepare(`SELECT ${ORDER_ROW} WHERE o.queue_date = ? AND o.deleted_at IS NULL ORDER BY o.queue_num`),
        serving: db.prepare(`
            SELECT queue_num, name, purpose, remarks, called_at FROM orders
            WHERE queue_date = ? AND status = 'serving' AND deleted_at IS NULL ORDER BY called_at DESC`),
        // the line: waiting and returning customers, in number order
        upcoming: db.prepare(`
            SELECT queue_num, name, purpose, status FROM orders
            WHERE queue_date = ? AND status IN ('pending', 'returning') AND deleted_at IS NULL ORDER BY queue_num`),
        // quantity ordered and tickets per time slot and purpose, deleted tickets left out
        statsByHour: db.prepare(`
            SELECT strftime('%H', o.created_at, 'localtime') AS bucket, o.purpose, SUM(i.qty) AS qty, COUNT(DISTINCT o.id) AS tickets
            FROM orders o JOIN order_items i ON i.order_id = o.id
            WHERE o.deleted_at IS NULL AND o.queue_date BETWEEN :from AND :to
            GROUP BY bucket, o.purpose`),
        statsByDay: db.prepare(`
            SELECT o.queue_date AS bucket, o.purpose, SUM(i.qty) AS qty, COUNT(DISTINCT o.id) AS tickets
            FROM orders o JOIN order_items i ON i.order_id = o.id
            WHERE o.deleted_at IS NULL AND o.queue_date BETWEEN :from AND :to
            GROUP BY bucket, o.purpose`),
        statsByMonth: db.prepare(`
            SELECT substr(o.queue_date, 1, 7) AS bucket, o.purpose, SUM(i.qty) AS qty, COUNT(DISTINCT o.id) AS tickets
            FROM orders o JOIN order_items i ON i.order_id = o.id
            WHERE o.deleted_at IS NULL AND o.queue_date BETWEEN :from AND :to
            GROUP BY bucket, o.purpose`),
        servedOn: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE queue_date = ? AND status = 'done' AND deleted_at IS NULL"),
        // History: any day, deleted only or all, by name or number; deleted ones newest-deleted first
        history: db.prepare(`
            SELECT ${ORDER_ROW}
            WHERE (:deletedOnly = 0 OR o.deleted_at IS NOT NULL)
              AND (:day = '' OR o.queue_date = :day)
              AND (:search = '' OR o.name LIKE :like ESCAPE '\\' OR o.queue_num = :num)
            ORDER BY CASE WHEN :deletedOnly = 1 THEN o.deleted_at END DESC, o.queue_date DESC, o.queue_num DESC
            LIMIT :limit`),
        itemsFor: db.prepare(`
            SELECT order_id, item, qty, color FROM order_items
            WHERE order_id IN (SELECT value FROM json_each(?)) ORDER BY order_id, position`),
        // Restore puts the ticket back in line: today's keeps its number, an earlier day's gets today's next one
        restoreSameDay: db.prepare(`
            UPDATE orders SET deleted_at = NULL, restored_at = ?, status = 'pending', called_at = NULL, remarks = '',
                served_by = NULL
            WHERE id = ?`),
        restoreToToday: db.prepare(`
            UPDATE orders SET
                original_date = COALESCE(original_date, queue_date), original_num = COALESCE(original_num, queue_num),
                queue_date = ?, queue_num = ?,
                deleted_at = NULL, restored_at = ?, status = 'pending', called_at = NULL, remarks = '', served_by = NULL
            WHERE id = ?`),
        insertItem: db.prepare("INSERT INTO order_items (order_id, position, item, qty, color) VALUES (?, ?, ?, ?, ?)"),
        deleteItems: db.prepare("DELETE FROM order_items WHERE order_id = ?"),
        orderItems: db.prepare("SELECT item, qty, color FROM order_items WHERE order_id = ? ORDER BY position"),
        dayItems: db.prepare(`
            SELECT i.order_id, i.item, i.qty, i.color FROM order_items i JOIN orders o ON o.id = i.order_id
            WHERE o.queue_date = ? ORDER BY i.order_id, i.position`),
        getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
        setSetting: db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"),
        deleteSetting: db.prepare("DELETE FROM settings WHERE key = ?"),
        insertSession: db.prepare("INSERT INTO sessions (sid_hash, user_id, expires) VALUES (?, ?, ?)"),
        // a disabled account's sign-ins stop working at once
        findSession: db.prepare(`
            SELECT s.expires, u.id, u.username, u.name, u.role, u.first_name, u.middle_name, u.surname,
                u.employee_id, u.department, u.photo
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.sid_hash = ? AND u.disabled_at IS NULL`),
        deleteSession: db.prepare("DELETE FROM sessions WHERE sid_hash = ?"),
        deleteExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires < ?"),
        // sign the account out everywhere except, optionally, this sign-in
        deleteUserSessions: db.prepare("DELETE FROM sessions WHERE user_id = ? AND sid_hash != ?"),

        findUser: db.prepare("SELECT * FROM users WHERE username = ?"),
        findUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
        insertUser: db.prepare(`
            INSERT INTO users (username, name, first_name, surname, role, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`),
        resetBuiltInAdmin: db.prepare("UPDATE users SET role = 'admin', disabled_at = NULL, password_hash = ? WHERE id = ?"),
        updateUser: db.prepare(`
            UPDATE users SET name = :name, first_name = :firstName, surname = :surname, role = :role,
                disabled_at = :disabledAt, password_hash = :passwordHash
            WHERE id = :id`),
        // My account
        updateProfile: db.prepare(`
            UPDATE users SET name = :name, first_name = :firstName, middle_name = :middleName, surname = :surname,
                employee_id = :employeeId, department = :department
            WHERE id = :id`),
        employeeIdTaken: db.prepare("SELECT id FROM users WHERE employee_id = ? COLLATE NOCASE AND id != ?"),
        setPhoto: db.prepare("UPDATE users SET photo = ? WHERE id = ?"),
        // signed_in: a sign-in that hasn't expired or been signed out (closing the browser doesn't end it, the TTL does)
        listUsers: db.prepare(`
            SELECT u.*,
                (SELECT COUNT(*) FROM serves s WHERE s.user_id = u.id) AS served_total,
                (SELECT COUNT(*) FROM serves s WHERE s.user_id = u.id AND date(s.served_at, 'localtime') = :today) AS served_today,
                (SELECT COUNT(*) FROM orders o
                    WHERE o.served_by = u.id AND o.status = 'serving' AND o.deleted_at IS NULL AND o.queue_date = :today) AS serving_now,
                EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires > :now) AS signed_in
            FROM users u
            ORDER BY u.disabled_at IS NOT NULL, u.role, u.name COLLATE NOCASE`),

        // one staff member's points, by served time
        myTotals: db.prepare(`
            SELECT COUNT(*) AS total,
                COALESCE(SUM(day = :today), 0) AS today,
                COALESCE(SUM(day >= :week), 0) AS week,
                COALESCE(SUM(day >= :month), 0) AS month,
                COALESCE(SUM(day >= :year), 0) AS year
            FROM (SELECT date(served_at, 'localtime') AS day FROM serves WHERE user_id = :user)`),
        myByHour: db.prepare(`
            SELECT strftime('%H', served_at, 'localtime') AS bucket, COUNT(*) AS served FROM serves
            WHERE user_id = :user AND date(served_at, 'localtime') BETWEEN :from AND :to GROUP BY bucket`),
        myByDay: db.prepare(`
            SELECT date(served_at, 'localtime') AS bucket, COUNT(*) AS served FROM serves
            WHERE user_id = :user AND date(served_at, 'localtime') BETWEEN :from AND :to GROUP BY bucket`),
        myByMonth: db.prepare(`
            SELECT strftime('%Y-%m', served_at, 'localtime') AS bucket, COUNT(*) AS served FROM serves
            WHERE user_id = :user AND date(served_at, 'localtime') BETWEEN :from AND :to GROUP BY bucket`),
    };

    const isBuiltIn = (user) => user.username.toLowerCase() === adminUsername.toLowerCase();

    // the admin from .env always exists, as an enabled admin with the .env password, so nobody is locked out
    const builtIn = sql.findUser.get(adminUsername);
    if (builtIn) sql.resetBuiltInAdmin.run(hashPasswordSync(adminPassword), builtIn.id);
    else sql.insertUser.run(adminUsername, adminUsername, adminUsername, "", "admin", hashPasswordSync(adminPassword), new Date().toISOString());

    const toUser = (row) => ({
        ...toMe(row),
        createdAt: row.created_at,
        disabled: row.disabled_at !== null,
        // its password and role come from .env
        builtIn: isBuiltIn(row),
        servedToday: row.served_today,
        servedTotal: row.served_total,
        servingNow: row.serving_now,
        signedIn: Boolean(row.signed_in),
    });

    // moves a ticket to a new status and keeps "who is serving it" and the points in step:
    // serving → the person who called it; waiting or returning → nobody; done → a point for whoever served it
    // (or whoever marked it done, if nobody called it); leaving done takes that visit's point back
    const changeStatus = (order, status, user, { calledAt = order.called_at, remarks = order.remarks, servedBy } = {}) =>
        transaction(db, () => {
            const server = servedBy !== undefined ? servedBy
                : status === "pending" || status === "returning" ? null
                : status === "serving" ? (order.status === "serving" ? order.served_by : user.id)
                : order.served_by ?? user.id;
            sql.setStatus.run({ status, calledAt, remarks, servedBy: server, id: order.id });
            if (order.status === "done" && status !== "done") sql.removePoint.run(order.id, order.queue_date);
            if (status === "done") sql.addPoint.run(order.id, server, order.queue_date, new Date().toISOString());
        });

    // today's ticket with this number, as a database row
    const findToday = (queueNum) => sql.findOrder.get(today(), queueNum);
    const loadOrder = (row) => toOrder(row, sql.orderItems.all(row.id));

    const saveItems = (orderId, items) => {
        sql.deleteItems.run(orderId);
        items.forEach(({ item, qty, color }, i) => sql.insertItem.run(orderId, i, item, qty, color ?? null));
    };

    const readSetting = (key) => {
        const row = sql.getSetting.get(key);
        return row ? JSON.parse(row.value) : null;
    };
    const writeSetting = (key, value) => {
        if (value === null) sql.deleteSetting.run(key);
        else sql.setSetting.run(key, JSON.stringify(value));
    };

    // display-screen video: { kind: "url", url } or { kind: "file", name, type, file, version }
    const getVideo = () => readSetting("video");

    // replaces the video, removing the old uploaded file if there was one
    const setVideo = (next) => {
        const previous = getVideo();
        writeSetting("video", next);
        if (previous?.kind === "file" && previous.file !== next?.file) rmSync(join(videosDir, previous.file), { force: true });
    };

    // what the display gets: the link, or a version stamp that busts the cache after a new upload
    const publicVideo = (video) => !video ? null
        : video.kind === "url" ? { kind: "url", url: video.url }
        : { kind: "file", name: video.name, version: video.version };

    // replaces an account's profile photo (or removes it with null), deleting the old file
    const setPhoto = (userId, file) => {
        const previous = sql.findUserById.get(userId).photo;
        sql.setPhoto.run(file, userId);
        if (previous && previous !== file) rmSync(join(photosDir, previous), { force: true });
    };

    // the session behind one cookie value, or null
    const sessionFor = (sid) => {
        if (!sid) return null;
        const sidHash = sha256(sid);
        const row = sql.findSession.get(sidHash);
        if (!row) return null;
        if (row.expires < Date.now()) {
            sql.deleteSession.run(sidHash);
            return null;
        }
        return { sidHash, user: toMe(row) };
    };

    // this tab's sign-in
    const getSession = (req) => sessionFor(readCookies(req)[sessionCookieName(req)]);

    // any tab's sign-in in this browser: for <img> requests (profile photos), which can't send X-Tab-Id
    const anySession = (req) =>
        Object.entries(readCookies(req))
            .filter(([name]) => name === SESSION_COOKIE || name.startsWith(`${SESSION_COOKIE}_`))
            .map(([, sid]) => sessionFor(sid))
            .find(Boolean) ?? null;

    async function handle(req, res) {
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname.replace(/^\/api/, "");
        const { method } = req;

        // same CSRF guard the front end expects the real backend to enforce
        if (/^\/(admin|auth)\//.test(path) && req.headers["x-requested-with"] !== "XMLHttpRequest") {
            return send(res, 403, { message: "Forbidden" });
        }

        if (method === "POST" && path === "/auth/login") {
            const { username, password } = await readBody(req);
            const account = typeof username === "string" ? sql.findUser.get(username.trim()) : undefined;
            const passwordOk = await checkPassword(String(password ?? ""), account?.password_hash ?? NO_SUCH_USER);
            if (!account || !passwordOk || account.disabled_at !== null) {
                return send(res, 401, { message: "Incorrect username or password." });
            }
            const user = toMe(account);
            const sid = randomBytes(32).toString("hex");
            sql.deleteExpiredSessions.run(Date.now());
            sql.insertSession.run(sha256(sid), account.id, Date.now() + SESSION_TTL_MS);
            return send(res, 200, user, {
                // no Max-Age: the browser forgets it when it closes, so the next person on a shared PC signs in
                // themselves; the server still ends it after SESSION_TTL_MS
                "Set-Cookie": `${sessionCookieName(req)}=${sid}; HttpOnly; SameSite=Strict; Path=/`,
            });
        }

        if (method === "POST" && path === "/orders") {
            const body = await readBody(req);
            if (!validOrder(body)) return send(res, 400, { message: "Invalid order." });
            const { name, purpose, orders: items, concern } = pickOrder(body);
            const order = transaction(db, () => {
                const date = today();
                // a plain number; the front end formats it as "SHN 01"
                const { last_num: queueNum } = sql.nextQueueNum.get(date);
                const { lastInsertRowid } = sql.insertOrder.run(date, queueNum, name, purpose, concern, new Date().toISOString());
                saveItems(lastInsertRowid, items);
                return loadOrder(sql.findOrder.get(date, queueNum));
            });
            return send(res, 201, order);
        }

        // public display board: number, name and purpose only, never order details
        if (method === "GET" && path === "/queue") {
            const date = today();
            return send(res, 200, {
                // most recently called first, so the display headlines the newest call
                // calledAt lets the display replay its animation when the same number is called again
                serving: sql.serving.all(date).map((o) => ({
                    queueNum: o.queue_num, name: o.name, purpose: o.purpose, remarks: o.remarks, calledAt: o.called_at,
                })),
                upcoming: sql.upcoming.all(date).map((o) => ({
                    queueNum: o.queue_num, name: o.name, purpose: o.purpose, ...(o.status === "returning" && { returning: true }),
                })),
            });
        }

        if (method === "GET" && path === "/video") return send(res, 200, publicVideo(getVideo()));

        // { enabled, voice, lang, rate, volume, repeat }, or null before it has been set up
        if (method === "GET" && path === "/announcer") return send(res, 200, readSetting("announcer"));

        if (method === "GET" && path === "/video/file") {
            const video = getVideo();
            if (video?.kind !== "file") return send(res, 404, { message: "No uploaded video." });
            return sendVideoFile(req, res, join(videosDir, video.file), video.type);
        }

        const orderMatch = path.match(/^\/orders\/([^/]+)$/);
        if (method === "PUT" && orderMatch) {
            const existing = findToday(Number(decodeURIComponent(orderMatch[1])));
            if (!existing) return send(res, 404, { message: "Order not found." });
            const body = await readBody(req);
            if (!validOrder(body)) return send(res, 400, { message: "Invalid order." });
            const { name, purpose, orders: items, concern } = pickOrder(body);
            transaction(db, () => {
                sql.updateOrder.run(name, purpose, concern, existing.id);
                saveItems(existing.id, items);
            });
            return send(res, 200, loadOrder(findToday(existing.queue_num)));
        }

        // everything below needs a signed-in account; sales staff only get the routes in SALES_ROUTES
        const session = getSession(req);
        if (path.startsWith("/auth/") || path.startsWith("/admin/")) {
            if (!session) return send(res, 401, { message: "Please sign in." });
            if (path.startsWith("/admin/") && session.user.role !== "admin" && !salesMay(method, path)) {
                return send(res, 403, { message: "Only an admin can do that." });
            }
        }
        const me = session?.user;

        // a staff member's profile photo, for any signed-in account; a plain GET from an <img>, so it lives
        // outside /admin, where every request must carry the X-Requested-With header
        const photoMatch = path.match(/^\/photos\/(\d+)$/);
        if (method === "GET" && photoMatch) {
            if (!anySession(req)) return send(res, 401, { message: "Please sign in." });
            const account = sql.findUserById.get(Number(photoMatch[1]));
            const file = account?.photo ? join(photosDir, account.photo) : null;
            const stats = file ? statSync(file, { throwIfNoEntry: false }) : undefined;
            if (!stats) return send(res, 404, { message: "No photo." });
            res.writeHead(200, {
                "Content-Type": photoType(file),
                "Content-Length": stats.size,
                // the URL changes with every new photo, so the browser can keep this one
                "Cache-Control": "private, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
            });
            return pipeline(createReadStream(file), res).catch(() => {
                // the page went away part-way; nothing to do
            });
        }

        if (method === "GET" && path === "/auth/me") return send(res, 200, session.user);

        if (method === "POST" && path === "/auth/logout") {
            sql.deleteSession.run(session.sidHash);
            return send(res, 204, undefined, { "Set-Cookie": `${sessionCookieName(req)}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
        }

        if (method === "PUT" && path === "/admin/video") {
            const { url: videoUrl } = await readBody(req);
            if (!validVideoUrl(videoUrl)) return send(res, 400, { message: "Enter a valid http(s) video link." });
            const video = { kind: "url", url: videoUrl.trim() };
            setVideo(video);
            return send(res, 200, publicVideo(video));
        }

        if (method === "POST" && path === "/admin/video/file") {
            const type = req.headers["content-type"];
            if (!VIDEO_EXTENSIONS[type]) return send(res, 415, { message: "Upload an MP4, WebM, OGG or MOV video." });
            if (Number(req.headers["content-length"]) > MAX_VIDEO_BYTES) {
                return send(res, 413, { message: "Video is larger than 200 MB." });
            }
            // the version doubles as a unique file name and a cache buster for the screens
            const version = Date.now();
            const file = `video-${version}${VIDEO_EXTENSIONS[type]}`;
            const size = await saveUpload(req, join(videosDir, file), MAX_VIDEO_BYTES);
            if (!size) {
                rmSync(join(videosDir, file), { force: true });
                return send(res, 400, { message: "The file is empty." });
            }
            const name = decodeURIComponent(req.headers["x-file-name"] ?? "video").slice(0, 200);
            const video = { kind: "file", name, type, file, version };
            setVideo(video);
            return send(res, 201, publicVideo(video));
        }

        if (method === "DELETE" && path === "/admin/video") {
            setVideo(null);
            return send(res, 204);
        }

        if (method === "PUT" && path === "/admin/announcer") {
            const body = await readBody(req);
            if (!validAnnouncer(body)) return send(res, 400, { message: "Invalid announcement settings." });
            const { enabled, voice, lang, rate, volume, repeat } = body;
            writeSetting("announcer", { enabled, voice, lang, rate, volume, repeat });
            return send(res, 200, readSetting("announcer"));
        }

        // sales staff can turn the announcements up or down, but not change the voice
        if (method === "PUT" && path === "/admin/announcer/volume") {
            const { volume } = await readBody(req);
            if (!validVolume(volume)) return send(res, 400, { message: "Volume must be between 0 and 1." });
            writeSetting("announcer", { ...readSetting("announcer"), volume });
            return send(res, 200, readSetting("announcer"));
        }

        if (method === "GET" && path === "/admin/users") return send(res, 200, sql.listUsers.all({ today: today(), now: Date.now() }).map(toUser));

        // only admins get here (see SALES_ROUTES); new accounts are usually sales staff
        if (method === "POST" && path === "/admin/users") {
            const { username, name, password, role = "sales" } = await readBody(req);
            if (typeof username !== "string" || !USERNAME.test(username.trim())) {
                return send(res, 400, { message: "Usernames are 3–32 letters, numbers, dots, dashes or underscores." });
            }
            if (!validName(name)) return send(res, 400, { message: "Enter the staff member's name." });
            if (!validPassword(password)) return send(res, 400, { message: `Passwords need at least ${MIN_PASSWORD} characters.` });
            if (!ROLES.includes(role)) return send(res, 400, { message: "Pick sales or admin." });
            if (sql.findUser.get(username.trim())) return send(res, 409, { message: "That username is taken." });
            // they can add a middle name, employee ID and department themselves on My account
            const [firstName, surname] = splitName(name);
            const { lastInsertRowid } = sql.insertUser.run(
                username.trim(), name.trim(), firstName, surname, role, await hashPassword(password), new Date().toISOString());
            return send(res, 201, toUser({ ...sql.findUserById.get(lastInsertRowid), served_total: 0, served_today: 0, serving_now: 0, signed_in: 0 }));
        }

        // { name?, role?, password?, disabled? }
        const userMatch = path.match(/^\/admin\/users\/(\d+)$/);
        if (method === "PATCH" && userMatch) {
            const account = sql.findUserById.get(Number(userMatch[1]));
            if (!account) return send(res, 404, { message: "Account not found." });
            const body = await readBody(req);
            const changes = {
                name: account.name,
                firstName: account.first_name,
                surname: account.surname,
                role: account.role,
                disabledAt: account.disabled_at,
                passwordHash: account.password_hash,
            };
            if (body.name !== undefined) {
                if (!validName(body.name)) return send(res, 400, { message: "Enter the staff member's name." });
                changes.name = body.name.trim();
                [changes.firstName, changes.surname] = splitName(body.name);
            }
            const lockedOut = isBuiltIn(account) || account.id === me.id;
            if (body.role !== undefined && body.role !== account.role) {
                if (!ROLES.includes(body.role)) return send(res, 400, { message: "Pick sales or admin." });
                if (lockedOut) return send(res, 400, { message: "You can't change the role of this account." });
                changes.role = body.role;
            }
            if (body.disabled !== undefined && body.disabled !== (account.disabled_at !== null)) {
                if (lockedOut) return send(res, 400, { message: "You can't switch off this account." });
                changes.disabledAt = body.disabled ? new Date().toISOString() : null;
            }
            if (body.password !== undefined) {
                if (isBuiltIn(account)) return send(res, 400, { message: "This admin's password is set in the server's .env file." });
                if (!validPassword(body.password)) return send(res, 400, { message: `Passwords need at least ${MIN_PASSWORD} characters.` });
                changes.passwordHash = await hashPassword(body.password);
            }
            sql.updateUser.run({ ...changes, id: account.id });
            // a new password, a new role or a switched-off account signs them out everywhere else
            if (changes.passwordHash !== account.password_hash || changes.role !== account.role || changes.disabledAt) {
                sql.deleteUserSessions.run(account.id, session.sidHash);
            }
            return send(res, 200, sql.listUsers.all({ today: today(), now: Date.now() }).map(toUser).find((u) => u.id === account.id));
        }

        // My account: { firstName, middleName, surname, employeeId, department } → your account
        if (method === "PATCH" && path === "/admin/me") {
            const body = await readBody(req);
            const text = (value) => (typeof value === "string" ? value.trim() : "");
            const profile = {
                firstName: text(body.firstName),
                middleName: text(body.middleName),
                surname: text(body.surname),
                employeeId: text(body.employeeId) || null,
                department: text(body.department),
            };
            if (!profile.firstName || profile.firstName.length > NAME_PART_MAX) {
                return send(res, 400, { message: `Enter your first name (up to ${NAME_PART_MAX} characters).` });
            }
            if (!profile.surname || profile.surname.length > NAME_PART_MAX) {
                return send(res, 400, { message: `Enter your surname (up to ${NAME_PART_MAX} characters).` });
            }
            if (profile.middleName.length > NAME_PART_MAX) {
                return send(res, 400, { message: `Middle names can be up to ${NAME_PART_MAX} characters.` });
            }
            if (profile.employeeId && !EMPLOYEE_ID.test(profile.employeeId)) {
                return send(res, 400, { message: "Employee IDs are up to 30 letters, numbers, dots, dashes or slashes." });
            }
            if (profile.employeeId && sql.employeeIdTaken.get(profile.employeeId, me.id)) {
                return send(res, 409, { message: "That employee ID belongs to another account." });
            }
            if (profile.department.length > DEPARTMENT_MAX) {
                return send(res, 400, { message: `Departments can be up to ${DEPARTMENT_MAX} characters.` });
            }
            sql.updateProfile.run({ ...profile, name: displayName(profile.firstName, profile.surname), id: me.id });
            return send(res, 200, toMe(sql.findUserById.get(me.id)));
        }

        // your profile photo, sent as the image itself (My account shrinks it to a small square first)
        if (method === "PUT" && path === "/admin/me/photo") {
            const type = PHOTO_TYPES[req.headers["content-type"]];
            if (!type) return send(res, 415, { message: "Upload a JPEG, PNG or WebP picture." });
            if (Number(req.headers["content-length"]) > MAX_PHOTO_BYTES) {
                return send(res, 413, { message: "Photos can be up to 2 MB." });
            }
            const bytes = await readBytes(req, MAX_PHOTO_BYTES);
            if (!type.isIt(bytes)) return send(res, 400, { message: "That file isn't a picture." });
            const file = `user-${me.id}-${Date.now()}${type.ext}`;
            writeFileSync(join(photosDir, file), bytes);
            setPhoto(me.id, file);
            return send(res, 200, toMe(sql.findUserById.get(me.id)));
        }

        if (method === "DELETE" && path === "/admin/me/photo") {
            setPhoto(me.id, null);
            return send(res, 200, toMe(sql.findUserById.get(me.id)));
        }

        // ?period=day|week|month|year → { period, from, to, totals: { total, today, week, month, year },
        //   buckets: [{ key, served, future }] } for whoever is signed in; one point per customer served
        if (method === "GET" && path === "/admin/me/stats") {
            const period = url.searchParams.get("period") ?? "week";
            if (!MY_PERIODS[period]) return send(res, 400, { message: "Pick day, week, month or year." });
            const now = new Date();
            const starts = {
                today: today(),
                week: localDate(startOfWeek()),
                month: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
                year: `${now.getFullYear()}-01-01`,
            };
            const range = {
                day: [starts.today, starts.today],
                week: [starts.week, localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6 - ((now.getDay() + 6) % 7)))],
                month: [starts.month, localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))],
                year: [starts.year, `${now.getFullYear()}-12-31`],
            }[period];
            const query = { day: sql.myByHour, week: sql.myByDay, month: sql.myByDay, year: sql.myByMonth }[period];
            const rows = query.all({ user: me.id, from: range[0], to: range[1] });
            const counts = new Map(rows.map((r) => [r.bucket, r.served]));
            const buckets = MY_PERIODS[period](rows.map((r) => Number(r.bucket))).map((key) => ({
                key,
                served: counts.get(key) ?? 0,
                future: isFutureSlot(period, key),
            }));
            const totals = sql.myTotals.get({ user: me.id, ...starts });
            return send(res, 200, { period, from: range[0], to: range[1], totals, buckets });
        }

        if (method === "GET" && path === "/admin/orders") {
            const date = today();
            const itemsByOrder = Map.groupBy(sql.dayItems.all(date), (item) => item.order_id);
            return send(res, 200, sql.dayOrders.all(date).map((row) => toOrder(row, itemsByOrder.get(row.id) ?? [])));
        }

        // call (or call again) a ticket: it becomes the headline on the display with the admin's remarks
        const callMatch = path.match(/^\/admin\/orders\/([^/]+)\/call$/);
        if (method === "POST" && callMatch) {
            const order = findToday(Number(decodeURIComponent(callMatch[1])));
            if (!order) return send(res, 404, { message: "Order not found." });
            const { remarks = "" } = await readBody(req);
            if (typeof remarks !== "string" || remarks.trim().length > MAX_REMARKS) {
                return send(res, 400, { message: `Remarks must be ${MAX_REMARKS} characters or fewer.` });
            }
            // whoever calls the customer is the one serving them
            changeStatus(order, "serving", me, { calledAt: Date.now(), remarks: remarks.trim(), servedBy: me.id });
            return send(res, 200, loadOrder(findToday(order.queue_num)));
        }

        const adminMatch = path.match(/^\/admin\/orders\/([^/]+)$/);
        if (adminMatch) {
            const order = findToday(Number(decodeURIComponent(adminMatch[1])));
            if (!order) return send(res, 404, { message: "Order not found." });

            if (method === "GET") return send(res, 200, loadOrder(order));
            if (method === "PATCH") {
                const { status } = await readBody(req);
                if (!ORDER_STATUSES.includes(status)) return send(res, 400, { message: "Invalid status." });
                const calledAt = status === "serving" && order.status !== "serving" ? Date.now() : order.called_at;
                changeStatus(order, status, me, { calledAt });
                return send(res, 200, loadOrder(findToday(order.queue_num)));
            }
            // moves it to History, where it can be restored
            if (method === "DELETE") {
                sql.deleteOrder.run(new Date().toISOString(), order.id);
                return send(res, 204);
            }
        }

        // ?period=day|week|month|year → { period, from, to, buckets: [{ key, qty: { purpose: n }, tickets: { purpose: n } }], servedToday }
        // every slot in the period is listed, empty ones included, so the graph and the export have no gaps
        if (method === "GET" && path === "/admin/stats") {
            const period = url.searchParams.get("period") ?? "week";
            if (!STATS_PERIODS[period]) return send(res, 400, { message: "Pick day, week, month or year." });
            const to = today();
            const from = { day: to, week: localDate(daysAgo(6)), month: localDate(daysAgo(29)) }[period]
                ?? `${STATS_PERIODS.year()[0]}-01`;
            const query = { day: sql.statsByHour, week: sql.statsByDay, month: sql.statsByDay, year: sql.statsByMonth }[period];
            const rows = query.all({ from, to });

            const keys = STATS_PERIODS[period](rows.map((r) => Number(r.bucket)));
            const buckets = new Map(keys.map((key) => [key, { key, qty: {}, tickets: {} }]));
            for (const { bucket, purpose, qty, tickets } of rows) {
                const slot = buckets.get(bucket);
                if (!slot) continue;
                slot.qty[purpose] = qty;
                slot.tickets[purpose] = tickets;
            }
            return send(res, 200, { period, from, to, buckets: [...buckets.values()], servedToday: sql.servedOn.get(to).n });
        }

        // ?search=name or number&day=YYYY-MM-DD&deleted=1 → newest first, up to HISTORY_LIMIT
        if (method === "GET" && path === "/admin/history") {
            const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
            const day = url.searchParams.get("day") ?? "";
            if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return send(res, 400, { message: "Pick a valid day." });
            // "RA 05" or "5" also finds ticket number 5
            const num = Number(search.match(/(\d+)\s*$/)?.[1] ?? -1);
            const rows = sql.history.all({
                deletedOnly: url.searchParams.get("deleted") === "1" ? 1 : 0,
                day,
                search,
                like: likePattern(search),
                num,
                limit: HISTORY_LIMIT,
            });
            const itemsByOrder = Map.groupBy(sql.itemsFor.all(JSON.stringify(rows.map((r) => r.id))), (i) => i.order_id);
            const date = today();
            return send(res, 200, rows.map((row) => toHistory(row, itemsByOrder.get(row.id) ?? [], date)));
        }

        // back in today's queue as waiting, whether it was deleted or is from an earlier day
        const restoreMatch = path.match(/^\/admin\/history\/(\d+)\/restore$/);
        if (method === "POST" && restoreMatch) {
            const row = sql.findById.get(Number(restoreMatch[1]));
            if (!row) return send(res, 404, { message: "Ticket not found." });
            const date = today();
            if (row.queue_date === date && row.deleted_at === null) {
                return send(res, 409, { message: "This ticket is already in today's queue." });
            }
            const restored = transaction(db, () => {
                const now = new Date().toISOString();
                if (row.queue_date === date) {
                    sql.restoreSameDay.run(now, row.id);
                } else {
                    const { last_num: queueNum } = sql.nextQueueNum.get(date);
                    sql.restoreToToday.run(date, queueNum, now, row.id);
                }
                return loadOrder(sql.findById.get(row.id));
            });
            return send(res, 200, restored);
        }

        return send(res, 404, { message: "Not found." });
    }

    const handler = (req, res) => {
        handle(req, res).catch((err) => {
            // a body that isn't JSON, or is too big, is a bad request; anything else is a problem on the server
            const badRequest = err instanceof SyntaxError || err.message === "Body too large";
            if (!badRequest) console.error(err);
            if (res.headersSent) return;
            if (badRequest) send(res, 400, { message: "Bad request." });
            else send(res, 500, { message: "Something went wrong on the server. Check the server's log." });
        });
    };
    handler.dataDir = dir;
    handler.close = () => db.close();
    return handler;
}
