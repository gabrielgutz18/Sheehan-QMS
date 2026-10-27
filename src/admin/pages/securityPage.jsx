import LifeCycleTable from '../components/orderStatus/lifeCycleTable.jsx';
import SecurityDetails from '../components/orderStatus/securityCheck.jsx';
import { listSecurityOrders } from '../api/adminOrderController.js';
import useMediaQuery from '../hooks/useMediaQuery.js';

// the table needs this much room for its Products column; narrower, on a guard's phone or tablet, each order is a card
const TABLE_FITS = "(min-width: 960px)";

// the security guards' page, the last stage: the Order status board, where every customer is today, step by step
// (the sales counter, each loading area in turn, the security check, done), with what each one bought (the invoices
// under their department, the items and quantities, who loaded each area); every finished order waits here at the
// security check until a guard presses Verified or reports something missing, over the quantity or stolen, and then
// it's done; nothing else here calls, changes or saves an order
// it opens on Security check, the customers at the gate; an invoice number finds its order
export default function SecurityPage() {
    const tableFits = useMediaQuery(TABLE_FITS);

    return (
        <section className="admin-page">
            <LifeCycleTable heading="h1" title="Security check" list={listSecurityOrders} details={SecurityDetails}
                startWith="security" compact={!tableFits} />
        </section>
    );
}
