import { useAuth } from '../auth/authContext.js';
import { ROLE_LABELS } from '../auth/roles.js';
import ProfilePhoto from '../components/profilePhoto.jsx';
import AccountForm from '../components/accountForm.jsx';

// My account: every staff member (admin or sales) keeps their own photo, name, employee ID and department here
// the name shown around the app, e.g. "Served by Maria Santos", is the first name and surname
export default function AccountPage() {
    const { user, setUser } = useAuth();

    return (
        <section className="admin-page">
            <h1 className="admin-title">My account</h1>

            <div className="account-columns">
                <div className="admin-panel account-card">
                    <h2>Profile photo</h2>
                    <ProfilePhoto account={user} onChange={setUser} />
                    <dl className="account-facts">
                        <div>
                            <dt>Shown as</dt>
                            <dd>{user.name}</dd>
                        </div>
                        <div>
                            <dt>Username</dt>
                            <dd>{user.username}</dd>
                        </div>
                        <div>
                            <dt>Role</dt>
                            <dd>{ROLE_LABELS[user.role]}</dd>
                        </div>
                    </dl>
                </div>

                <div className="admin-panel">
                    <h2>Your details</h2>
                    {/* keyed on the account so a fresh sign-in starts the form over */}
                    <AccountForm key={user.id} account={user} onChange={setUser} />
                </div>
            </div>
        </section>
    );
}
