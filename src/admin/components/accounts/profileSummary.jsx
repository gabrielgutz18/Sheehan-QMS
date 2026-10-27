import { Link } from 'react-router';

import { ROLE_LABELS } from '../../auth/roles.js';
import Avatar from '../common/avatar.jsx';
import Icon from '../common/icon.jsx';

const EDIT_ICON = "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4";
const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

// the signed-in staff member at the top of the Dashboard's side panel: their photo on a banner, their name and
// username, and the details they keep on My account (where the pencil goes to change them); a detail they haven't
// filled in is left out
// account: the signed-in account, from useAuth()
export default function ProfileSummary({ account }) {
    const facts = [
        { label: "Role", value: ROLE_LABELS[account.role] ?? account.role },
        { label: "Employee ID", value: account.employeeId },
        { label: "Department", value: account.department },
        { label: "Sales team", value: account.team },
        { label: "Joined on", value: account.createdAt && dayFormat.format(new Date(account.createdAt)) },
    ].filter(({ value }) => value);

    return (
        <section className="profile-summary" aria-label="Your profile">
            <div className="profile-summary-cover">
                <Link to="/admin/account" className="profile-summary-edit" aria-label="Edit my account">
                    <Icon d={EDIT_ICON} />
                </Link>
            </div>
            <div className="profile-summary-body">
                <Avatar account={account} size={64} />
                <p className="profile-summary-name">{account.name}</p>
                <p className="profile-summary-username">@{account.username}</p>
                <dl className="profile-summary-facts">
                    {facts.map(({ label, value }) => (
                        <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}
