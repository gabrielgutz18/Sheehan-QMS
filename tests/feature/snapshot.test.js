// npm run snapshot / seed:snapshot: carry the app's current state to another computer
// run: npm test            only these: npm test -- --test-name-pattern="snapshot"
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import { loadSnapshot, saveSnapshot } from '../../server/snapshot.js';
import { bootApp, localDay, ticket } from '../support/testApp.js';

let office;
let home;
let folder;

beforeEach(async () => {
    office = await bootApp();
    home = await bootApp();
    folder = mkdtempSync(join(tmpdir(), "sheehan-snapshot-"));
});

afterEach(async () => {
    await office.close();
    await home.close();
    rmSync(folder, { recursive: true, force: true });
});

// the loader prints "Database: applied migration ..." the first time; keep it out of the report
const quietly = (fn) => {
    const log = mock.method(console, "log", () => {});
    try {
        return fn();
    } finally {
        log.mock.restore();
    }
};

// a day at the office: a sales account with a photo, an order served and a customer report waiting
const officeDay = async () => {
    const maria = await office.actingAsSales();
    writeFileSync(join(office.dataDir, "photos", "maria.jpg"), "photo bytes");
    office.db.prepare("UPDATE users SET photo = 'maria.jpg' WHERE id = ?").run(maria.account.id);
    const kiosk = office.client();
    await kiosk.post("/orders", ticket());
    await kiosk.post("/orders", { name: "Ana Reyes", purpose: "Customer Report", orders: [], concern: "Leaking roof" });
    await maria.post("/admin/orders/1/call");
    await maria.patch("/admin/orders/1", { status: "done" });
    return maria;
};

describe("snapshot", () => {
    test("a snapshot carries staff, tickets, concerns, points and photos to another computer", async () => {
        const maria = await officeDay();
        const file = join(folder, "snapshot.json");

        saveSnapshot(office.dataDir, file);
        quietly(() => loadSnapshot(home.dataDir, file));
        // nobody is signed in at home from the office
        home.assertDatabaseCount("sessions", 0);

        // staff keep their passwords
        const signedIn = home.client();
        (await signedIn.post("/auth/login", { username: "maria.santos", password: "sales-password" })).assertStatus(200);
        const admin = await home.actingAsAdmin();

        const [served, report] = (await admin.get("/admin/orders")).assertStatus(200).body;
        assert.equal(served.status, "done");
        assert.equal(served.servedBy.id, maria.account.id);
        assert.equal(report.concern, "Leaking roof");
        home.assertDatabaseCount("serves", 1, { user_id: maria.account.id });
        assert.equal(readFileSync(join(home.dataDir, "photos", "maria.jpg"), "utf8"), "photo bytes");
    });

    test("the snapshot's day becomes today, so its queue is today's queue", async () => {
        await officeDay();
        const file = join(folder, "snapshot.json");
        saveSnapshot(office.dataDir, file);
        // pretend it was taken two days ago, with its tickets from that day
        const snapshot = JSON.parse(readFileSync(file, "utf8"));
        const twoDaysAgo = localDay(2);
        snapshot.takenOn = twoDaysAgo;
        for (const row of [...snapshot.tables.orders, ...snapshot.tables.serves, ...snapshot.tables.queue_counters]) {
            row.queue_date = twoDaysAgo;
        }
        writeFileSync(file, JSON.stringify(snapshot));

        const { days } = quietly(() => loadSnapshot(home.dataDir, file));

        assert.equal(days, 2);
        const admin = await home.actingAsAdmin();
        assert.equal((await admin.get("/admin/orders")).body.length, 2);
        assert.equal((await home.client().post("/orders", ticket())).body.queueNum, 3);
    });

    test("--keep-dates leaves the tickets on their real day, in History", async () => {
        await officeDay();
        const file = join(folder, "snapshot.json");
        saveSnapshot(office.dataDir, file);
        const snapshot = JSON.parse(readFileSync(file, "utf8"));
        snapshot.takenOn = localDay(1);
        for (const row of snapshot.tables.orders) row.queue_date = localDay(1);
        writeFileSync(file, JSON.stringify(snapshot));

        quietly(() => loadSnapshot(home.dataDir, file, { keepDates: true }));

        const admin = await home.actingAsAdmin();
        assert.deepEqual((await admin.get("/admin/orders")).body, []);
        assert.equal((await admin.get(`/admin/history?day=${localDay(1)}`)).body.length, 2);
    });

    test("it won't overwrite a database with data unless asked, and backs it up first", async () => {
        await officeDay();
        const file = join(folder, "snapshot.json");
        saveSnapshot(office.dataDir, file);
        await home.client().post("/orders", ticket({ name: "Home test" }));

        assert.throws(() => quietly(() => loadSnapshot(home.dataDir, file)), /--replace/);
        home.assertDatabaseHas("orders", { name: "Home test" });

        const { backup } = quietly(() => loadSnapshot(home.dataDir, file, { replace: true }));

        assert.ok(existsSync(join(backup, "queue.db")));
        home.assertDatabaseMissing("orders", { name: "Home test" });
        home.assertDatabaseHas("orders", { name: "Ana Reyes" });
    });

    test("a snapshot from before several invoices per ticket keeps each ticket's invoice number", async () => {
        await office.client().post("/orders", {
            name: "Juan Dela Cruz", purpose: "Roofings", orders: [], invoices: [{ invoiceNo: "43355521", type: "Roofings" }],
        });
        const file = join(folder, "snapshot.json");
        saveSnapshot(office.dataDir, file);
        // as an older copy of the app saved it: the invoice number on the ticket itself
        const snapshot = JSON.parse(readFileSync(file, "utf8"));
        const [invoice] = snapshot.tables.order_invoices;
        delete snapshot.tables.order_invoices;
        snapshot.tables.orders[0].invoice_no = invoice.invoice_no;
        snapshot.migrations = snapshot.migrations.filter((name) => name !== "011_order_invoices.sql");
        writeFileSync(file, JSON.stringify(snapshot));

        quietly(() => loadSnapshot(home.dataDir, file));

        home.assertDatabaseHas("order_invoices", { position: 0, invoice_no: "43355521", type: "Roofings" });
        home.assertDatabaseCount("order_invoices", 1);
    });
});
