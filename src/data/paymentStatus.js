// how the customer is paying, for Payment status on Customer order; add more here and both the dropdown and the
// backend's check pick them up (server/api.js imports this list)
// Vale: taken now, paid later; Terms: paid on the customer's agreed terms
const paymentStatus = [
    { type: "Vale" },
    { type: "Paid" },
    { type: "Terms" },
];

export default paymentStatus;
