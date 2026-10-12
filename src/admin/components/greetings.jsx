import { ROLE_LABELS } from '../auth/roles.js';

// "Hello, Maria!" at the top of a staff member's landing page (Dashboard for admins, My counter for sales)
export default function Greetings({ name, role }) {
    return (
        <div className="greetings">
            <p className="greetings-hello">Hello, {name}!</p>
            {role && <p className="greetings-role">Signed in as {ROLE_LABELS[role] ?? role}</p>}
        </div>
    );
}
