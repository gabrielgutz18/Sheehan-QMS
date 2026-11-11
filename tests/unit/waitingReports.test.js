// the developers' Dashboard's Staff concerns: only the reports still Open or In progress count, by status and by kind,
// with the newest few first; and how long ago each was sent, as Reports on Staff concerns says it
// run: node --test tests/unit/waitingReports.test.js
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { reportAge } from "../../src/admin/data/lastSeen.js";
import { waitingReports } from "../../src/admin/data/waitingReports.js";

// a report as listConcerns gives it, with only what the panel reads
const report = (id, kind, status, createdAt) => ({ id, kind, status, createdAt, staff: { id: 1, name: "Crew" } });

describe("waiting reports", () => {
    const reports = [
        report(1, "bug", "open", "2026-11-10T08:00:00.000Z"),
        report(2, "concern", "in_progress", "2026-11-10T09:00:00.000Z"),
        report(3, "feature", "done", "2026-11-10T10:00:00.000Z"),
        report(4, "bug", "declined", "2026-11-10T11:00:00.000Z"),
        report(5, "bug", "open", "2026-11-10T12:00:00.000Z"),
    ];

    test("counts only Open and In progress, by status and by kind", () => {
        const waiting = waitingReports(reports);
        assert.equal(waiting.open, 2);
        assert.equal(waiting.inProgress, 1);
        assert.deepEqual(waiting.byKind, { bug: 2, concern: 1, feature: 0 });
    });

    test("lists the newest waiting first, as many as asked for", () => {
        assert.deepEqual(
            waitingReports(reports).newest.map((r) => r.id),
            [5, 2, 1],
        );
        assert.deepEqual(
            waitingReports(reports, 2).newest.map((r) => r.id),
            [5, 2],
        );
    });

    test("sent the same moment, the later report comes first", () => {
        const same = "2026-11-10T08:00:00.000Z";
        const waiting = waitingReports([report(7, "bug", "open", same), report(8, "bug", "open", same)]);
        assert.deepEqual(
            waiting.newest.map((r) => r.id),
            [8, 7],
        );
    });

    test("with nothing waiting, every count is nought", () => {
        const waiting = waitingReports([report(3, "feature", "done", "2026-11-10T10:00:00.000Z")]);
        assert.deepEqual(waiting, { open: 0, inProgress: 0, byKind: { bug: 0, concern: 0, feature: 0 }, newest: [] });
    });
});

describe("report age", () => {
    const sent = "2026-11-10T08:00:00.000Z";
    const at = (minutes) => new Date(sent).getTime() + minutes * 60 * 1000;

    test("says now, minutes, hours or days", () => {
        assert.equal(reportAge(sent, at(0.5)), "now");
        assert.equal(reportAge(sent, at(5)), "5m");
        assert.equal(reportAge(sent, at(3 * 60 + 10)), "3h");
        assert.equal(reportAge(sent, at(2 * 24 * 60 + 1)), "2d");
    });
});
