// the backend API, shared by the Vite dev server (npm run dev) and server/server.js (npm start)
// orders, settings, staff accounts and sign-ins are saved in a SQLite database in the data folder
// (see server/db.js), and an uploaded display video next to it in videos/, so nothing is lost on restart
// seven roles: admins can do everything; sales, loading, hardware, security, cashier and developer staff only what
// ROLE_ROUTES lists for them
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import { openDatabase, resolveDataDir, transaction } from './db.js';
import { clientIp, createRateLimiter } from './rateLimit.js';
import { createSheetSync } from './googleSheet.js';
import paymentStatus from '../src/data/paymentStatus.js';
import teams from '../src/data/teams.js';
import checkers, { CHECKER_ROUNDS } from '../src/data/checkers.js';
import { splitList } from '../src/data/list.js';
import { DEPARTMENTS, areasFor, departmentHas, departmentOf } from '../src/data/loadingAreas.js';

const SESSION_COOKIE = "sid";
// each browser tab signs in on its own: the page sends its tab's id (X-Tab-Id) and the session cookie is named
// after it, so a second tab or window of the same browser isn't already signed in as someone else
const TAB_ID = /^[a-f0-9]{32}$/;
const sessionCookieName = (req) => {
    const tab = req.headers["x-tab-id"];
    return typeof tab === "string" && TAB_ID.test(tab) ? `${SESSION_COOKIE}_${tab}` : SESSION_COOKIE;
};
// over HTTPS (nginx with deploy/nginx-https.conf says so in X-Forwarded-Proto) the cookie is also Secure, so the
// browser never sends it over plain http; without HTTPS it can't be, or no one could sign in
const cookieFlags = (req) => `HttpOnly; SameSite=Strict; Path=/${req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`;
const readCookies = (req) => Object.fromEntries(
    (req.headers.cookie ?? "").split(/;\s*/).filter((c) => c.includes("=")).map((c) => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)]));
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
// returning: back in line after being served; like pending, it waits for a counter to call it
const ORDER_STATUSES = ["pending", "serving", "returning", "done"];
// a done order can't be called (or set to Now serving) again: it has to go back in line first
const ALREADY_DONE = "This order is already done. Mark them Returning to put them back in line, then call them.";
// sales hand the customer over after the ticket and the talk; the department (loading or Hardware) calls them
const SALES_DONT_CALL = "Sales don't call customers. Hand them over, and loading calls them.";
const MAX_REMARKS = 120;
// optional per-item color for roofing orders; must match src/data/roofingColors.js
const ROOFING_COLORS = ["red", "blue", "green"];
// the purpose of a Customer Report, a concern instead of an order: no items, just the concern; Customer order no
// longer takes them, but older tickets are reports
const REPORT_PURPOSE = "Customer Report";
const MAX_CONCERN = 300;
// the payment statuses picked on the Cashier page and on Customer order, and the teams sales pick on Customer order;
// both are the lists in src/data, so a new one is added in one place
const PAYMENT_STATUSES = paymentStatus.map((p) => p.type);
const NO_SUCH_PAYMENT = `Pick a payment status from the list (${PAYMENT_STATUSES.join(", ")}).`;
// who picks the payment status on Customer order, as they take or edit the order; the cashier has the Cashier page
const PAYMENT_ON_ORDER = ["admin", "sales"];
const TEAMS = teams.map((t) => t.name);
const CHECKER_COLUMNS = checkers.map((c) => c.name);
// an order can have several invoices, each with its number and the type of order it's for
const MAX_INVOICE = 30;
const MAX_INVOICES = 20;
const MAX_SALESMAN = 60;
// the person a customer sends to collect the items for them
const MAX_RUNNER = 60;
const MAX_RECEIVER = 60;
const MAX_CHECKER = 60;
// several types of order are kept together, "Roofings, Steel", so a purpose can be longer than one name
const MAX_PURPOSE = 200;
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
// loading: the loading crew, one shared line for its areas (Roofings, Steel, TBA); hardware: the Hardware department,
// the same as loading but for its own area (src/data/loadingAreas.js); security: the guards at the gate, the last
// stage, who check what each customer leaves with; cashier: who changes how each order is paid; developer: the team
// that builds the app, who answer staff on the Chat page when something doesn't go well
const ROLES = ["admin", "sales", "loading", "hardware", "security", "cashier", "developer"];
const NO_SUCH_ROLE = "Pick admin, sales, loading, hardware, security, cashier or developer.";
// a developer makes and changes accounts on Accounts too, but not admin ones, so they can't give themselves everything
const ADMINS_ONLY = "Only an admin can make or change an admin account.";
// one chat message, written to or by the developers
const MAX_MESSAGE = 1000;
// a developer is online while signed in and using the app: every open page fetches far more often than this
const ONLINE_MS = 2 * 60 * 1000;
// how often an account's last_seen is written, at most, so a busy page doesn't write on every request
const SEEN_EVERY_MS = 30 * 1000;
// what a guard's security check can find: all as it should be, or something missing, more than the order's quantity,
// or stolen (the last three are reports, with a note saying what)
const SECURITY_RESULTS = ["verified", "missing", "over", "stolen"];
const MAX_SECURITY_NOTE = 300;
const NO_SUCH_TEAM = `Pick a sales team from the list (${TEAMS.join(", ")}), or none.`;
const USERNAME = /^[a-z0-9._-]{3,32}$/i;
const MIN_PASSWORD = 8;

// how much one computer (one IP address) may ask of the API before it's told 429 Too Many Requests and to wait;
// a busy staff PC polls a few pages every 5-10 seconds, far under these
const MINUTE_MS = 60 * 1000;
const RATE_LIMITS = {
    // every API request but the display video, which the player fetches in many small ranges
    api: { limit: 300, windowMs: MINUTE_MS },
    // new tickets from the kiosk and Customer order, which anyone on the network can send without signing in, so the
    // queue can't be filled with junk
    orders: { limit: 30, windowMs: MINUTE_MS },
    // wrong passwords: after this many the computer waits before it may try again, so passwords can't be guessed
    failedLogins: { limit: 10, windowMs: 15 * MINUTE_MS },
};
const TOO_MANY_REQUESTS = "Too many requests. Please wait a moment and try again.";
const TOO_MANY_LOGINS = "Too many attempts. Please wait a moment and try again.";

// My account: every staff member keeps their own name, details and photo
const ACCOUNT_ROUTES = [
    ["PATCH", /^\/admin\/me$/],
    ["PUT", /^\/admin\/me\/photo$/],
    ["DELETE", /^\/admin\/me\/photo$/],
];
// Message developer: every staff member but the developers writes to them there when something doesn't go well,
// seeing which of them are online
const MESSAGE_ROUTES = [
    ["GET", /^\/admin\/messages$/],
    ["POST", /^\/admin\/messages$/],
    ["GET", /^\/admin\/developers$/],
];
// what each role other than admin may do; every other /admin route is for admins only, so a new route is safe by default
const ROLE_ROUTES = {
    sales: [
        ["GET", /^\/admin\/orders$/],
        ["GET", /^\/admin\/order-status$/],
        // one of today's tickets, opened on Customer order to edit it, and saved again (kept as an edit, with who saved it)
        ["GET", /^\/admin\/orders\/[^/]+$/],
        ["PUT", /^\/admin\/orders\/[^/]+$/],
        // the Order sheet on Customer order: every day's orders, saved one cell at a time (runner, receiver, sales
        // team); the payment status shows there and is changed on the Cashier page
        ["GET", /^\/admin\/order-sheet$/],
        ["PATCH", /^\/admin\/order-sheet\/\d+$/],
        // sales don't call customers: after the ticket and the talk they hand them over, and the department calls them
        ["POST", /^\/admin\/orders\/[^/]+\/handover$/],
        // the Cashier page, the same as the cashier's: changing how each order is paid
        ["GET", /^\/admin\/payments$/],
        ["PATCH", /^\/admin\/payments\/\d+$/],
        ["PATCH", /^\/admin\/orders\/[^/]+$/],
        ["GET", /^\/admin\/history$/],
        ["POST", /^\/admin\/history\/\d+\/restore$/],
        ["GET", /^\/admin\/me\/stats$/],
        ["PUT", /^\/admin\/announcer\/volume$/],
        ...ACCOUNT_ROUTES,
        ...MESSAGE_ROUTES,
    ],
    // the Loading page: the customers sales has handed over, and calling, starting to load (the truck is at the area),
    // finishing or sending them back to waiting
    loading: [
        ["GET", /^\/admin\/orders$/],
        // the Order status board: every order, not just the ones handed over, with none of the sales details
        ["GET", /^\/admin\/order-status$/],
        ["POST", /^\/admin\/loading\/[^/]+\/(call|start|done|back)$/],
        ...ACCOUNT_ROUTES,
        ...MESSAGE_ROUTES,
    ],
    // the Hardware page: the same as loading's, for the customers handed over with something from Hardware
    hardware: [
        ["GET", /^\/admin\/orders$/],
        ["GET", /^\/admin\/order-status$/],
        ["POST", /^\/admin\/hardware\/[^/]+\/(call|start|done|back)$/],
        ...ACCOUNT_ROUTES,
        ...MESSAGE_ROUTES,
    ],
    // the Security page: where every customer is and what they bought, to check the products and quantities they
    // leave with, and the check itself at the gate, the last stage; nothing else they can call, change or save but
    // their own account
    security: [
        ["GET", /^\/admin\/security$/],
        // the security check: verified, or a report of something missing, over the quantity or stolen, which can send
        // the order back to one of its areas
        ["POST", /^\/admin\/security\/[^/]+\/check$/],
        // the Order status board the top bar opens on My account
        ["GET", /^\/admin\/order-status$/],
        ...ACCOUNT_ROUTES,
        ...MESSAGE_ROUTES,
    ],
    // the Cashier page: every day's orders with how each is paid, and changing its payment status (Vale to Paid, ...);
    // nothing else they can call, change or save but their own account
    cashier: [
        ["GET", /^\/admin\/payments$/],
        ["PATCH", /^\/admin\/payments\/\d+$/],
        // the Order status board the top bar opens
        ["GET", /^\/admin\/order-status$/],
        ...ACCOUNT_ROUTES,
        ...MESSAGE_ROUTES,
    ],
    // the developers: the Chat page, answering what staff write from Message developer; the Order status board; and
    // Accounts, to make and fix staff accounts (not admin ones); nothing in the queue they can call, change or save
    developer: [
        ["GET", /^\/admin\/chats$/],
        ["GET", /^\/admin\/chats\/\d+$/],
        ["POST", /^\/admin\/chats\/\d+$/],
        // their team, and which of them are online; and every other staff member, online or not, on the Chat page's
        // Staff list
        ["GET", /^\/admin\/developers$/],
        ["GET", /^\/admin\/staff-presence$/],
        ["GET", /^\/admin\/order-status$/],
        ["GET", /^\/admin\/users$/],
        ["POST", /^\/admin\/users$/],
        ["PATCH", /^\/admin\/users\/\d+$/],
        ...ACCOUNT_ROUTES,
    ],
};
const roleMay = (role, method, path) => (ROLE_ROUTES[role] ?? []).some(([m, route]) => m === method && route.test(path));

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

