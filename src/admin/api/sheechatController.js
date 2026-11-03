import http, { apiUrl } from '../../api/http.js';

// SheeChat: staff chatting one another (every role but the developers), one conversation per pair of people
// message: { id, body, sentAt, from: { id, name, role, photo }, to, read, image }
// to: the recipient's id; read: the recipient has opened it; image: it carries a picture (see sheeChatImageUrl), body
// is its caption then, '' for none

// your conversations: [{ with: { id, name, role, photo, disabled }, last: { body, image, sentAt, mine }, unread }],
// newest first; unread is how many of theirs you haven't opened yet
export const listSheeChats = (options) => http.get("/admin/sheechat", options);

// everyone you can chat with (no developers, not you), online ones first:
// [{ id, name, firstName, surname, role, department, photo, online, lastSeen }]
export const listSheeChatPeople = (options) => http.get("/admin/sheechat/people", options);

// one person's profile: { id, name, firstName, surname, role, department, team, photo, coverPhoto, createdAt, disabled,
// online, lastSeen }; looking at it reads nothing
export const getSheeChatProfile = (userId, options) =>
    http.get(`/admin/sheechat/${encodeURIComponent(userId)}/profile`, options);

// your conversation with one person, oldest first; opening it reads what they sent you
export const listSheeChat = (userId, options) => http.get(`/admin/sheechat/${encodeURIComponent(userId)}`, options);

// body: the text → the message
export const sendSheeChat = (userId, body) => http.post(`/admin/sheechat/${encodeURIComponent(userId)}`, { body });

// whether they're writing to you right now: [{ id, name }], empty when they aren't
export const listSheeChatTyping = (userId, options) =>
    http.get(`/admin/sheechat/${encodeURIComponent(userId)}/typing`, options);

// tells them you're writing; it wears off by itself a few seconds after the last time, or when the message is sent
export const noteSheeChatTyping = (userId) => http.post(`/admin/sheechat/${encodeURIComponent(userId)}/typing`);

// pictures are bigger than a message, so they get longer to arrive
const IMAGE_TIMEOUT_MS = 60000;

// image: a JPEG, PNG or WebP Blob (up to 5 MB); body: its caption, or '' → the message
export const sendSheeChatImage = (userId, image, body = "") => {
    const path = `/admin/sheechat/${encodeURIComponent(userId)}/image`;
    return http.post(body ? `${path}?body=${encodeURIComponent(body)}` : path, image, { timeout: IMAGE_TIMEOUT_MS });
};

// where a SheeChat message's picture is shown from; it never changes
export const sheeChatImageUrl = (message) => apiUrl(`/sheechat-images/${message.id}`);
