import { useCallback, useEffect, useState } from 'react';
import '../style/orderStatus.css';
import '../style/chat.css';

import { answerChat, answerChatImage, listChat, listChats } from '../api/chatController.js';
import { ROLE_LABELS } from '../auth/roles.js';
import { useAuth } from '../auth/authContext.js';
import Avatar from '../components/common/avatar.jsx';
import DeveloperHeads from '../components/chat/developerHeads.jsx';
import MessageThread from '../components/chat/messageThread.jsx';
import StaffList from '../components/chat/staffList.jsx';
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
                onSend={async (body, image) => {
                    added(await (image ? answerChatImage(staff.id, image, body) : answerChat(staff.id, body)));
                    onSent();
                }}
                empty="No messages yet."
                label={`Answer to ${staff.name}`}
            />
        </>
    );
}

// the developers' Chat page: everyone who has written from Message developer, newest first, with how many of their
// messages nobody has opened yet; picking one opens the conversation to answer it; the team's chat heads on top show
// which developers are online, since any of them may answer; the Staff list beside the conversations shows every staff
// member by department and who's online, and picking one opens a conversation with them, even before they've written
export default function ChatPage() {
    const { user } = useAuth();
    const [chats, setChats] = useState(null);
    const [listError, setListError] = useState("");
    // the left column: "chats" (the conversations) or "staff" (everyone, by department)
    const [view, setView] = useState("chats");
    // whose conversation is open: { id, name, role, photo }, or null
    const [openStaff, setOpenStaff] = useState(null);
    const openId = openStaff?.id ?? null;
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

    const unread = chats?.reduce((sum, c) => sum + c.unread, 0) ?? 0;

    // opening a conversation reads it, so its count goes as soon as it's picked
    const pick = (staff) => {
        setOpenStaff(staff);
        setChats((prev) => prev?.map((c) => (c.staff.id === staff.id ? { ...c, unread: 0 } : c)));
    };

    return (
        <section className="admin-page">
            <div>
                <h1 className="admin-title">Chat</h1>
                <p className="tab-hint">What staff write from Message developer when something doesn't go well. Pick one to answer.</p>
            </div>

            <div className="admin-panel">
                <DeveloperHeads meId={user.id} />
            </div>

            {listError && <p className="field-error" role="alert">{listError}</p>}

            <div className="chat-layout">
                <nav className="admin-panel chat-list" aria-label={view === "chats" ? "Conversations" : "Staff"}>
                    <div className="order-status-filters chat-views" role="group" aria-label="Show">
                        <button type="button" className="status-chip" aria-pressed={view === "chats"} onClick={() => setView("chats")}>
                            Conversations
                            {unread > 0 && <span className="status-chip-count">{unread}</span>}
                        </button>
                        <button type="button" className="status-chip" aria-pressed={view === "staff"} onClick={() => setView("staff")}>
                            Staff
                        </button>
                    </div>
                    {view === "staff" ? (
                        <StaffList openId={openId} onPick={pick} />
                    ) : !chats ? (
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
                                        onClick={() => pick(staff)}
                                    >
                                        <Avatar account={staff} size={36} />
                                        <span className="chat-list-text">
                                            <span className="chat-list-name">
                                                <strong>{staff.name}</strong>
                                                <span className="history-note">
                                                    {ROLE_LABELS[staff.role] ?? staff.role}{staff.disabled && " · switched off"}
                                                </span>
                                            </span>
                                            <span className="chat-list-last">
                                                {!last.fromStaff && `${last.from.id === user.id ? "You" : last.from.name}: `}
                                                {last.image ? (last.body ? `Picture · ${last.body}` : "Picture") : last.body}
                                            </span>
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
                    {openStaff ? (
                        // keyed by who it's with, so picking someone else starts their conversation afresh
                        <Conversation key={openStaff.id} staff={openStaff} onSent={() => setSent((n) => n + 1)} />
                    ) : (
                        <p className="admin-empty">Pick a conversation, or someone on the Staff list, on the left.</p>
                    )}
                </div>
            </div>
        </section>
    );
}
