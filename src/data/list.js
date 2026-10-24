// several types of order are kept as one text: "Roofings, Steel"
// the backend reads and checks them the same way (server/api.js imports this)
export const LIST_SEPARATOR = ", ";

export const splitList = (text) => (text ? text.split(LIST_SEPARATOR) : []);

export const joinList = (items) => items.join(LIST_SEPARATOR);
