import http, { apiUrl } from '../../api/http.js';

// staff writing to the developers when something doesn't go well, and the developers answering
// message: { id, body, sentAt, fromStaff, from: { id, name, role, photo }, read, image }
// fromStaff: written by the staff member whose conversation it is (a developer's answer otherwise); read: the other
// side has opened it; image: it carries a picture (see chatImageUrl), body is its caption then, '' for none

// Message developer (every role but developer): your own conversation, oldest first; opening it reads their answers
export const listMyMessages = (options) => http.get("/admin/messages", options);

// the developer team, online ones first: [{ id, name, firstName, surname, photo, online, lastSeen }]; lastSeen is
// when they last used the app (ms), or null
export const listDevelopers = (options) => http.get("/admin/developers", options);

// the Chat page's Staff list (developers only): everyone else, online ones first, as listDevelopers has them plus
// { role, department }
export const listStaffPresence = (options) => http.get("/admin/staff-presence", options);

// body: the text → the message
export const sendMyMessage = (body) => http.post("/admin/messages", { body });

// pictures are bigger than a message, so they get longer to arrive
const IMAGE_TIMEOUT_MS = 60000;
const withCaption = (path, body) => (body ? `${path}?body=${encodeURIComponent(body)}` : path);

// image: a JPEG, PNG or WebP Blob (up to 5 MB); body: its caption, or '' → the message
export const sendMyImage = (image, body = "") =>
    http.post(withCaption("/admin/messages/image", body), image, { timeout: IMAGE_TIMEOUT_MS });

// where a message's picture is shown from; it never changes
export const chatImageUrl = (message) => apiUrl(`/chat-images/${message.id}`);

// the Chat page (developers only): [{ staff: { id, name, role, photo, disabled },
// last: { body, image, sentAt, fromStaff, from: { id, name } }, unread }], newest first; unread is how many of theirs no
// developer has opened yet
export const listChats = (options) => http.get("/admin/chats", options);

// one staff member's conversation, oldest first; opening it reads what they wrote
export const listChat = (staffId, options) => http.get(`/admin/chats/${encodeURIComponent(staffId)}`, options);

// body: the answer → the message
export const answerChat = (staffId, body) => http.post(`/admin/chats/${encodeURIComponent(staffId)}`, { body });

// a picture answering them, as sendMyImage has it
export const answerChatImage = (staffId, image, body = "") =>
    http.post(withCaption(`/admin/chats/${encodeURIComponent(staffId)}/image`, body), image, { timeout: IMAGE_TIMEOUT_MS });
