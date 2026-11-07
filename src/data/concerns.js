// concern reports: the three buttons on Message developer start a short guided chat (the bot) that asks these
// questions, then sends the answers to the developers as one report they can track; server/api.js imports this file,
// so it checks the answers against the same lists the page shows; keep it free of browser and React code

// a bug's page, as the person tapped it from their own sidebar (or Other)
export const MAX_AREA = 60;
// how much a report shows of what happened in the conversation list and the pop-ups; the card shows all of it
const SUMMARY_DETAILS = 120;

// how bad a bug or a system concern is
const HOW_BAD = { blocking: "Can't work", slow: "Slows me down", minor: "Minor" };

// what a system concern is about
export const CONCERN_TOPICS = {
    speed: "Speed",
    data: "Wrong data",
    printing: "Printing",
    sheet: "Google sheet",
    signin: "Sign-in",
    other: "Other",
};

// one question of the bot's; key: the answer it fills in (area, details, extra, impact, or screenshot)
// choices: where its tap choices come from: "pages" (the person's own sidebar, plus Other), "topics" (CONCERN_TOPICS)
// or "impacts" (the kind's impacts); a question with none is typed; picture: a screenshot, which can be skipped
/** @typedef {{ key: string, question: string, choices?: "pages" | "topics" | "impacts", picture?: boolean }} ConcernStep */

// the three kinds of report; label: the button's words; short: the kind on a card and in the list; icon: one 24 × 24
// SVG path, drawn by Icon on the buttons and cards
/** @type {Record<string, { label: string, short: string, icon: string, impacts: Record<string, string>, steps: ConcernStep[] }>} */
export const CONCERN_KINDS = {
    bug: {
        label: "Report a bug",
        short: "Bug",
        icon: "M8 6V4M16 6V4M5 10H3M21 10h-2M5 16H3M21 16h-2M12 20v-8M8 7h8a3 3 0 0 1 3 3v5a7 7 0 0 1-14 0v-5a3 3 0 0 1 3-3z",
        impacts: HOW_BAD,
        steps: [
            { key: "area", question: "Which page were you on?", choices: "pages" },
            { key: "details", question: "What were you doing, and what happened?" },
            { key: "impact", question: "How bad is it?", choices: "impacts" },
            { key: "screenshot", question: "Add a screenshot? Attach or paste a picture, or skip.", picture: true },
        ],
    },
    // for when the system is slow, the data looks wrong, the printer or the sheet sync acts up, and so on
    concern: {
        label: "System concern",
        short: "Concern",
        icon: "M12 3 2 20h20zM12 9v5M12 17v.5",
        impacts: HOW_BAD,
        steps: [
            { key: "area", question: "What is it about?", choices: "topics" },
            { key: "details", question: "Tell us more." },
            { key: "impact", question: "How bad is it?", choices: "impacts" },
        ],
    },
    // the area is the person's own department, filled in from their account
    feature: {
        label: "Feature for my department",
        short: "Feature",
        icon: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z",
        impacts: { high: "A lot", medium: "Some", low: "Nice to have" },
        steps: [
            { key: "details", question: "What would you like the system to do?" },
            { key: "extra", question: "How would it help your work?" },
            { key: "impact", question: "How much would it help?", choices: "impacts" },
        ],
    },
};

// where a report stands; a developer moves it along, and Done or Declined can be reopened
export const CONCERN_STATUSES = { open: "Open", in_progress: "In progress", done: "Done", declined: "Declined" };

// the report's area in words: a concern's topic key becomes its label; a bug's page and a feature's department are
// words already
export const areaLabel = (kind, area) => (kind === "concern" ? (CONCERN_TOPICS[area] ?? area) : area);

// the one line a report's card message carries, so the conversation list and the pop-ups show something sensible:
// "Bug · Loading · Can't work: Start button does nothing"
export const concernSummary = ({ kind, area, impact, details }) => {
    const type = CONCERN_KINDS[kind];
    const what = details.length > SUMMARY_DETAILS ? `${details.slice(0, SUMMARY_DETAILS - 1).trimEnd()}…` : details;
    return `${type.short} · ${areaLabel(kind, area)} · ${type.impacts[impact] ?? impact}: ${what}`;
};

// the bot's message back to the staff member when a developer changes a report's status; by: the developer's name
export const statusSentence = ({ id, status, note, by }) => {
    const said = {
        open: `Report #${id} was reopened`,
        in_progress: `Report #${id} is now In progress (${by} is on it)`,
        done: `Report #${id} is Done`,
        declined: `Report #${id} was declined`,
    }[status];
    return note ? `${said}: "${note}"` : `${said}.`;
};
