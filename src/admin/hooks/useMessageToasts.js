import { useCallback, useEffect, useState } from 'react';

import { listUnreadMessages } from '../api/chatController.js';

// as often as the chat pages themselves look for new messages
const REFRESH_MS = 5000;
// after a long time away several people may have written; more than this would cover the page
const MAX_SHOWN = 4;

// which conversation a message is in; every developer's answer is in the one conversation with the team
const conversationKey = ({ kind, from }) => (kind === "developer" ? kind : `${kind}:${from.id}`);

// the conversation open on this tab's page right now, or null; no pop-up for what's already on screen
let viewing = null;

// a chat page calls this for the conversation it has open: 'sheechat:<their id>', 'staff:<their id>' or 'developer'
export function useViewingConversation(key) {
    useEffect(() => {
        viewing = key;
        return () => {
            viewing = null;
        };
    }, [key]);
}

// the newest message already popped up in each conversation, kept per tab so a reload doesn't show them all again, and
// per account as a tab can sign in as someone else; blocked storage only means they show again after a reload
const seenKey = (userId) => `messageToastsSeen:${userId}`;
const loadSeen = (userId) => {
    try {
        return JSON.parse(sessionStorage.getItem(seenKey(userId))) ?? {};
    } catch {
        return {};
    }
};
const saveSeen = (userId, seen) => {
    try {
        sessionStorage.setItem(seenKey(userId), JSON.stringify(seen));
    } catch {
        // kept for as long as the page is open instead
    }
};

// the pop-ups to show for what others wrote to userId, oldest first: one per conversation, as listUnreadMessages has
// them plus key; a new message updates its conversation's pop-up, and one goes once it's read, on any tab
// dismiss(key): take one away; it comes back only when another message arrives in that conversation
// unreadSheeChat: whether anything on SheeChat is still unopened, popped up or not, for the red dot in the sidebar
export default function useMessageToasts(userId) {
    const [toasts, setToasts] = useState([]);
    const [unreadSheeChat, setUnreadSheeChat] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        const seen = loadSeen(userId);

        const load = () =>
            listUnreadMessages({ signal })
                .then((data) => {
                    const open = viewing;
                    const unread = (data ?? []).map((message) => ({ ...message, key: conversationKey(message) }));
                    // oldest first, so the newest lands at the bottom, nearest the corner
                    const fresh = unread.filter(({ key, id }) => key !== open && id > (seen[key] ?? 0)).toReversed();
                    unread.forEach(({ key, id }) => {
                        seen[key] = id;
                    });
                    saveSeen(userId, seen);

                    setUnreadSheeChat(unread.some(({ kind, key }) => kind === "sheechat" && key !== open));
                    setToasts((shown) => {
                        const kept = shown
                            .map(({ key }) => unread.find((message) => message.key === key))
                            .filter((message) => message && message.key !== open);
                        const added = fresh.filter(({ key }) => !kept.some((message) => message.key === key));
                        const next = [...kept, ...added].slice(-MAX_SHOWN);
                        // the same as before: left alone, so the page around them isn't drawn again every few seconds
                        const same = next.length === shown.length && next.every(({ id }, i) => id === shown[i].id);
                        return same ? shown : next;
                    });
                })
                // the page's own requests say when the server can't be reached, and the next try may work
                .catch(() => {});

        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, [userId]);

    const dismiss = useCallback((key) => setToasts((shown) => shown.filter((toast) => toast.key !== key)), []);

    return { toasts, dismiss, unreadSheeChat };
}
