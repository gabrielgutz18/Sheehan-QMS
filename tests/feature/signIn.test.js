// staying signed in, like Facebook: a sign-in lasts until Sign out, a week without using the app, or 30 days after
// signing in; a new tab, or the browser opened again, carries on as the browser's last sign-in
// run: npm test            only these: npm test -- --test-name-pattern="signed in"
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { ADMIN, bootApp } from '../support/testApp.js';

const DAY = 24 * 60 * 60 * 1000;
// two browser tabs' ids, as src/api/http.js makes them
const TAB_A = "a".repeat(32);
const TAB_B = "b".repeat(32);

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(async () => {
    await app.close();
});

// one request from a browser tab holding `cookies`; gives the status, the body and the cookies it was sent back,
// as { name: { value, maxAge } } (maxAge undefined for one that ends when the browser closes)
const request = async (method, path, { tab, cookies = {}, body } = {}) => {
    const res = await fetch(app.url(path), {
        method,
        headers: {
            "X-Requested-With": "XMLHttpRequest",
            ...(tab && { "X-Tab-Id": tab }),
            ...(body !== undefined && { "Content-Type": "application/json" }),
            Cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; "),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = Object.fromEntries(res.headers.getSetCookie().map((line) => {
        const [pair, ...flags] = line.split(/;\s*/);
        const maxAge = flags.find((flag) => flag.startsWith("Max-Age="));
        return [pair.slice(0, pair.indexOf("=")), { value: pair.slice(pair.indexOf("=") + 1), maxAge: maxAge && Number(maxAge.slice(8)) }];
    }));
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, set };
};

// tab A signs in as the admin: the browser's cookies afterwards
const signInOnTabA = async () => {
    const { status, set } = await request("POST", "/auth/login", { tab: TAB_A, body: ADMIN });
    assert.equal(status, 200);
    return { [`sid_${TAB_A}`]: set[`sid_${TAB_A}`].value, sid_kept: set.sid_kept.value };
};

const sessionRow = (sid) =>
    app.db.prepare("SELECT expires, created_at FROM sessions WHERE sid_hash = ?").get(createHash("sha256").update(sid).digest("hex"));

