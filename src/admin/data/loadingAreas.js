import { splitList } from '../../data/list.js';

// where the loading crew sends a customer it calls: one-tap "Please proceed to …" messages in the Loading page's call
// dialog (the message can still be changed before calling); these are departments of the company, not teams
const loadingAreas = ["Roofings", "Steel", "TBA"];

// what the display shows under the number when loading calls a customer
export const proceedTo = (area) => `Please proceed to ${area}`;

// the call dialog starts with the area named like one of the order's types of order, e.g. Steel for a Steel order
export const defaultLoadingRemarks = (order) => {
    const area = loadingAreas.find((name) => splitList(order.purpose).includes(name));
    return area ? proceedTo(area) : "Please proceed to the loading area";
};

export const quickLoadingRemarks = loadingAreas.map((name) => ({ label: name, text: proceedTo(name) }));
