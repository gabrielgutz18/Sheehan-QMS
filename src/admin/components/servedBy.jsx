import servedByInfo from '../data/servedBy.js';
import Avatar from './avatar.jsx';

// the tags attached to a ticket once a staff member takes the customer: their photo and
// "Being served by Maria Santos", then "Served by Maria Santos · 10:42 AM" when it's Done; nothing before that
// an order handed over to loading shows "Being loaded by Pedro Garcia" at loading, then "Loaded by Pedro Garcia" under
// the sales staff member's tag once loading is done
export default function ServedBy({ order }) {
    return servedByInfo(order).map((info) => (
        <span key={info.label} className={`served-by${info.done ? " is-done" : ""}`}>
            <Avatar account={info.account} size={22} />
            <span className="served-by-text">
                {info.label} <strong>{info.account.name}</strong>
                {info.time && <span className="served-by-time"> · {info.time}</span>}
            </span>
        </span>
    ));
}
