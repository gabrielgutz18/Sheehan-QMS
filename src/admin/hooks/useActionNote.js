import { useCallback, useEffect, useRef, useState } from 'react';

// how long the note stays up
const NOTE_MS = 6000;

// a short "it worked" line after a button press, e.g. "A-12 handed over to Loading", gone after a few seconds; a
// ticket just moving in the list doesn't tell everyone the press took, so some press it again or ask a coworker
// → [note, show(text)]; show("") clears it, as when the next press fails
export default function useActionNote() {
    const [note, setNote] = useState("");
    const timer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));

    const show = useCallback((text) => {
        clearTimeout(timer.current);
        setNote(text);
        if (text) timer.current = setTimeout(() => setNote(""), NOTE_MS);
    }, []);

    useEffect(() => () => clearTimeout(timer.current), []);

    return /** @type {[string, (text: string) => void]} */ ([note, show]);
}
