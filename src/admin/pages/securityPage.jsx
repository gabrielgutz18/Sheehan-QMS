import LifeCycleTable from '../components/orderStatus/lifeCycleTable.jsx';
import OrderProducts from '../components/orderStatus/orderProducts.jsx';
import { listSecurityOrders } from '../api/adminOrderController.js';
import useMediaQuery from '../hooks/useMediaQuery.js';

// the table needs this much room for its Products column; narrower, on a guard's phone or tablet, each order is a card
const TABLE_FITS = "(min-width: 960px)";

// the security guards' page, the last stage: the Order status board, where every customer is today, with what each
// one bought (the invoices under their department, the items and quantities, who loaded it), so the guards can check
// the products a customer leaves with; looking only: nothing here calls, changes or saves an order
// it opens on Done, the customers who've finished and are on their way out; an invoice number finds its order
export default function SecurityPage() {
    const tableFits = useMediaQuery(TABLE_FITS);

    return (
        <section className="admin-page">
            <LifeCycleTable heading="h1" title="Security check" list={listSecurityOrders} details={OrderProducts}
                startWith="done" compact={!tableFits} />
        </section>
    );
}
