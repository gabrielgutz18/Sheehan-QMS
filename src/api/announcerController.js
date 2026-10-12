import http from './http.js';
import { DEFAULT_ANNOUNCER } from '../sound/sound.js';

// call announcement settings for the display: { enabled, voice, lang, rate, repeat }
// the backend returns null until they're set up in admin, so the defaults fill in
export const getAnnouncer = async (options) => ({ ...DEFAULT_ANNOUNCER, ...(await http.get("/announcer", options)) });
