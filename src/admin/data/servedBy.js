const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// who has a ticket's customer, as the pages word it: "Being served by" while they're at the counter,
// "Served by" once it's Done, with the time it was marked Done; null until someone calls the ticket
// order: from the orders or history API, with servedBy { id, name, photo } and servedAt
export default function servedByInfo(order) {
    if (!order.servedBy) return null;
    const done = order.status === "done";
    return {
        account: order.servedBy,
        done,
        label: done ? "Served by" : "Being served by",
        time: done && order.servedAt ? timeFormat.format(new Date(order.servedAt)) : "",
    };
}
