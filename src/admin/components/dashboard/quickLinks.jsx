import { Link } from 'react-router';

import { navFor } from '../../data/navItems.js';
import Icon from '../common/icon.jsx';

// a card for each of the signed-in role's own pages (every one in the sidebar but the Dashboard itself), saying what
// it's for
export default function QuickLinks({ role }) {
    const pages = navFor(role).filter(({ end }) => !end);

    return (
        <ul className="quick-links">
            {pages.map(({ to, label, icon, blurb }) => (
                <li key={to}>
                    <Link to={to} className="stat-card has-icon quick-link">
                        <span className="stat-icon"><Icon d={icon} /></span>
                        <span className="quick-link-label">{label}</span>
                        <span className="stat-label">{blurb}</span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
