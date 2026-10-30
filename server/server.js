// production server: the built site (dist/) and the API on one port, e.g. on the Windows server
// build first, then start:  npm run build  →  npm start
// also what /api is forwarded to during `npm run dev` when DEV_API=off is set in .env
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { createApi } from './api.js';

const PORT = Number(process.env.PORT ?? 3000);
const { ADMIN_USERNAME, ADMIN_PASSWORD, DATA_DIR, GOOGLE_SHEET_URL, GOOGLE_SHEET_TOKEN } = process.env;

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const ASSETS = join(DIST, 'assets');

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".txt": "text/plain; charset=utf-8",
};

const plain = (res, status, text) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(text);
};

// a file from dist/, or index.html for app pages like /staff/orders so the router takes over
function serveSite(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") return plain(res, 405, "Method not allowed");

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
        return plain(res, 400, "Bad request");
    }
    let file = normalize(join(DIST, pathname));
    if (!file.startsWith(DIST)) return plain(res, 403, "Forbidden");

    let stats = statSync(file, { throwIfNoEntry: false });
    if (!stats?.isFile()) {
        // a missing file is a real 404; anything else is a page of the app
        if (extname(pathname)) return plain(res, 404, "Not found");
        file = join(DIST, "index.html");
        stats = statSync(file, { throwIfNoEntry: false });
        if (!stats) return plain(res, 503, "The site isn't built yet. Run npm run build, then restart the server.");
    }

    res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": stats.size,
        // files in assets/ get a new name on every build, so browsers can keep them; everything else is rechecked
        "Cache-Control": file.startsWith(ASSETS) ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    // a stream error with no handler would crash the whole server; pipeline catches it and cuts this response off
    pipeline(createReadStream(file), res).catch(() => {
        // the file went away mid-send (a rebuild) or the browser left; nothing more to do
    });
}

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

const api = createApi({
    adminUsername: ADMIN_USERNAME,
    adminPassword: ADMIN_PASSWORD,
    dataDir: DATA_DIR,
    googleSheet: GOOGLE_SHEET_URL && { url: GOOGLE_SHEET_URL, token: GOOGLE_SHEET_TOKEN },
});

const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname === "/api" || pathname.startsWith("/api/")) return api(req, res);
    serveSite(req, res);
});

server.listen(PORT, () => {
    console.log(`Sheehan queue running on http://localhost:${PORT} (admin user: ${ADMIN_USERNAME})`);
    console.log(`Data folder: ${api.dataDir}`);
    if (GOOGLE_SHEET_URL) console.log("Copying the Order sheet to Google Sheets");
});

// close the database cleanly when stopped (Ctrl+C, or the Windows service stopping)
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        server.close();
        api.close();
        process.exit(0);
    });
}
