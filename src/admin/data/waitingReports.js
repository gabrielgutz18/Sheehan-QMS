import { CONCERN_KINDS } from "../../data/concerns.js";

// the reports a developer still has to do something about: the ones shown at first on the Chat page's Reports, and
// the only ones on the developers' Dashboard
export const WAITING = ["open", "in_progress"];

// the developers' Dashboard's Staff concerns, from the reports as listConcerns gives them: how many are Open and In
// progress, how many of each kind (bug, concern, feature) are still waiting, and the newest few waiting, newest first
/** @param {any[]} reports @param {number} [shown] */
export const waitingReports = (reports, shown = 6) => {
    const waiting = reports.filter((r) => WAITING.includes(r.status));
    return {
        open: waiting.filter((r) => r.status === "open").length,
        inProgress: waiting.filter((r) => r.status === "in_progress").length,
        byKind: Object.fromEntries(
            Object.keys(CONCERN_KINDS).map((kind) => [kind, waiting.filter((r) => r.kind === kind).length]),
        ),
        newest: waiting
            .toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id)
            .slice(0, shown),
    };
};
