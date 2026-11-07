import OrderDetails from './orderDetails.jsx';
import SentBackNote from './sentBackNote.jsx';
import ServedBy from './servedBy.jsx';
import { areasToStart, proceedTo, startLoadingLabel } from '../../data/loadingAreas.js';
import formatQueueNum from '../../../data/queueNum.js';
import { workOf } from '../../../data/loadingAreas.js';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// the order's areas in turn, so the crew sees what's finished, where the customer is now and what's left; each says
// so in words too, not just by its color
function AreaSteps({ order }) {
    const areas = order.areas ?? [];
    if (areas.length === 0) return null;
    return (
        <ol className="serving-areas" aria-label="The order's areas">
            {areas.map(({ name, loaded }) => {
                const now = !loaded && name === order.loadingArea;
                return (
                    <li key={name} className={`serving-area${loaded ? " is-done" : now ? " is-now" : ""}`}>
                        {loaded && <span aria-hidden="true">✓ </span>}
                        {name}
                        {loaded && <span className="visually-hidden"> (done)</span>}
                        {now && <span className="serving-area-now">now</span>}
                    </li>
                );
            })}
        </ol>
    );
}

// a customer a department's crew has now, on the Loading, TBA, Chassis and Hardware pages, read from the top: who it
// is and how far along they are, what the order is, then what to do next; there's one main button at a time, Start
// loading while the truck is on its way and Done once it's loading, with the less used ones under it
// busy: this ticket's action is on its way; onStart(area): "" for an order from before the areas
/**
 * @param {{ order: any, department: string, busy: boolean, onStart: (area: string) => void, onFinish: () => void, onCallAgain: () => void, onSendBack: () => void }} props
 */
export default function ServingCard({ order, department, busy, onStart, onFinish, onCallAgain, onSendBack }) {
    const { loadingArea, loadingStartedAt, remarks } = order;
    const isLoading = Boolean(loadingStartedAt);
    // the words for the area they're at, or the one they'll start at: loading a truck, or preparing at Hardware
    const work = workOf(isLoading ? loadingArea : areasToStart(order, department)[0]);
    // the usual "Please proceed to Roofings" only repeats the area, so only a message someone changed shows
    const message = remarks && remarks !== proceedTo(loadingArea) ? remarks : "";

    return (
        <li className={`serving-card${isLoading ? " is-loading" : ""}`}>
            <div className="serving-head">
                <div className="serving-top">
                    <strong className="serving-number">{formatQueueNum(order.queueNum, order.purpose, order)}</strong>
                    <span className="serving-status">
                        {isLoading ? `Loading since ${timeFormat.format(new Date(loadingStartedAt))}` : "Called"}
                    </span>
                </div>
                <span className="serving-name">{order.name}</span>
            </div>

            <AreaSteps order={order} />
            <SentBackNote order={order} />

            <dl className="serving-facts">
                <div>
                    <dt>Order</dt>
                    <dd>{order.purpose}</dd>
                </div>
                {message && (
                    <div>
                        <dt>Message</dt>
                        <dd>“{message}”</dd>
                    </div>
                )}
            </dl>
            <OrderDetails order={order} />
            <ServedBy order={order} />

            <div className="serving-actions">
                <p className="serving-next">
                    {isLoading
                        ? `Press Done${loadingArea ? ` at ${loadingArea}` : ""} when it's ${work.finished}.`
                        : `Press Start ${work.doing} ${work.startWhen}.`}
                </p>
                <div className="serving-main-actions">
                    {isLoading ? (
                        <button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={onFinish}>
                            {loadingArea ? `Done at ${loadingArea}` : "Done"}
                        </button>
                    ) : (
                        areasToStart(order, department).map((area, i) => (
                            <button
                                key={area}
                                type="button"
                                className={`admin-btn${i === 0 ? " admin-btn-primary" : ""}`}
                                disabled={busy}
                                onClick={() => onStart(area)}
                            >
                                {startLoadingLabel(area)}
                            </button>
                        ))
                    )}
                </div>
                <div className="serving-more-actions">
                    {!isLoading && (
                        <button type="button" className="admin-btn" disabled={busy} onClick={onCallAgain}>
                            Call again
                        </button>
                    )}
                    <button type="button" className="admin-btn" disabled={busy} onClick={onSendBack}>
                        Back to waiting
                    </button>
                </div>
            </div>
        </li>
    );
}
