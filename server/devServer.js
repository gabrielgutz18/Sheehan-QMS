// local stand-in for the real backend so the app can be used during development
// data lives in memory and resets on restart; run with: npm run api
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ORDER_STATUSES = ["pending", "serving", "done"];

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

const adminUser = { id: 1, name: ADMIN_USERNAME, role: "admin" };
const sessions = new Map(); // sid -> { user, expires }
const orders = new Map(); // queueNum (number) -> order
let nextQueue = 1;

// compare digests so the check takes the same time whatever the input
const sameSecret = (a, b) => {
    const digest = (s) => createHash("sha256").update(String(s)).digest();
    return timingSafeEqual(digest(a), digest(b));
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

const getSession = (req) => {
    const sid = req.headers.cookie?.match(/(?:^|;\s*)sid=([^;]+)/)?.[1];
    const session = sid && sessions.get(sid);
    if (!session) return null;
    if (session.expires < Date.now()) {
        sessions.delete(sid);
        return null;
    }
    return { sid, ...session };
};

const validOrder = (body) =>
    typeof body.name === "string" && body.name.trim() && body.name.length <= 100 &&
    typeof body.purpose === "string" && body.purpose.length <= 100 &&
    Array.isArray(body.orders) && body.orders.length > 0 && body.orders.length <= 50 &&
    body.orders.every((o) => typeof o.item === "string" && o.item.length <= 100 && Number.isInteger(o.qty) && o.qty > 0);

const pickOrder = ({ name, purpose, orders: items }) => ({
    name: name.trim(),
    purpose,
    orders: items.map(({ item, qty }) => ({ item, qty })),
});

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
        if (!sameSecret(username ?? "", ADMIN_USERNAME) || !sameSecret(password ?? "", ADMIN_PASSWORD)) {
            return send(res, 401, { message: "Incorrect username or password." });
        }
        const sid = randomBytes(32).toString("hex");
        sessions.set(sid, { user: adminUser, expires: Date.now() + SESSION_TTL_MS });
        return send(res, 200, adminUser, {
            "Set-Cookie": `${SESSION_COOKIE}=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
        });
    }

    if (method === "POST" && path === "/orders") {
        const body = await readBody(req);
        if (!validOrder(body)) return send(res, 400, { message: "Invalid order." });
        // a plain number; the front end formats it as "SHN 01"
        const queueNum = nextQueue++;
        const order = { queueNum, ...pickOrder(body), status: "pending", createdAt: new Date().toISOString() };
        orders.set(queueNum, order);
        return send(res, 201, order);
    }

    const orderMatch = path.match(/^\/orders\/([^/]+)$/);
    if (method === "PUT" && orderMatch) {
        const existing = orders.get(Number(decodeURIComponent(orderMatch[1])));
        if (!existing) return send(res, 404, { message: "Order not found." });
        const body = await readBody(req);
        if (!validOrder(body)) return send(res, 400, { message: "Invalid order." });
        Object.assign(existing, pickOrder(body));
        return send(res, 200, existing);
    }

    // everything below needs an admin session
    const session = getSession(req);
    if (path.startsWith("/auth/") || path.startsWith("/admin/")) {
        if (!session || session.user.role !== "admin") return send(res, 401, { message: "Please sign in." });
    }

    if (method === "GET" && path === "/auth/me") return send(res, 200, session.user);

    if (method === "POST" && path === "/auth/logout") {
        sessions.delete(session.sid);
        return send(res, 204, undefined, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    }

    if (method === "GET" && path === "/admin/orders") return send(res, 200, [...orders.values()]);

    const adminMatch = path.match(/^\/admin\/orders\/([^/]+)$/);
    if (adminMatch) {
        const queueNum = Number(decodeURIComponent(adminMatch[1]));
        const order = orders.get(queueNum);
        if (!order) return send(res, 404, { message: "Order not found." });

        if (method === "GET") return send(res, 200, order);
        if (method === "PATCH") {
            const { status } = await readBody(req);
            if (!ORDER_STATUSES.includes(status)) return send(res, 400, { message: "Invalid status." });
            order.status = status;
            return send(res, 200, order);
        }
        if (method === "DELETE") {
            orders.delete(queueNum);
            return send(res, 204);
        }
    }

    return send(res, 404, { message: "Not found." });
}

createServer((req, res) => {
    handle(req, res).catch((err) => {
        console.error(err);
        if (!res.headersSent) send(res, 400, { message: "Bad request." });
    });
}).listen(PORT, () => {
    console.log(`Dev API on http://localhost:${PORT} (admin user: ${ADMIN_USERNAME})`);
});
