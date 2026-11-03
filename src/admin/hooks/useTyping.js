import { useCallback, useEffect, useRef, useState } from 'react';

// "is typing" is only worth showing while it's true, so it's asked for more often than the messages themselves
const WATCH_MS = 2000;
// saying so once in a while is enough, not on every key; the server's TYPING_MS must outlast this
const NOTE_EVERY_MS = 2000;

// who's writing in the open conversation, and telling them you are; list({ signal }) fetches [{ id, name }] and note()
// says you're writing, both kept stable with useCallback
// typing: who's writing now; typed(): call it as you write, it reaches the server only every NOTE_EVERY_MS
// a tab in the background doesn't ask, as nobody is looking at it
export default function useTyping(list, note) {
    const [typing, setTyping] = useState([]);
    const lastNote = useRef(0);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const load = () => {
            if (document.hidden) return;
            list({ signal })
                .then((data) => {
                    const next = data ?? [];
                    // the same as before: left alone, so the conversation isn't drawn again every 2 seconds
                    setTyping((shown) =>
                        next.length === shown.length && next.every(({ id }, i) => id === shown[i].id) ? shown : next);
                })
                // can't tell any more, so nobody is shown typing forever; the page's own requests report the error
                .catch(() => {
                    if (!signal.aborted) setTyping((shown) => (shown.length ? [] : shown));
                });
        };

        load();
        const id = setInterval(load, WATCH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, [list]);

    const typed = useCallback(() => {
        const now = Date.now();
        if (now - lastNote.current < NOTE_EVERY_MS) return;
        lastNote.current = now;
        // nothing to tell anyone if it fails: their message still goes when they press Send
        note().catch(() => {});
    }, [note]);

    return { typing, typed };
}