// Retry-After is in whole seconds
const tooManyRequests = (res, waitMs, message = TOO_MANY_REQUESTS) =>
    send(res, 429, { message }, { "Retry-After": String(Math.ceil(waitMs / 1000)) });

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

// an order lists 1-50 items, or none when it has invoices (the invoices list them);
// a customer report (REPORT_PURPOSE) has no items, only the concern
const validOrder = (body) =>
    typeof body.name === "string" && body.name.trim() && body.name.length <= 100 &&
    typeof body.purpose === "string" && body.purpose.length <= MAX_PURPOSE &&
    validSale(body) && validInvoices(body.invoices, splitList(body.purpose)) &&
    (body.purpose === REPORT_PURPOSE ? validReport(body) : validItems(body.orders, body.invoices?.length > 0));

// the invoices from Customer order, up to MAX_INVOICES: each has a number (no number twice) and the type of order
// it's for, one of the order's own types
const validInvoices = (invoices = [], types) =>
    Array.isArray(invoices) && invoices.length <= MAX_INVOICES &&
    invoices.every((i) => typeof i === "object" && i !== null && hasText(i.invoiceNo) &&
        i.invoiceNo.trim().length <= MAX_INVOICE && types.includes(i.type)) &&
    new Set(invoices.map((i) => i.invoiceNo.trim().toLowerCase())).size === invoices.length;

const validItems = (items = [], invoiced) =>
    Array.isArray(items) && (items.length > 0 || invoiced) && items.length <= 50 &&
    items.every((o) => typeof o.item === "string" && o.item.length <= 100 && Number.isInteger(o.qty) && o.qty > 0 &&
        (o.color === undefined || ROOFING_COLORS.includes(o.color)));

const hasText = (value) => typeof value === "string" && value.trim() !== "";
const optionalText = (value, max) => value === undefined || (typeof value === "string" && value.trim().length <= max);
const optionalPick = (value, list) => value === undefined || value === "" || list.includes(value);
// a time of day as HH:MM (24-hour), the way a time field sends it; "" when left blank
const optionalTime = (value) =>
    value === undefined || value === "" || (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

// a real day as YYYY-MM-DD; "2026-02-30" would quietly become 2 March, so it must survive the round trip
const validDay = (day) => {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const date = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
};

// the checkers from Customer order, each optional: { Roofing: ["Pedro", ""] }, a column from src/data/checkers.js
// with its 1st and 2nd checker
const validCheckers = (value) =>
    value === undefined ||
    (typeof value === "object" && value !== null && !Array.isArray(value) &&
        Object.entries(value).every(([column, names]) =>
            CHECKER_COLUMNS.includes(column) && Array.isArray(names) && names.length <= CHECKER_ROUNDS.length &&
            names.every((name) => optionalText(name, MAX_CHECKER))));

// the checkers as stored: JSON with only the columns that have a name, each with its 1st and 2nd checker; "" for none
const storedCheckers = (value = {}) => {
    const filled = CHECKER_COLUMNS
        .map((column) => [column, CHECKER_ROUNDS.map((_, i) => value[column]?.[i]?.trim() ?? "")])
        .filter(([, names]) => names.some(Boolean));
    return filled.length ? JSON.stringify(Object.fromEntries(filled)) : "";
};

// the sales details from Customer order, each optional: salesman, runner, receiver, the times the customer came in to
// sales and left it, the sales team that served them, how it's paid, and for a returning customer, the day they come
// back for the items (null when they're taking them now); the payment status is only kept from an admin or sales staff
// member (see paymentFrom)
const validSale = ({
    salesman, runner, receiver, salesTimeIn, salesTimeOut, checkers: checkerNames, team, paymentStatus: payment, pickupDate,
}) =>
    optionalText(salesman, MAX_SALESMAN) && optionalText(runner, MAX_RUNNER) && optionalText(receiver, MAX_RECEIVER) &&
    optionalTime(salesTimeIn) && optionalTime(salesTimeOut) && validCheckers(checkerNames) &&
    optionalPick(team, TEAMS) && optionalPick(payment, PAYMENT_STATUSES) &&
    (pickupDate === undefined || pickupDate === null || validDay(pickupDate));

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

// one chat message between a staff member and the developers; fromStaff: written by the staff member whose
// conversation it is (a developer's answer otherwise); read: the other side has opened it
const toMessage = (row) => ({
    id: row.id,
    body: row.body,
    sentAt: row.sent_at,
    fromStaff: row.sender_id === row.staff_id,
    from: { id: row.sender_id, name: row.name, role: row.role, photo: row.photo },
    read: row.read_at !== null,
});

// a chat message's text, trimmed, or null when it's empty or too long
const messageBody = ({ body }) => {
    const text = typeof body === "string" ? body.trim() : "";
    return text && text.length <= MAX_MESSAGE ? text : null;
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
    // their own sales team (GIGA, MEGA, ... from src/data/teams.js), set by an admin on Accounts; "" for none; an edit
    // they save on Customer order is marked with it
    team: row.sales_team,
    // the photo's file name doubles as a version for its URL, or null
    photo: row.photo,
    // when the account was made: "Joined on" on the Dashboard's profile
    createdAt: row.created_at,
});

// a report keeps only its concern and an order only its items, so switching purpose on Edit drops the other
// the keys besides orders and invoices are the insertOrder / updateOrder parameters; the payment status isn't one of
// them: it's saved on its own (see paymentFrom), so the edit says who set it
const pickOrder = ({
    name, purpose, orders: items = [], invoices = [], concern, salesman, runner, receiver, salesTimeIn, salesTimeOut,
    checkers: checkerNames, team, pickupDate,
}) => {
    const isReport = purpose === REPORT_PURPOSE;
    return {
        name: name.trim(),
        purpose,
        orders: isReport ? [] : items.map(({ item, qty, color }) => ({ item, qty, ...(color && { color }) })),
        invoices: invoices.map(({ invoiceNo, type }) => ({ invoiceNo: invoiceNo.trim(), type })),
        concern: isReport ? concern.trim() : "",
        salesman: salesman?.trim() ?? "",
        runner: runner?.trim() ?? "",
        receiver: receiver?.trim() ?? "",
        salesTimeIn: salesTimeIn ?? "",
        salesTimeOut: salesTimeOut ?? "",
        checkers: storedCheckers(checkerNames),
        team: team ?? "",
        pickupDate: pickupDate ?? null,
    };
};

// the details a save on Customer order can change, each with its column in orders; items and invoices are compared
// on their own, and so is the payment status (see paymentFrom)
const EDITABLE_COLUMNS = {
    name: "name", purpose: "purpose", concern: "concern", salesman: "salesman", runner: "runner", receiver: "receiver",
    salesTimeIn: "sales_time_in", salesTimeOut: "sales_time_out", checkers: "checkers", team: "team",
    pickupDate: "pickup_date",
};
// the Order sheet on Customer order: the details any sales staff member fills in after the ticket, each cell saved on
// its own, with whether a value is one it takes; the payment status shows on the sheet but isn't one: it's changed on
// Customer order or the Cashier page
const SHEET_CELLS = {
    runner: (value) => typeof value === "string" && value.trim().length <= MAX_RUNNER,
    receiver: (value) => typeof value === "string" && value.trim().length <= MAX_RECEIVER,
    team: (value) => value === "" || TEAMS.includes(value),
};
// a save from the sheet: one or more of its cells, nothing else
const validSheet = (body) =>
    typeof body === "object" && body !== null && !Array.isArray(body) && Object.keys(body).length > 0 &&
    Object.entries(body).every(([key, value]) => Object.hasOwn(SHEET_CELLS, key) && SHEET_CELLS[key](value));
const itemsOf = (rows) => rows.map(({ item, qty, color }) => ({ item, qty, ...(color && { color }) }));
const invoicesOf = (rows) => rows.map(({ invoice_no, type }) => ({ invoiceNo: invoice_no, type }));

// which details a save changes: the stored order (its row, item rows and invoice rows) against what pickOrder made of
// the save, as the keys an edit keeps, e.g. ["runner", "invoices"]; [] when nothing changed
const changedDetails = (row, storedItems, storedInvoices, { orders: items, invoices, ...fields }) => [
    ...Object.entries(EDITABLE_COLUMNS)
        .filter(([key, column]) => (row[column] ?? null) !== (fields[key] ?? null))
        .map(([key]) => key),
    ...(JSON.stringify(itemsOf(storedItems)) !== JSON.stringify(items) ? ["items"] : []),
    ...(JSON.stringify(invoicesOf(storedInvoices)) !== JSON.stringify(invoices) ? ["invoices"] : []),
];