describe("staying signed in", () => {
    test("signing in keeps the browser signed in after it closes, for up to 30 days", async () => {
        const before = Date.now();
        const { set } = await request("POST", "/auth/login", { tab: TAB_A, body: ADMIN });

        // the tab's own cookie ends with the browser; the kept one doesn't
        assert.equal(set[`sid_${TAB_A}`].maxAge, undefined);
        assert.equal(set.sid_kept.maxAge, 30 * 24 * 60 * 60);
        assert.equal(set.sid_kept.value, set[`sid_${TAB_A}`].value);

        const row = sessionRow(set.sid_kept.value);
        assert.ok(row.created_at >= before && row.created_at <= Date.now());
        assert.ok(Math.abs(row.expires - (row.created_at + 7 * DAY)) < 1000, "a week from signing in");
    });

    test("a new tab, or the browser opened again, carries on signed in as the browser's last sign-in", async () => {
        const { sid_kept } = await signInOnTabA();

        // tab B has only the kept cookie: it's signed in, and gets a cookie of its own for the same sign-in
        const me = await request("GET", "/auth/me", { tab: TAB_B, cookies: { sid_kept } });
        assert.equal(me.status, 200);
        assert.equal(me.body.username, ADMIN.username);
        assert.equal(me.set[`sid_${TAB_B}`].value, sid_kept);

        // and works with it from then on
        const users = await request("GET", "/admin/users", { tab: TAB_B, cookies: { [`sid_${TAB_B}`]: sid_kept } });
        assert.equal(users.status, 200);
    });

    test("with nothing kept, a new tab starts signed out", async () => {
        const me = await request("GET", "/auth/me", { tab: TAB_B });
        assert.equal(me.status, 401);
        assert.equal(me.set[`sid_${TAB_B}`], undefined);
    });

    test("a tab only picks the kept sign-in up again if it's still the same person", async () => {
        const { sid_kept } = await signInOnTabA();
        const { body: admin } = await request("GET", "/auth/me", { tab: TAB_A, cookies: { sid_kept } });

        assert.equal((await request("GET", `/auth/me?as=${admin.id}`, { tab: TAB_B, cookies: { sid_kept } })).status, 200);
        const someoneElse = await request("GET", `/auth/me?as=${admin.id + 1}`, { tab: TAB_B, cookies: { sid_kept } });
        assert.equal(someoneElse.status, 401);
        assert.equal(someoneElse.set[`sid_${TAB_B}`], undefined);
    });

    test("using the app starts the week over, but never past 30 days from signing in", async () => {
        const cookies = await signInOnTabA();
        const sid = cookies.sid_kept;
        const hash = createHash("sha256").update(sid).digest("hex");

        // last used 6 days ago: one more day to go, until it's used again
        app.db.prepare("UPDATE sessions SET expires = ? WHERE sid_hash = ?").run(Date.now() + DAY, hash);
        assert.equal((await request("GET", "/auth/me", { tab: TAB_A, cookies })).status, 200);
        assert.ok(sessionRow(sid).expires > Date.now() + 6.9 * DAY, "a full week again");

        // signed in 29 days ago: a week from now would be past the 30 days, so it ends at the 30 days instead
        const signedIn = Date.now() - 29 * DAY;
        app.db.prepare("UPDATE sessions SET created_at = ?, expires = ? WHERE sid_hash = ?").run(signedIn, Date.now() + 1000, hash);
        assert.equal((await request("GET", "/auth/me", { tab: TAB_A, cookies })).status, 200);
        assert.equal(sessionRow(sid).expires, signedIn + 30 * DAY);
    });

    test("a sign-in left unused for the week ends, and a new tab can't pick it up either", async () => {
        const cookies = await signInOnTabA();
        const hash = createHash("sha256").update(cookies.sid_kept).digest("hex");
        app.db.prepare("UPDATE sessions SET expires = ? WHERE sid_hash = ?").run(Date.now() - 1, hash);

        assert.equal((await request("GET", "/auth/me", { tab: TAB_A, cookies })).status, 401);
        assert.equal((await request("GET", "/auth/me", { tab: TAB_B, cookies: { sid_kept: cookies.sid_kept } })).status, 401);
    });

    test("Sign out signs out every tab carrying on as that sign-in, and the browser stops keeping it", async () => {
        const cookies = await signInOnTabA();
        const { sid_kept } = cookies;
        await request("GET", "/auth/me", { tab: TAB_B, cookies: { sid_kept } });

        const out = await request("POST", "/auth/logout", { tab: TAB_A, cookies });
        assert.equal(out.status, 204);
        assert.equal(out.set[`sid_${TAB_A}`].maxAge, 0);
        assert.equal(out.set.sid_kept.maxAge, 0);

        assert.equal((await request("GET", "/auth/me", { tab: TAB_B, cookies: { [`sid_${TAB_B}`]: sid_kept } })).status, 401);
    });

    test("cookies for sign-ins that have ended are dropped, so the browser stops sending them", async () => {
        const { sid_kept } = await signInOnTabA();
        const ended = "c".repeat(64);

        const me = await request("GET", "/auth/me", { tab: TAB_B, cookies: { sid_kept, [`sid_${"d".repeat(32)}`]: ended } });
        assert.equal(me.status, 200);
        assert.equal(me.set[`sid_${"d".repeat(32)}`].maxAge, 0);
        assert.equal(me.set.sid_kept, undefined);
    });

    test("with too many tabs' cookies, the oldest tabs sharing the sign-in give theirs up", async () => {
        const { sid_kept } = await signInOnTabA();
        // 20 tabs already carrying on as it, the oldest first, as the browser sends them
        const tabs = Array.from({ length: 20 }, (_, i) => `sid_${i.toString(16).padStart(32, "0")}`);
        const cookies = { sid_kept, ...Object.fromEntries(tabs.map((name) => [name, sid_kept])) };

        const me = await request("GET", "/auth/me", { tab: TAB_B, cookies });
        assert.equal(me.status, 200);
        assert.equal(me.set[tabs[0]].maxAge, 0);
        assert.equal(me.set[tabs[1]], undefined);
        assert.equal(me.set[`sid_${TAB_B}`].value, sid_kept);
    });
});
