// concern reports: staff tap Report a bug, System concern or Feature for my department on Message developer, answer
// the bot's few questions, and the answers reach the developers as one report; a developer moves it along (In
// progress, Done, Declined, reopened) from the Chat page, and each change comes back to the staff member as a message
// run: npm test            only these: npm test -- --test-name-pattern="concern reports"
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { bootApp } from "../support/testApp.js";

let app;

beforeEach(async () => {
    app = await bootApp();
});

afterEach(() => app.close());

const bug = (overrides = {}) => ({
    kind: "bug",
    area: "Loading",
    details: "I pressed Start and nothing happened.",
    impact: "blocking",
    ...overrides,
});

describe("concern reports", () => {
    test("a bug report reaches the developers as one card message, with its details", async () => {
        const loading = await app.actingAsLoading();

        const card = (await loading.post("/admin/concerns", bug())).assertStatus(201).body;

        assert.equal(card.kind, "report");
        assert.equal(card.fromStaff, true);
        assert.equal(card.body, "Bug · Loading · Can't work: I pressed Start and nothing happened.");
        assert.deepEqual(card.concern, {
            id: card.concern.id,
            kind: "bug",
            area: "Loading",
            details: "I pressed Start and nothing happened.",
            extra: "",
            impact: "blocking",
            status: "open",
            statusNote: "",
        });
        app.assertDatabaseHas("concerns", { staff_id: loading.account.id, kind: "bug", status: "open" });
        app.assertDatabaseHas("messages", { id: card.id, kind: "report", concern_id: card.concern.id });

        // it's in their own conversation, like any message
        const thread = (await loading.get("/admin/messages")).assertStatus(200).body;
        assert.deepEqual(
            thread.map((m) => m.kind),
            ["report"],
        );
    });

    test("a system concern keeps its topic, and a feature takes the department from the account", async () => {
        const cashier = await app.actingAsCashier();
        (
            await cashier.patch("/admin/me", { firstName: "Rosa", surname: "Bayad", department: "Accounting" })
        ).assertStatus(200);

        const concern = (
            await cashier.post("/admin/concerns", {
                kind: "concern",
                area: "printing",
                details: "Receipts come out blank.",
                impact: "slow",
            })
        ).assertStatus(201).body;
        assert.equal(concern.body, "Concern · Printing · Slows me down: Receipts come out blank.");
        assert.equal(concern.concern.area, "printing");

        const feature = (
            await cashier.post("/admin/concerns", {
                kind: "feature",
                area: "Anything typed here",
                details: "Show today's total.",
                extra: "I count it by hand.",
                impact: "high",
            })
        ).assertStatus(201).body;
        assert.equal(feature.concern.area, "Accounting");
        assert.equal(feature.concern.extra, "I count it by hand.");
        assert.equal(feature.body, "Feature · Accounting · A lot: Show today's total.");
    });

    test("a feature from an account with no department is filed under its role", async () => {
        const hardware = await app.actingAsHardware();

        const feature = (
            await hardware.post("/admin/concerns", {
                kind: "feature",
                details: "Print a pick list.",
                extra: "Saves walking back.",
                impact: "medium",
            })
        ).assertStatus(201).body;

        assert.equal(feature.concern.area, "Hardware");
    });

    test("a report missing an answer, or with one off the lists, is refused and nothing is saved", async () => {
        const sales = await app.actingAsSales();

        for (const body of [
            bug({ kind: "wish" }),
            bug({ impact: "high" }),
            bug({ area: "" }),
            bug({ area: "x".repeat(61) }),
            bug({ details: "   " }),
            bug({ details: "x".repeat(1001) }),
            { kind: "concern", area: "coffee", details: "Too hot.", impact: "minor" },
            { kind: "feature", details: "A dark mode.", impact: "low" },
            { kind: "feature", details: "A dark mode.", extra: "x".repeat(1001), impact: "low" },
        ]) {
            (await sales.post("/admin/concerns", body)).assertStatus(400);
        }
        app.assertDatabaseCount("concerns", 0);
        app.assertDatabaseCount("messages", 0);
    });

    test("developers can't send a report, and only developers list or change them", async () => {
        const sales = await app.actingAsSales();
        const admin = await app.actingAsAdmin();
        const developer = await app.actingAsDeveloper();
        const { concern } = (await sales.post("/admin/concerns", bug())).assertStatus(201).body;

        (await developer.post("/admin/concerns", bug())).assertStatus(403);
        for (const browser of [sales, admin]) {
            (await browser.get("/admin/concerns")).assertStatus(403);
            (await browser.patch(`/admin/concerns/${concern.id}`, { status: "done" })).assertStatus(403);
        }
        // an admin reports like everyone else on Message developer
        (await admin.post("/admin/concerns", bug())).assertStatus(201);
    });

    test("a developer's status change is saved with its note and comes back to the staff member as a message", async () => {
        const loading = await app.actingAsLoading();
        const developer = await app.actingAsDeveloper("Mark Dev");
        const { concern } = (await loading.post("/admin/concerns", bug())).assertStatus(201).body;

        const working = (
            await developer.patch(`/admin/concerns/${concern.id}`, { status: "in_progress" })
        ).assertStatus(200).body;
        assert.equal(working.concern.status, "in_progress");
        assert.deepEqual(working.concern.statusBy, { id: developer.account.id, name: "Mark Dev" });
        assert.equal(working.message.kind, "status");
        assert.equal(working.message.fromStaff, false);
        assert.equal(working.message.body, `Report #${concern.id} is now In progress (Mark Dev is on it).`);

        const done = (
            await developer.patch(`/admin/concerns/${concern.id}`, {
                status: "done",
                note: "  Fixed it, refresh the page.  ",
            })
        ).assertStatus(200).body;
        assert.equal(done.message.body, `Report #${concern.id} is Done: "Fixed it, refresh the page."`);
        app.assertDatabaseHas("concerns", {
            id: concern.id,
            status: "done",
            status_note: "Fixed it, refresh the page.",
            status_by: developer.account.id,
        });

        // the card in the thread shows where it stands now
        const thread = (await loading.get("/admin/messages")).assertStatus(200).body;
        assert.deepEqual(
            thread.map((m) => m.kind),
            ["report", "status", "status"],
        );
        assert.equal(thread[0].concern.status, "done");
        assert.equal(thread[0].concern.statusNote, "Fixed it, refresh the page.");
        assert.equal(thread[2].concern.id, concern.id);
    });

    test("asking for the status a report already has is a 409, and a Done or Declined one can be reopened", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();
        const { concern } = (await sales.post("/admin/concerns", bug())).assertStatus(201).body;

        (await developer.patch(`/admin/concerns/${concern.id}`, { status: "open" })).assertStatus(409);
        (
            await developer.patch(`/admin/concerns/${concern.id}`, {
                status: "declined",
                note: "Already on the History tab.",
            })
        ).assertStatus(200);
        (await developer.patch(`/admin/concerns/${concern.id}`, { status: "declined" })).assertStatus(409);

        const reopened = (await developer.patch(`/admin/concerns/${concern.id}`, { status: "open" })).assertStatus(
            200,
        ).body;
        assert.equal(reopened.message.body, `Report #${concern.id} was reopened.`);
        assert.equal(reopened.concern.status, "open");
        assert.equal(reopened.concern.statusNote, "");
        app.assertDatabaseCount("messages", 2, { kind: "status" });
    });

    test("a status change with a bad status, a long note or an unknown report is refused", async () => {
        const sales = await app.actingAsSales();
        const developer = await app.actingAsDeveloper();
        const { concern } = (await sales.post("/admin/concerns", bug())).assertStatus(201).body;

        (await developer.patch(`/admin/concerns/${concern.id}`, { status: "fixed" })).assertStatus(400);
        (
            await developer.patch(`/admin/concerns/${concern.id}`, { status: "done", note: "x".repeat(1001) })
        ).assertStatus(400);
        (await developer.patch("/admin/concerns/999", { status: "done" })).assertStatus(404);
        app.assertDatabaseHas("concerns", { id: concern.id, status: "open" });
        app.assertDatabaseCount("messages", 0, { kind: "status" });
    });

    test("a new report is unread for the developers, and a status change is unread for the staff member", async () => {
        const loading = await app.actingAsLoading();
        const developer = await app.actingAsDeveloper();
        const { concern } = (await loading.post("/admin/concerns", bug())).assertStatus(201).body;

        const [chat] = (await developer.get("/admin/chats")).assertStatus(200).body;
        assert.equal(chat.unread, 1);
        assert.equal(chat.last.body, "Bug · Loading · Can't work: I pressed Start and nothing happened.");
        const [popup] = (await developer.get("/admin/unread-messages")).assertStatus(200).body;
        assert.equal(popup.kind, "staff");

        (await developer.patch(`/admin/concerns/${concern.id}`, { status: "in_progress" })).assertStatus(200);
        const [answer] = (await loading.get("/admin/unread-messages")).assertStatus(200).body;
        assert.equal(answer.kind, "developer");
        assert.equal(answer.body, `Report #${concern.id} is now In progress (Dev Coder is on it).`);
    });

    test("the Reports list is newest first, with who sent each, and filters by kind, status and department", async () => {
        const loading = await app.actingAsLoading();
        const cashier = await app.actingAsCashier();
        (
            await cashier.patch("/admin/me", { firstName: "Rosa", surname: "Bayad", department: "Accounting" })
        ).assertStatus(200);
        const developer = await app.actingAsDeveloper();

        const first = (await loading.post("/admin/concerns", bug())).assertStatus(201).body.concern;
        const second = (
            await cashier.post("/admin/concerns", {
                kind: "concern",
                area: "speed",
                details: "Payments take a minute.",
                impact: "slow",
            })
        ).assertStatus(201).body.concern;
        (await developer.patch(`/admin/concerns/${first.id}`, { status: "done" })).assertStatus(200);

        const all = (await developer.get("/admin/concerns")).assertStatus(200).body;
        assert.deepEqual(
            all.map((c) => c.id),
            [second.id, first.id],
        );
        assert.equal(all[0].staff.name, "Rosa Bayad");
        assert.equal(all[0].staff.department, "Accounting");
        assert.equal(all[0].staff.disabled, false);
        assert.equal(all[0].statusBy, null);
        assert.equal(all[1].statusBy.id, developer.account.id);
        assert.equal(typeof all[1].createdAt, "string");

        const ids = async (query) =>
            (await developer.get(`/admin/concerns?${query}`)).assertStatus(200).body.map((c) => c.id);
        assert.deepEqual(await ids("kind=bug"), [first.id]);
        assert.deepEqual(await ids("status=open"), [second.id]);
        assert.deepEqual(await ids("status=open,in_progress"), [second.id]);
        assert.deepEqual(await ids("department=Accounting"), [second.id]);
        assert.deepEqual(await ids("kind=feature"), []);

        for (const query of ["kind=wish", "status=fixed", "status=open,fixed"]) {
            (await developer.get(`/admin/concerns?${query}`)).assertStatus(400);
        }
    });

    test("plain messages still say they're text, with no report", async () => {
        const sales = await app.actingAsSales();

        const sent = (await sales.post("/admin/messages", { body: "Hello." })).assertStatus(201).body;

        assert.equal(sent.kind, "text");
        assert.equal(sent.concern, null);
    });
});
