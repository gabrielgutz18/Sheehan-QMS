import AreaSteps from "./areaSteps.jsx";
import OrderFacts from "./orderFacts.jsx";
import SentBackNote from "./sentBackNote.jsx";
import TicketNumber from "../common/ticketNumber.jsx";
import { areasToStart, startLoadingLabel } from "../../data/loadingAreas.js";

// where the customer stands in the line, as pills by the number: someone else has them, they're coming back for their
// items, or they're the one Call next calls; plain Waiting otherwise
const pillsFor = (order, isNext) => {
    const pills = [];
    if (order.status === "serving") pills.push({ text: "Busy elsewhere", tone: "elsewhere" });
    if (order.status === "returning") pills.push({ text: "Returning", tone: "returning" });
    if (isNext && order.status !== "serving") pills.push({ text: "Next up", tone: "next" });
    return pills.length ? pills : [{ text: "Waiting", tone: "waiting" }];
};

// a customer in line at a department, on the Loading, Service and Hardware pages, read from the top like the serving
// card: who it is and where they stand, how far along the order's areas are, what the order is, then what to do; Call
// is the main button, Start loading beside it for when the truck is already at the area, and Recall on its own line
// since it's for a mistake, not the usual next step
// isNext: the customer Call next calls, picked out so the crew sees who that is; busy: this ticket's action is on its
// way; onStart(area): "" for an order from before the areas; onRecall: left out when no area here is done yet
/**
 * @param {{ order: any, department: string, isNext: boolean, busy: boolean, onCall: () => void,
 *   onStart: (area: string) => void, onRecall?: () => void }} props
 */
export default function WaitingCard({ order, department, isNext, busy, onCall, onStart, onRecall }) {
    // a sales counter or the other department has the customer right now: everything waits until they finish
    const elsewhere = order.status === "serving";
    const hintId = `wait-${order.queueNum}`;
    const hasAreas = (order.areas ?? []).length > 0;

    return (
        <li className={`waiting-card${isNext && !elsewhere ? " is-next" : ""}${elsewhere ? " is-elsewhere" : ""}`}>
            <div className="waiting-body">
                <div className="waiting-head">
                    <div className="waiting-top">
                        <strong className="waiting-number">
                            <TicketNumber order={order} />
                        </strong>
                        <span className="waiting-pills">
                            {pillsFor(order, isNext).map(({ text, tone }) => (
                                <span key={tone} className={`waiting-pill is-${tone}`}>
                                    {text}
                                </span>
                            ))}
                        </span>
                    </div>
                    <span className="waiting-name">{order.name}</span>
                    {/* the chips below say the same for an order with areas */}
                    {!hasAreas && order.purpose && <span className="waiting-purpose">{order.purpose}</span>}
                </div>

                <AreaSteps order={order} />
                <SentBackNote order={order} />
                <OrderFacts order={order} />
            </div>

            <div className="waiting-actions">
                {elsewhere && (
                    <p id={hintId} className="wait-hint">
                        Please wait until {order.servedBy?.name ?? "the other counter"} finishes.
                    </p>
                )}
                <div className="waiting-main-actions">
                    <button
                        type="button"
                        className="admin-btn admin-btn-call"
                        disabled={elsewhere || busy}
                        aria-describedby={elsewhere ? hintId : undefined}
                        onClick={onCall}
                    >
                        Call
                    </button>
                    {areasToStart(order, department).map((area) => (
                        <button
                            key={area}
                            type="button"
                            className="admin-btn"
                            disabled={elsewhere || busy}
                            aria-describedby={elsewhere ? hintId : undefined}
                            onClick={() => onStart(area)}
                        >
                            {startLoadingLabel(area)}
                        </button>
                    ))}
                </div>
                {onRecall && (
                    <p className="waiting-recall">
                        <span>Wrong receipt or order at an area already done?</span>
                        <button type="button" className="admin-btn" disabled={elsewhere || busy} onClick={onRecall}>
                            Recall
                        </button>
                    </p>
                )}
            </div>
        </li>
    );
}
