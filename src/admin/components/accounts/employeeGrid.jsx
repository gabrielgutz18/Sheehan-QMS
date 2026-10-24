import availabilityOf from '../../data/availability.js';
import ProfileCard from './profileCard.jsx';

// every staff account as a card, so admins can see at a glance who's in and who's serving
// accounts: the list from listUsers(), or null while it loads; meId: the signed-in admin's id
export default function EmployeeGrid({ accounts, meId }) {
    const keys = accounts?.map((a) => availabilityOf(a).key) ?? [];
    const serving = keys.filter((key) => key === "serving").length;
    const signedIn = serving + keys.filter((key) => key === "active").length;

    return (
        <section className="admin-panel" aria-labelledby="employees-title">
            <div className="employee-grid-head">
                <h2 id="employees-title">Employees</h2>
                {accounts && (
                    <span className="video-hint">
                        {signedIn} of {accounts.length} signed in{serving > 0 && ` · ${serving} serving now`}
                    </span>
                )}
            </div>

            {!accounts ? (
                <p className="admin-empty">Loading...</p>
            ) : (
                <ul className="employee-grid">
                    {accounts.map((a) => (
                        <li key={a.id}>
                            <ProfileCard account={a} isMe={a.id === meId} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
