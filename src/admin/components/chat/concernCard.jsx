import { useState } from "react";

import { CONCERN_KINDS, CONCERN_STATUSES, areaLabel } from "../../../data/concerns.js";
import Icon from "../common/icon.jsx";

const MAX_NOTE = 1000;

// what a developer can move a report to from where it stands; Done or Declined can only be reopened
const NEXT = {
    open: [
        ["in_progress", "In progress"],
        ["done", "Done"],
        ["declined", "Decline"],
    ],
    in_progress: [
        ["done", "Done"],
        ["declined", "Decline"],
        ["open", "Back to open"],
    ],
    done: [["open", "Reopen"]],
    declined: [["open", "Reopen"]],
};

// where a report stands, as a colored badge
/** @param {{ status: string }} props */
export function ConcernStatus({ status }) {
    return <span className={`concern-status is-${status}`}>{CONCERN_STATUSES[status] ?? status}</span>;
}

// a report in a conversation: its kind and number, where it stands, the page or topic, how bad, and what was said
// canChange: the developer's buttons to move it along, with an optional note for the staff member;
// onChange(status, note) saves it, and throws with the server's message when it can't
/**
 * @param {{ concern: any, canChange?: boolean, onChange?: (status: string, note: string) => Promise<any> }} props
 */
export default function ConcernCard({ concern, canChange = false, onChange }) {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const kind = CONCERN_KINDS[concern.kind];

    const change = async (status) => {
        setBusy(true);
        setError("");
        try {
            await onChange?.(status, note.trim());
            setNote("");
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <article className="concern-card" aria-label={`${kind?.short ?? "Report"} #${concern.id}`}>
            <header className="concern-card-head">
                <span className="concern-card-kind">
                    {kind && <Icon d={kind.icon} className="line-icon concern-icon" />}
                    {kind?.short ?? concern.kind} #{concern.id}
                </span>
                <ConcernStatus status={concern.status} />
            </header>
            <dl className="concern-card-facts">
                <div>
                    <dt>{concern.kind === "bug" ? "Page" : concern.kind === "concern" ? "About" : "Department"}</dt>
                    <dd>{areaLabel(concern.kind, concern.area)}</dd>
                </div>
                <div>
                    <dt>{concern.kind === "feature" ? "Would help" : "How bad"}</dt>
                    <dd>{kind?.impacts[concern.impact] ?? concern.impact}</dd>
                </div>
            </dl>
            <p className="concern-card-details">{concern.details}</p>
            {concern.extra && (
                <p className="concern-card-details">
                    <strong>How it would help:</strong> {concern.extra}
                </p>
            )}
            {concern.statusNote && <p className="concern-card-note">Developer's note: {concern.statusNote}</p>}

            {canChange && (
                <div className="concern-card-actions">
                    <textarea
                        aria-label={`Note for report #${concern.id}`}
                        rows={2}
                        maxLength={MAX_NOTE}
                        placeholder="A note for them (optional)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        disabled={busy}
                    />
                    <div className="concern-card-buttons">
                        {NEXT[concern.status]?.map(([status, label]) => (
                            <button
                                key={status}
                                type="button"
                                className={`admin-btn${status === "done" ? " admin-btn-primary" : ""}`}
                                onClick={() => change(status)}
                                disabled={busy}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {error && (
                        <p className="field-error" role="alert">
                            {error}
                        </p>
                    )}
                </div>
            )}
        </article>
    );
}
