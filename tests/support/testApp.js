// boots the real API (server/api.js) on a free port with a brand-new database in a temp folder, like Laravel's
// RefreshDatabase: every test starts with an empty queue and just the built-in admin, and nothing is left behind
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mock } from 'node:test';

import { createApi } from '../../server/api.js';
import { DB_FILE } from '../../server/db.js';

export const ADMIN = { username: "admin", password: "admin-test-password" };

// a valid kiosk order; pass any field to change it
export const ticket = (overrides = {}) => ({
    name: "Juan Dela Cruz",
    purpose: "Roofings",
    orders: [{ item: "Long span", qty: 4, color: "red" }],
    ...overrides,
});

const pad2 = (n) => String(n).padStart(2, "0");

// YYYY-MM-DD by the local clock, n days ago, the way the server dates tickets
export const localDay = (daysAgo = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// status and JSON body of one request; assertStatus fails with the server's message, so a wrong status says why
const response = (method, path, status, body) => ({
    status,
    body,
    assertStatus(expected) {
        assert.equal(status, expected, `${method} ${path} answered ${status}${body?.message ? `: ${body.message}` : ""}`);
        return this;
    },
});

// " WHERE a IS ? AND b IS ?", where IS also matches NULL
const whereClause = (conditions) => {
    const keys = Object.keys(conditions);
    return keys.length ? ` WHERE ${keys.map((key) => `${key} IS ?`).join(" AND ")}` : "";
};

export async function bootApp() {
    const dataDir = mkdtempSync(join(tmpdir(), "sheehan-test-"));
    // keep "Database: applied migration ..." out of the test report
    const quiet = mock.method(console, "log", () => {});
    const api = createApi({ adminUsername: ADMIN.username, adminPassword: ADMIN.password, dataDir });
    quiet.mock.restore();

    const server = createServer(api);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    // a second connection to the same database, for the assertDatabase* checks and for data the API can't make
    const db = new DatabaseSync(join(dataDir, DB_FILE));

    // one browser: it keeps its own sign-in cookie, so several can be signed in as different people at once
    const client = () => {
        let cookie = "";
        // bytes (a Buffer) go as they are, with contentType, as the pages send pictures; any other body goes as JSON
        const send = async (method, path, body, contentType = "application/json") => {
            const isBytes = body instanceof Uint8Array;
            const res = await fetch(`${base}/api${path}`, {
                method,
                headers: {
                    // the CSRF header the admin pages send
                    "X-Requested-With": "XMLHttpRequest",
                    ...(body !== undefined && { "Content-Type": contentType }),
                    ...(cookie && { Cookie: cookie }),
                },
                body: body === undefined || isBytes ? body : JSON.stringify(body),
            });
            const setCookie = res.headers.get("set-cookie");
            if (setCookie) cookie = setCookie.split(";")[0];
            // a picture comes back as its bytes
            if (!res.headers.get("content-type")?.includes("json")) {
                const bytes = Buffer.from(await res.arrayBuffer());
                return response(method, path, res.status, bytes.length ? bytes : null);
            }
            const text = await res.text();
            return response(method, path, res.status, text ? JSON.parse(text) : null);
        };
        return {
            get: (path) => send("GET", path),
            post: (path, body = {}) => send("POST", path, body),
            put: (path, body) => send("PUT", path, body),
            patch: (path, body) => send("PATCH", path, body),
            delete: (path) => send("DELETE", path),
            // a file sent as its bytes, e.g. upload("/admin/messages/image", png, "image/png")
            upload: (path, bytes, contentType) => send("POST", path, bytes, contentType),
        };
    };

    // a browser signed in as the built-in admin
    const actingAsAdmin = async () => {
        const browser = client();
        const { body: account } = (await browser.post("/auth/login", ADMIN)).assertStatus(200);
        return Object.assign(browser, { account });
    };

    // a new staff account, made by the admin as in the app, and a browser signed in as it
    const actingAsStaff = async (role, name) => {
        const admin = await actingAsAdmin();
        const credentials = { username: name.toLowerCase().replace(/[^a-z0-9]+/g, "."), password: `${role}-password` };
        (await admin.post("/admin/users", { ...credentials, name, role })).assertStatus(201);
        const browser = client();
        const { body: account } = (await browser.post("/auth/login", credentials)).assertStatus(200);
        return Object.assign(browser, { account });
    };
    const actingAsSales = (name = "Maria Santos") => actingAsStaff("sales", name);
    // someone on the loading crew
    const actingAsLoading = (name = "Pedro Garcia") => actingAsStaff("loading", name);
    // someone in the TBA department (Tire, Battery, Chassis)
    const actingAsTba = (name = "Tony Gulong") => actingAsStaff("tba", name);
    // someone in the Hardware department
    const actingAsHardware = (name = "Ben Martillo") => actingAsStaff("hardware", name);
    // a security guard at the gate
    const actingAsSecurity = (name = "Jose Bantay") => actingAsStaff("security", name);
    // the cashier, who changes how each order is paid
    const actingAsCashier = (name = "Rosa Bayad") => actingAsStaff("cashier", name);
    // someone in the inventory department
    const actingAsInventory = (name = "Ines Bodega") => actingAsStaff("inventory", name);
    // someone on the team that builds the app, who answers staff on the Chat page
    const actingAsDeveloper = (name = "Dev Coder") => actingAsStaff("developer", name);

    const countRows = (table, conditions = {}) =>
        db.prepare(`SELECT COUNT(*) AS n FROM ${table}${whereClause(conditions)}`).get(...Object.values(conditions)).n;

    return {
        db,
        // the temp folder holding this test's queue.db, photos/ and videos/
        dataDir,
        // the full address of an API path, for requests that must skip the client's headers
        url: (path) => `${base}/api${path}`,
        client,
        actingAsAdmin,
        actingAsSales,
        actingAsLoading,
        actingAsTba,
        actingAsHardware,
        actingAsSecurity,
        actingAsCashier,
        actingAsInventory,
        actingAsDeveloper,

        assertDatabaseHas(table, conditions) {
            assert.ok(countRows(table, conditions) > 0, `no row in ${table} matches ${JSON.stringify(conditions)}`);
        },
        assertDatabaseMissing(table, conditions) {
            assert.equal(countRows(table, conditions), 0, `${table} has a row matching ${JSON.stringify(conditions)}`);
        },
        assertDatabaseCount(table, expected, conditions = {}) {
            assert.equal(countRows(table, conditions), expected, `rows in ${table} matching ${JSON.stringify(conditions)}`);
        },

        async close() {
            db.close();
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
            api.close();
            // Windows can hold the database file for a moment after it closes
            rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        },
    };
}
