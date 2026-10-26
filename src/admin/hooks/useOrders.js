import { useCallback, useEffect, useRef, useState } from 'react';

import { listOrders } from '../api/adminOrderController.js';

// keep the queue fresh while the page is open
const REFRESH_MS = 10000;

// refreshMs: how often to fetch again; the Order sheet, which several people work on at once, asks for it sooner
// list: what to fetch, today's orders unless given; the Order sheet fetches every day's (listOrderSheet)
// changed(): call it when a save starts and when it ends; a refresh asked for before then is dropped, since it would
// show the change undone until the next one
export default function useOrders({ refreshMs = REFRESH_MS, list = listOrders } = {}) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const saves = useRef(0);
    const changed = useCallback(() => {
        saves.current += 1;
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const load = () => {
            const asked = saves.current;
            return list({ signal })
                .then((data) => {
                    if (saves.current !== asked) return;
                    setOrders(data ?? []);
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
        const id = setInterval(load, refreshMs);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, [refreshMs, list]);

    return { orders, setOrders, loading, error, changed };
}
