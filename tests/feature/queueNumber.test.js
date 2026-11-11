// the queue number on the ticket, the display and the counters: the initials of each type of order, then the number
// run: npm test            only these: npm test -- --test-name-pattern="queue number"
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import formatQueueNum, { paperNumber, ticketNumber } from "../../src/data/queueNum.js";
import { callAnnouncement, spokenTicket } from "../../src/sound/sound.js";

describe("queue number", () => {
    test("one type of order gives its initials", () => {
        assert.equal(formatQueueNum(1, "Roofings"), "R 01");
        assert.equal(formatQueueNum(12, "Roofings Accessories"), "RA 12");
    });

    test("several types of order give each one's initials, in the list's order", () => {
        assert.equal(formatQueueNum(3, "Roofings, Tire"), "RT 03");
        assert.equal(formatQueueNum(3, "Roofings Accessories, Steel"), "RAS 03");
        assert.equal(formatQueueNum(3, "Tire, Steel, Hardwares"), "TSH 03");
    });

    test("an order without a type of order falls back to SHN", () => {
        assert.equal(formatQueueNum(5, ""), "SHN 05");
        assert.equal(formatQueueNum(5, undefined), "SHN 05");
    });

    test("the announcer reads the letters one by one, then the number", () => {
        assert.equal(spokenTicket(7, "Roofings, Tire"), "R T, 7");
    });

    test("a pick-up shows the number on its paper and the day it was given; its paper says just the number", () => {
        const juan = { queueNum: 1001, purpose: "Roofings, Steel", pickup: { num: 1, date: "2026-11-11" } };
        assert.equal(ticketNumber(juan), "RS 01 · PICK-UP · Nov 11");
        assert.equal(ticketNumber({ ...juan, priority: true }), "* RS 01 · PICK-UP · Nov 11");
        assert.equal(paperNumber(juan), "RS 01");
        assert.equal(ticketNumber({ queueNum: 1, purpose: "Roofings, Steel" }), "RS 01");
    });

    test("the announcer calls a pick-up by its paper's number and day", () => {
        const call = {
            queueNum: 1001,
            purpose: "Roofings, Steel",
            name: "Juan Dela Cruz",
            remarks: "Please proceed to Window 1",
            pickup: { num: 1, date: "2026-11-11" },
        };
        assert.equal(
            callAnnouncement(call),
            "Now serving pick-up R S, 1, from November 11. Juan Dela Cruz. Please proceed to Window 1.",
        );
    });
});
