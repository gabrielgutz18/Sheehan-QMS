import { useAuth } from '../../auth/authContext.js';
import useOrderStatus from '../../hooks/useOrderStatus.js';
import formatQueueNum from '../../../data/queueNum.js';
import { splitList } from '../../../data/list.js';
import { stageOf, whereNow } from '../../data/orderStage.js';
import { areasLeft } from '../../data/loadingAreas.js';
import { DEPARTMENTS, departmentOf } from '../../../data/loadingAreas.js';
import Avatar from '../common/avatar.jsx';
import Icon from '../common/icon.jsx';

const FLAG_ICON = "M5 21V4M5 4h11l-2.5 4L16 12H5";
const TAG_ICON = "M3 12V4h8l9 9-8 8zM7.5 7.5h.01";

// said in place of a name while no one is with the customer
const NOBODY = {
    line: "Not called yet",
    loading: "Waiting for the loading crew",
    security: "Waiting for a guard",
};
// the department next to call a handed-over customer: TBA's, Hardware's or the loading crew's
const nobodyFor = (order, stage) => {
    const next = departmentOf(areasLeft(order)[0] ?? "");
    return stage === "loading" && next !== "loading" ? `Waiting for the ${DEPARTMENTS[next]} crew` : NOBODY[stage] ?? "No one yet";
};

// the Dashboard's In charge list, for every staff member, from the Order status board: each customer still in progress
// today, in queue order, with where they are, who is with them now (the sales staff member serving them or the loading
// crew member loading them, with their photo; "you" for the signed-in staff member, whose customers are tinted), and
// their types of order
export default function InChargeTable() {
    const { user } = useAuth();
    const { orders, loading, error } = useOrderStatus();
    const active = orders.filter((o) => stageOf(o) !== "done");

    return (
        <section className="overview-section" aria-labelledby="in-charge-title">
            <div className="charge-head">
                <h2 id="in-charge-title" className="overview-heading">In charge</h2>
                <p className={`order-status-live${error ? " is-stale" : ""}`}>
                    {error ? "Can't reach the server" : `Live · ${active.length} in progress`}
                </p>
            </div>

            {loading ? (
                <p className="order-status-empty">Loading...</p>
            ) : active.length === 0 ? (
                <p className="order-status-empty">No customers in progress right now.</p>
            ) : (
                <div className="admin-table-wrap charge-wrap">
                    <table className="admin-table charge-table">
                        <thead>
                            <tr>
                                <th scope="col">Customer</th>
                                <th scope="col">Where</th>
                                <th scope="col">In charge</th>
                                <th scope="col">Type of order</th>
                            </tr>
                        </thead>
                        <tbody>
                            {active.map((o) => {
                                const stage = stageOf(o);
                                // someone has the customer only while they're being served or loaded; servedBy stays
                                // on a finished order waiting for the security check, but no one is with them then
                                const person = o.status === "serving" ? o.servedBy : null;
                                const mine = person?.id === user.id;
                                return (
                                    <tr key={o.queueNum} className={mine ? "is-mine" : undefined}>
                                        <th scope="row">
                                            <span className="charge-ticket">{formatQueueNum(o.queueNum, o.purpose, o.priority)}</span>
                                            <span className="charge-name">{o.name}</span>
                                        </th>
                                        <td>
                                            <span className={`charge-stage is-${stage}`}>
                                                <Icon d={FLAG_ICON} />
                                                {whereNow(o, { named: false })}
                                            </span>
                                        </td>
                                        <td>
                                            {person ? (
                                                <span className="charge-person">
                                                    <Avatar account={person} size={26} />
                                                    <span>
                                                        {person.name}
                                                        {mine && <span className="charge-you"> (you)</span>}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="charge-nobody">{nobodyFor(o, stage)}</span>
                                            )}
                                        </td>
                                        <td>
                                            <ul className="charge-tags">
                                                {splitList(o.purpose).map((type) => (
                                                    <li key={type}>
                                                        <Icon d={TAG_ICON} />
                                                        {type}
                                                    </li>
                                                ))}
                                            </ul>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
