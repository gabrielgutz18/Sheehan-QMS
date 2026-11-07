import { capitalized, workOf } from '../../data/loadingAreas.js';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const timeOf = (iso) => (iso ? timeFormat.format(new Date(iso)) : "");

// who has had a ticket's customer, as the pages word it, one tag each: "Being served by" while they're at the counter,
// "Served by" once it's Done, with the time it was marked Done; none until someone calls the ticket
// loading isn't serving, it's loading the order (the truck, for roofing): "Being loaded by" while the loading crew
// has the customer, then "Loaded by" with the time they pressed Done, under the sales staff member who served it;
// Hardware's crew prepares the order instead, so there it's "Being prepared by" and "Prepared by" (workOf)
// order: from the orders or history API, with servedBy { id, name, photo }, servedAt and loaded { by, at }
export default function servedByInfo(order) {
    // the area last finished, whose crew order.loaded names: the one with the latest Done
    const lastDone = (order.areas ?? [])
        .filter(({ loaded }) => loaded)
        .reduce((last, area) => (!last || area.loaded.at > last.loaded.at ? area : last), null);
    const done = order.status === "done";
    const atLoading = order.status === "serving" && order.atLoading;
    return [
        order.servedBy && {
            account: order.servedBy,
            done,
            label: atLoading ? `Being ${workOf(order.loadingArea).done} by` : done ? "Served by" : "Being served by",
            time: done ? timeOf(order.servedAt) : "",
        },
        order.loaded && {
            account: order.loaded.by,
            done: true,
            label: `${capitalized(workOf(lastDone?.name).done)} by`,
            time: timeOf(order.loaded.at),
        },
    ].filter(Boolean);
}
