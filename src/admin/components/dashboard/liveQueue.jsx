import { Link } from 'react-router';

import ServingCompo from './servingCompo.jsx';
import NextNumComp from './nextNumComp.jsx';

// the live queue on the Dashboard, under the profile: a small copy of the queue display, Now serving over the line,
// with a link to the display itself
// error: the queue couldn't be fetched last time, so it's marked Offline instead of Live
// manage: the orders have their details (admins), for opening a ticket and the link to Orders
export default function LiveQueue({ orders, loading, error = "", manage = false }) {
    return (
        <section className="live-queue" aria-label="Live queue">
            <ServingCompo orders={orders} loading={loading} live={!error} />
            <NextNumComp orders={orders} loading={loading} manage={manage} />

            {/* the queue display itself, in a tab of its own so this page stays open */}
            <Link to="/" target="_blank" rel="noopener" className="admin-btn live-queue-display">
                Open the live queue display ↗
            </Link>
        </section>
    );
}
