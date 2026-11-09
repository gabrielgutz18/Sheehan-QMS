import { useEffect, useState } from "react";

import { CONCERN_KINDS, CONCERN_STATUSES, areaLabel } from "../../../data/concerns.js";
import Icon from "../common/icon.jsx";
import { ConcernStatus } from "./concernCard.jsx";

// the statuses shown at first: the reports someone still has to do something about
const STILL_OPEN = ["open", "in_progress"];

// how long ago a report was sent, in a few characters: "now", "5m", "3h", "2d"
const age = (iso, now) => {
    const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / (24 * 60))}d`;
};

// the Chat page's Reports: every report staff sent, filtered by kind, status and department, newest first; picking
// one opens that person's conversation, where its card has the status buttons
// reports: as listConcerns gives them, or null while they load; openId: whose conversation is open
/** @param {{ reports: any[] | null, openId: number | null, onPick: (staff: any) => void }} props */
export default function ReportList({ reports, openId, onPick }) {
    // "" for every kind
    const [kind, setKind] = useState("");
    const [statuses, setStatuses] = useState(STILL_OPEN);
    // "" for every department
    const [department, setDepartment] = useState("");
    // the clock the ages are counted from, moved on once a minute
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(id);
    }, []);

    if (!reports) return <p className="admin-empty">Loading...</p>;

    const departments = [...new Set(reports.map((r) => r.staff.department).filter(Boolean))].sort();
    const shown = reports.filter(
        (r) =>
            (!kind || r.kind === kind) &&
            statuses.includes(r.status) &&
            (!department || r.staff.department === department),
    );
    const toggleStatus = (status) =>
        setStatuses((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));

    return (
        <div className="report-list">
            <div className="order-status-filters report-filters" role="group" aria-label="Kind">
                <button type="button" className="status-chip" aria-pressed={!kind} onClick={() => setKind("")}>
                    All
                </button>
                {Object.entries(CONCERN_KINDS).map(([key, { short }]) => (
                    <button
                        key={key}
                        type="button"
                        className="status-chip"
                        aria-pressed={kind === key}
                        onClick={() => setKind(key)}
                    >
                        {short}
                    </button>
                ))}
            </div>
            <div className="order-status-filters report-filters" role="group" aria-label="Status">
                {Object.entries(CONCERN_STATUSES).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        className="status-chip"
                        aria-pressed={statuses.includes(key)}
                        onClick={() => toggleStatus(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {departments.length > 0 && (
                <label className="report-department">
                    Department
                    <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                        <option value="">Every department</option>
                        {departments.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            {shown.length === 0 ? (
                <p className="admin-empty">
                    {reports.length === 0 ? "No reports yet." : "No reports match these filters."}
                </p>
            ) : (
                <ul>
                    {shown.map((r) => {
                        const type = CONCERN_KINDS[r.kind];
                        return (
                            <li key={r.id}>
                                <button
                                    type="button"
                                    className={`chat-list-item report-row${r.staff.id === openId ? " is-open" : ""}`}
                                    onClick={() => onPick(r.staff)}
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
                                            {r.staff.name} · {areaLabel(r.kind, r.area)} ·{" "}
                                            {type.impacts[r.impact] ?? r.impact}
                                        </span>
                                        <span className="chat-list-last">{r.details}</span>
                                    </span>
                                    <span className="chat-list-end">
                                        <time dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString()}>
                                            {age(r.createdAt, now)}
                                        </time>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
