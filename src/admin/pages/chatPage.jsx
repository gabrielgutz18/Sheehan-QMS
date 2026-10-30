import { useCallback, useEffect, useState } from 'react';
import '../style/chat.css';

import { answerChat, listChat, listChats } from '../api/chatController.js';
import { ROLE_LABELS } from '../auth/roles.js';
import Avatar from '../components/common/avatar.jsx';
import MessageThread from '../components/chat/messageThread.jsx';
import useMessages from '../hooks/useMessages.js';

// new messages should show up while a developer has the page open
const REFRESH_MS = 5000;
const lastTime = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

// the open conversation, answered by the developer signed in; onSent: once an answer is saved
function Conversation({ staff, onSent }) {
    const list = useCallback((options) => listChat(staff.id, options), [staff.id]);
    const { messages, loading, error, added } = useMessages(list);

    return (
        <>
            <h2>{staff.name}</h2>
            <MessageThread
                messages={messages}
                loading={loading}
                error={error}
                mine={(m) => !m.fromStaff}
                onSend={async (body) => {
                    added(await answerChat(staff.id, body));
                    onSent();
                }}
                empty="No messages yet."
                label={`Answer to ${staff.name}`}
            />
        </>
    );
}

// the developers' Chat page: everyone who has written from Message developer, newest first, with how many of their
// messages nobody has opened yet; picking one opens the conversation to answer it
export default function ChatPage() {
    const [chats, setChats] = useState(null);
    const [listError, setListError] = useState("");
    const [openId, setOpenId] = useState(null);
    // bumped on every answer, so the list shows it as the last message straight away
    const [sent, setSent] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const load = () =>
            listChats({ signal })
                .then((data) => {
                    setChats(data ?? []);
                    setListError("");
                })
                .catch((err) => !signal.aborted && setListError(err.message));
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, [sent]);

    const open = chats?.find(({ staff }) => staff.id === openId);

    // opening a conversation reads it, so its count goes as soon as it's picked
    const pick = (staffId) => {
        setOpenId(staffId);
        setChats((prev) => prev.map((c) => (c.staff.id === staffId ? { ...c, unread: 0 } : c)));
    };

    return (
        <section className="admin-page">
            <div>
                <h1 className="admin-title">Chat</h1>
                <p className="tab-hint">What staff write from Message developer when something doesn't go well. Pick one to answer.</p>
            </div>

            {listError && <p className="field-error" role="alert">{listError}</p>}

            <div className="chat-layout">
                <nav className="admin-panel chat-list" aria-label="Conversations">
                    {!chats ? (
                        <p className="admin-empty">Loading...</p>
                    ) : chats.length === 0 ? (
                        <p className="admin-empty">Nobody has written yet.</p>
                    ) : (
                        <ul>
                            {chats.map(({ staff, last, unread }) => (
                                <li key={staff.id}>
                                    <button
                                        type="button"
                                        className={`chat-list-item${staff.id === openId ? " is-open" : ""}`}
                                        aria-current={staff.id === openId ? "true" : undefined}
                                        onClick={() => pick(staff.id)}
                                    >
                                        <Avatar account={staff} size={36} />
                                        <span className="chat-list-text">
                                            <span className="chat-list-name">
                                                <strong>{staff.name}</strong>
                                                <span className="history-note">
                                                    {ROLE_LABELS[staff.role] ?? staff.role}{staff.disabled && " · switched off"}
                                                </span>
                                            </span>
                                            <span className="chat-list-last">{last.fromStaff ? "" : "You: "}{last.body}</span>
                                        </span>
                                        <span className="chat-list-end">
                                            <time dateTime={last.sentAt}>{lastTime.format(new Date(last.sentAt))}</time>
                                            {unread > 0 && (
                                                <span className="chat-unread" aria-label={`${unread} unread`}>{unread}</span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </nav>

                <div className="admin-panel chat-panel">
                    {open ? (
                        // keyed by who it's with, so picking someone else starts their conversation afresh
                        <Conversation key={open.staff.id} staff={open.staff} onSent={() => setSent((n) => n + 1)} />
                    ) : (
                        <p className="admin-empty">Pick a conversation on the left.</p>
                    )}
                </div>
            </div>
        </section>
    );
}