// the payment status an order is saved with on Customer order: the one picked, from an admin or sales staff member;
// otherwise (the kiosk, any other account, or none picked) what it had, so it can be changed there but not cleared
const paymentFrom = (body, staff, stored = "") =>
    (PAYMENT_ON_ORDER.includes(staff?.role) && body.paymentStatus) || stored;

// one save on Customer order that changed something: who saved it, their sales team then (left out for none), what
// changed and when (ISO 8601)
const toEdit = (row) => ({
    by: { id: row.user_id, name: row.name, photo: row.photo },
    ...(row.sales_team && { team: row.sales_team }),
    changes: JSON.parse(row.changes),
    at: row.edited_at,
});

// the areas an order is loaded in, in turn (src/data/loadingAreas.js), each with who finished loading it there and
// when, once they have: [{ name: "Roofings", loaded: { by: { name }, at } }, { name: "Steel" }]; [] for a Customer
// Report
const areasOf = (row) => {
    const loads = JSON.parse(row.loads_json ?? "[]");
    return areasFor(row.purpose).map((name) => {
        const load = loads.find(({ area }) => area === name);
        return { name, ...(load && { loaded: { by: { name: load.by }, at: load.at } }) };
    });
};
// where a finished order is with the security check at the gate: "waiting" for a guard, then "verified", or
// "reported" (something missing, over the quantity or stolen); left out for one that doesn't need it (yet)
const securityOf = (row) =>
    row.security_check_id !== null ? (row.check_result === "verified" ? "verified" : "reported")
    : row.security_pending === 1 ? "waiting"
    : undefined;
// how the order is getting on with loading and the security check, for every page that shows it; loadingArea is the
// area the loading crew has the customer at right now, and loadingStartedAt when they pressed Loading there (ISO
// 8601; left out while the customer is only called): until that area is done no other area can take them
// returned: the report that sent the order back from the security check to one of its areas, with what the guard saw,
// until the next check
const progressOf = (row) => ({
    areas: areasOf(row),
    ...(row.at_loading === 1 && row.loading_area && { loadingArea: row.loading_area }),
    ...(row.at_loading === 1 && row.loading_started_at && { loadingStartedAt: row.loading_started_at }),
    ...(securityOf(row) && { security: securityOf(row) }),
    ...(row.return_check_id !== null && {
        returned: {
            area: row.return_area,
            result: row.return_result,
            ...(row.return_note && { note: row.return_note }),
            by: { name: row.returned_by_name },
            at: row.returned_at,
        },
    }),
});
// this visit's security check: the result, the guard's note (for a report), who checked it and when (ISO 8601)
const checkOf = (row) => row.security_check_id !== null && {
    securityCheck: {
        result: row.check_result,
        ...(row.check_note && { note: row.check_note }),
        by: { name: row.checked_by_name },
        at: row.checked_at,
    },
};

// a stored order in the shape the front end expects
const toOrder = (row, items, invoices, edits = []) => ({
    queueNum: row.queue_num,
    name: row.name,
    purpose: row.purpose,
    orders: itemsOf(items),
    // the invoices from Customer order, in the order they were added; type is the type of order each is for
    // ('' on an older ticket with several types)
    invoices: invoicesOf(invoices),
    status: row.status,
    createdAt: row.created_at,
    ...(row.called_at !== null && { calledAt: row.called_at, remarks: row.remarks }),
    // a customer report's concern, in place of items
    ...(row.concern && { concern: row.concern }),
    // the sales details from Customer order, each left out until it's filled in; pickupDate (YYYY-MM-DD) is the day
    // a returning customer comes back for the items; runner is who the customer sent to collect them; salesTimeIn and
    // salesTimeOut (HH:MM) are when the customer came in to sales and left it
    ...(row.salesman && { salesman: row.salesman }),
    ...(row.runner && { runner: row.runner }),
    ...(row.receiver && { receiver: row.receiver }),
    ...(row.sales_time_in && { salesTimeIn: row.sales_time_in }),
    ...(row.sales_time_out && { salesTimeOut: row.sales_time_out }),
    // the checkers, { Roofing: ["Pedro", ""] }, with only the columns that have a name
    ...(row.checkers && { checkers: JSON.parse(row.checkers) }),
    ...(row.payment_status && { paymentStatus: row.payment_status }),
    // team is the sales team that served the customer (src/data/teams.js); it stays theirs after the hand-over
    ...(row.team && { team: row.team }),
    ...(row.pickup_date && { pickupDate: row.pickup_date }),
    // the loading crew is serving the customer now (rather than a sales counter that called them back)
    ...(row.at_loading === 1 && { atLoading: true }),
    // the sales staff member who handed the customer over to loading, and when (ISO 8601); until then it's served at
    // a sales counter and loading can't call it
    ...(row.handed_over_by !== null && {
        handedOver: { by: { id: row.handed_over_by, name: row.handed_over_by_name }, at: row.handed_over_at },
    }),
    // the staff member serving it, or who served it; photo is for their avatar (see photoUrl in the front end)
    ...(row.served_by !== null && { servedBy: { id: row.served_by, name: row.served_by_name, photo: row.served_by_photo } }),
    // when they marked it Done (ISO 8601)
    ...(row.status === "done" && row.served_at && { servedAt: row.served_at }),
    // the loading staff member who finished loading a handed-over order, and when they pressed Done (ISO 8601; left
    // out on one loaded before it was kept); loading isn't serving, so servedBy stays the sales staff member
    ...(row.loaded_by !== null && {
        loaded: {
            by: { id: row.loaded_by, name: row.loaded_by_name, photo: row.loaded_by_photo },
            ...(row.loaded_at && { at: row.loaded_at }),
        },
    }),
    // every save on Customer order that changed something, newest first (see toEdit); left out until the first one
    ...(edits.length > 0 && { edits: edits.map(toEdit) }),
    ...progressOf(row),
    ...checkOf(row),
});

// an order on the Order status board, which every staff member sees: where the customer is, from the line to a sales
// counter to loading, and nothing else (no invoices, payment or other sales details); servedBy is whoever is serving
// them or last did (photo is for their avatar, as on toOrder), atLoading that it's the loading crew, team the sales
// team that served them
const toStatus = (row) => ({
    queueNum: row.queue_num,
    name: row.name,
    purpose: row.purpose,
    status: row.status,
    createdAt: row.created_at,
    ...(row.team && { team: row.team }),
    ...(row.at_loading === 1 && { atLoading: true }),
    ...(row.handed_over_by !== null && { handedOver: true }),
    ...(row.served_by !== null && { servedBy: { id: row.served_by, name: row.served_by_name, photo: row.served_by_photo } }),
    ...(row.pickup_date && { pickupDate: row.pickup_date }),
    ...progressOf(row),
});

// an order on the Security page: the Order status board's, plus what the customer bought, so the guards can check
// the products and quantities they leave with: the invoices (each with its type of order), the items on a ticket
// taken before invoices, who finished loading it and when, when it was marked Done, and this visit's security check
// (with the guard's note on a report); still no payment, salesman, runner, receiver or other sales details
const toSecurity = (row, items, invoices) => ({
    ...toStatus(row),
    orders: itemsOf(items),
    invoices: invoicesOf(invoices),
    ...(row.loaded_by !== null && {
        loaded: { by: { name: row.loaded_by_name }, ...(row.loaded_at && { at: row.loaded_at }) },
    }),
    ...(row.status === "done" && row.served_at && { servedAt: row.served_at }),
    ...checkOf(row),
});

// an order on the Cashier page, from any day: the Order status board's, plus what the cashier goes by to take the
// payment: the invoices (each with its type of order), the salesman, the payment status and who last changed it and
// when (ISO 8601; left out until someone has); id picks it out, since numbers repeat every day; no items, runner,
// receiver, checkers or other sales details
const toPayment = (row, invoices, edits, todayDate) => {
    const change = edits.find((edit) => JSON.parse(edit.changes).includes("paymentStatus"));
    return {
        id: row.id,
        date: row.queue_date,
        isToday: row.queue_date === todayDate,
        ...toStatus(row),
        invoices: invoicesOf(invoices),
        ...(row.salesman && { salesman: row.salesman }),
        ...(row.payment_status && { paymentStatus: row.payment_status }),
        ...(change && { paymentChange: { by: { name: change.name }, at: change.edited_at } }),
    };
};

// a ticket from any day for the History page and the Order sheet; id picks it out, since numbers repeat every day
const toHistory = (row, items, invoices, edits, todayDate) => ({
    id: row.id,
    date: row.queue_date,
    isToday: row.queue_date === todayDate,
    ...toOrder(row, items, invoices, edits),
    deletedAt: row.deleted_at,
    restoredAt: row.restored_at,
    ...(row.original_date !== null && { originalDate: row.original_date, originalNum: row.original_num }),
});

