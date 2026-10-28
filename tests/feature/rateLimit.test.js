// rate limiting: one computer can't flood the server; past its share it's told 429 Too Many Requests with a
// Retry-After, while every other computer carries on as normal
// run: npm test            only these: npm test -- --test-name-pattern="rate limit"
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import { createRateLimiter } from '../../server/rateLimit.js';
import { ADMIN, bootApp, ticket } from '../support/testApp.js';

let app;

beforeEach(async () => {
    app = await bootApp();
    // keep the "Rate limit ..." warnings out of the test report
    mock.method(console, "warn", () => {});
});

afterEach(async () => {
    mock.restoreAll();
    await app.close();
});

// a request from the computer at `ip`, as nginx passes it on: the tests' own requests come from 127.0.0.1
const from = (ip, method, path, body) => fetch(app.url(path), {
    method,
    headers: {
        "X-Forwarded-For": ip,
        "X-Requested-With": "XMLHttpRequest",
        ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
});

// n requests one after another; the status of each
const repeat = async (n, request) => {
    const statuses = [];
    for (let i = 0; i < n; i++) statuses.push((await request()).status);
    return statuses;
};

describe("rate limit", () => {
    test("a computer that sends too many requests is told to wait, and others are not", async () => {
        const statuses = await repeat(300, () => from("192.168.1.20", "GET", "/queue"));
        assert.ok(statuses.every((s) => s === 200));

        const blocked = await from("192.168.1.20", "GET", "/queue");
        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers.get("retry-after")) > 0);
        assert.match((await blocked.json()).message, /Too many requests/);

        assert.equal((await from("192.168.1.21", "GET", "/queue")).status, 200);
    });

    test("too many new tickets from one computer are refused, and none of them are saved", async () => {
        const statuses = await repeat(31, () => from("192.168.1.30", "POST", "/orders", ticket()));
        assert.deepEqual(statuses.slice(0, 30), Array(30).fill(201));
        assert.equal(statuses[30], 429);
        app.assertDatabaseCount("orders", 30);

        assert.equal((await from("192.168.1.31", "POST", "/orders", ticket())).status, 201);
    });

    test("after too many wrong passwords even the right one has to wait", async () => {
        const wrong = { username: ADMIN.username, password: "not-the-password" };
        const statuses = await repeat(10, () => from("192.168.1.40", "POST", "/auth/login", wrong));
        assert.ok(statuses.every((s) => s === 401));

        const blocked = await from("192.168.1.40", "POST", "/auth/login", ADMIN);
        assert.equal(blocked.status, 429);
        assert.match((await blocked.json()).message, /Too many attempts/);

        // the guesser's computer is the one that waits: the admin signs in from their own
        assert.equal((await from("192.168.1.41", "POST", "/auth/login", ADMIN)).status, 200);
    });

    test("signing in correctly doesn't count against the computer", async () => {
        const statuses = await repeat(12, () => from("192.168.1.50", "POST", "/auth/login", ADMIN));
        assert.ok(statuses.every((s) => s === 200));
    });

    test("the browser's own X-Forwarded-For entries are ignored: only the last, nginx's, counts", async () => {
        await repeat(300, () => from("192.168.1.60", "GET", "/queue"));
        // a client claiming to be someone else, with nginx adding its real address at the end
        assert.equal((await from("10.0.0.99, 192.168.1.60", "GET", "/queue")).status, 429);
    });
});

describe("rate limiter", () => {
    test("allows the limit in each window, then again once the window is over", () => {
        let time = 0;
        const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });
        assert.equal(limiter.hit("a"), 0);
        assert.equal(limiter.hit("a"), 0);
        assert.equal(limiter.retryAfter("a"), 1000);
        time = 400;
        assert.equal(limiter.hit("a"), 600);
        time = 1000;
        assert.equal(limiter.retryAfter("a"), 0);
        assert.equal(limiter.hit("a"), 0);
    });

    test("tells onLimit once per window when a key goes over", () => {
        const over = [];
        const limiter = createRateLimiter({ limit: 1, windowMs: 1000, onLimit: (key) => over.push(key), now: () => 0 });
        limiter.hit("a");
        limiter.hit("a");
        limiter.hit("a");
        assert.deepEqual(over, ["a"]);
    });
});
