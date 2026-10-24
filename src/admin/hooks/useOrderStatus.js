import { useEffect, useState } from 'react';

import { listOrderStatus } from '../api/adminOrderController.js';

// the Order status board is watched by every counter and crew, so it refreshes more often than the queue
const REFRESH_MS = 5000;

// today's orders for the Order status board, kept fresh while it's open; updatedAt is when they last came in, so a
// board that can't reach the server shows how old its news is
export default function useOrderStatus() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updatedAt, setUpdatedAt] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        const load = () =>
            listOrderStatus({ signal })
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
    }, []);

    return { orders, loading, error, updatedAt };
}