// order rows with the staff member serving them (o. prefixes keep "name" unambiguous), who handed them over to
// loading, who finished loading them, and, once it's done, when they marked it Done: this visit's point, if the point
// is theirs (at most one per order and day)
// the areas loading has finished so far, as JSON ([{ area, by, at }], see areasOf), this visit's security check
// with the guard who did it, and the report that last sent it back to an area, with its guard
const ORDER_ROW = `o.*, u.name AS served_by_name, u.photo AS served_by_photo, h.name AS handed_over_by_name,
    l.name AS loaded_by_name, l.photo AS loaded_by_photo, s.served_at,
    (SELECT json_group_array(json_object('area', ol.area, 'by', lu.name, 'at', ol.loaded_at))
        FROM order_loads ol JOIN users lu ON lu.id = ol.loaded_by WHERE ol.order_id = o.id) AS loads_json,
    sc.result AS check_result, sc.note AS check_note, sc.checked_at, su.name AS checked_by_name,
    rc.returned_to AS return_area, rc.result AS return_result, rc.note AS return_note, rc.checked_at AS returned_at,
    ru.name AS returned_by_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.served_by
    LEFT JOIN users h ON h.id = o.handed_over_by
    LEFT JOIN users l ON l.id = o.loaded_by
    LEFT JOIN serves s ON s.order_id = o.id AND s.queue_date = o.queue_date AND s.user_id = o.served_by
    LEFT JOIN security_checks sc ON sc.id = o.security_check_id
    LEFT JOIN users su ON su.id = sc.user_id
    LEFT JOIN security_checks rc ON rc.id = o.return_check_id
    LEFT JOIN users ru ON ru.id = rc.user_id`;

