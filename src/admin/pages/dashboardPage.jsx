import useOrders from '../hooks/useOrders.js';
import { useAuth } from '../auth/authContext.js';
import Greetings from '../components/greetings.jsx';
import TotalViewer from '../components/totalViewer.jsx';
import ServingCompo from '../components/servingCompo.jsx';
import NextNumComp from '../components/nextNumComp.jsx';
import Statistics from '../components/statistics.jsx';

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
