import http from '../../api/http.js';

// the backend sets/clears an httpOnly session cookie; these calls only return the user
// user shape: { id, username, name, role: "admin" | "sales" | "loading" | "security", firstName, middleName, surname, employeeId, department, photo }

export const login = ({ username, password }) => http.post("/auth/login", { username, password });

export const getCurrentUser = (options) => http.get("/auth/me", options);

export const logout = () => http.post("/auth/logout");
