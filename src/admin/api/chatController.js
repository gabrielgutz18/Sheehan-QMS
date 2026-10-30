import http from '../../api/http.js';

// staff writing to the developers when something doesn't go well, and the developers answering
// message: { id, body, sentAt, fromStaff, from: { id, name, role, photo }, read }
// fromStaff: written by the staff member whose conversation it is (a developer's answer otherwise); read: the other
// side has opened it

// Message developer (every role but developer): your own conversation, oldest first; opening it reads their answers
export const listMyMessages = (options) => http.get("/admin/messages", options);

// body: the text → the message
export const sendMyMessage = (body) => http.post("/admin/messages", { body });

// the Chat page (developers only): [{ staff: { id, name, role, photo, disabled }, last: { body, sentAt, fromStaff },
// unread }], newest first; unread is how many of theirs no developer has opened yet
export const listChats = (options) => http.get("/admin/chats", options);

// one staff member's conversation, oldest first; opening it reads what they wrote
export const listChat = (staffId, options) => http.get(`/admin/chats/${encodeURIComponent(staffId)}`, options);

// body: the answer → the message
export const answerChat = (staffId, body) => http.post(`/admin/chats/${encodeURIComponent(staffId)}`, { body });
