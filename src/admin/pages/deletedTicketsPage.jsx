import { TicketHistory } from '../components/orders/ordersHistory.jsx';

// the developers' Deleted tickets page: the tickets deleted on Customer order, from any day, to Purge for good when the
// database needs the room; admins have the same list, with Restore, on Customer order → Orders & history → Deleted
export default function DeletedTicketsPage() {
    return (
        <section className="admin-page">
            <h1 className="admin-title">Deleted tickets</h1>
            <p className="deleted-tickets-intro">
                Tick the tickets to erase for good. A copy of the database is saved first, and staff keep their points.
            </p>
            <div className="orders-history">
                <div className="history-filters">
                    <TicketHistory deleted />
                </div>
            </div>
        </section>
    );
}
