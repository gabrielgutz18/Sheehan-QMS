import { splitList } from '../../data/list.js';

// an order goes to one or more loading crews (order.team, "Roofings, Steel"); each calls the customer in turn
export const teamsOf = (order) => splitList(order.team);

// where the customer is with one crew: "done", "serving" (with that crew now) or "waiting"
export const teamState = (order, team) =>
    order.status === "done" || splitList(order.teamsDone).includes(team) ? "done"
    : order.status === "serving" && order.servingTeam === team ? "serving"
    : "waiting";

// who has the customer while someone else is serving them: the crew, or the person at a sales counter
export const servingElsewhere = (order) => order.servingTeam ?? order.servedBy?.name ?? "the other counter";
