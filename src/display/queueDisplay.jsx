//func
import { useEffect, useState } from 'react';
import { getQueue } from '../api/queueController.js';
import { DEFAULT_CALL_NOTE } from '../data/callNote.js';
import './style/queueDisplay.css';

//assets
import logo from '../assets/SheehanLogo.png';

//components
import Call from './components/call.jsx';
import Clock from '../components/clock.jsx';
import NumberCard from './components/numberCard.jsx';
import VideoUp from '../components/videoup.jsx';

const POLL_MS = 5000;
const UPCOMING_LIMIT = 8;
// one per counter; more than this and the video gets squeezed
const ALSO_SERVING_LIMIT = 3;

const callNote = (o) => o.remarks || DEFAULT_CALL_NOTE;

export default function QueueDisplay() {
    const [queue, setQueue] = useState({ serving: [], upcoming: [] });
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState("");

    // poll the board; the next request waits for the previous one so they never pile up
    useEffect(() => {
        const controller = new AbortController();
        let timer;

        const load = async () => {
            try {
                setQueue(await getQueue({ signal: controller.signal }));
                setError("");
            } catch (err) {
                if (controller.signal.aborted) return;
                setError(err.message);
            }
            setLoaded(true);
            timer = setTimeout(load, POLL_MS);
        };

        load();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, []);

    const { serving, upcoming } = queue;
    // several numbers can be served at once, one per counter: the newest call is the headline,
    // and everyone else still at a counter is listed under it, newest first
    const [current, ...alsoServing] = serving;
    const othersShown = alsoServing.slice(0, ALSO_SERVING_LIMIT);
    const othersHidden = alsoServing.length - othersShown.length;
    const shown = upcoming.slice(0, UPCOMING_LIMIT);
    const hidden = upcoming.length - shown.length;

    return (
        <div className="queue-screen">
            {/* two columns that meet at a divider; every block butts up against the next, closed off by a line */}
            <main className="queue-board">
                {/* left: who we are, then the line */}
                <div className="queue-side">
                    <header className="queue-brand">
                        <img className="queue-logo" src={logo} alt="Sheehan Inc. logo" />
                        <div className="queue-brand-text">
                            <h1 className="queue-company">Sheehan, Inc.</h1>
                            <p className="queue-subtitle">Queue Information Display</p>
                        </div>
                        <span className="waiting-count">{upcoming.length} in line</span>
                    </header>

                    {error && <p className="queue-error" role="alert">{error}</p>}

                    {/* upcoming */}
                    <section className="upcoming-panel" aria-label="Up next">
                        <table className="upcoming-table">
                            <thead>
                                <tr>
                                    <th scope="col">Ticket No.</th>
                                    <th scope="col">Customer Name</th>
                                    <th scope="col">Station / Counter</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.length > 0 ? (
                                    shown.map((o) => (
                                        <tr key={o.queueNum}>
                                            <td>
                                                <NumberCard number={o.queueNum} purpose={o.purpose} priority={o.priority} />
                                            </td>
                                            <td className="upcoming-name">
                                                {o.name}
                                                {o.returning && <span className="upcoming-returning">Returning</span>}
                                            </td>
                                            <td><span className="upcoming-station">{o.purpose}</span></td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3} className="upcoming-empty">{loaded ? "No one in line" : "Loading..."}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {hidden > 0 && <p className="upcoming-more">+{hidden} more in line</p>}
                    </section>
                </div>

                {/* right: now serving above the video, the clock along the bottom */}
                <div className="queue-main">
                    <section className="serving-panel" aria-labelledby="serving-title">
                        <div className="serving-bar">
                            <h2 id="serving-title" className="serving-title">
                                Now Serving
                            </h2>
                            {/* goes to Offline while the board can't reach the server, so a stale screen doesn't claim to be live */}
                            <span className={`live-badge${error ? " live-badge--off" : ""}`}>
                                <span className="live-dot" aria-hidden="true" />
                                {error ? "Offline" : "Live"}
                            </span>
                        </div>

                        <div className="serving-list" aria-live="polite">
                            {current ? (
                                <>
                                    {/* key on the call so a new number, or the same one called again, replays its animation */}
                                    <div key={`${current.queueNum}-${current.calledAt}`} className="serving-call">
                                        <NumberCard number={current.queueNum} purpose={current.purpose} priority={current.priority} variant="serving" />
                                        <p className="serving-name">{current.name}</p>
                                        <hr className="serving-rule" />
                                        <p className="serving-note">{callNote(current)}</p>
                                    </div>

                                    {othersShown.length > 0 && (
                                        <ul className="serving-others" aria-label="Also being served">
                                            {othersShown.map((o) => (
                                                <li key={o.queueNum} className="serving-other">
                                                    <NumberCard number={o.queueNum} purpose={o.purpose} priority={o.priority} />
                                                    <span className="serving-other-name">{o.name}</span>
                                                    <span className="serving-other-note">{callNote(o)}</span>
                                                </li>
                                            ))}
                                            {othersHidden > 0 && <li className="serving-more">+{othersHidden} more being served</li>}
                                        </ul>
                                    )}
                                </>
                            ) : (
                                <p className="serving-empty">{loaded ? "Waiting for the next customer" : "Loading..."}</p>
                            )}
                        </div>
                    </section>

                    {/* video under now serving */}
                    <section className="queue-video">
                        <VideoUp />
                    </section>

                    <footer className="queue-footer">
                        <Clock />
                    </footer>
                </div>
            </main>

            {/* chime + voice for each new call */}
            <Call serving={serving} loaded={loaded} />
        </div>
    );
}
