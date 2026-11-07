import { useEffect, useRef, useState } from 'react';

import { isSoundAllowed, playChime } from '../../sound/sound.js';

// whether this computer chimes for new customers on a department page; a per-computer choice, so it's kept in the
// browser, and on unless someone switched it off
const CHIME_KEY = "sheehan.newCustomerChime";
const CHIME_VOLUME = 0.6;

const readChimeOn = () => {
    try {
        return localStorage.getItem(CHIME_KEY) !== "off";
    } catch {
        return true;
    }
};

const chime = () => playChime(CHIME_VOLUME).catch(() => {});

// a department's crew is often away from the screen, loading a truck: a chime when a customer is handed over to them,
// and how many can be called in the browser tab's name, e.g. "(2) Loading", which shows even from another tab
// waitingIds: the queue numbers waiting here now; servingIds: the ones being served here, so one sent back to waiting
// from here doesn't chime; callable: how many of the waiting can be called now; loading: still on the first fetch
// → [chimeOn, setChimeOn]; switching it on plays the chime once, so they know the sound (and the click lets it play)
export default function useNewCustomerAlert({ waitingIds, servingIds, callable, loading, label }) {
    const [chimeOn, setChimeOnState] = useState(readChimeOn);
    // the customers already on this page; null until the first list has come in, so opening the page doesn't chime
    const known = useRef(/** @type {Set<string> | null} */ (null));
    const waitingKey = waitingIds.join(",");
    const servingKey = servingIds.join(",");

    useEffect(() => {
        if (loading) return;
        const waiting = waitingKey ? waitingKey.split(",") : [];
        const serving = servingKey ? servingKey.split(",") : [];
        const arrived = known.current !== null && waiting.some((id) => !known.current.has(id));
        known.current = new Set([...waiting, ...serving]);
        // until someone has clicked the page, the browser holds sound back and would play it late, so it's skipped
        if (arrived && chimeOn && isSoundAllowed()) chime();
    }, [waitingKey, servingKey, loading, chimeOn]);

    useEffect(() => {
        const original = document.title;
        if (callable > 0) document.title = `(${callable}) ${label}`;
        return () => {
            document.title = original;
        };
    }, [callable, label]);

    const setChimeOn = (on) => {
        setChimeOnState(on);
        try {
            localStorage.setItem(CHIME_KEY, on ? "on" : "off");
        } catch {
            // private window or blocked storage: it still works until the page is closed
        }
        if (on) chime();
    };

    return /** @type {[boolean, (on: boolean) => void]} */ ([chimeOn, setChimeOn]);
}
