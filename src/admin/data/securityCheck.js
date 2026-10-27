// what a guard's security check at the gate can find; values must match the backend (server/api.js): all as it should
// be, or a report of something wrong, with a note saying what
export const CHECK_RESULTS = [
    { value: "verified", label: "Verified" },
    { value: "missing", label: "Missing", hint: "Something on the order isn't there" },
    { value: "over", label: "Over the quantity", hint: "More than the order lists" },
    { value: "stolen", label: "Stolen", hint: "Something that isn't theirs" },
];

export const REPORTS = CHECK_RESULTS.filter(({ value }) => value !== "verified");

export const resultLabel = (result) => CHECK_RESULTS.find(({ value }) => value === result)?.label ?? result;
