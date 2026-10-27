import loadingAreas from '../../data/loadingAreas.js';

// where the loading crew sends a customer it calls: one-tap "Please proceed to …" messages in the Loading page's call
// dialog (the message can still be changed before calling); the areas are departments of the company, not teams,
// and each order is loaded in its own areas in turn (src/data/loadingAreas.js)

// what the display shows under the number when loading calls a customer
export const proceedTo = (area) => `Please proceed to ${area}`;

// the order's areas still to load, in turn: ["Steel"] once Roofings is done
export const areasLeft = (order) => (order.areas ?? []).filter((area) => !area.loaded).map(({ name }) => name);

// the call dialog starts with the next area the order still needs, e.g. Steel once Roofings is done
export const defaultLoadingRemarks = (order) => {
    const [next] = areasLeft(order);
    return next ? proceedTo(next) : "Please proceed to the loading area";
};

export const quickLoadingRemarks = loadingAreas.map(({ name }) => ({ label: name, text: proceedTo(name) }));
