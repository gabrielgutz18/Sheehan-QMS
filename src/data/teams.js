// the sales teams: Team name on Customer order is the team that served the customer, printed on the ticket, and it
// stays theirs after they're handed over to loading (Roofings and Steel are departments, not teams, and loading is one
// shared line); add more here and the form and the backend's checks pick them up (server/api.js imports this list)
const teams = [
    { name: "GIGA" },
    { name: "MEGA" },
    { name: "TBA" },
    { name: "ULTRA" },
    { name: "TERA" },
    { name: "FIELD" },
    { name: "HR" },
    { name: "PUR" },
    { name: "MANILA" },
    { name: "SVDK" },
];

export default teams;
