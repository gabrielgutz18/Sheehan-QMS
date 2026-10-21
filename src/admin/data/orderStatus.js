// queue states an order moves through; values must match the backend
const orderStatus = [
    { value: "pending", label: "Waiting" },
    { value: "serving", label: "Now serving" },
    { value: "done", label: "Done" },
    // back after being served: in line again, with their own number, until a counter calls them
    { value: "returning", label: "Returning customer" },
];

// waiting and returning customers are both in line for a counter to call
export const inLine = (order) => order.status === "pending" || order.status === "returning";

export default orderStatus;
