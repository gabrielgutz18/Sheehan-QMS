import { changedDetails, editTime } from '../../data/orderEdits.js';
import Avatar from '../common/avatar.jsx';

function EditLine({ edit }) {
    return (
        <>
            <span className="edited-by-tag">
                <Avatar account={edit.by} size={22} />
                <span className="served-by-text">
                    Edited by <strong>{edit.by.name}</strong>
                    {edit.team && <> · {edit.team}</>}
                    <span className="served-by-time"> · {editTime(edit.at)}</span>
                </span>
            </span>
            <span className="edited-by-changes">Changed {changedDetails(edit.changes)}</span>
        </>
    );
}

// the last time someone saved a change to the order on Customer order, under its other tags: "Edited by Gabriel
// Gutierrez · GIGA · 12:54 PM" (their own sales team, as it was then) and what they changed; the edits before it open
// below, newest first; nothing until the first edit
// edits: from the orders or history API, newest first
export default function EditedBy({ edits }) {
    if (!edits?.length) return null;
    const [latest, ...earlier] = edits;
    return (
        <div className="edited-by">
            <EditLine edit={latest} />
            {earlier.length > 0 && (
                <details className="edited-by-earlier">
                    <summary>{earlier.length === 1 ? "1 earlier edit" : `${earlier.length} earlier edits`}</summary>
                    <ul>
                        {earlier.map((edit, i) => (
                            <li key={`${edit.at}-${i}`}><EditLine edit={edit} /></li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
