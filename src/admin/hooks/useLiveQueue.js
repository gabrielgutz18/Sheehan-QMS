import { getQueue } from '../../api/queueController.js';
import useOrders from './useOrders.js';

// the queue as the display has it (GET /queue, which every staff member can read: numbers, names and purposes, never
// order details), in the shape listOrders gives, so the Dashboard's cards and lists read either one
const listLiveQueue = (options) =>
    getQueue(options).then(({ serving, upcoming }) => [
        ...serving.map((o) => ({ ...o, status: "serving" })),
        ...upcoming.map(({ returning, ...o }) => ({ ...o, status: returning ? "returning" : "pending" })),
    ]);

// as often as the queue display checks, so the two show the same calls
const LIVE_MS = 5000;

// today's queue for the Dashboard, kept fresh: admins get every order with its details (for the counts by status and
// opening a ticket); everyone else gets the live queue
export default function useLiveQueue(role) {
    return useOrders(role === "admin" ? { refreshMs: LIVE_MS } : { refreshMs: LIVE_MS, list: listLiveQueue });
}
