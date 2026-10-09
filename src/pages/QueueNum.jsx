//func
import { useEffect, useState } from 'react';
import { getQueue } from '../api/queueController.js';
import '../style/queueNum.css';

//components
import Header from '../components/header.jsx';
import NumberCard from '../components/numberCard.jsx';
import VideoUp from '../components/videoup.jsx';

const POLL_MS = 5000;
const UPCOMING_LIMIT = 8;

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
    const shown = upcoming.slice(0, UPCOMING_LIMIT);
    const hidden = upcoming.length - shown.length;

    return (
        <div className="queue-screen">
            <Header />

            <main className="queue-page">
                {error && <p className="queue-error" role="alert">{error}</p>}

                <div className="queue-board">
                    {/* now serving */}
                    <section className="queue-panel serving-panel" aria-labelledby="serving-title">
                        <h2 id="serving-title" className="panel-title">
                            <span className="live-dot" aria-hidden="true" />
                            Now Serving
                        </h2>

                        <div className="serving-list" aria-live="polite">
                            {serving.length > 0 ? (
                                // key on the number so a newly called number remounts and replays its animation
                                serving.map((o) => (
                                    <NumberCard key={o.queueNum} number={o.queueNum} purpose={o.purpose} variant="serving" />
                                ))
                            ) : (
                                <p className="serving-empty">{loaded ? "Waiting for the next customer" : "Loading..."}</p>
                            )}
                        </div>

                        {serving.length > 0 && <p className="serving-note">Please proceed to the counter</p>}
                    </section>

                    {/* upcoming */}
                    <section className="queue-panel upcoming-panel" aria-labelledby="upcoming-title">
                        <div className="panel-head">
                            <h2 id="upcoming-title" className="panel-title">Up Next</h2>
                            <span className="waiting-count">{upcoming.length} waiting</span>
                        </div>

                        {shown.length > 0 ? (
                            <ol className="upcoming-list">
                                {shown.map((o, i) => (
                                    <li key={o.queueNum}>
                                        <NumberCard number={o.queueNum} purpose={o.purpose} variant={i === 0 ? "next" : "upcoming"} />
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="upcoming-empty">{loaded ? "No one in line" : "Loading..."}</p>
                        )}

                        {hidden > 0 && <p className="upcoming-more">+{hidden} more in line</p>}
                    </section>
                </div>

                {/* video below the number cards */}
                <section className="queue-video">
                    <VideoUp />
                </section>
            </main>
        </div>
    );
}
