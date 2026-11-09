import { CONCERN_KINDS, CONCERN_TOPICS } from "../../../data/concerns.js";

// the guided chat's steps on Message developer: one report being answered, question by question, in the browser
// only (nothing reaches the server before Send report, and a refresh throws it away)
// draft: { kind, step, answers, pages }; step: the index of the question being asked; answers: what's been given so
// far by key (area, details, extra, impact, screenshot); pages: the person's own sidebar pages, for a bug's first one

/** @typedef {{ kind: string, step: number, answers: Record<string, any>, pages: string[] }} ConcernDraft */
/** @typedef {{ value: string, label: string }} ConcernChoice */

// a bug's page can also be one that isn't in the sidebar
export const OTHER_PAGE = "Other";

// a new report of this kind; area: the person's department (or role), which a feature is filed under
/** @returns {ConcernDraft} */
export const startConcern = (kind, { pages = [], area = "" } = {}) => ({
    kind,
    step: 0,
    answers: kind === "feature" ? { area } : {},
    pages,
});

// a question's tap choices, or null for a typed one
/** @returns {ConcernChoice[] | null} */
const choicesOf = (draft, step) => {
    if (step.choices === "pages") return [...draft.pages, OTHER_PAGE].map((label) => ({ value: label, label }));
    if (step.choices === "topics") return Object.entries(CONCERN_TOPICS).map(([value, label]) => ({ value, label }));
    if (step.choices === "impacts") {
        return Object.entries(CONCERN_KINDS[draft.kind].impacts).map(([value, label]) => ({ value, label }));
    }
    return null;
};

// the question being asked, with its choices; null once every one has an answer and the summary shows
/** @returns {{ key: string, question: string, choices: ConcernChoice[] | null, picture: boolean } | null} */
export const concernQuestion = (draft) => {
    const step = CONCERN_KINDS[draft.kind].steps[draft.step];
    if (!step) return null;
    return { key: step.key, question: step.question, choices: choicesOf(draft, step), picture: Boolean(step.picture) };
};

// the answer to the question being asked: a choice's value, typed words, or for the screenshot a picture (a Blob);
// blank words, or a value that isn't one of the choices, leave the draft as it is
/** @returns {ConcernDraft} */
export const answerConcern = (draft, value) => {
    const question = concernQuestion(draft);
    if (!question) return draft;
    let answer = value;
    if (question.choices) {
        if (!question.choices.some((c) => c.value === value)) return draft;
    } else if (!question.picture) {
        answer = typeof value === "string" ? value.trim() : "";
        if (!answer) return draft;
    } else if (!value) {
        return draft;
    }
    return { ...draft, step: draft.step + 1, answers: { ...draft.answers, [question.key]: answer } };
};

// Skip, on the screenshot question only: on to the summary with no picture
/** @returns {ConcernDraft} */
export const skipConcern = (draft) => (concernQuestion(draft)?.picture ? { ...draft, step: draft.step + 1 } : draft);

// what the person said to each question, in their words: a choice's label, what they typed, or the picture
const answerText = (draft, step) => {
    const value = draft.answers[step.key];
    if (step.picture) return value ? "Screenshot attached." : "No screenshot.";
    return choicesOf(draft, step)?.find((c) => c.value === value)?.label ?? value;
};

// the guided chat so far, for the thread: each question the bot asked and the answer given, then the question
// being asked; [{ from: 'bot' | 'me', text }]
/** @returns {{ from: "bot" | "me", text: string }[]} */
export const concernTranscript = (draft) =>
    CONCERN_KINDS[draft.kind].steps
        .slice(0, draft.step + 1)
        .flatMap((step, i) => [
            { from: /** @type {const} */ ("bot"), text: step.question },
            ...(i < draft.step ? [{ from: /** @type {const} */ ("me"), text: answerText(draft, step) }] : []),
        ]);

// the report to send, as POST /admin/concerns takes it
export const concernPayload = ({ kind, answers }) => ({
    kind,
    area: answers.area ?? "",
    details: answers.details ?? "",
    extra: answers.extra ?? "",
    impact: answers.impact ?? "",
});
