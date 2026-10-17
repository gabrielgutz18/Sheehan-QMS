import servedByInfo from '../data/servedBy.js';
import Avatar from './avatar.jsx';

// the tag attached to a ticket once a staff member takes the customer: their photo and
// "Being served by Maria Santos", then "Served by Maria Santos · 10:42 AM" when it's Done; nothing before that
export default function ServedBy({ order }) {
    const info = servedByInfo(order);
    if (!info) return null;

    return (
        <span className={`served-by${info.done ? " is-done" : ""}`}>
            <Avatar account={info.account} size={22} />
            <span className="served-by-text">
                {info.label} <strong>{info.account.name}</strong>
                {info.time && <span className="served-by-time"> · {info.time}</span>}
            </span>
        </span>
    );
}
