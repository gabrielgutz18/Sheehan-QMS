import { useEffect, useState } from 'react';

import { listStaffPresence } from '../../api/chatController.js';
import { ROLE_LABELS } from '../../auth/roles.js';
import { seenAgo } from '../../data/lastSeen.js';
import Avatar from '../common/avatar.jsx';

// who's online changes as staff come and go, so it checks again now and then
const REFRESH_MS = 15000;
// the departments, in the order the sidebar has their pages; each is a kind of staff account
const DEPARTMENTS = ["admin", "sales", "loading", "tba", "hardware", "security", "cashier"];

// the Chat page's Staff list: every staff member by department, online ones first in each, with a green dot on the
// ones online and when the others were last on; picking one opens a conversation with them
// openId: the staff member whose conversation is open; onPick(account) opens theirs
export default function StaffList({ openId, onPick }) {
    const [staff, setStaff] = useState(null);
    const [error, setError] = useState("");
    const [onlineOnly, setOnlineOnly] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const load = () =>
            listStaffPresence({ signal })
                .then((data) => {
                    setStaff(data ?? []);
                    setError("");
                })
                .catch((err) => !signal.aborted && setError(err.message));
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    if (error) return <p className="field-error" role="alert">{error}</p>;
    if (!staff) return <p className="admin-empty">Loading...</p>;

    const online = staff.filter((s) => s.online).length;
    // the server sends them online first, then by name, so each department keeps that order
    const groups = DEPARTMENTS
        .map((role) => ({ role, members: staff.filter((s) => s.role === role) }))
        .filter(({ members }) => members.length > 0);

    return (
        <div className="chat-staff">
            <label className="chat-staff-filter">
                <input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} />
                Online only ({online} of {staff.length})
            </label>

            {groups.length === 0 && <p className="admin-empty">No staff accounts yet.</p>}

            {groups.map(({ role, members }) => {
                const shown = onlineOnly ? members.filter((s) => s.online) : members;
                const headingId = `chat-staff-${role}`;
                return (
                    <section key={role} className="chat-staff-group" aria-labelledby={headingId}>
                        <h3 id={headingId} className="chat-staff-heading">
                            {ROLE_LABELS[role]}
                            <span>{members.filter((s) => s.online).length} of {members.length} online</span>
                        </h3>
                        {shown.length === 0 ? (
                            <p className="chat-staff-none">Nobody online.</p>
                        ) : (
                            <ul>
                                {shown.map((s) => (
                                    <li key={s.id}>
                                        <button
                                            type="button"
                                            className={`chat-list-item${s.id === openId ? " is-open" : ""}`}
                                            aria-current={s.id === openId ? "true" : undefined}
                                            onClick={() => onPick(s)}
                                        >
                                            <span className={`chat-head-photo${s.online ? " is-online" : ""}`}>
                                                <Avatar account={s} size={32} />
                                                <span className="chat-head-dot" aria-hidden="true" />
                                            </span>
                                            <span className="chat-list-text">
                                                <strong>{s.name}</strong>
                                                {s.department && <span className="chat-list-last">{s.department}</span>}
                                            </span>
                                            <span className={`chat-staff-status${s.online ? " is-online" : ""}`}>
                                                {s.online ? "Online" : seenAgo(s.lastSeen)}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
