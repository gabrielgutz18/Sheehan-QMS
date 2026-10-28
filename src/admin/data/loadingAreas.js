import loadingAreas, { DEPARTMENTS, areasFor, departmentHas, departmentOf } from '../../data/loadingAreas.js';

// where a department's crew sends a customer it calls: one-tap "Please proceed to …" messages in the Loading and
// Hardware pages' call dialog (the message can still be changed before calling); the areas are departments of the
// company, not teams, and each order is loaded in its own areas in turn (src/data/loadingAreas.js)

// who sales hands an order over to, as the pages word it: "loading", "hardware", or "loading and hardware" for one
// with something from both; "loading" for one with no areas
export const handOverTo = (purpose) => {
    const departments = [...new Set(areasFor(purpose).map(departmentOf))];
    return (departments.length ? departments : ["loading"]).map((d) => DEPARTMENTS[d].toLowerCase()).join(" and ");
};

// what the display shows under the number when a department calls a customer
export const proceedTo = (area) => `Please proceed to ${area}`;

// the order's areas still to load, in turn: ["Steel"] once Roofings is done
export const areasLeft = (order) => (order.areas ?? []).filter((area) => !area.loaded).map(({ name }) => name);

// the ones of them a department works: ["Hardware"] for an order for Roofings and Hardwares, at Hardware
export const areasLeftIn = (order, department) => areasLeft(order).filter((area) => departmentOf(area) === department);

// whether a department has a part in the order (one of its areas, or, for the loading crew, an order from before the
// areas), and whether any of it is still to do while the order isn't done
export const departmentHasOrder = (order, department) => departmentHas(department, (order.areas ?? []).map(({ name }) => name));
export const departmentStillNeeds = (order, department) =>
    order.status !== "done" && departmentHas(department, areasLeft(order));

// whether the department has the customer right now (rather than a sales counter or the other department)
export const atDepartment = (order, department) =>
    order.status === "serving" && Boolean(order.atLoading) && departmentOf(order.loadingArea ?? "") === department;

// the call dialog starts with the next area the order still needs here, e.g. Steel once Roofings is done
export const defaultLoadingRemarks = (order, department = "loading") => {
    const [next] = areasLeftIn(order, department);
    return next ? proceedTo(next) : "Please proceed to the loading area";
};

// a department's areas, each as a one-tap message
export const quickRemarksFor = (department) => loadingAreas
    .filter((area) => area.department === department)
    .map(({ name }) => ({ label: name, text: proceedTo(name) }));
