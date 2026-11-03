import { useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import "../../style/chat.css";

import Avatar from "../common/avatar.jsx";
import Icon from "../common/icon.jsx";

// long enough to look up from the counter and read it
const SHOWN_MS = 10000;
const CLOSE_ICON = "M6 6l12 12M18 6 6 18";
// where each kind of message is answered from
const CHAT_PAGES = { sheechat: "/staff/sheechat", developer: "/staff/message-developer", staff: "/staff/chat" };

const timeToday = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const timeEarlier = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// when it was sent: the day too for one that waited since an earlier day, as those pop up at the next sign-in
const sentWhen = (sentAt) => {
    const sent = new Date(sentAt);
    return (sent.toDateString() === new Date().toDateString() ? timeToday : timeEarlier).format(sent);
};

const onVisibilityChange = (listener) => {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
};

// one pop-up: the sender's photo and name, what they wrote and when, nothing more; it stays while the pointer or keyboard is on it, and
// while the tab is in the background, so nobody misses a message by being on another window; a newer message in the
// conversation starts its time again; the X only shows on the pop-up the pointer or keyboard is on
function MessageToast({ message, onOpen, onDismiss }) {
    const { key, id, from, body, image, sentAt } = message;
    const text = image ? (body ? `Picture · ${body}` : "Picture") : body;
    const when = sentWhen(sentAt);
    const [held, setHeld] = useState(false);
    const tabHidden = useSyncExternalStore(onVisibilityChange, () => document.hidden);

    useEffect(() => {
        if (held || tabHidden) return;
        const timer = setTimeout(() => onDismiss(key), SHOWN_MS);
        return () => clearTimeout(timer);
    }, [key, id, held, tabHidden, onDismiss]);

    return (
        <div
            className="message-toast"
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
        >
            <button
                type="button"
                className="message-toast-open"
                aria-label={`Message from ${from.name}: ${text} (${when})`}
                onClick={() => onOpen(message)}
            >
                <Avatar account={from} size={36} />
                <span className="message-toast-text">
                    <span className="message-toast-from">
                        <strong>{from.name}</strong>
                        <time className="message-toast-time" dateTime={sentAt}>{when}</time>
                    </span>
                    <span className="message-toast-body">{text}</span>
                </span>
            </button>
            <button
                type="button"
                className="message-toast-close"
                aria-label={`Dismiss message from ${from.name}`}
                onClick={() => onDismiss(key)}
            >
                <Icon d={CLOSE_ICON} className="admin-nav-icon" />
            </button>
        </div>
    );
}

// the corner of every staff page: a pop-up when someone writes to the person signed in, which opens the conversation
// when clicked; the region is always there, as screen readers only announce what's added to one they already know
// toasts, dismiss: from useMessageToasts
export default function MessageToasts({ toasts, dismiss }) {
    const navigate = useNavigate();

    const open = ({ key, kind, from }) => {
        dismiss(key);
        navigate(CHAT_PAGES[kind], { state: { open: from } });
    };

    return (
        <div className="message-toasts" role="region" aria-live="polite" aria-label="New messages">
            {toasts.map((message) => (
                <MessageToast key={message.key} message={message} onOpen={open} onDismiss={dismiss} />
            ))}
        </div>
    );
}
