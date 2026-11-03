import { useCallback, useEffect, useState } from 'react';

// a conversation is answered while someone waits on it, so it fetches again often
const REFRESH_MS = 5000;

// a chat's messages, kept fresh while it's open; list({ signal }) fetches them
// added(message): one just sent, shown straight away instead of on the next fetch
// fetching is what marks a conversation as read, so a tab in the background doesn't: the other person shouldn't get
// "seen" for what's sitting behind another window; it fetches again as soon as the tab is back
export default function useMessages(list) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const load = () => {
            if (document.hidden) return;
            list({ signal })
                .then((data) => {
                    setMessages(data ?? []);
                    setError("");
                })
                .catch((err) => {
                    if (!signal.aborted) setError(err.message);
                })
                .finally(() => {
                    if (!signal.aborted) setLoading(false);
                });
        };

        load();
        const id = setInterval(load, REFRESH_MS);
        document.addEventListener("visibilitychange", load);
        return () => {
            clearInterval(id);
            document.removeEventListener("visibilitychange", load);
            controller.abort();
        };
    }, [list]);

    const added = useCallback((message) =>
        setMessages((prev) => (prev.some(({ id }) => id === message.id) ? prev : [...prev, message])), []);

    return { messages, loading, error, added };
}
