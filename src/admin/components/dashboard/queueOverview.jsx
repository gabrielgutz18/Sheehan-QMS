import formatQueueNum from '../../../data/queueNum.js';
import { inLine } from '../../data/orderStatus.js';
import Icon from '../common/icon.jsx';

const ICONS = {
    serving: "M4 9v6h4l5 4V5L8 9zM16 9a3 3 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11",
    line: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.75",
    next: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4zM14 5v2M14 11v2M14 17v2",
};

// the Dashboard's first row, for every staff member: how many are being served and in line now, and the next number
// a counter will call
export default function QueueOverview({ orders, loading }) {
    const line = orders.filter(inLine);
    const next = line[0];
    const cards = [
        { label: "Now serving", value: orders.filter((o) => o.status === "serving").length, icon: ICONS.serving },
        { label: "In line", value: line.length, icon: ICONS.line },
        { label: "Next number", value: next ? formatQueueNum(next.queueNum, next.purpose) : "None", icon: ICONS.next },
    ];

    return (
        <div className="stat-grid">
            {cards.map(({ label, value, icon }) => (
                <div key={label} className="stat-card has-icon">
                    <span className="stat-icon"><Icon d={icon} /></span>
                    <span className="stat-label">{label}</span>
                    <span className="stat-value">{loading ? "–" : value}</span>
                </div>
            ))}
        </div>
    );
}
