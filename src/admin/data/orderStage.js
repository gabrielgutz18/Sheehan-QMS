// where a customer is with their order, for the Order status board:
//   line     in line for a sales counter (waiting, or a returning customer)
//   sales    at a sales counter
//   loading  handed over to loading: waiting for the loading crew, or with it
//   done     every part of it finished
export const STAGES = [
    { value: "line", label: "In line" },
    { value: "sales", label: "At sales" },
    { value: "loading", label: "Loading" },
    { value: "done", label: "Done" },
];

export const stageOf = (order) =>
    order.status === "done" ? "done"
    : order.status === "returning" ? "line"
    : order.handedOver ? "loading"
    : order.status === "serving" ? "sales"
    : "line";

const by = (order) => (order.servedBy ? ` · ${order.servedBy.name}` : "");

// one line saying where they are now, e.g. "At sales · Maria Santos", "At loading · Pedro Garcia" or "Waiting for
// loading"
export const whereNow = (order) => {
    switch (stageOf(order)) {
        case "done":
            return "Done";
        case "sales":
            return `At sales${by(order)}`;
        case "loading":
            // a sales counter can call a customer back after handing them over
            if (order.status === "serving") return `${order.atLoading ? "At loading" : "Back at sales"}${by(order)}`;
            return "Waiting for loading";
        default:
            return order.status === "returning" ? "Returning customer, in line" : "In line for sales";
    }
};

// the steps the order goes through, each "done", "now" or "waiting": the sales counter, loading once they're handed
// over to it, then done
export const stepsOf = (order) => {
    const stage = stageOf(order);
    const sales = stage === "done" || order.handedOver ? "done" : stage === "sales" ? "now" : "waiting";
    const loading = order.handedOver && {
        label: "Loading",
        state: stage === "done" ? "done" : order.status === "serving" && order.atLoading ? "now" : "waiting",
    };
    return [
        { label: "Sales", state: sales },
        ...(loading ? [loading] : []),
        { label: "Done", state: stage === "done" ? "done" : "waiting" },
    ];
};
