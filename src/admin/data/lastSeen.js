const MINUTE_MS = 60 * 1000;

// how long ago someone last used the app, for whoever is offline: "5 min ago", "3 h ago", or the day for anything
// older; ms is their lastSeen, or null when they never have ("Offline")
export const seenAgo = (ms) => {
    if (ms === null || ms === undefined) return "Offline";
    const minutes = Math.floor((Date.now() - ms) / MINUTE_MS);
    if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
    return new Date(ms).toLocaleDateString();
};
