import { useAuth } from "../auth/authContext.js";
import Greetings from "../components/common/greetings.jsx";
import LifeCycleTable from "../components/orderStatus/lifeCycleTable.jsx";
import SecurityDetails from "../components/orderStatus/securityCheck.jsx";
import { listSecurityOrders } from "../api/adminOrderController.js";
import useMediaQuery from "../hooks/useMediaQuery.js";

// the table needs this much room, beside the menu and inside its panel, to show the status and both buttons whole;
// narrower, on a guard's phone or tablet, each order is a card
const TABLE_FITS = "(min-width: 1200px)";

// the security guards' page, the last stage: the Order status board, where every customer is today, step by step
// (the sales counter, each loading area in turn, the security check, done), with what each one bought (the invoices
// under their department, the items and quantities, who loaded each area); every finished order waits here at the
// security check until a guard presses Verified or reports something missing, over the quantity or stolen, and then
// it's done; nothing else here calls, changes or saves an order
// it opens on Security check, the customers at the gate; an invoice number finds its order
export default function SecurityPage() {
    const { user } = useAuth();
    const tableFits = useMediaQuery(TABLE_FITS);

    return (
        <section className="admin-page">
            <div className="admin-page-head">
                <h1 className="admin-title">Security check</h1>
                <Greetings name={user.firstName || user.name} role={user.role} />
            </div>

            <div className="admin-panel security">
                <LifeCycleTable
                    heading="h2"
                    title="Orders today"
                    list={listSecurityOrders}
                    details={SecurityDetails}
                    startWith="security"
                    compact={!tableFits}
                />
            </div>
        </section>
    );
}
