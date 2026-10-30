import { useEffect, useRef, useState } from 'react';

import { ROLE_LABELS } from '../../auth/roles.js';
import Avatar from '../common/avatar.jsx';

const MAX_MESSAGE = 1000;
const sentTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// one conversation between a staff member and the developers, oldest at the top, with a box to write the next message
// mine(message): whether it's the signed-in side's, shown on the right; onSend(body) saves one and gives it back
// empty: what shows before anyone has written; label: the box's name for screen readers
export default function MessageThread({ messages, loading, error, mine, onSend, empty, label }) {
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");
    const listRef = useRef(null);
    const lastId = messages.at(-1)?.id;

    // keep the newest message in view as they come in
    useEffect(() => {
        const list = listRef.current;
        if (list) list.scrollTop = list.scrollHeight;
    }, [lastId]);

    const send = async (e) => {
        e.preventDefault();
        const body = draft.trim();
        if (!body || sending) return;
        setSending(true);
        setSendError("");
        try {
            await onSend(body);
            setDraft("");
        } catch (err) {
            setSendError(err.message);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="chat-thread">
            <ol ref={listRef} className="chat-messages" aria-live="polite">
                {loading && messages.length === 0 ? (
                    <li className="admin-empty">Loading...</li>
                ) : messages.length === 0 ? (
                    <li className="admin-empty">{empty}</li>
                ) : (
                    messages.map((m) => (
                        <li key={m.id} className={`chat-message${mine(m) ? " is-mine" : ""}`}>
                            <Avatar account={m.from} size={28} />
                            <div className="chat-bubble">
                                <p className="chat-meta">
                                    <strong>{m.from.name}</strong>
                                    <span>{ROLE_LABELS[m.from.role] ?? m.from.role}</span>
                                    <time dateTime={m.sentAt}>{sentTime.format(new Date(m.sentAt))}</time>
                                </p>
                                <p className="chat-body">{m.body}</p>
                                {mine(m) && m.read && <p className="chat-seen">Seen</p>}
                            </div>
                        </li>
                    ))
                )}
            </ol>

            {error && <p className="field-error" role="alert">{error}</p>}

            <form className="chat-compose" onSubmit={send}>
                <textarea
                    aria-label={label}
                    rows={3}
                    maxLength={MAX_MESSAGE}
                    placeholder="Write a message..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter sends, Shift+Enter starts a new line
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
                    }}
                />
                <div className="chat-compose-actions">
                    <span className="video-hint">{draft.length}/{MAX_MESSAGE} · Enter sends, Shift+Enter for a new line</span>
                    <button type="submit" className="admin-btn admin-btn-primary" disabled={sending || !draft.trim()}>
                        {sending ? "Sending..." : "Send"}
                    </button>
                </div>
                {sendError && <p className="field-error" role="alert">{sendError}</p>}
            </form>
        </div>
    );
}
