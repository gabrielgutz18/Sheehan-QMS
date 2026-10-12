import http from '../../api/http.js';

// settings: { enabled, voice, lang, rate, repeat } → the saved settings
export const saveAnnouncer = (settings) => http.put("/admin/announcer", settings);
