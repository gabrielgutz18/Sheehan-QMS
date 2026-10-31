import useOrders from '../../hooks/useOrders.js';
import formatQueueNum from '../../../data/queueNum.js';

// View queue ticket on Customer order: today's tickets, newest first, to open one's ticket and print it again
// (the list keeps itself fresh, so a ticket served a moment ago joins it within a few seconds)
// current: the ticket open now, or null; onView(queueNum) opens another
export default function TicketPicker({ current, onView }) {
    const { orders, loading, error } = useOrders();
    const newestFirst = [...orders].reverse();

    return (
        <label className="admin-filter ticket-picker">
            <span>View queue ticket</span>
            <select
                value={current ?? ""}
                disabled={loading && orders.length === 0}
                aria-describedby={error ? "ticket-picker-error" : undefined}
                onChange={(e) => e.target.value && onView(Number(e.target.value))}
            >
                <option value="">
                    {loading && orders.length === 0 ? "Loading..." : newestFirst.length ? "Pick a ticket..." : "No tickets yet today"}
                </option>
                {newestFirst.map((o) => (
                    <option key={o.queueNum} value={o.queueNum}>
                        {formatQueueNum(o.queueNum, o.purpose, o.priority)} · {o.name}
                    </option>
                ))}
            </select>
            {error && <span id="ticket-picker-error" className="field-error">{error}</span>}
        </label>
    );
}
