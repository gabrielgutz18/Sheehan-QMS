import { useCallback, useEffect, useState } from 'react';

// a conversation is answered while someone waits on it, so it fetches again often
const REFRESH_MS = 5000;

// a chat's messages, kept fresh while it's open; list({ signal }) fetches them
// added(message): one just sent, shown straight away instead of on the next fetch
export default function useMessages(list) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const load = () =>
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

        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, [list]);

    const added = useCallback((message) =>
        setMessages((prev) => (prev.some(({ id }) => id === message.id) ? prev : [...prev, message])), []);

    return { messages, loading, error, added };
}
