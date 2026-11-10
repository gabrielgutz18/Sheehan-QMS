// shown and read out under a called number on the display when the staff leave the remarks blank
export const DEFAULT_CALL_NOTE = "Please wait";

// a gate at the end of a call's note, "Please proceed to Roofings (Gate Y: Yero)", goes on a line of its own under the
// number: ["Please proceed to Roofings", "(Gate Y: Yero)"]; ["Please wait", ""] for a note with none
/** @param {string} note */
export const splitGate = (note) => {
    const match = note.match(/^(.*\S)\s*(\(Gate [^)]*\))$/);
    return match ? [match[1], match[2]] : [note, ""];
};

// how the announcer says it: "Please proceed to Roofings, Gate Y, Yero"
/** @param {string} note */
export const spokenGate = (note) => {
    const [where, gate] = splitGate(note);
    return gate ? `${where}, ${gate.slice(1, -1).replace(":", ",")}` : note;
};
