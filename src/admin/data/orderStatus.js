// queue states an order moves through; values must match the backend
const orderStatus = [
    { value: "pending", label: "Waiting" },
    { value: "serving", label: "Now serving" },
    { value: "done", label: "Done" },
];

export default orderStatus;
