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

// how long ago a report was sent, in a few characters, for Staff concerns' Reports and the developers' Dashboard:
// "now", "5m", "3h", "2d"; iso: its createdAt; now: the clock it's counted from, in ms
export const reportAge = (iso, now) => {
    const minutes = Math.floor((now - new Date(iso).getTime()) / MINUTE_MS);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / (24 * 60))}d`;
};
