import { useCallback, useEffect, useState } from 'react';
import '../style/orderStatus.css';
import '../style/chat.css';

import {
    listSheeChat, listSheeChatPeople, listSheeChats, sendSheeChat, sendSheeChatImage, sheeChatImageUrl,
} from '../api/sheechatController.js';
import { ROLE_LABELS } from '../auth/roles.js';
import { useAuth } from '../auth/authContext.js';
import Avatar from '../components/common/avatar.jsx';
import MessageThread from '../components/chat/messageThread.jsx';
import StaffList from '../components/chat/staffList.jsx';
import useMessages from '../hooks/useMessages.js';

// new messages should show up while the page is open
const REFRESH_MS = 5000;
const lastTime = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

// the open conversation with one person; onSent: once a message is saved
function Conversation({ person, meId, onSent }) {
    const list = useCallback((options) => listSheeChat(person.id, options), [person.id]);
    const { messages, loading, error, added } = useMessages(list);

    return (
        <>
            <h2>
                {person.name}
                <span className="history-note"> {ROLE_LABELS[person.role] ?? person.role}</span>
            </h2>
            <MessageThread
                messages={messages}
                loading={loading}
                error={error}
                mine={(m) => m.from.id === meId}
                imageUrl={sheeChatImageUrl}
                disabled={person.disabled ? `${person.name}'s account is switched off, so you can't send them messages.` : ""}
                onSend={async (body, image) => {
                    added(await (image ? sendSheeChatImage(person.id, image, body) : sendSheeChat(person.id, body)));
                    onSent();
                }}
                empty={`No messages yet. Say hello to ${person.name}.`}
                label={`Message to ${person.name}`}
            />
        </>
    );
}

// SheeChat, for every role but the developers: chat with anyone else on the staff, one conversation per person;
// Conversations lists the people you've talked to, newest first, with how many of theirs you haven't opened; People
// lists everyone by department, online ones first, to start a new one
export default function SheeChatPage() {
    const { user } = useAuth();
    const [chats, setChats] = useState(null);
    const [listError, setListError] = useState("");
    // the left column: "chats" (your conversations) or "people" (everyone, by department)
    const [view, setView] = useState("chats");
    // who the open conversation is with: { id, name, role, photo, disabled? }, or null
    const [openPerson, setOpenPerson] = useState(null);
    const openId = openPerson?.id ?? null;
    // bumped on every message sent, so the list shows it as the last one straight away
    const [sent, setSent] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const load = () =>
            listSheeChats({ signal })
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

    const unread = chats?.reduce((sum, c) => sum + c.unread, 0) ?? 0;

    // opening a conversation reads it, so its count goes as soon as it's picked
    const pick = (person) => {
        setOpenPerson(person);
        setChats((prev) => prev?.map((c) => (c.with.id === person.id ? { ...c, unread: 0 } : c)));
    };

    return (
        <section className="admin-page">
            <div>
                <h1 className="admin-title">SheeChat</h1>
                <p className="tab-hint">Chat with anyone on the staff. Pick a conversation, or someone on People to start one.</p>
            </div>

            {listError && <p className="field-error" role="alert">{listError}</p>}

            <div className="chat-layout">
                <nav className="admin-panel chat-list" aria-label={view === "chats" ? "Conversations" : "People"}>
                    <div className="order-status-filters chat-views" role="group" aria-label="Show">
                        <button type="button" className="status-chip" aria-pressed={view === "chats"} onClick={() => setView("chats")}>
                            Conversations
                            {unread > 0 && <span className="status-chip-count">{unread}</span>}
                        </button>
                        <button type="button" className="status-chip" aria-pressed={view === "people"} onClick={() => setView("people")}>
                            People
                        </button>
                    </div>
                    {view === "people" ? (
                        <StaffList openId={openId} onPick={pick} list={listSheeChatPeople} />
                    ) : !chats ? (
                        <p className="admin-empty">Loading...</p>
                    ) : chats.length === 0 ? (
                        <p className="admin-empty">No conversations yet. Pick someone on People to start one.</p>
                    ) : (
                        <ul>
                            {chats.map(({ with: person, last, unread: count }) => (
                                <li key={person.id}>
                                    <button
                                        type="button"
                                        className={`chat-list-item${person.id === openId ? " is-open" : ""}`}
                                        aria-current={person.id === openId ? "true" : undefined}
                                        onClick={() => pick(person)}
                                    >
                                        <Avatar account={person} size={36} />
                                        <span className="chat-list-text">
                                            <span className="chat-list-name">
                                                <strong>{person.name}</strong>
                                                <span className="history-note">
                                                    {ROLE_LABELS[person.role] ?? person.role}{person.disabled && " · switched off"}
                                                </span>
                                            </span>
                                            <span className="chat-list-last">
                                                {last.mine && "You: "}
                                                {last.image ? (last.body ? `Picture · ${last.body}` : "Picture") : last.body}
                                            </span>
                                        </span>
                                        <span className="chat-list-end">
                                            <time dateTime={last.sentAt}>{lastTime.format(new Date(last.sentAt))}</time>
                                            {count > 0 && (
                                                <span className="chat-unread" aria-label={`${count} unread`}>{count}</span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </nav>

                <div className="admin-panel chat-panel">
                    {openPerson ? (
                        // keyed by who it's with, so picking someone else starts their conversation afresh
                        <Conversation
                            key={openPerson.id}
                            person={openPerson}
                            meId={user.id}
                            onSent={() => setSent((n) => n + 1)}
                        />
                    ) : (
                        <p className="admin-empty">Pick a conversation, or someone on People, on the left.</p>
                    )}
                </div>
            </div>
        </section>
    );
}
