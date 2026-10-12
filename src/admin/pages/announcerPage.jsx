import { useEffect, useMemo, useState } from 'react';

import { getAnnouncer } from '../../api/announcerController.js';
import { saveAnnouncer } from '../api/adminAnnouncerController.js';
import { announce, callAnnouncement, findVoice, getVoices } from '../../sound/sound.js';

const SAMPLE_CALL = { queueNum: 1, purpose: "Roofing Accessories", name: "Juan Dela Cruz", remarks: "Please proceed to Window 1" };

const REPEATS = [
    { value: 1, label: "Once" },
    { value: 2, label: "Twice" },
];

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const languageName = (lang) => {
    try {
        return languageNames.of(lang);
    } catch {
        return lang;
    }
};

// this browser's voices grouped by language, English first since the announcement is in English
const groupVoices = (voices) => {
    const groups = Map.groupBy(voices, (v) => languageName(v.lang));
    return [...groups.entries()]
        .map(([language, list]) => [language, list.sort((a, b) => a.name.localeCompare(b.name))])
        .sort(([a], [b]) => (b.startsWith("English") - a.startsWith("English")) || a.localeCompare(b));
};

export default function AnnouncerPage() {
    const [settings, setSettings] = useState(null);
    const [voices, setVoices] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        getAnnouncer({ signal: controller.signal })
            .then(setSettings)
            .catch((err) => !controller.signal.aborted && setError(err.message));
        getVoices().then(setVoices);
        return () => controller.abort();
    }, []);

    const grouped = useMemo(() => groupVoices(voices ?? []), [voices]);

    const change = (patch) => {
        setNotice("");
        setSettings((prev) => ({ ...prev, ...patch }));
    };

    const pickVoice = (name) => {
        const voice = voices.find((v) => v.name === name);
        change({ voice: name, lang: voice?.lang ?? "" });
    };

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        setNotice("");
        try {
            setSettings(await saveAnnouncer(settings));
            setNotice("Saved. The display screen uses it within 30 seconds.");
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // the voice the display would fall back to when this computer doesn't have the saved one
    const missingVoice = settings?.voice && voices && !voices.some((v) => v.name === settings.voice);

    return (
        <section className="admin-page">
            <h1 className="admin-title">Call announcements</h1>

            {error && <p className="field-error" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <div className="video-columns">
                <div className="admin-panel">
                    <h2>Voice</h2>
                    {!settings || !voices ? (
                        <p className="admin-empty">Loading...</p>
                    ) : (
                        <form className="video-form" onSubmit={save}>
                            <label className="announcer-toggle">
                                <input
                                    type="checkbox"
                                    checked={settings.enabled}
                                    onChange={(e) => change({ enabled: e.target.checked })}
                                />
                                Read each call out loud on the display screen
                            </label>

                            {voices.length === 0 ? (
                                <p className="video-hint">
                                    This browser has no text-to-speech voices. Open this page in Microsoft Edge or Chrome.
                                </p>
                            ) : (
                                <label className="admin-field">
                                    Voice
                                    <select value={settings.voice} onChange={(e) => pickVoice(e.target.value)}>
                                        <option value="">Browser default</option>
                                        {missingVoice && <option value={settings.voice}>{settings.voice} (not on this computer)</option>}
                                        {grouped.map(([language, list]) => (
                                            <optgroup key={language} label={language}>
                                                {list.map((v) => (
                                                    <option key={v.voiceURI} value={v.name}>
                                                        {v.name}{v.localService ? "" : " · online"}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </label>
                            )}
                            {missingVoice && (
                                <p className="video-hint">
                                    This computer doesn't have that voice, so it would use {findVoice(voices, settings)?.name ?? "the default"}.
                                </p>
                            )}

                            <label className="admin-field">
                                Speed: {settings.rate.toFixed(1)}×
                                <input
                                    type="range"
                                    className="announcer-range"
                                    min="0.6"
                                    max="1.4"
                                    step="0.1"
                                    value={settings.rate}
                                    onChange={(e) => change({ rate: Number(e.target.value) })}
                                />
                            </label>

                            <label className="admin-field">
                                Volume: {Math.round(settings.volume * 100)}%
                                <input
                                    type="range"
                                    className="announcer-range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={settings.volume}
                                    onChange={(e) => change({ volume: Number(e.target.value) })}
                                />
                            </label>

                            <div>
                                <span className="announcer-label">Say each call</span>
                                <div className="video-tabs" role="radiogroup" aria-label="Say each call">
                                    {REPEATS.map(({ value, label }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={settings.repeat === value}
                                            className="video-tab"
                                            onClick={() => change({ repeat: value })}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="announcer-actions">
                                <button
                                    type="button"
                                    className="admin-btn"
                                    onClick={() => announce(callAnnouncement(SAMPLE_CALL), settings)}
                                >
                                    Test on this computer
                                </button>
                                <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                                    {saving ? "Saving..." : "Save"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                <div className="admin-panel">
                    <h2>How it works</h2>
                    <ul className="printer-tips">
                        <li>
                            When a ticket is called (or called again), the display screen plays a chime and says, for
                            example: “{callAnnouncement(SAMPLE_CALL)}”
                        </li>
                        <li>
                            Voices come from each computer's browser. For an exact match, pick the voice on the display
                            computer itself; elsewhere the display uses a voice in the same language.
                        </li>
                        <li>
                            Microsoft Edge has the most natural voices, including Filipino. Voices marked “online” need
                            an internet connection.
                        </li>
                        <li>
                            Browsers keep sound off until someone taps the page, so tap the display once after it opens.
                            To skip that on an unattended screen, start its browser with{" "}
                            <code>--autoplay-policy=no-user-gesture-required</code>.
                        </li>
                    </ul>
                </div>
            </div>
        </section>
    );
}
