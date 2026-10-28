// rate limiting: each client (by IP address) gets so many requests in a time window; past that the API answers
// 429 Too Many Requests until the window ends, so one runaway screen, script or password guesser can't flood the server
// kept in memory: a restart starts everyone afresh, which is fine for limits measured in minutes

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const plainIp = (ip) => ip.replace(/^::ffff:/, "");

// who sent a request: behind nginx on the same machine every request comes from 127.0.0.1, so then it's the last
// entry of X-Forwarded-For, the one nginx adds itself (earlier entries come from the browser and can't be trusted)
export const clientIp = (req) => {
    const direct = req.socket?.remoteAddress ?? "";
    const forwarded = req.headers["x-forwarded-for"];
    if (LOOPBACK.has(direct) && typeof forwarded === "string") {
        const last = forwarded.split(",").at(-1).trim();
        if (last) return plainIp(last);
    }
    return plainIp(direct);
};

// at most `limit` hits per key in each window of `windowMs`; onLimit(key) runs once per window when a key goes over
export function createRateLimiter({ limit, windowMs, onLimit = () => {}, now = Date.now }) {
    // key → { count, resetAt }
    const windows = new Map();
    let nextSweep = 0;

    // forgets keys whose window is over, so clients that came and went don't pile up in memory
    const sweep = (time) => {
        if (time < nextSweep) return;
        for (const [key, entry] of windows) if (entry.resetAt <= time) windows.delete(key);
        nextSweep = time + windowMs;
    };

    const current = (key, time) => {
        const entry = windows.get(key);
        return entry && entry.resetAt > time ? entry : null;
    };

    return {
        // counts one hit; the ms to wait if that went over the limit, or 0 if it's allowed
        hit(key) {
            const time = now();
            sweep(time);
            let entry = current(key, time);
            if (!entry) {
                entry = { count: 0, resetAt: time + windowMs };
                windows.set(key, entry);
            }
            entry.count += 1;
            if (entry.count <= limit) return 0;
            if (entry.count === limit + 1) onLimit(key);
            return entry.resetAt - time;
        },
        // the ms to wait if the key has already used up its window, or 0; counts nothing
        retryAfter(key) {
            const time = now();
            const entry = current(key, time);
            return entry && entry.count >= limit ? entry.resetAt - time : 0;
        },
    };
}
