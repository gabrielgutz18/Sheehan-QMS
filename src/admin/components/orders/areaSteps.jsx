import { areasLeft } from "../../data/loadingAreas.js";

// the order's areas in turn, as chips, so the crew sees at a glance what's finished, where the customer is now (here
// or at the other department) and, while no one has them, which area is next; each says so in words too, not just by
// its color (the Loading, Service and Hardware pages' cards)
/** @param {{ order: any }} props */
export default function AreaSteps({ order }) {
    const areas = order.areas ?? [];
    if (areas.length === 0) return null;
    const now = order.status === "serving" && order.atLoading ? order.loadingArea : null;
    const next = now ? null : areasLeft(order)[0];

    return (
        <ol className="area-steps" aria-label="The order's areas">
            {areas.map(({ name, loaded }) => {
                const state = loaded ? "done" : name === now ? "now" : name === next ? "next" : "";
                return (
                    <li key={name} className={`area-step${state ? ` is-${state}` : ""}`}>
                        {loaded && <span aria-hidden="true">✓</span>}
                        {name}
                        {loaded && <span className="visually-hidden"> (done)</span>}
                        {(state === "now" || state === "next") && <span className="area-step-tag">{state}</span>}
                    </li>
                );
            })}
        </ol>
    );
}
