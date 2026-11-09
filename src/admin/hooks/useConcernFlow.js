import { useState } from "react";

import { sendMyImage } from "../api/chatController.js";
import { sendConcern } from "../api/concernController.js";
import {
    answerConcern,
    concernPayload,
    concernQuestion,
    skipConcern,
    startConcern,
} from "../components/chat/concernSteps.js";

// the guided chat on Message developer: one report being answered in the browser, then sent as one report, with its
// screenshot after it; pages: the person's own sidebar pages (a bug's first question); area: their department, or
// their role, for a feature; sent(message): each message the server gives back, shown in the thread straight away
/** @param {{ pages: string[], area: string, sent: (message: any) => void }} options */
export default function useConcernFlow({ pages, area, sent }) {
    // the report being answered (see concernSteps.js), or null while no flow is running
    const [draft, setDraft] = useState(
        /** @type {import('../components/chat/concernSteps.js').ConcernDraft | null} */ (null),
    );
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const question = draft && concernQuestion(draft);

    const start = (kind) => {
        setError("");
        setDraft(startConcern(kind, { pages, area }));
    };
    // Cancel throws the draft away; nothing of it has reached the server
    const cancel = () => {
        setError("");
        setDraft(null);
    };
    const answer = (value) => setDraft((d) => d && answerConcern(d, value));
    const skip = () => setDraft((d) => d && skipConcern(d));

    // Send report: the report and its card first, then the screenshot as a picture in the chat; a failed send keeps
    // the answers so it can be pressed again
    const send = async () => {
        if (!draft || question || sending) return;
        setSending(true);
        setError("");
        let card = null;
        try {
            card = await sendConcern(concernPayload(draft));
            sent(card);
            const screenshot = draft.answers.screenshot;
            if (screenshot) sent(await sendMyImage(screenshot, `Screenshot for report #${card.concern.id}`));
            setDraft(null);
        } catch (err) {
            if (!card) {
                setError(err.message);
            } else {
                // the report is saved; only the picture didn't make it
                setDraft(null);
                setError("The report was sent, but the screenshot wasn't; attach it in the chat.");
            }
        } finally {
            setSending(false);
        }
    };

    return { draft, question, sending, error, start, cancel, answer, skip, send };
}
