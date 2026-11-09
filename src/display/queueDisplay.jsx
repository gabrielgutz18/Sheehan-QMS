//func
import { useEffect, useState } from "react";
import { getQueue } from "../api/queueController.js";
import { DEFAULT_CALL_NOTE } from "../data/callNote.js";
import "./style/queueDisplay.css";

//assets
import logo from "../assets/SheehanLogo.png";

//components
import Call from "./components/call.jsx";
import Clock from "../components/clock.jsx";
import NumberCard from "./components/numberCard.jsx";
import VideoUp from "../components/videoup.jsx";

const POLL_MS = 5000;
// the list's rows are sized for this many (.upcoming-list in queueDisplay.css)
const UPCOMING_LIMIT = 8;
// one per counter; the right half of the slab stacks this many, and the rest show as "+2 more"
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
    // several numbers can be served at once, one per counter: the newest call is the headline on the left,
    // and everyone else still at a counter stacks on the right, newest first
    const [current, ...alsoServing] = serving;
    const othersShown = alsoServing.slice(0, ALSO_SERVING_LIMIT);
    const othersHidden = alsoServing.length - othersShown.length;
    const shown = upcoming.slice(0, UPCOMING_LIMIT);
    const hidden = upcoming.length - shown.length;
    const servingState = !current ? " serving--idle" : othersShown.length > 0 ? " serving--split" : "";

    return (
        <div className="queue-screen">
            <header className="queue-top">
                <img className="queue-logo" src={logo} alt="" />
                <h1 className="queue-company">Sheehan, Inc.</h1>
                <Clock />
            </header>

            {/* only there while the board can't reach the server, so a stale screen doesn't pass for a current one */}
            {error && (
                <p className="queue-error" role="alert">
                    Offline. {error}
                </p>
            )}

            {/* the slab is red only while someone is being called, so red always means "look up" */}
            <section className={`serving${servingState}`} aria-labelledby="serving-title">
                <div aria-live="polite">
                    <div className="serving-band">
                        <div className="serving-head">
                            <h2 id="serving-title" className="serving-title">
                                Now serving
                            </h2>
                            {othersHidden > 0 && <p className="serving-more">+{othersHidden} more</p>}
                        </div>

                        {current ? (
                            <div className="serving-calls">
                                {/* key on the call so a new number, or the same one called again, replays its entrance */}
                                <div key={`${current.queueNum}-${current.calledAt}`} className="serving-call">
                                    <NumberCard
                                        number={current.queueNum}
                                        purpose={current.purpose}
                                        marks={current}
                                        variant="serving"
                                    />
                                    <div className="serving-who">
                                        <p className="serving-name">{current.name}</p>
                                        <p className="serving-note">{callNote(current)}</p>
                                    </div>
                                </div>

                                {othersShown.length > 0 && (
                                    <ul className="serving-others" aria-label="Also being served">
                                        {othersShown.map((o) => (
                                            <li key={o.queueNum} className="serving-other">
                                                <NumberCard number={o.queueNum} purpose={o.purpose} marks={o} />
                                                <span className="serving-other-name">{o.name}</span>
                                                <span className="serving-other-note">{callNote(o)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ) : (
                            <p className="serving-empty">{loaded ? "Waiting for the next customer" : "Loading..."}</p>
                        )}
                    </div>
                </div>
            </section>

            <div className="queue-floor">
                <section className="upcoming" aria-labelledby="upcoming-title">
                    <div className="upcoming-head">
                        <h2 id="upcoming-title" className="upcoming-title">
                            Up next
                        </h2>
                        {upcoming.length > 0 && (
                            <p className="upcoming-count">
                                {hidden > 0
                                    ? `Next ${shown.length} of ${upcoming.length}`
                                    : `${upcoming.length} waiting`}
                            </p>
                        )}
                    </div>

                    {shown.length > 0 ? (
                        <ol className="upcoming-list">
                            {shown.map((o) => (
                                <li key={o.queueNum} className="upcoming-row">
                                    <NumberCard number={o.queueNum} purpose={o.purpose} marks={o} />
                                    <span className="upcoming-name">
                                        <span className="upcoming-name-text">{o.name}</span>
                                        {o.returning && <span className="upcoming-returning">Returning</span>}
                                    </span>
                                    <span className="upcoming-station">{o.purpose}</span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="upcoming-empty">{loaded ? "No one in line" : "Loading..."}</p>
                    )}
                </section>

                <section className="queue-video">
                    <VideoUp />
                </section>
            </div>

            {/* chime + voice for each new call */}
            <Call serving={serving} loaded={loaded} />
        </div>
    );
}
