import { ROLE_LABELS } from '../auth/roles.js';
import availabilityOf from '../data/availability.js';
import Avatar from './avatar.jsx';

// one employee in the Accounts grid: photo, name, role, employee ID, department and availability
export default function ProfileCard({ account, isMe = false }) {
    const availability = availabilityOf(account);

    return (
        <article className={`profile-card${account.disabled ? " is-disabled" : ""}`} aria-label={account.name}>
            <Avatar account={account} size={72} />
            <h3 className="profile-card-name">
                {account.name}
                {isMe && <span className="profile-card-you"> (you)</span>}
            </h3>
            <p className="profile-card-role">
                {[ROLE_LABELS[account.role], account.employeeId].filter(Boolean).join(" · ")}
            </p>
            <p className={`profile-card-dept${account.department ? "" : " is-empty"}`}>
                {account.department || "No department yet"}
            </p>
            <span className={`availability availability--${availability.key}`}>{availability.label}</span>
        </article>
    );
}