// "%" and "_" mean "anything" in LIKE, so a search for them is escaped
const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// returns a (req, res) handler for every /api route, with close() to shut the database
// dataDir: where queue.db and uploaded videos are kept (DATA_DIR in .env; data/ by default)
// adminUsername / adminPassword: the built-in admin from .env, created or updated at every start
// googleSheet: { url, token } of the Google Apps Script web app the Order sheet is copied to (see server/googleSheet.js);
// left out, nothing is sent
export function createApi({ adminUsername, adminPassword, dataDir, googleSheet }) {
    const dir = resolveDataDir(dataDir);
    const videosDir = join(dir, "videos");
    const photosDir = join(dir, "photos");
    mkdirSync(videosDir, { recursive: true });
    mkdirSync(photosDir, { recursive: true });
    const db = openDatabase(dir);

    // one set per API, so each test (and each restart) starts with a clean slate
    const limiters = Object.fromEntries(Object.entries(RATE_LIMITS).map(([name, options]) => [name, createRateLimiter({
        ...options,
        // once per computer per window, so the log shows who is flooding the server without filling up with it
        onLimit: (ip) => console.warn(`Rate limit (${name}): ${ip} went over ${options.limit} in ${options.windowMs / 1000}s`),
    })]));

    const sql = {
        nextQueueNum: db.prepare(`
            INSERT INTO queue_counters (queue_date, last_num) VALUES (?, 1)
            ON CONFLICT (queue_date) DO UPDATE SET last_num = last_num + 1
            RETURNING last_num`),
        // payment_status is left to its '' (none yet) and to setPayment: Customer order's and the Cashier page's
        insertOrder: db.prepare(`
            INSERT INTO orders (queue_date, queue_num, name, purpose, concern, salesman, runner, receiver,
                sales_time_in, sales_time_out, checkers, team, pickup_date, created_at)
            VALUES (:date, :queueNum, :name, :purpose, :concern, :salesman, :runner, :receiver,
                :salesTimeIn, :salesTimeOut, :checkers, :team, :pickupDate, :createdAt)`),
        updateOrder: db.prepare(`
            UPDATE orders SET name = :name, purpose = :purpose, concern = :concern,
                salesman = :salesman, runner = :runner, receiver = :receiver, sales_time_in = :salesTimeIn,
                sales_time_out = :salesTimeOut, checkers = :checkers, team = :team, pickup_date = :pickupDate
            WHERE id = :id`),
        // the Order sheet's cells; the ones a save leaves out keep what's stored
        updateSheet: db.prepare(`
            UPDATE orders SET runner = :runner, receiver = :receiver, team = :team
            WHERE id = :id`),
        // how the order is paid, from the Cashier page or Customer order
        setPayment: db.prepare("UPDATE orders SET payment_status = ? WHERE id = ?"),
        setStatus: db.prepare(`
            UPDATE orders SET status = :status, called_at = :calledAt, remarks = :remarks, served_by = :servedBy,
                at_loading = :atLoading, loaded_by = :loadedBy, loaded_at = :loadedAt, loading_area = :loadingArea,
                loading_started_at = :loadingStartedAt, security_pending = :securityPending,
                security_check_id = :securityCheckId, return_check_id = :returnCheckId
            WHERE id = :id`),
        // the crew presses Loading: the truck is at the area they called the customer to
        startLoading: db.prepare("UPDATE orders SET loading_started_at = ? WHERE id = ?"),
        // loading finishes one area of the order; a visit loads each area once
        addLoad: db.prepare(`
            INSERT INTO order_loads (order_id, area, loaded_by, loaded_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (order_id, area) DO NOTHING`),
        clearLoads: db.prepare("DELETE FROM order_loads WHERE order_id = ?"),
        // the guard's check at the gate: kept for good, and this visit's until the order is reopened
        insertCheck: db.prepare(`
            INSERT INTO security_checks (order_id, user_id, result, note, checked_at, returned_to) VALUES (?, ?, ?, ?, ?, ?)`),
        setCheck: db.prepare("UPDATE orders SET security_pending = 0, security_check_id = ?, return_check_id = NULL WHERE id = ?"),
        // a report sends the order back from the gate to one of its areas: back in line for that area, which loads
        // it again (its load is taken off), with the other areas still loaded and the sales point left alone
        returnToArea: db.prepare(`
            UPDATE orders SET status = 'pending', remarks = '', served_by = NULL, at_loading = 0, loading_area = '',
                loading_started_at = NULL, loaded_by = NULL, loaded_at = NULL, security_pending = 0,
                security_check_id = NULL, return_check_id = :check
            WHERE id = :id`),
        clearLoad: db.prepare("DELETE FROM order_loads WHERE order_id = ? AND area = ?"),
        // sales hands the customer over to loading: back in line, for the loading crew now, with the counter's
        // remarks cleared so they don't follow the customer; the order keeps its sales team
        handOver: db.prepare(`
            UPDATE orders SET handed_over_by = :user, handed_over_at = :at, status = 'pending', remarks = '',
                served_by = NULL, at_loading = 0
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
        // the Order sheet: every day's orders, newest day first and in number order within a day; Customer Reports are
        // concerns, not orders, so they're left out
        sheetOrders: db.prepare(`
            SELECT ${ORDER_ROW} WHERE o.deleted_at IS NULL AND o.purpose != ?
            ORDER BY o.queue_date DESC, o.queue_num`),
        // a customer one loading crew has finished with while another still has to call them stays on the display as
        // "Please wait" (no remarks) until that crew calls them, instead of going back in line
        serving: db.prepare(`
            SELECT queue_num, name, purpose, CASE WHEN status = 'serving' THEN remarks ELSE '' END AS remarks, called_at
            FROM orders
            WHERE queue_date = ? AND deleted_at IS NULL AND status = 'serving'
            ORDER BY called_at DESC`),
        // the line: waiting and returning customers, in number order
        upcoming: db.prepare(`
            SELECT queue_num, name, purpose, status FROM orders
            WHERE queue_date = ? AND status IN ('pending', 'returning') AND deleted_at IS NULL
            ORDER BY queue_num`),
        // orders per time slot and purpose ("Roofings, Steel" as it's stored), deleted tickets and Customer Reports
        // left out; GET /admin/stats splits the purposes into their types of order
        statsByHour: db.prepare(`
            SELECT strftime('%H', created_at, 'localtime') AS bucket, purpose, COUNT(*) AS orders FROM orders
            WHERE deleted_at IS NULL AND purpose != :report AND queue_date BETWEEN :from AND :to
            GROUP BY bucket, purpose`),
        statsByDay: db.prepare(`
            SELECT queue_date AS bucket, purpose, COUNT(*) AS orders FROM orders
            WHERE deleted_at IS NULL AND purpose != :report AND queue_date BETWEEN :from AND :to
            GROUP BY bucket, purpose`),
        statsByMonth: db.prepare(`
            SELECT substr(queue_date, 1, 7) AS bucket, purpose, COUNT(*) AS orders FROM orders
            WHERE deleted_at IS NULL AND purpose != :report AND queue_date BETWEEN :from AND :to
            GROUP BY bucket, purpose`),
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
        invoicesFor: db.prepare(`
            SELECT order_id, invoice_no, type FROM order_invoices
            WHERE order_id IN (SELECT value FROM json_each(?)) ORDER BY order_id, position`),
        // Restore puts the ticket back in line: today's keeps its number, an earlier day's gets today's next one
        restoreSameDay: db.prepare(`
            UPDATE orders SET deleted_at = NULL, restored_at = ?, status = 'pending', called_at = NULL, remarks = '',
                served_by = NULL, at_loading = 0, handed_over_by = NULL, handed_over_at = NULL, loaded_by = NULL,
                loaded_at = NULL, loading_area = '', loading_started_at = NULL, security_pending = 0,
                security_check_id = NULL, return_check_id = NULL
            WHERE id = ?`),
        restoreToToday: db.prepare(`
            UPDATE orders SET
                original_date = COALESCE(original_date, queue_date), original_num = COALESCE(original_num, queue_num),
                queue_date = ?, queue_num = ?,
                deleted_at = NULL, restored_at = ?, status = 'pending', called_at = NULL, remarks = '', served_by = NULL,
                at_loading = 0, handed_over_by = NULL, handed_over_at = NULL, loaded_by = NULL, loaded_at = NULL,
                loading_area = '', loading_started_at = NULL, security_pending = 0, security_check_id = NULL,
                return_check_id = NULL
            WHERE id = ?`),
        insertItem: db.prepare("INSERT INTO order_items (order_id, position, item, qty, color) VALUES (?, ?, ?, ?, ?)"),
        deleteItems: db.prepare("DELETE FROM order_items WHERE order_id = ?"),
        orderItems: db.prepare("SELECT item, qty, color FROM order_items WHERE order_id = ? ORDER BY position"),
        dayItems: db.prepare(`
            SELECT i.order_id, i.item, i.qty, i.color FROM order_items i JOIN orders o ON o.id = i.order_id
            WHERE o.queue_date = ? ORDER BY i.order_id, i.position`),
        // a save on Customer order that changed something, with the editor's sales team at the time
        insertEdit: db.prepare(`
            INSERT INTO order_edits (order_id, user_id, sales_team, changes, edited_at) VALUES (?, ?, ?, ?, ?)`),
        orderEdits: db.prepare(`
            SELECT e.order_id, e.user_id, u.name, u.photo, e.sales_team, e.changes, e.edited_at
            FROM order_edits e JOIN users u ON u.id = e.user_id
            WHERE e.order_id = ? ORDER BY e.id DESC`),
        dayEdits: db.prepare(`
            SELECT e.order_id, e.user_id, u.name, u.photo, e.sales_team, e.changes, e.edited_at
            FROM order_edits e JOIN users u ON u.id = e.user_id JOIN orders o ON o.id = e.order_id
            WHERE o.queue_date = ? ORDER BY e.order_id, e.id DESC`),
        editsFor: db.prepare(`
            SELECT e.order_id, e.user_id, u.name, u.photo, e.sales_team, e.changes, e.edited_at
            FROM order_edits e JOIN users u ON u.id = e.user_id
            WHERE e.order_id IN (SELECT value FROM json_each(?)) ORDER BY e.order_id, e.id DESC`),
        insertInvoice: db.prepare("INSERT INTO order_invoices (order_id, position, invoice_no, type) VALUES (?, ?, ?, ?)"),
        deleteInvoices: db.prepare("DELETE FROM order_invoices WHERE order_id = ?"),
        orderInvoices: db.prepare("SELECT invoice_no, type FROM order_invoices WHERE order_id = ? ORDER BY position"),
        dayInvoices: db.prepare(`
            SELECT v.order_id, v.invoice_no, v.type FROM order_invoices v JOIN orders o ON o.id = v.order_id
            WHERE o.queue_date = ? ORDER BY v.order_id, v.position`),
        getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
        setSetting: db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"),
        deleteSetting: db.prepare("DELETE FROM settings WHERE key = ?"),
        insertSession: db.prepare("INSERT INTO sessions (sid_hash, user_id, expires) VALUES (?, ?, ?)"),
        // a disabled account's sign-ins stop working at once
        findSession: db.prepare(`
            SELECT s.expires, u.id, u.username, u.name, u.role, u.first_name, u.middle_name, u.surname,
                u.employee_id, u.department, u.sales_team, u.photo, u.created_at
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.sid_hash = ? AND u.disabled_at IS NULL`),
        deleteSession: db.prepare("DELETE FROM sessions WHERE sid_hash = ?"),
        deleteExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires < ?"),
        // sign the account out everywhere except, optionally, this sign-in
        deleteUserSessions: db.prepare("DELETE FROM sessions WHERE user_id = ? AND sid_hash != ?"),

        findUser: db.prepare("SELECT * FROM users WHERE username = ?"),
        findUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
        insertUser: db.prepare(`
            INSERT INTO users (username, name, first_name, surname, role, sales_team, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
        resetBuiltInAdmin: db.prepare("UPDATE users SET role = 'admin', disabled_at = NULL, password_hash = ? WHERE id = ?"),
        updateUser: db.prepare(`
            UPDATE users SET name = :name, first_name = :firstName, surname = :surname, role = :role,
                sales_team = :team, disabled_at = :disabledAt, password_hash = :passwordHash
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

        // Message developer and the Chat page: one staff member's conversation with the developers, oldest first
        threadMessages: db.prepare(`
            SELECT m.id, m.staff_id, m.sender_id, m.body, m.sent_at, m.read_at, u.name, u.role, u.photo
            FROM messages m JOIN users u ON u.id = m.sender_id
            WHERE m.staff_id = ? ORDER BY m.id`),
        insertMessage: db.prepare("INSERT INTO messages (staff_id, sender_id, body, sent_at) VALUES (?, ?, ?, ?)"),
        findMessage: db.prepare(`
            SELECT m.id, m.staff_id, m.sender_id, m.body, m.sent_at, m.read_at, u.name, u.role, u.photo
            FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`),
        // opening the conversation reads what the other side wrote: the staff member the developers' answers, a
        // developer what the staff member wrote
        readAnswers: db.prepare("UPDATE messages SET read_at = ? WHERE staff_id = ? AND sender_id != staff_id AND read_at IS NULL"),
        readQuestions: db.prepare("UPDATE messages SET read_at = ? WHERE staff_id = ? AND sender_id = staff_id AND read_at IS NULL"),
        // the Chat page's list: everyone who has a conversation, the newest message first, with how many of theirs
        // no developer has read yet
        listChats: db.prepare(`
            SELECT u.id, u.name, u.role, u.photo, u.disabled_at, m.body AS last_body, m.sent_at AS last_at,
                m.sender_id = u.id AS last_from_staff, m.sender_id AS last_from_id,
                (SELECT name FROM users WHERE id = m.sender_id) AS last_from_name,
                (SELECT COUNT(*) FROM messages x WHERE x.staff_id = u.id AND x.sender_id = u.id AND x.read_at IS NULL) AS unread
            FROM users u JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE staff_id = u.id)
            ORDER BY m.id DESC`),
        setLastSeen: db.prepare("UPDATE users SET last_seen = ? WHERE id = ?"),
        // every account but switched-off ones, with whether a sign-in of theirs is still open, for who's online
        listPresence: db.prepare(`
            SELECT u.id, u.name, u.first_name, u.surname, u.role, u.department, u.photo, u.last_seen,
                EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires > :now) AS signed_in
            FROM users u
            WHERE u.disabled_at IS NULL
            ORDER BY u.name COLLATE NOCASE`),

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
    else sql.insertUser.run(adminUsername, adminUsername, adminUsername, "", "admin", "", hashPasswordSync(adminPassword), new Date().toISOString());

    const toUser = (row) => ({
        ...toMe(row),
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
    // atLoading (1 or 0) stays only while the same person keeps serving it; a customer handed over to loading already
    // gave the sales staff member their point, so loading finishing or reopening it leaves that point alone
    // loading isn't serving, it's loading the order (the truck, for roofing): a handed-over order that's done is still
    // served by the sales staff member who handed it over, and loadedBy is who finished loading it (the loading staff
    // member serving it, unless the Loading page says who pressed Done); leaving done clears it
    // loadingArea: the area the loading crew calls them to; finishedArea: the area loading has just finished
    const changeStatus = (order, status, user, {
        calledAt = order.called_at, remarks = order.remarks, servedBy, atLoading, loadedBy, loadingArea, finishedArea,
    } = {}) =>
        transaction(db, () => {
            const handedOver = order.handed_over_by !== null;
            const server = servedBy !== undefined ? servedBy
                : status === "pending" || status === "returning" ? null
                : status === "serving" ? (order.status === "serving" ? order.served_by : user.id)
                : handedOver ? order.handed_over_by
                : order.served_by ?? user.id;
            const loading = atLoading ?? (status === "serving" && server === order.served_by ? order.at_loading : 0);
            const stillDone = order.status === "done" && status === "done";
            const loader = stillDone ? order.loaded_by
                : status !== "done" || !handedOver ? null
                : loadedBy ?? (order.at_loading === 1 ? order.served_by : null);
            const loadedAt = stillDone ? order.loaded_at : loader === null ? null : new Date().toISOString();
            // the area loading called them to, while they're there, and when Loading was pressed there: kept while
            // they stay at that area, cleared once they leave it or are called to another
            const area = loading === 1 ? loadingArea ?? order.loading_area : "";
            const startedAt = loading === 1 && order.at_loading === 1 && area === order.loading_area
                ? order.loading_started_at : null;
            // a finished order waits for the security check once a visit; a Customer Report has nothing to check
            const securityPending = stillDone ? order.security_pending
                : status === "done" && order.purpose !== REPORT_PURPOSE ? 1 : 0;
            const reopened = order.status === "done" && status !== "done";
            sql.setStatus.run({
                status, calledAt, remarks, servedBy: server, atLoading: loading, loadedBy: loader, loadedAt,
                loadingArea: area, loadingStartedAt: startedAt, securityPending,
                securityCheckId: stillDone ? order.security_check_id : null,
                returnCheckId: reopened ? null : order.return_check_id, id: order.id,
            });
            if (finishedArea) sql.addLoad.run(order.id, finishedArea, user.id, new Date().toISOString());
            // reopening a finished order starts the visit over: every area loaded again, and a new security check
            if (reopened) sql.clearLoads.run(order.id);
            if (handedOver) return;
            if (reopened) sql.removePoint.run(order.id, order.queue_date);
            if (status === "done") sql.addPoint.run(order.id, server, order.queue_date, new Date().toISOString());
        });

    // today's ticket with this number, as a database row
    const findToday = (queueNum) => sql.findOrder.get(today(), queueNum);
    const loadOrder = (row) => toOrder(row, sql.orderItems.all(row.id), sql.orderInvoices.all(row.id), sql.orderEdits.all(row.id));
    // tickets from any day, as database rows, in toHistory's shape, their items, invoices and edits fetched together
    const loadAnyDay = (rows) => {
        const ids = JSON.stringify(rows.map((r) => r.id));
        const itemsByOrder = Map.groupBy(sql.itemsFor.all(ids), (i) => i.order_id);
        const invoicesByOrder = Map.groupBy(sql.invoicesFor.all(ids), (i) => i.order_id);
        const editsByOrder = Map.groupBy(sql.editsFor.all(ids), (e) => e.order_id);
        const date = today();
        return rows.map((row) => toHistory(row, itemsByOrder.get(row.id) ?? [],
            invoicesByOrder.get(row.id) ?? [], editsByOrder.get(row.id) ?? [], date));
    };
    // the same, in toPayment's shape, for the Cashier page
    const loadPayments = (rows) => {
        const ids = JSON.stringify(rows.map((r) => r.id));
        const invoicesByOrder = Map.groupBy(sql.invoicesFor.all(ids), (i) => i.order_id);
        const editsByOrder = Map.groupBy(sql.editsFor.all(ids), (e) => e.order_id);
        const date = today();
        return rows.map((row) => toPayment(row, invoicesByOrder.get(row.id) ?? [], editsByOrder.get(row.id) ?? [], date));
    };

    // the Order sheet copied to Google Sheets: the same orders the sheet lists
    const sheetSync = googleSheet?.url && createSheetSync({
        ...googleSheet,
        listOrders: () => loadAnyDay(sql.sheetOrders.all(REPORT_PURPOSE)),
    });
    if (sheetSync) sheetSync.start();

    const saveItems = (orderId, items) => {
        sql.deleteItems.run(orderId);
        items.forEach(({ item, qty, color }, i) => sql.insertItem.run(orderId, i, item, qty, color ?? null));
    };

    const saveInvoices = (orderId, invoices) => {
        sql.deleteInvoices.run(orderId);
        invoices.forEach(({ invoiceNo, type }, i) => sql.insertInvoice.run(orderId, i, invoiceNo, type));
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

    // notes that an account is using the app, for who's online; written at most every SEEN_EVERY_MS per account
    const lastSeenWrites = new Map();
    const seen = (userId) => {
        const now = Date.now();
        if (now - (lastSeenWrites.get(userId) ?? 0) < SEEN_EVERY_MS) return;
        lastSeenWrites.set(userId, now);
        sql.setLastSeen.run(now, userId);
    };

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
        const ip = clientIp(req);

        if (path !== "/video/file") {
            const wait = limiters.api.hit(ip);
            if (wait) return tooManyRequests(res, wait);
        }

        // same CSRF guard the front end expects the real backend to enforce
        if (/^\/(admin|auth)\//.test(path) && req.headers["x-requested-with"] !== "XMLHttpRequest") {
            return send(res, 403, { message: "Forbidden" });
        }

        if (method === "POST" && path === "/auth/login") {
            // checked before the password, so a guesser can't keep the server busy hashing either
            const wait = limiters.failedLogins.retryAfter(ip);
            if (wait) return tooManyRequests(res, wait, TOO_MANY_LOGINS);
            const { username, password } = await readBody(req);
            const account = typeof username === "string" ? sql.findUser.get(username.trim()) : undefined;
            const passwordOk = await checkPassword(String(password ?? ""), account?.password_hash ?? NO_SUCH_USER);
            if (!account || !passwordOk || account.disabled_at !== null) {
                limiters.failedLogins.hit(ip);
                return send(res, 401, { message: "Incorrect username or password." });
            }
            const user = toMe(account);
            const sid = randomBytes(32).toString("hex");
            sql.deleteExpiredSessions.run(Date.now());
            sql.insertSession.run(sha256(sid), account.id, Date.now() + SESSION_TTL_MS);
            seen(account.id);
            return send(res, 200, user, {
                // no Max-Age: the browser forgets it when it closes, so the next person on a shared PC signs in
                // themselves; the server still ends it after SESSION_TTL_MS
                "Set-Cookie": `${sessionCookieName(req)}=${sid}; ${cookieFlags(req)}`,
            });
        }

        if (method === "POST" && path === "/orders") {
            const wait = limiters.orders.retryAfter(ip);
            if (wait) return tooManyRequests(res, wait);
            const body = await readBody(req);
            if (!validOrder(body)) return send(res, 400, { message: "Invalid order." });
            // only tickets that join the queue count; a refused one is already covered by the api limit
            limiters.orders.hit(ip);
            const { orders: items, invoices, ...fields } = pickOrder(body);
            // an admin or sales staff member taking it on Customer order can say how it's paid; the kiosk can't
            const staff = getSession(req)?.user;
            const payment = paymentFrom(body, staff);
            const order = transaction(db, () => {
                const date = today();
                // a plain number; the front end formats it as "SHN 01"
                const { last_num: queueNum } = sql.nextQueueNum.get(date);
                const createdAt = new Date().toISOString();
                const { lastInsertRowid } = sql.insertOrder.run({ ...fields, date, queueNum, createdAt });
                saveItems(lastInsertRowid, items);
                saveInvoices(lastInsertRowid, invoices);
                // kept as an edit too, so the Cashier page shows who set it
                if (payment) {
                    sql.setPayment.run(payment, lastInsertRowid);
                    sql.insertEdit.run(lastInsertRowid, staff.id, staff.team, JSON.stringify(["paymentStatus"]), createdAt);
                }
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

        // everything below needs a signed-in account; sales, loading and security staff only get their routes in ROLE_ROUTES
        const session = getSession(req);
        if (path.startsWith("/auth/") || path.startsWith("/admin/")) {
            if (!session) return send(res, 401, { message: "Please sign in." });
            if (path.startsWith("/admin/") && session.user.role !== "admin" && !roleMay(session.user.role, method, path)) {
                return send(res, 403, { message: "Only an admin can do that." });
            }
        }
        const me = session?.user;
        if (me) seen(me.id);

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
            return send(res, 204, undefined, { "Set-Cookie": `${sessionCookieName(req)}=; ${cookieFlags(req)}; Max-Age=0` });
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

        // admins and developers get here (see ROLE_ROUTES); new accounts are usually sales staff
        if (method === "POST" && path === "/admin/users") {
            const { username, name, password, role = "sales", team = "" } = await readBody(req);
            if (me.role === "developer" && role === "admin") return send(res, 403, { message: ADMINS_ONLY });
            if (typeof username !== "string" || !USERNAME.test(username.trim())) {
                return send(res, 400, { message: "Usernames are 3–32 letters, numbers, dots, dashes or underscores." });
            }
            if (!validName(name)) return send(res, 400, { message: "Enter the staff member's name." });
            if (!validPassword(password)) return send(res, 400, { message: `Passwords need at least ${MIN_PASSWORD} characters.` });
            if (!ROLES.includes(role)) return send(res, 400, { message: NO_SUCH_ROLE });
            if (!optionalPick(team, TEAMS)) return send(res, 400, { message: NO_SUCH_TEAM });
            if (sql.findUser.get(username.trim())) return send(res, 409, { message: "That username is taken." });
            // they can add a middle name, employee ID and department themselves on My account
            const [firstName, surname] = splitName(name);
            const { lastInsertRowid } = sql.insertUser.run(username.trim(), name.trim(), firstName, surname, role, team,
                await hashPassword(password), new Date().toISOString());
            return send(res, 201, toUser({ ...sql.findUserById.get(lastInsertRowid), served_total: 0, served_today: 0, serving_now: 0, signed_in: 0 }));
        }

        // { name?, role?, team?, password?, disabled? }; team is "" for none
        const userMatch = path.match(/^\/admin\/users\/(\d+)$/);
        if (method === "PATCH" && userMatch) {
            const account = sql.findUserById.get(Number(userMatch[1]));
            if (!account) return send(res, 404, { message: "Account not found." });
            const body = await readBody(req);
            if (me.role === "developer" && (account.role === "admin" || body.role === "admin")) {
                return send(res, 403, { message: ADMINS_ONLY });
            }
            const changes = {
                name: account.name,
                firstName: account.first_name,
                surname: account.surname,
                role: account.role,
                team: account.sales_team,
                disabledAt: account.disabled_at,
                passwordHash: account.password_hash,
            };
            if (body.name !== undefined) {
                if (!validName(body.name)) return send(res, 400, { message: "Enter the staff member's name." });
                changes.name = body.name.trim();
                [changes.firstName, changes.surname] = splitName(body.name);
            }
            // any account's team, your own and the built-in admin's included: it only marks the edits they save
            if (body.team !== undefined) {
                if (!optionalPick(body.team, TEAMS)) return send(res, 400, { message: NO_SUCH_TEAM });
                changes.team = body.team;
            }
            const lockedOut = isBuiltIn(account) || account.id === me.id;
            if (body.role !== undefined && body.role !== account.role) {
                if (!ROLES.includes(body.role)) return send(res, 400, { message: NO_SUCH_ROLE });
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

        // Message developer: your own conversation with the developers, oldest first; opening it reads their answers
        if (method === "GET" && path === "/admin/messages") {
            sql.readAnswers.run(new Date().toISOString(), me.id);
            return send(res, 200, sql.threadMessages.all(me.id).map(toMessage));
        }

        // { body } → the message, from you to the developers; a developer answers on the Chat page instead
        if (method === "POST" && path === "/admin/messages") {
            if (me.role === "developer") return send(res, 403, { message: "Answer staff on the Chat page." });
            const body = messageBody(await readBody(req));
            if (!body) return send(res, 400, { message: `Write a message of up to ${MAX_MESSAGE} characters.` });
            const { lastInsertRowid } = sql.insertMessage.run(me.id, me.id, body, new Date().toISOString());
            return send(res, 201, toMessage(sql.findMessage.get(lastInsertRowid)));
        }

        // who's online: every account but switched-off ones, online ones first, then by name; online while signed in
        // and seen in the last ONLINE_MS; lastSeen (ms) is when they last used the app, or null if they never have
        const presence = () => {
            const now = Date.now();
            return sql.listPresence.all({ now }).map((row) => ({
                id: row.id,
                name: row.name,
                firstName: row.first_name,
                surname: row.surname,
                role: row.role,
                department: row.department,
                photo: row.photo,
                online: Boolean(row.signed_in) && row.last_seen !== null && now - row.last_seen < ONLINE_MS,
                lastSeen: row.last_seen,
            })).toSorted((a, b) => b.online - a.online);
        };

        // the developer team, for Message developer and the Chat page's chat heads
        if (method === "GET" && path === "/admin/developers") {
            return send(res, 200, presence().filter((account) => account.role === "developer"));
        }

        // the Chat page's Staff list, the developers' only: everyone else, for the page to group by department
        if (method === "GET" && path === "/admin/staff-presence") {
            if (me.role !== "developer") return send(res, 403, { message: "Only a developer can do that." });
            return send(res, 200, presence().filter((account) => account.role !== "developer"));
        }

        // the Chat page, the developers' only (an admin writes to them from Message developer like everyone else):
        // everyone who has written, newest first
        if (method === "GET" && path === "/admin/chats") {
            if (me.role !== "developer") return send(res, 403, { message: "Only a developer can do that." });
            return send(res, 200, sql.listChats.all().map((row) => ({
                staff: { id: row.id, name: row.name, role: row.role, photo: row.photo, disabled: row.disabled_at !== null },
                last: {
                    body: row.last_body,
                    sentAt: row.last_at,
                    fromStaff: Boolean(row.last_from_staff),
                    from: { id: row.last_from_id, name: row.last_from_name },
                },
                unread: row.unread,
            })));
        }

        // one staff member's conversation, which opening reads; POST { body } answers them
        const chatMatch = path.match(/^\/admin\/chats\/(\d+)$/);
        if (chatMatch && (method === "GET" || method === "POST")) {
            if (me.role !== "developer") return send(res, 403, { message: "Only a developer can do that." });
            const staff = sql.findUserById.get(Number(chatMatch[1]));
            if (!staff || staff.role === "developer") return send(res, 404, { message: "Staff member not found." });
            if (method === "GET") {
                sql.readQuestions.run(new Date().toISOString(), staff.id);
                return send(res, 200, sql.threadMessages.all(staff.id).map(toMessage));
            }
            const body = messageBody(await readBody(req));
            if (!body) return send(res, 400, { message: `Write a message of up to ${MAX_MESSAGE} characters.` });
            const { lastInsertRowid } = sql.insertMessage.run(staff.id, me.id, body, new Date().toISOString());
            return send(res, 201, toMessage(sql.findMessage.get(lastInsertRowid)));
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

        // a loading or hardware account only gets the orders sales has handed over that its department has a part in:
        // the department's one shared line
        if (method === "GET" && path === "/admin/orders") {
            const date = today();
            const itemsByOrder = Map.groupBy(sql.dayItems.all(date), (item) => item.order_id);
            const invoicesByOrder = Map.groupBy(sql.dayInvoices.all(date), (invoice) => invoice.order_id);
            const editsByOrder = Map.groupBy(sql.dayEdits.all(date), (edit) => edit.order_id);
            const rows = sql.dayOrders.all(date).filter((row) => !DEPARTMENTS[me.role] ||
                (row.handed_over_by !== null && departmentHas(me.role, areasFor(row.purpose))));
            return send(res, 200, rows.map((row) => toOrder(row, itemsByOrder.get(row.id) ?? [],
                invoicesByOrder.get(row.id) ?? [], editsByOrder.get(row.id) ?? [])));
        }

        // the Order status board: all of today's orders for every staff member, a loading crew's included, so anyone
        // can see where a customer is
        if (method === "GET" && path === "/admin/order-status") {
            return send(res, 200, sql.dayOrders.all(today()).map(toStatus));
        }

        // the Security page (security guards and admins): today's orders, where each customer is and what they bought;
        // Customer Reports are concerns, with nothing to take out, so they're left out
        if (method === "GET" && path === "/admin/security") {
            const date = today();
            const itemsByOrder = Map.groupBy(sql.dayItems.all(date), (item) => item.order_id);
            const invoicesByOrder = Map.groupBy(sql.dayInvoices.all(date), (invoice) => invoice.order_id);
            const rows = sql.dayOrders.all(date).filter((row) => row.purpose !== REPORT_PURPOSE);
            return send(res, 200, rows.map((row) =>
                toSecurity(row, itemsByOrder.get(row.id) ?? [], invoicesByOrder.get(row.id) ?? [])));
        }

        // call (or call again) a ticket: it becomes the headline on the display with the admin's remarks
        // a done one is refused, e.g. from a page that hadn't refreshed yet when someone else (or loading) finished it
        const callMatch = path.match(/^\/admin\/orders\/([^/]+)\/call$/);
        if (method === "POST" && callMatch) {
            const order = findToday(Number(decodeURIComponent(callMatch[1])));
            if (!order) return send(res, 404, { message: "Order not found." });
            if (order.status === "done") return send(res, 409, { message: ALREADY_DONE });
            const { remarks = "" } = await readBody(req);
            if (typeof remarks !== "string" || remarks.trim().length > MAX_REMARKS) {
                return send(res, 400, { message: `Remarks must be ${MAX_REMARKS} characters or fewer.` });
            }
            // whoever calls the customer is the one serving them
            changeStatus(order, "serving", me, { calledAt: Date.now(), remarks: remarks.trim(), servedBy: me.id });
            return send(res, 200, loadOrder(findToday(order.queue_num)));
        }

        // after the ticket and the talk with the customer, sales hands them over to loading: they wait in line on the
        // Loading page, where the crew calls them (sales doesn't), the order keeps its sales team, and it counts as the
        // customer served for whoever served them (whoever hands them over, if nobody called them)
        const handOverMatch = path.match(/^\/admin\/orders\/([^/]+)\/handover$/);
        if (method === "POST" && handOverMatch) {
            const order = findToday(Number(decodeURIComponent(handOverMatch[1])));
            if (!order) return send(res, 404, { message: "Order not found." });
            if (order.handed_over_by !== null) return send(res, 409, { message: "This customer is already with loading." });
            if (order.status === "done") return send(res, 409, { message: "This order is already done." });
            const at = new Date().toISOString();
            transaction(db, () => {
                sql.handOver.run({ user: me.id, at, id: order.id });
                sql.addPoint.run(order.id, order.served_by ?? me.id, order.queue_date, at);
            });
            return send(res, 200, loadOrder(findToday(order.queue_num)));
        }

        // the Order sheet on Customer order: every order from every day, not just today's (deleted ones and Customer
        // Reports left out)
        if (method === "GET" && path === "/admin/order-sheet") {
            return send(res, 200, loadAnyDay(sql.sheetOrders.all(REPORT_PURPOSE)));
        }

        // the Order sheet's cells, shared by every sales staff member: each cell is saved on its own, so two people
        // working on the same order at once don't overwrite each other's cells; a save that changes something is kept
        // as an edit, the same as a save on Customer order; by id, since an earlier day's order can be filled in too
        const sheetMatch = path.match(/^\/admin\/order-sheet\/(\d+)$/);
        if (method === "PATCH" && sheetMatch) {
            const order = sql.findById.get(Number(sheetMatch[1]));
            // only an order the sheet lists
            if (!order || order.deleted_at !== null || order.purpose === REPORT_PURPOSE) {
                return send(res, 404, { message: "Order not found." });
            }
            const body = await readBody(req);
            if (!validSheet(body)) return send(res, 400, { message: "Invalid order sheet change." });
            const cells = {
                runner: (body.runner ?? order.runner).trim(),
                receiver: (body.receiver ?? order.receiver).trim(),
                team: body.team ?? order.team,
            };
            const changes = Object.keys(body).filter((key) => cells[key] !== order[EDITABLE_COLUMNS[key]]);
            transaction(db, () => {
                sql.updateSheet.run({ ...cells, id: order.id });
                if (changes.length) {
                    sql.insertEdit.run(order.id, me.id, me.team, JSON.stringify(changes), new Date().toISOString());
                }
            });
            return send(res, 200, loadAnyDay([sql.findById.get(order.id)])[0]);
        }

        // the Cashier page (cashiers, sales and admins): the Order sheet's orders, every one from every day (deleted ones and
        // Customer Reports left out), with how each is paid
        if (method === "GET" && path === "/admin/payments") {
            return send(res, 200, loadPayments(sql.sheetOrders.all(REPORT_PURPOSE)));
        }

        // the cashier (or sales) changes how an order is paid, e.g. Vale to Paid once the customer has settled it; from any day, by
        // id; it can be changed but not cleared, and a change is kept as an edit with who made it, like one on the Order
        // sheet, so sales see it on the ticket
        const paymentMatch = path.match(/^\/admin\/payments\/(\d+)$/);
        if (method === "PATCH" && paymentMatch) {
            const order = sql.findById.get(Number(paymentMatch[1]));
            if (!order || order.deleted_at !== null || order.purpose === REPORT_PURPOSE) {
                return send(res, 404, { message: "Order not found." });
            }
            const body = await readBody(req);
            if (!PAYMENT_STATUSES.includes(body?.paymentStatus)) return send(res, 400, { message: NO_SUCH_PAYMENT });
            if (body.paymentStatus !== order.payment_status) {
                transaction(db, () => {
                    sql.setPayment.run(body.paymentStatus, order.id);
                    sql.insertEdit.run(order.id, me.id, me.team, JSON.stringify(["paymentStatus"]), new Date().toISOString());
                });
            }
            return send(res, 200, loadPayments([sql.findById.get(order.id)])[0]);
        }

        const adminMatch = path.match(/^\/admin\/orders\/([^/]+)$/);
        if (adminMatch) {
            const order = findToday(Number(decodeURIComponent(adminMatch[1])));
            if (!order) return send(res, 404, { message: "Order not found." });

            if (method === "GET") return send(res, 200, loadOrder(order));
            // Customer order saves the whole order again (admins and sales staff only); a save that changes something
            // is kept as an edit with who saved it, their sales team and when; one that changes nothing isn't
            // the runner and receiver are filled in on the Order sheet, so a save without them keeps what's stored; so
            // does one without a payment status
            if (method === "PUT") {
                const body = await readBody(req);
                if (!validOrder(body)) return send(res, 400, { message: "Invalid order." });
                const saved = pickOrder({ runner: order.runner, receiver: order.receiver, ...body });
                const { orders: items, invoices, ...fields } = saved;
                const payment = paymentFrom(body, me, order.payment_status);
                transaction(db, () => {
                    const changes = [
                        ...changedDetails(order, sql.orderItems.all(order.id), sql.orderInvoices.all(order.id), saved),
                        ...(payment !== order.payment_status ? ["paymentStatus"] : []),
                    ];
                    sql.updateOrder.run({ ...fields, id: order.id });
                    sql.setPayment.run(payment, order.id);
                    saveItems(order.id, items);
                    saveInvoices(order.id, invoices);
                    if (changes.length) {
                        sql.insertEdit.run(order.id, me.id, me.team, JSON.stringify(changes), new Date().toISOString());
                    }
                });
                return send(res, 200, loadOrder(findToday(order.queue_num)));
            }
            if (method === "PATCH") {
                const { status } = await readBody(req);
                if (!ORDER_STATUSES.includes(status)) return send(res, 400, { message: "Invalid status." });
                // Now serving puts them on the display, the same as calling them, which sales don't do
                if (status === "serving" && order.status !== "serving" && me.role === "sales") {
                    return send(res, 403, { message: SALES_DONT_CALL });
                }
                if (order.status === "done" && status === "serving") return send(res, 409, { message: ALREADY_DONE });
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

        // the Loading and Hardware pages: a department's crew calls a customer sales has handed over to one of its
        // areas, marks them done, or sends them back to waiting; each is one shared line, so any of the department's
        // accounts (or an admin) can call any of them, and finish or send back one the department is serving; a
        // customer is in one place at a time, so while a sales counter or the other department has them, they can't
        // be called
        // Done means the crew has finished loading the order there: whoever pressed it loaded it, and the sales staff
        // member who handed it over still served it
        // a station loads one truck at a time: once the truck is at the area they were called to, the crew presses
        // Loading (start), and from then on the customer can't be called to another area until that one is done (or
        // sends them back to waiting), e.g. Steel waits while Roofings is loading; Done needs Loading first
        const loadingMatch = path.match(/^\/admin\/(loading|hardware)\/([^/]+)\/(call|start|done|back)$/);
        if (method === "POST" && loadingMatch) {
            const [, department, queueNum, action] = loadingMatch;
            const label = DEPARTMENTS[department];
            const order = findToday(Number(decodeURIComponent(queueNum)));
            if (!order) return send(res, 404, { message: "Order not found." });
            const body = await readBody(req);
            if (order.handed_over_by === null) return send(res, 409, { message: "Sales hasn't handed this customer over yet." });
            const servingHere = order.status === "serving" && order.at_loading === 1 &&
                departmentOf(order.loading_area) === department;
            // the order is loaded in each of its areas in turn (src/data/loadingAreas.js); these are the ones left,
            // and the ones of them this department works
            const loaded = JSON.parse(order.loads_json).map(({ area }) => area);
            const areasLeft = areasFor(order.purpose).filter((area) => !loaded.includes(area));
            const leftHere = areasLeft.filter((area) => departmentOf(area) === department);
            const loadingAt = servingHere && order.loading_started_at ? order.loading_area || label : null;

            if (action === "call") {
                if (order.status === "done") return send(res, 409, { message: `${label} has already finished this order.` });
                if (order.status === "serving" && !servingHere) {
                    return send(res, 409, { message: `Please wait until ${order.served_by_name ?? "the other counter"} finishes.` });
                }
                // an order from before the areas has none left, and is the loading crew's
                if (!departmentHas(department, areasLeft)) {
                    return send(res, 409, { message: `There's nothing left for ${label} on this order.` });
                }
                // the area they're called to: the next one the order needs here unless the crew picks another of them
                const { remarks = "", area = leftHere[0] ?? "" } = body;
                if (typeof remarks !== "string" || remarks.trim().length > MAX_REMARKS) {
                    return send(res, 400, { message: `Remarks must be ${MAX_REMARKS} characters or fewer.` });
                }
                if (leftHere.length > 0 && !leftHere.includes(area)) {
                    return send(res, 400, { message: `Call them to an area this order still needs: ${leftHere.join(", ")}.` });
                }
                if (loadingAt && area !== order.loading_area) {
                    return send(res, 409, { message: `${loadingAt} is loading this truck. Please wait until it finishes.` });
                }
                changeStatus(order, "serving", me, {
                    calledAt: Date.now(), remarks: remarks.trim(), servedBy: me.id, atLoading: 1, loadingArea: area,
                });
            } else {
                if (!servingHere) return send(res, 409, { message: `${label} isn't serving this customer.` });
                const at = order.loading_area || label;
                if (action === "start") {
                    if (loadingAt) return send(res, 409, { message: `${at} is already loading this truck.` });
                    sql.startLoading.run(new Date().toISOString(), order.id);
                } else if (action === "back") changeStatus(order, "pending", me);
                else if (!loadingAt) {
                    return send(res, 409, { message: `Press Loading once the truck is at ${at}, then Done when it's loaded.` });
                } else {
                    // Done finishes the area they were called to: the order waits for its next area, here or at the
                    // other department, or, once every area is loaded, it's done and goes on to the security check
                    const area = order.loading_area || leftHere[0];
                    const next = areasLeft.filter((name) => name !== area);
                    if (next.length > 0) changeStatus(order, "pending", me, { remarks: "", finishedArea: area });
                    else changeStatus(order, "done", me, { loadedBy: me.id, finishedArea: area });
                }
            }
            return send(res, 200, loadOrder(findToday(order.queue_num)));
        }

        // the security check at the gate (security guards and admins): every finished order waits for it, and the guard
        // verifies what the customer leaves with, or reports something missing, over the order's quantity or stolen,
        // saying what they saw; either way the order is then done, and the check is kept with it
        // a report can instead send the order back to one of its areas (returnTo: "Roofings"): only that area loads it
        // again, the others stay loaded, and then it comes back here for a new check
        const checkMatch = path.match(/^\/admin\/security\/([^/]+)\/check$/);
        if (method === "POST" && checkMatch) {
            const order = findToday(Number(decodeURIComponent(checkMatch[1])));
            if (!order) return send(res, 404, { message: "Order not found." });
            if (order.security_check_id !== null) {
                return send(res, 409, { message: `${order.checked_by_name} has already checked this order.` });
            }
            if (order.security_pending !== 1) return send(res, 409, { message: "This order isn't at the security check yet." });
            const { result, note = "", returnTo = "" } = await readBody(req);
            if (!SECURITY_RESULTS.includes(result)) return send(res, 400, { message: "Pick verified, missing, over or stolen." });
            if (typeof note !== "string" || note.trim().length > MAX_SECURITY_NOTE) {
                return send(res, 400, { message: `Notes must be ${MAX_SECURITY_NOTE} characters or fewer.` });
            }
            if (result !== "verified" && !note.trim()) {
                return send(res, 400, { message: "Say what's wrong, e.g. which item and how many." });
            }
            // only an order sales handed over was loaded, so only its areas can load it again
            const areas = order.handed_over_by === null ? [] : areasFor(order.purpose);
            if (returnTo !== "" && (result === "verified" || !areas.includes(returnTo))) {
                return send(res, 400, {
                    message: areas.length ? `Send it back to one of its areas: ${areas.join(", ")}.` : "This order has no area to send it back to.",
                });
            }
            transaction(db, () => {
                const { lastInsertRowid } = sql.insertCheck.run(order.id, me.id, result, note.trim(),
                    new Date().toISOString(), returnTo);
                if (!returnTo) return sql.setCheck.run(lastInsertRowid, order.id);
                sql.returnToArea.run({ check: lastInsertRowid, id: order.id });
                sql.clearLoad.run(order.id, returnTo);
            });
            const row = findToday(order.queue_num);
            return send(res, 200, toSecurity(row, sql.orderItems.all(row.id), sql.orderInvoices.all(row.id)));
        }

        // ?period=day|week|month|year → { period, from, to, buckets: [{ key, orders: { type: n }, total }], servedToday }
        // orders counts each type of order: one for Roofings and Steel is in both; total is the slot's orders, each once
        // every slot in the period is listed, empty ones included, so the graph and the export have no gaps
        if (method === "GET" && path === "/admin/stats") {
            const period = url.searchParams.get("period") ?? "week";
            if (!STATS_PERIODS[period]) return send(res, 400, { message: "Pick day, week, month or year." });
            const to = today();
            const from = { day: to, week: localDate(daysAgo(6)), month: localDate(daysAgo(29)) }[period]
                ?? `${STATS_PERIODS.year()[0]}-01`;
            const query = { day: sql.statsByHour, week: sql.statsByDay, month: sql.statsByDay, year: sql.statsByMonth }[period];
            const rows = query.all({ from, to, report: REPORT_PURPOSE });

            const keys = STATS_PERIODS[period](rows.map((r) => Number(r.bucket)));
            const buckets = new Map(keys.map((key) => [key, { key, orders: {}, total: 0 }]));
            for (const { bucket, purpose, orders } of rows) {
                const slot = buckets.get(bucket);
                if (!slot) continue;
                slot.total += orders;
                for (const type of splitList(purpose)) slot.orders[type] = (slot.orders[type] ?? 0) + orders;
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
            return send(res, 200, loadAnyDay(rows));
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
                sql.clearLoads.run(row.id);
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
    handler.close = () => {
        if (sheetSync) sheetSync.stop();
        db.close();
    };
    return handler;
}
