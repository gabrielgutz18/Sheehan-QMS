// the types of order on Customer order; a ticket can be for several at once, kept together as its purpose in
// this list's order, e.g. "Roofings, Steel" (see list.js; each one gives the queue number its letters, in that order,
// "RS 01", see queueNum.js)
const purpose = [
    { name: "Roofings" },
    { name: "Tire" },
    { name: "Steel" },
    { name: "Hardwares" },
    { name: "Chassis" },
    { name: "Roofings Accessories" },
    { name: "Battery"},
];

export default purpose;
