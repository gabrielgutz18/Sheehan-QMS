import useOrders from '../hooks/useOrders.js';
import { useAuth } from '../auth/authContext.js';
import Greetings from '../components/common/greetings.jsx';
import TotalViewer from '../components/dashboard/totalViewer.jsx';
import ServingCompo from '../components/dashboard/servingCompo.jsx';
import NextNumComp from '../components/dashboard/nextNumComp.jsx';
import Statistics from '../components/dashboard/statistics.jsx';

export default function DashboardPage() {
    const { user } = useAuth();
    const { orders, loading, error } = useOrders();

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">Dashboard</h1>
                <Greetings name={user.firstName || user.name} role={user.role} />
            </div>

            {error && <p className="field-error" role="alert">{error}</p>}

            <TotalViewer orders={orders} loading={loading} />

            <div className="queue-columns">
                <ServingCompo orders={orders} />
                <NextNumComp orders={orders} />
            </div>

            <Statistics />
        </section>
    );
}
