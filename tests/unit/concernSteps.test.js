// the guided chat on Message developer: each kind of report asks its questions in order, takes only answers from its
// lists, and ends with what POST /admin/concerns takes
// run: node --test tests/unit/concernSteps.test.js
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
    answerConcern,
    concernPayload,
    concernQuestion,
    concernTranscript,
    skipConcern,
    startConcern,
} from "../../src/admin/components/chat/concernSteps.js";
import { concernSummary, statusSentence } from "../../src/data/concerns.js";

// every answer in turn, from a new draft
const answerAll = (draft, answers) => answers.reduce(answerConcern, draft);

describe("concern steps", () => {
    test("a bug asks for the page from the person's own sidebar, then what happened, how bad, and a screenshot", () => {
        let draft = startConcern("bug", { pages: ["Dashboard", "Loading"] });

        const page = concernQuestion(draft);
        assert.equal(page.question, "Which page were you on?");
        assert.deepEqual(
            page.choices.map((c) => c.label),
            ["Dashboard", "Loading", "Other"],
        );

        draft = answerAll(draft, ["Loading", "  Start does nothing  ", "blocking"]);
        assert.equal(concernQuestion(draft).picture, true);
        draft = skipConcern(draft);

        assert.equal(concernQuestion(draft), null);
        assert.deepEqual(concernPayload(draft), {
            kind: "bug",
            area: "Loading",
            details: "Start does nothing",
            extra: "",
            impact: "blocking",
        });
        assert.equal(draft.answers.screenshot, undefined);
    });

    test("a bug's screenshot is kept to send after the report", () => {
        const picture = { size: 10 };
        const draft = answerAll(startConcern("bug", { pages: [] }), ["Other", "Blank page", "minor", picture]);

        assert.equal(concernQuestion(draft), null);
        assert.equal(draft.answers.screenshot, picture);
        assert.deepEqual(concernTranscript(draft).at(-1), { from: "me", text: "Screenshot attached." });
    });

    test("a system concern picks its topic, and a feature is filed under the person's department", () => {
        const concern = answerAll(startConcern("concern"), ["printing", "Receipts are blank.", "slow"]);
        assert.equal(concernQuestion(concern), null);
        assert.deepEqual(concernPayload(concern), {
            kind: "concern",
            area: "printing",
            details: "Receipts are blank.",
            extra: "",
            impact: "slow",
        });

        let feature = startConcern("feature", { area: "Roofings" });
        assert.equal(concernQuestion(feature).question, "What would you like the system to do?");
        feature = answerAll(feature, ["A pick list.", "Less walking.", "high"]);
        assert.deepEqual(concernPayload(feature), {
            kind: "feature",
            area: "Roofings",
            details: "A pick list.",
            extra: "Less walking.",
            impact: "high",
        });
    });

    test("blank words, a choice off the list and a skip before the screenshot leave the draft where it is", () => {
        const draft = startConcern("concern");

        assert.equal(answerConcern(draft, "coffee"), draft);
        const typed = answerConcern(draft, "speed");
        assert.equal(answerConcern(typed, "   "), typed);
        assert.equal(skipConcern(typed), typed);
        // once every question is answered, there's nothing left to answer
        const finished = answerAll(draft, ["speed", "Slow.", "minor"]);
        assert.equal(answerConcern(finished, "more"), finished);
        // the screenshot needs a picture
        const atPicture = answerAll(startConcern("bug"), ["Other", "Blank.", "minor"]);
        assert.equal(answerConcern(atPicture, null), atPicture);
    });

    test("the transcript shows each question with the answer's words, then the question being asked", () => {
        const draft = answerAll(startConcern("concern"), ["sheet", "Rows are missing."]);

        assert.deepEqual(concernTranscript(draft), [
            { from: "bot", text: "What is it about?" },
            { from: "me", text: "Google sheet" },
            { from: "bot", text: "Tell us more." },
            { from: "me", text: "Rows are missing." },
            { from: "bot", text: "How bad is it?" },
        ]);
    });

    test("a report's summary line and the bot's status sentences", () => {
        assert.equal(
            concernSummary({ kind: "concern", area: "signin", impact: "blocking", details: "Locked out." }),
            "Concern · Sign-in · Can't work: Locked out.",
        );
        const long = concernSummary({ kind: "bug", area: "Loading", impact: "minor", details: "x".repeat(200) });
        assert.ok(long.endsWith("…"));
        assert.ok(long.length < 160);

        assert.equal(statusSentence({ id: 3, status: "declined", note: "", by: "Mark" }), "Report #3 was declined.");
        assert.equal(
            statusSentence({ id: 3, status: "in_progress", note: "Looking.", by: "Mark" }),
            'Report #3 is now In progress (Mark is on it): "Looking."',
        );
    });
});
