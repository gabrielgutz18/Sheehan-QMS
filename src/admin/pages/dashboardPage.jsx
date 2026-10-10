import useOrders from '../hooks/useOrders.js';
import TotalViewer from '../components/totalViewer.jsx';
import ServingCompo from '../components/servingCompo.jsx';
import NextNumComp from '../components/nextNumComp.jsx';

export default function DashboardPage() {
    const { orders, loading, error } = useOrders();

    return (
        <section className="admin-page">
            <h1 className="admin-title">Dashboard</h1>

            {error && <p className="field-error" role="alert">{error}</p>}

            <TotalViewer orders={orders} loading={loading} />

            <div className="queue-columns">
                <ServingCompo orders={orders} />
                <NextNumComp orders={orders} />
            </div>
        </section>
    );
}
