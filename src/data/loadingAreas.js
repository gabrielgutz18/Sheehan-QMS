import { splitList } from './list.js';

// the departments that take a customer once sales hands them over, each with its own staff role and page: the
// loading crew (Roofings, Steel), TBA (Tire, Battery), Chassis and Hardware; a customer who bought from several goes
// to each in turn, one at a time
export const DEPARTMENTS = { loading: "Loading", tba: "TBA", chassis: "Chassis", hardware: "Hardware" };

// a department's name inside a sentence: "loading", "hardware", but "TBA" stays in capitals
export const departmentWord = (department) => {
    const label = DEPARTMENTS[department];
    return label === label.toUpperCase() ? label : label.toLowerCase();
};

// the loading areas, departments of the company (not teams), in the order a customer goes through them, each with
// the types of order (purpose.js) it loads and the department whose staff work it; a ticket for several types is
// loaded in each of their areas in turn, e.g. "Roofings, Hardwares" at Roofings, then Hardware; server/api.js imports
// this list too, so the two always agree
const loadingAreas = [
    { name: "Roofings", types: ["Roofings", "Roofings Accessories"], department: "loading" },
    { name: "Steel", types: ["Steel"], department: "loading" },
    { name: "TBA", types: ["Tire", "Battery"], department: "tba" },
    { name: "Chassis", types: ["Chassis"], department: "chassis" },
    { name: "Hardware", types: ["Hardwares"], department: "hardware" },
];

// the areas an order is loaded in, in turn: ["Roofings", "Steel"]; [] for a Customer Report
export const areasFor = (purpose) => {
    const types = splitList(purpose);
    return loadingAreas.filter((area) => area.types.some((type) => types.includes(type))).map(({ name }) => name);
};

// the department that works an area; one from before the areas ("") is the loading crew's
export const departmentOf = (area) => loadingAreas.find(({ name }) => name === area)?.department ?? "loading";

// whether a department has any part in an order: one of its areas, or, for the loading crew, an order with no areas
// (from before them)
export const departmentHas = (department, areas) =>
    areas.length === 0 ? department === "loading" : areas.some((area) => departmentOf(area) === department);

export default loadingAreas;
