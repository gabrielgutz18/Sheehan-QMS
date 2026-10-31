import formatQueueNum from '../../../data/queueNum.js';
import { DEFAULT_CALL_NOTE } from '../../../data/callNote.js';
import Icon from '../common/icon.jsx';
import ServedBy from '../orders/servedBy.jsx';

// the display's Now Serving sparkle
const SPARKLE_ICON = "M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0zM20 3v4M22 5h-4M4 17v2M5 18H3";
// as on the display, one per counter; the rest are counted
const ALSO_SERVING_LIMIT = 3;

const callNote = (o) => o.remarks || DEFAULT_CALL_NOTE;

// Now serving, as the queue display shows it but smaller: the newest call's number large, with the name and the line
// read out under it, then everyone else still at a counter, newest first
// live: the queue is keeping up with the server; Offline when it can't, so a stale card doesn't claim to be live
export default function ServingCompo({ orders, loading, live = true }) {
    const [current, ...others] = orders.filter((o) => o.status === "serving").sort((a, b) => b.calledAt - a.calledAt);
    const shown = others.slice(0, ALSO_SERVING_LIMIT);
    const hidden = others.length - shown.length;

    return (
        <section className="mini-serving" aria-labelledby="mini-serving-title">
            <div className="mini-serving-bar">
                <h2 id="mini-serving-title" className="mini-serving-title">
                    <Icon d={SPARKLE_ICON} />
                    Now serving
                </h2>
                <span className={`mini-live${live ? "" : " is-off"}`}>
                    <span className="mini-live-dot" aria-hidden="true" />
                    {live ? "Live" : "Offline"}
                </span>
            </div>

            {current ? (
                <>
                    <div className="mini-serving-call">
                        <p className="mini-serving-num">{formatQueueNum(current.queueNum, current.purpose, current)}</p>
                        <p className="mini-serving-name">{current.name}</p>
                        <p className="mini-serving-note">{callNote(current)}</p>
                        <ServedBy order={current} />
                    </div>

                    {shown.length > 0 && (
                        <ul className="mini-serving-others" aria-label="Also being served">
                            {shown.map((o) => (
                                <li key={o.queueNum} className="mini-serving-other">
                                    <span className="mini-num">{formatQueueNum(o.queueNum, o.purpose, o)}</span>
                                    <span className="mini-name">{o.name}</span>
                                    <span className="mini-pill">{callNote(o)}</span>
                                </li>
                            ))}
                            {hidden > 0 && <li className="mini-more">+{hidden} more being served</li>}
                        </ul>
                    )}
                </>
            ) : (
                <p className="mini-empty">{loading ? "Loading..." : "Waiting for the next customer"}</p>
            )}
        </section>
    );
}
