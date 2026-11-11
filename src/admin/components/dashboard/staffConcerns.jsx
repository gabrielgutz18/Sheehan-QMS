import "../../style/chat.css";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { CONCERN_KINDS, areaLabel } from "../../../data/concerns.js";
import { listConcerns } from "../../api/concernController.js";
import { reportAge } from "../../data/lastSeen.js";
import { waitingReports } from "../../data/waitingReports.js";
import Icon from "../common/icon.jsx";
import { ConcernStatus } from "../chat/concernCard.jsx";

// as often as Staff concerns on SheeChat checks, so the two agree
const REFRESH_MS = 5000;

// where the developers answer staff and move reports along
const CONCERNS_TAB = "/staff/sheechat?tab=concerns";

// what each kind's card is called, as the bot's buttons put it on Message developer
const KIND_CARDS = { bug: "Bugs", concern: "System concerns", feature: "Features" };

// the developers' Dashboard only: the reports staff sent through the bot on Message developer that are still Open or
// In progress, how many of each kind, and the newest few; picking one opens that person's conversation on SheeChat's
// Staff concerns tab, where its card has the status buttons
export default function StaffConcerns() {
    const navigate = useNavigate();
    // every report, or null until they load
    const [reports, setReports] = useState(/** @type {any[] | null} */ (null));
    const [error, setError] = useState("");
    // the clock the ages are counted from, moved on with each check
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const load = () =>
            listConcerns({ signal })
                .then((data) => {
                    setReports(data ?? []);
                    setError("");
                    setNow(Date.now());
                })
                .catch((err) => !signal.aborted && setError(err.message));
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    const waiting = reports && waitingReports(reports);

    return (
        <section className="overview-section" aria-labelledby="staff-concerns-title">
            <div className="charge-head">
                <h2 id="staff-concerns-title" className="overview-heading">
                    Staff concerns
                </h2>
                <p className={`order-status-live${error ? " is-stale" : ""}`}>
                    {error
                        ? "Can't reach the server"
                        : waiting
                          ? `Live · ${waiting.open} open · ${waiting.inProgress} in progress`
                          : "Live"}
                </p>
            </div>

            <div className="stat-grid">
                {Object.entries(CONCERN_KINDS).map(([kind, { icon }]) => (
                    <div key={kind} className="stat-card has-icon">
                        <span className="stat-icon">
                            <Icon d={icon} />
                        </span>
                        <span className="stat-label">{KIND_CARDS[kind] ?? kind}</span>
                        <span className="stat-value">{waiting ? waiting.byKind[kind] : "–"}</span>
                    </div>
                ))}
            </div>

            <div className="admin-panel concern-feed">
                {!waiting ? (
                    <p className="order-status-empty">Loading...</p>
                ) : waiting.newest.length === 0 ? (
                    <p className="order-status-empty">No open reports. Staff are all set.</p>
                ) : (
                    <ul aria-label="Newest open reports">
                        {waiting.newest.map((r) => {
                            const type = CONCERN_KINDS[r.kind];
                            return (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        className="chat-list-item report-row"
                                        onClick={() => navigate(CONCERNS_TAB, { state: { open: r.staff } })}
                                    >
                                        <Icon d={type.icon} className="line-icon concern-icon" />
                                        <span className="chat-list-text">
                                            <span className="chat-list-name">
                                                <strong>
                                                    #{r.id} · {type.short}
                                                </strong>
                                                <ConcernStatus status={r.status} />
                                            </span>
                                            <span className="chat-list-last">
                                                {r.staff.name}
                                                {r.staff.department && ` (${r.staff.department})`} ·{" "}
                                                {areaLabel(r.kind, r.area)} · {type.impacts[r.impact] ?? r.impact}
                                            </span>
                                            <span className="chat-list-last">{r.details}</span>
                                        </span>
                                        <span className="chat-list-end">
                                            <time dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString()}>
                                                {reportAge(r.createdAt, now)}
                                            </time>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <Link to={CONCERNS_TAB} className="concern-feed-all">
                    See every report on Staff concerns
                </Link>
            </div>
        </section>
    );
}
