import { splitList } from '../../data/list.js';
import purpose from '../../data/purpose.js';

// the By product tab on the Cashier page: every type of order on Customer order is its own group, none merged, so
// Roofings Accessories is not Roofings and Battery is not Tire; a ticket for several shows under each one, with only
// that type's invoices
const PRODUCTS = purpose.map(({ name }) => name);

// an invoice that can't be placed: no type on a ticket of several, or a type no longer taken
export const NO_PRODUCT = "No product";

const GROUPS = [...PRODUCTS, NO_PRODUCT];

// an older invoice with no type goes with the order's type of order when it has only one, as on the Order sheet
const groupOf = (type, types) => {
    const name = type || (types.length === 1 ? types[0] : "");
    return PRODUCTS.includes(name) ? name : NO_PRODUCT;
};

// a ticket's invoices under each group it belongs to; a type bought with no invoice yet is still that type's
const invoicesByGroup = (order) => {
    const types = splitList(order.purpose);
    const groups = new Map(types.filter((type) => PRODUCTS.includes(type)).map((type) => [type, []]));
    for (const invoice of order.invoices ?? []) {
        const group = groupOf(invoice.type, types);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(invoice);
    }
    if (groups.size === 0) groups.set(NO_PRODUCT, []);
    return groups;
};

// the orders under every group, in Customer order's order: [{ name, lines: [{ order, invoices, also }] }], each group's
// tickets in the order they came in; also: the ticket's other types, to go and look at under their own groups
export const groupsByProduct = (orders) => {
    const groups = new Map(GROUPS.map((name) => [name, []]));
    for (const order of orders) {
        const own = invoicesByGroup(order);
        for (const [name, invoices] of own) {
            const also = PRODUCTS.filter((other) => other !== name && own.has(other));
            groups.get(name).push({ order, invoices, also });
        }
    }
    return [...groups].map(([name, lines]) => ({ name, lines }));
};

// how many tickets the groups hold; one under several groups counts once
export const ticketCount = (groups) => new Set(groups.flatMap(({ lines }) => lines.map(({ order }) => order.id))).size;
