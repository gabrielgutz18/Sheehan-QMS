import { useEffect, useRef, useState } from 'react';

import { getAnnouncer } from '../api/announcerController.js';
import { DEFAULT_ANNOUNCER, announce, callAnnouncement, isSoundAllowed, unlockSound } from '../sound/sound.js';

// pick up voice changes made in admin without reloading the display
const SETTINGS_REFRESH_MS = 30000;

const callKey = (o) => `${o.queueNum}-${o.calledAt}`;

// reads each new call out loud on the queue display, including a "Call again"
// serving: the board's serving list; loaded: false until the first poll has answered
export default function Call({ serving, loaded }) {
    const [settings, setSettings] = useState(DEFAULT_ANNOUNCER);
    const [locked, setLocked] = useState(() => !isSoundAllowed());
    // calls already on the board, so opening the display doesn't read out everyone being served
    const announced = useRef(null);

    useEffect(() => {
        const controller = new AbortController();
        const load = () => getAnnouncer({ signal: controller.signal }).then(setSettings).catch(() => {
            // keep the last settings; the next refresh tries again
        });
        load();
        const id = setInterval(load, SETTINGS_REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    useEffect(() => {
        if (!loaded) return;
        if (!announced.current) {
            announced.current = new Set(serving.map(callKey));
            return;
        }
        // oldest first, so two quick calls are read in the order they were made
        const fresh = serving.filter((o) => !announced.current.has(callKey(o))).sort((a, b) => a.calledAt - b.calledAt);
        // only remember who's still being served, so the list doesn't grow all day
        announced.current = new Set(serving.map(callKey));
        // while sound is still off, the browser would hold the chime and play it late, so skip it
        if (!settings.enabled || !isSoundAllowed()) return;
        for (const o of fresh) announce(callAnnouncement(o), settings);
    }, [serving, loaded, settings]);

    // browsers keep sound off until someone clicks or presses a key on the page, so any tap or key press on the display
    // turns it on; nothing on screen asks for it, so a display nobody touches is opened with deploy/display-chrome.cmd,
    // which starts the browser with sound allowed
    useEffect(() => {
        if (!locked) return;
        const unlock = () => {
            unlockSound();
            setLocked(false);
        };
        document.addEventListener("click", unlock);
        document.addEventListener("keydown", unlock);
        return () => {
            document.removeEventListener("click", unlock);
            document.removeEventListener("keydown", unlock);
        };
    }, [locked]);

    return null;
}
