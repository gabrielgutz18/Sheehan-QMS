import http from '../../api/http.js';

// staff accounts, admins only
// account: { id, username, name, role: "admin" | "sales", createdAt, disabled, builtIn, servedToday, servedTotal,
//            servingNow, signedIn } plus the profile fields from accountController.js
// builtIn is the admin from the server's .env file: its password and role can't be changed here
// servingNow is how many of today's tickets they're serving; signedIn is whether a sign-in of theirs is still open

export const listUsers = (options) => http.get("/admin/users", options);

// { username, name, password, role } → the new account
export const createUser = (account) => http.post("/admin/users", account);

// changes: any of { name, role, password, disabled } → the updated account
export const updateUser = (id, changes) => http.patch(`/admin/users/${encodeURIComponent(id)}`, changes);
