import { useEffect, useRef, useState } from 'react';

import { getAnnouncer } from '../../../api/announcerController.js';
import { setAnnouncerVolume } from '../../api/staffController.js';
import { playChime } from '../../../sound/sound.js';

// wait for the slider to settle before saving
const SAVE_DELAY_MS = 400;

// how loud the display screen reads out calls; sales staff can change this, not the voice
export default function AnnouncerVolume() {
    const [volume, setVolume] = useState(null);
    const [status, setStatus] = useState("");
    const timer = useRef(null);

    useEffect(() => {
        const controller = new AbortController();
        getAnnouncer({ signal: controller.signal })
            .then((settings) => setVolume(settings.volume))
            .catch((err) => !controller.signal.aborted && setStatus(err.message));
        return () => {
            controller.abort();
            clearTimeout(timer.current);
        };
    }, []);

    const change = (value) => {
        setVolume(value);
        setStatus("");
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            try {
                await setAnnouncerVolume(value);
                setStatus("Saved. The display uses it within 30 seconds.");
            } catch (err) {
                setStatus(err.message);
            }
        }, SAVE_DELAY_MS);
    };

    return (
        <div className="admin-panel">
            <h2>Announcer volume</h2>
            {volume === null ? (
                <p className="admin-empty">{status || "Loading..."}</p>
            ) : (
                <div className="volume-row">
                    <label className="admin-field volume-field">
                        <span>{volume === 0 ? "Muted" : `${Math.round(volume * 100)}%`}</span>
                        <input
                            type="range"
                            className="announcer-range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={volume}
                            onChange={(e) => change(Number(e.target.value))}
                        />
                    </label>
                    <button type="button" className="admin-btn" onClick={() => playChime(volume)} disabled={volume === 0}>
                        Test chime here
                    </button>
                </div>
            )}
            {volume !== null && status && <p className="video-hint" role="status">{status}</p>}
        </div>
    );
}
