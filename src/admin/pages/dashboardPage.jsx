import { useAuth } from '../auth/authContext.js';
import useLiveQueue from '../hooks/useLiveQueue.js';
import Greetings from '../components/common/greetings.jsx';
import QueueOverview from '../components/dashboard/queueOverview.jsx';
import TotalViewer from '../components/dashboard/totalViewer.jsx';
import Statistics from '../components/dashboard/statistics.jsx';
import QuickLinks from '../components/dashboard/quickLinks.jsx';
import ProfileSummary from '../components/accounts/profileSummary.jsx';
import LiveQueue from '../components/dashboard/liveQueue.jsx';
import InChargeTable from '../components/dashboard/inChargeTable.jsx';

// every staff member's Dashboard: the live queue (how many are being served and in line, the next number, and the
// tickets themselves) beside their own profile, and who is in charge of each customer in progress; admins also get
// the day's orders by status and the sales graph, and everyone else a link to each of their own pages
export default function DashboardPage() {
    const { user } = useAuth();
    const isAdmin = user.role === "admin";
    const { orders, loading, error } = useLiveQueue(user.role);

    return (
        <div className="overview">
            <section className="admin-page overview-main">
                <div className="admin-page-head">
                    <h1 className="admin-title">Dashboard</h1>
                    <Greetings name={user.firstName || user.name} role={user.role} />
                </div>

                {error && <p className="field-error" role="alert">{error}</p>}

                <section className="overview-section" aria-labelledby="overview-queue">
                    <h2 id="overview-queue" className="overview-heading">Overview</h2>
                    <QueueOverview orders={orders} loading={loading} />
                </section>

                <InChargeTable />

                {isAdmin ? (
                    <>
                        <section className="overview-section" aria-labelledby="overview-status">
                            <h2 id="overview-status" className="overview-heading">Queue status</h2>
                            <TotalViewer orders={orders} loading={loading} />
                        </section>

                        <Statistics />
                    </>
                ) : (
                    <section className="overview-section" aria-labelledby="overview-pages">
                        <h2 id="overview-pages" className="overview-heading">Your pages</h2>
                        <QuickLinks role={user.role} />
                    </section>
                )}
            </section>

            <aside className="overview-rail" aria-label="Profile and live queue">
                <ProfileSummary account={user} />
                <LiveQueue orders={orders} loading={loading} error={error} manage={isAdmin} />
            </aside>
        </div>
    );
}
