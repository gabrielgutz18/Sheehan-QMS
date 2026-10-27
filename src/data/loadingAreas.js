import { splitList } from './list.js';

// the loading areas, departments of the company (not teams), in the order a customer goes through them, each with
// the types of order (purpose.js) it loads; a ticket for several types is loaded in each of their areas in turn, e.g.
// "Roofings, Steel" at Roofings, then Steel; server/api.js imports this list too, so the two always agree
const loadingAreas = [
    { name: "Roofings", types: ["Roofings", "Roofings Accessories"] },
    { name: "Steel", types: ["Steel", "Hardwares"] },
    { name: "TBA", types: ["Tire", "Battery", "Chassis"] },
];

// the areas an order is loaded in, in turn: ["Roofings", "Steel"]; [] for a Customer Report
export const areasFor = (purpose) => {
    const types = splitList(purpose);
    return loadingAreas.filter((area) => area.types.some((type) => types.includes(type))).map(({ name }) => name);
};

export default loadingAreas;
