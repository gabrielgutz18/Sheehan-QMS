//func
import { useEffect, useState } from 'react';
import { getQueue } from '../api/queueController.js';
import '../style/queueNum.css';

//components
import Header from '../components/header.jsx';
import NumberCard from '../components/numberCard.jsx';
import VideoUp from '../components/videoup.jsx';
import formatQueueNum from '../data/queueNum.js';

const POLL_MS = 5000;
const UPCOMING_LIMIT = 8;
// one per counter; more than this and the video gets squeezed
const ALSO_SERVING_LIMIT = 3;

const callNote = (o) => o.remarks || `Please proceed to ${o.purpose}`;

export default function QueueNum() {
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
            <Header />

            <main className="queue-page">
                {error && <p className="queue-error" role="alert">{error}</p>}

                {/* left: the line as a table; right: now serving above the video */}
                <div className="queue-board">
                    {/* upcoming */}
                    <section className="queue-panel upcoming-panel" aria-labelledby="upcoming-title">
                        <div className="panel-head">
                            <h2 id="upcoming-title" className="panel-title">Up Next</h2>
                            <span className="waiting-count">{upcoming.length} waiting</span>
                        </div>

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
                                    shown.map((o, i) => (
                                        <tr key={o.queueNum}>
                                            <td>
                                                <NumberCard number={o.queueNum} purpose={o.purpose} variant={i === 0 ? "next" : "upcoming"} />
                                            </td>
                                            <td className="upcoming-name">{o.name}</td>
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

                    {/* now serving */}
                    <section className="queue-panel serving-panel" aria-labelledby="serving-title">
                        <h2 id="serving-title" className="panel-title">
                            <span className="live-dot" aria-hidden="true" />
                            Now Serving
                        </h2>

                        <div className="serving-list" aria-live="polite">
                            {current ? (
                                <>
                                    {/* key on the call so a new number, or the same one called again, replays its animation */}
                                    <div key={`${current.queueNum}-${current.calledAt}`} className="serving-call">
                                        <NumberCard number={current.queueNum} purpose={current.purpose} variant="serving" />
                                        <p className="serving-name">{current.name}</p>
                                        <hr className="serving-rule" />
                                        <p className="serving-note">{callNote(current)}</p>
                                    </div>

                                    {othersShown.length > 0 && (
                                        <ul className="serving-others" aria-label="Also being served">
                                            {othersShown.map((o) => (
                                                <li key={o.queueNum} className="serving-other">
                                                    <span className="serving-other-num">{formatQueueNum(o.queueNum, o.purpose)}</span>
                                                    <span className="serving-other-name">{o.name}</span>
                                                    <span className="serving-other-note">{callNote(o)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {othersHidden > 0 && <p className="serving-more">+{othersHidden} more being served</p>}
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
                </div>
            </main>
        </div>
    );
}
