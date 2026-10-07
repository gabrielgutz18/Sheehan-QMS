import { useEffect, useState } from 'react';

import { listOrders } from '../api/adminOrderController.js';

// keep the queue fresh while the page is open
const REFRESH_MS = 10000;

export default function useOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const load = () =>
            listOrders({ signal })
                .then((data) => {
                    setOrders(data ?? []);
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
    }, []);

    return { orders, setOrders, loading, error };
}
