import http from "../../api/http.js";

// staff accounts, for admins and developers (a developer can't make or change an admin account: 403)
// account: { id, username, name, role: "admin" | "sales" | "loading" | "service" | "hardware" | "security" | "cashier" | "inventory" | "developer", team, createdAt, disabled, builtIn, servedToday,
//            servedTotal, servingNow, signedIn } plus the profile fields from accountController.js
// team is their own sales team from src/data/teams.js ("" for none); the edits they save on Customer order show it
// loadingArea is the loading crew's area a loading account works in, Roofings, Steel or Logistics ("" for none, and
// for every other kind of account)
// builtIn is the admin from the server's .env file: its password and role can't be changed here
// servingNow is how many of today's tickets they're serving; signedIn is whether a sign-in of theirs is still open

export const listUsers = (options) => http.get("/admin/users", options);

// { username, name, password, role, team?, loadingArea? } → the new account
export const createUser = (account) => http.post("/admin/users", account);

// changes: any of { name, role, team, loadingArea, password, disabled } → the updated account
export const updateUser = (id, changes) => http.patch(`/admin/users/${encodeURIComponent(id)}`, changes);

// erases a switched-off account for good: its name stays on the tickets it worked on, and shows as "Deleted account" in the chats
export const dropUser = (id) => http.delete(`/admin/users/${encodeURIComponent(id)}`);
