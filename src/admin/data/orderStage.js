import { departmentOf } from '../../data/loadingAreas.js';

// where a customer is with their order, for the Order status board and the Security page:
//   line      in line for a sales counter (waiting, or a returning customer)
//   sales     at a sales counter
//   loading   handed over to loading: waiting for the loading crew, or with it, in each of the order's areas in turn
//   security  finished, at the gate: waiting for a security guard to check what they leave with
//   done      every part of it finished, the security check included
export const STAGES = [
    { value: "line", label: "In line" },
    { value: "sales", label: "At sales" },
    { value: "loading", label: "Loading" },
    { value: "security", label: "Security check" },
    { value: "done", label: "Done" },
];

// a Customer Report is a concern, with nothing to take out past the gate; must match the backend (server/api.js)
const REPORT_PURPOSE = "Customer Report";

export const stageOf = (order) =>
    order.status === "done" ? (order.security === "waiting" ? "security" : "done")
    : order.status === "returning" ? "line"
    : order.handedOver ? "loading"
    : order.status === "serving" ? "sales"
    : "line";

const by = (order) => (order.servedBy ? ` · ${order.servedBy.name}` : "");
// the order's areas still to load, in turn
const areasLeft = (order) => (order.areas ?? []).filter((area) => !area.loaded);

// one line saying where they are now, e.g. "At sales · Maria Santos", "At Roofings · Pedro Garcia", "Waiting for
// Steel" or "At the security check"
// named: false leaves out who has them ("At sales"), for a list that shows them beside it
export const whereNow = (order, { named = true } = {}) => {
    const who = named ? by(order) : "";
    switch (stageOf(order)) {
        case "done":
            return order.security === "reported" ? "Done · reported" : "Done";
        case "security":
            return "At the security check";
        case "sales":
            return `At sales${who}`;
        case "loading": {
            // a sales counter can call a customer back after handing them over
            if (order.status === "serving") {
                return `${order.atLoading ? `At ${order.loadingArea ?? "loading"}` : "Back at sales"}${who}`;
            }
            const [next] = areasLeft(order);
            const started = (order.areas ?? []).some((area) => area.loaded);
            // Hardware is its own department, so it's named even before anything is loaded
            return next && (started || departmentOf(next.name) !== "loading") ? `Waiting for ${next.name}` : "Waiting for loading";
        }
        default:
            return order.status === "returning" ? "Returning customer, in line" : "In line for sales";
    }
};

// the steps the order goes through, each "done", "now" or "waiting": the sales counter, each loading area in turn once
// they're handed over to loading (e.g. Roofings, then Steel), the security check, then done
// an order finished before the security check, or a Customer Report, has no security step
export const stepsOf = (order) => {
    const stage = stageOf(order);
    const finished = stage === "security" || stage === "done";
    const sales = finished || order.handedOver ? "done" : stage === "sales" ? "now" : "waiting";
    // an order handed over before loading went area by area has one Loading step
    const areas = !order.handedOver ? [] : order.areas?.length ? order.areas : [{ name: "Loading" }];
    const atLoading = order.status === "serving" && order.atLoading;
    const here = order.loadingArea ?? areasLeft(order)[0]?.name ?? "Loading";
    const loading = areas.map((area) => ({
        label: area.name,
        state: finished || area.loaded ? "done" : atLoading && area.name === here ? "now" : "waiting",
    }));
    const needsCheck = order.purpose !== REPORT_PURPOSE && (order.status !== "done" || Boolean(order.security));
    return [
        { label: "Sales", state: sales },
        ...loading,
        ...(needsCheck ? [{ label: "Security", state: stage === "done" ? "done" : stage === "security" ? "now" : "waiting" }] : []),
        { label: "Done", state: stage === "done" ? "done" : "waiting" },
    ];
};
