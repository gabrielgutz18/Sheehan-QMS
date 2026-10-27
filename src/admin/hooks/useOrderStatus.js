import { useCallback, useEffect, useState } from 'react';

import { listOrderStatus } from '../api/adminOrderController.js';

// the Order status board is watched by every counter and crew, so it refreshes more often than the queue
const REFRESH_MS = 5000;

// today's orders for the Order status board, kept fresh while it's open; updatedAt is when they last came in, so a
// board that can't reach the server shows how old its news is
// list: what to fetch, the board's own orders unless given; the Security page fetches them with what each customer
// bought (listSecurityOrders)
// refresh(): fetch them again now, e.g. once the guard has checked an order
export default function useOrderStatus({ list = listOrderStatus } = {}) {
    const [orders, setOrders] = useState([]);
    const [asked, setAsked] = useState(0);
    const refresh = useCallback(() => setAsked((n) => n + 1), []);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updatedAt, setUpdatedAt] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const load = () =>
            list({ signal })
                .then((data) => {
                    setOrders(data ?? []);
                    setError("");
                    setUpdatedAt(new Date());
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
    }, [list, asked]);

    return { orders, loading, error, updatedAt, refresh };
}
