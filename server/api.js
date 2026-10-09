// in-memory stand-in for the real backend, shared by the Vite dev server and server/devServer.js
// data (orders, the display video and any uploaded file) resets whenever the process restarts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ORDER_STATUSES = ["pending", "serving", "done"];
const MAX_REMARKS = 120;
// optional per-item color for roofing orders; must match src/data/roofingColors.js
const ROOFING_COLORS = ["red", "blue", "green"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-m4v"];
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

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

// uploaded videos come in as the raw request body, not JSON
const readFile = async (req, limit) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) throw new Error("Body too large");
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
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
const sendVideoFile = (req, res, { data, type }) => {
    const total = data.length;
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (!range || (!range[1] && !range[2])) {
        res.writeHead(200, { "Content-Type": type, "Content-Length": total, "Accept-Ranges": "bytes" });
        return res.end(data);
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
    return res.end(data.subarray(start, end + 1));
};

const validOrder = (body) =>
    typeof body.name === "string" && body.name.trim() && body.name.length <= 100 &&
    typeof body.purpose === "string" && body.purpose.length <= 100 &&
    Array.isArray(body.orders) && body.orders.length > 0 && body.orders.length <= 50 &&
    body.orders.every((o) => typeof o.item === "string" && o.item.length <= 100 && Number.isInteger(o.qty) && o.qty > 0 &&
        (o.color === undefined || ROOFING_COLORS.includes(o.color)));

const pickOrder = ({ name, purpose, orders: items }) => ({
    name: name.trim(),
    purpose,
    orders: items.map(({ item, qty, color }) => ({ item, qty, ...(color && { color }) })),
});

// returns a (req, res) handler for every /api route
export function createApi({ adminUsername, adminPassword }) {
    const adminUser = { id: 1, name: adminUsername, role: "admin" };
    const sessions = new Map(); // sid -> { user, expires }
    const orders = new Map(); // queueNum (number) -> order
    let nextQueue = 1;
    // display-screen video: { kind: "url", url } or { kind: "file", name, type, data, version }
    let video = null;
    let videoVersion = 0;

    // what the display gets: the link, or a version stamp that busts the cache after a new upload
    const publicVideo = () => !video ? null
        : video.kind === "url" ? { kind: "url", url: video.url }
        : { kind: "file", name: video.name, version: video.version };

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
            if (!sameSecret(username ?? "", adminUsername) || !sameSecret(password ?? "", adminPassword)) {
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

        // public display board: number, name and purpose only, never order details
        if (method === "GET" && path === "/queue") {
            const byStatus = (status) => [...orders.values()].filter((o) => o.status === status);
            const board = ({ queueNum, name, purpose }) => ({ queueNum, name, purpose });
            // calledAt lets the display replay its animation when the same number is called again
            const called = (o) => ({ ...board(o), remarks: o.remarks ?? "", calledAt: o.calledAt });
            return send(res, 200, {
                // most recently called first, so the display headlines the newest call
                serving: byStatus("serving").sort((a, b) => b.calledAt - a.calledAt).map(called),
                upcoming: byStatus("pending").sort((a, b) => a.queueNum - b.queueNum).map(board),
            });
        }

        if (method === "GET" && path === "/video") return send(res, 200, publicVideo());

        if (method === "GET" && path === "/video/file") {
            if (video?.kind !== "file") return send(res, 404, { message: "No uploaded video." });
            return sendVideoFile(req, res, video);
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

        if (method === "PUT" && path === "/admin/video") {
            const { url: videoUrl } = await readBody(req);
            if (!validVideoUrl(videoUrl)) return send(res, 400, { message: "Enter a valid http(s) video link." });
            video = { kind: "url", url: videoUrl.trim() };
            return send(res, 200, publicVideo());
        }

        if (method === "POST" && path === "/admin/video/file") {
            const type = req.headers["content-type"];
            if (!VIDEO_TYPES.includes(type)) return send(res, 415, { message: "Upload an MP4, WebM, OGG or MOV video." });
            if (Number(req.headers["content-length"]) > MAX_VIDEO_BYTES) {
                return send(res, 413, { message: "Video is larger than 200 MB." });
            }
            const data = await readFile(req, MAX_VIDEO_BYTES);
            if (!data.length) return send(res, 400, { message: "The file is empty." });
            const name = decodeURIComponent(req.headers["x-file-name"] ?? "video").slice(0, 200);
            video = { kind: "file", name, type, data, version: ++videoVersion };
            return send(res, 201, publicVideo());
        }

        if (method === "DELETE" && path === "/admin/video") {
            video = null;
            return send(res, 204);
        }

        if (method === "GET" && path === "/admin/orders") return send(res, 200, [...orders.values()]);

        // call (or call again) a ticket: it becomes the headline on the display with the admin's remarks
        const callMatch = path.match(/^\/admin\/orders\/([^/]+)\/call$/);
        if (method === "POST" && callMatch) {
            const order = orders.get(Number(decodeURIComponent(callMatch[1])));
            if (!order) return send(res, 404, { message: "Order not found." });
            const { remarks = "" } = await readBody(req);
            if (typeof remarks !== "string" || remarks.trim().length > MAX_REMARKS) {
                return send(res, 400, { message: `Remarks must be ${MAX_REMARKS} characters or fewer.` });
            }
            Object.assign(order, { status: "serving", calledAt: Date.now(), remarks: remarks.trim() });
            return send(res, 200, order);
        }

        const adminMatch = path.match(/^\/admin\/orders\/([^/]+)$/);
        if (adminMatch) {
            const queueNum = Number(decodeURIComponent(adminMatch[1]));
            const order = orders.get(queueNum);
            if (!order) return send(res, 404, { message: "Order not found." });

            if (method === "GET") return send(res, 200, order);
            if (method === "PATCH") {
                const { status } = await readBody(req);
                if (!ORDER_STATUSES.includes(status)) return send(res, 400, { message: "Invalid status." });
                if (status === "serving" && order.status !== "serving") order.calledAt = Date.now();
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

    return (req, res) => {
        handle(req, res).catch((err) => {
            console.error(err);
            if (!res.headersSent) send(res, 400, { message: "Bad request." });
        });
    };
}
