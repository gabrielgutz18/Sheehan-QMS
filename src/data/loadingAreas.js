import { splitList } from './list.js';

// the departments that take a customer once sales hands them over, each with its own staff role and page: the
// loading crew (Roofings, Steel, Logistics, Chassis), Service (Tire, Battery) and Hardware; a customer who bought from
// several goes to each in turn, one at a time
export const DEPARTMENTS = { loading: "Loading", service: "Service", hardware: "Hardware" };

// a department's name inside a sentence: "loading", "service", "hardware"
export const departmentWord = (department) => DEPARTMENTS[department].toLowerCase();

// the loading areas, departments of the company (not teams), in the order a customer goes through them, each with
// the types of order (purpose.js) it loads and the department whose staff work it; a ticket for several types is
// loaded in each of their areas in turn, e.g. "Roofings, Hardwares" at Roofings, then Hardware; server/api.js imports
// this list too, so the two always agree
// the loading crew works four areas, each with only its own products: Roofings (Roofings, Roofings Accessories), Steel
// (steel only), Logistics (plain sheets, stainless steel, insulation, all as For Logistics for now) and Chassis
// gate: the gate of the yard a customer drives to for the area, told with the call ("Please proceed to Roofings (Gate Y:
// Yero)"); Yero is where the roofing sheets are, Bakalan the steel; an area with none is just named
const loadingAreas = [
    { name: "Roofings", types: ["Roofings", "Roofings Accessories"], department: "loading", gate: "Gate Y: Yero" },
    { name: "Steel", types: ["Steel"], department: "loading", gate: "Gate B: Bakalan" },
    { name: "Logistics", types: ["For Logistics"], department: "loading" },
    { name: "Chassis", types: ["Chassis"], department: "loading" },
    { name: "Service", types: ["Tire", "Battery"], department: "service" },
    // Hardware hands small items over the counter, not onto a truck, so its crew prepares the order (WORK below)
    { name: "Hardware", types: ["Hardwares"], department: "hardware", work: "preparing" },
];

// the loading crew's own areas, in order: ["Roofings", "Steel", "Logistics", "Chassis"]; each loading account is set to one of
// them on Accounts (users.loading_area), so the crew shows grouped by area
export const CREW_AREAS = loadingAreas.filter(({ department }) => department === "loading").map(({ name }) => name);

// how the pages and the server word an area's work: a truck is loaded at Roofings, Steel, Logistics, Chassis and Service, but at
// Hardware the crew gets the items ready, so it's "Start preparing at Hardware", "Prepared by Juan" there; only the
// words differ, the steps (Call, Start, Done) and the records are the same
// verb: "Load it at an area ..."; doing: "Loading at Roofings", "Start loading"; done: "Loaded by", "Not loaded"; what:
// what the crew is working on, in "Roofings is loading this truck"; startWhen: when to press Start; finished: when to
// press Done
const WORK = {
    loading: {
        verb: "load",
        doing: "loading",
        done: "loaded",
        what: "this truck",
        startWhen: "once the truck is at the area",
        finished: "fully loaded",
    },
    preparing: {
        verb: "prepare",
        doing: "preparing",
        done: "prepared",
        what: "this order",
        startWhen: "when you start getting the items ready",
        finished: "ready",
    },
};

// an area's words (WORK); the loading ones for an order from before the areas ("") or an unknown area
/** @param {string | null | undefined} area */
export const workOf = (area) => WORK[loadingAreas.find(({ name }) => name === area)?.work ?? "loading"];

// what the display shows under the number when a department calls a customer to an area, with the area's gate:
// "Please proceed to Roofings (Gate Y: Yero)", "Please proceed to Hardware"
/** @param {string} area */
export const proceedTo = (area) => {
    const gate = loadingAreas.find(({ name }) => name === area)?.gate;
    return `Please proceed to ${area}${gate ? ` (${gate})` : ""}`;
};

// "Loaded", "Prepared": the start of a sentence
/** @param {string} word */
export const capitalized = (word) => word.charAt(0).toUpperCase() + word.slice(1);

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

// the lists on a department's History tab, one at a time so different products never mix: each is a few types of order
// and the area they're loaded in; the first is the one that opens; Tire and Battery are apart though Service loads them
// together, so both show the same Service load
export const HISTORY_LISTS = {
    loading: [
        { name: "Roofings", types: ["Roofings", "Roofings Accessories"], area: "Roofings" },
        { name: "Steel", types: ["Steel"], area: "Steel" },
        { name: "For Logistics", types: ["For Logistics"], area: "Logistics" },
        { name: "Chassis", types: ["Chassis"], area: "Chassis" },
    ],
    service: [
        { name: "Tire", types: ["Tire"], area: "Service" },
        { name: "Battery", types: ["Battery"], area: "Service" },
    ],
    hardware: [{ name: "Hardware", types: ["Hardwares"], area: "Hardware" }],
};

// a department's History lists; [] for anything that isn't a department
/** @param {string} department */
export const historyListsOf = (department) => (Object.hasOwn(HISTORY_LISTS, department) ? HISTORY_LISTS[department] : []);

export default loadingAreas;
