// the checkers on Customer order's Checker tab and on the printed ticket: a 1st and a 2nd checker for each of these
// columns; add one here and the form, the ticket and the backend's checks all pick it up (server/api.js imports
// this list)
const checkers = [
    { name: "Roofing" },
    { name: "Construction" },
    { name: "Hardware/TBA/Chassis" },
];

// the rows: who checks the items first, and who checks them again; short is the ticket's row label
export const CHECKER_ROUNDS = [
    { name: "1st Checker", short: "1st" },
    { name: "2nd Checker", short: "2nd" },
];

// "Hardware/TBA/Chassis" can wrap after each slash in a narrow column instead of overflowing it
export const breakable = (name) => name.replaceAll("/", "/​");

// an order's checkers, { Roofing: ["Pedro", ""] }, as one line for staff, e.g. "Roofing: Pedro · Construction: Ana /
// Ben"; "" while none is filled in
export const checkerSummary = (value = {}) =>
    checkers
        .map(({ name }) => [name, (value[name] ?? []).map((checker) => checker.trim()).filter(Boolean)])
        .filter(([, names]) => names.length)
        .map(([name, names]) => `${name}: ${names.join(" / ")}`)
        .join(" · ");

export default checkers;
