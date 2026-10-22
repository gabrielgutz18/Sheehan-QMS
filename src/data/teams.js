// the loading crews: an order goes to one or more of them (Team name on Customer order), and each Loading account
// belongs to one (set on Accounts); add more here and the dropdowns, the Loading page and the backend's checks all
// pick them up (server/api.js imports this list)
// quickRemark: offered as a one-tap "Please proceed to …" in the Loading page's call card (a crew always gets its own)
const teams = [
    { name: "Roofings", quickRemark: true },
    { name: "Steel", quickRemark: true },
    { name: "GIGA"},
    { name: "MEGA"},
    { name: "TBA"},
    { name: "ULTRA"}
];

// what the display shows under the number when a crew calls a customer; it can be changed before calling
export const proceedTo = (team) => `Please proceed to ${team}`;

export default teams;
