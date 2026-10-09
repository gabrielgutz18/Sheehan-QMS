import http from '../../api/http.js';

// uploads can be large, so allow far longer than the default request timeout
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export const MAX_VIDEO_MB = 200;

export const setVideoUrl = (url) => http.put("/admin/video", { url });

export const uploadVideoFile = (file) =>
    http.post("/admin/video/file", file, {
        timeout: UPLOAD_TIMEOUT_MS,
        headers: { "X-File-Name": encodeURIComponent(file.name) },
    });

export const clearVideo = () => http.delete("/admin/video");
