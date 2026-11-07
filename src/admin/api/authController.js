import http from '../../api/http.js';

// the backend sets/clears an httpOnly session cookie; these calls only return the user
// user shape: { id, username, name, role: "admin" | "sales" | "loading" | "tba" | "chassis" | "hardware" | "security" | "cashier" | "inventory", firstName, middleName, surname, employeeId, department, photo }

export const login = ({ username, password }) => http.post("/auth/login", { username, password });

// as: the account this tab was signed in as, when it's checking it can carry on as them; with none, a tab with no
// sign-in of its own takes the browser's last one
/** @param {{ signal?: AbortSignal, as?: number }} [options] */
export const getCurrentUser = ({ as, ...options } = {}) =>
    http.get(as === undefined ? "/auth/me" : `/auth/me?as=${encodeURIComponent(as)}`, options);

export const logout = () => http.post("/auth/logout");
