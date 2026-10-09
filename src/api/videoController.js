import http, { apiUrl } from './http.js';

// display video: null, { kind: "url", url } or { kind: "file", name, version }
export const getVideo = (options) => http.get("/video", options);

// version changes on every upload so the screen never plays a cached old file
export const videoFileUrl = (version) => apiUrl(`/video/file?v=${version}`);
