import newId from '../data/newId.js';

// base URL for the backend; override with VITE_API_URL in a .env.local file
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

// full URL for things the browser loads directly, like <video src>
export const apiUrl = (path) => `${BASE_URL}${path}`;

// give up on a request that hangs instead of leaving the UI spinning
const TIMEOUT_MS = 15000;

// this browser tab's id, kept for as long as the tab is open (it survives reloads); the backend names this tab's
// session cookie after it, so every tab or window signs in on its own
const TAB_KEY = "tabId";
const tabId = (() => {
    try {
        let id = sessionStorage.getItem(TAB_KEY);
        if (!id) {
            id = newId();
            sessionStorage.setItem(TAB_KEY, id);
        }
        return id;
    } catch {
        // storage blocked: this page load signs in on its own
        return newId();
    }
})();

export class HttpError extends Error {
    /**
     * @param {number} status
     * @param {string} message
     * @param {any} [data]
     * @param {number | null} [retryAfter] seconds the server asked us to wait, on a 429
     */
    constructor(status, message, data, retryAfter = null) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.data = data;
        this.retryAfter = retryAfter;
    }
}

// the admin area listens here so an expired session sends the user back to login
const unauthorizedListeners = new Set();

export function onUnauthorized(listener) {
    unauthorizedListeners.add(listener);
    return () => {
        unauthorizedListeners.delete(listener);
    };
}

// whether the server answered the last request; the staff pages put up a bar while it doesn't, since their lists only
// change by asking again every few seconds and would otherwise sit there looking up to date
let reachable = true;
const connectionListeners = new Set();

const setReachable = (now) => {
    if (now === reachable) return;
    reachable = now;
    connectionListeners.forEach((listener) => listener());
};

export const isServerReachable = () => reachable;

/** @param {() => void} listener */
export function onConnectionChange(listener) {
    connectionListeners.add(listener);
    return () => {
        connectionListeners.delete(listener);
    };
}

// what to say when the server sent no message of its own; in plain words, since staff can't do anything with a code
const fallbackMessage = (status) =>
    status >= 500
        ? "Something went wrong on the server. Please try again, and if it keeps happening, tell the developers on SheeChat's Message developer tab."
        : `That didn't work (error ${status}). Please try again.`;

// a File/Blob body is sent as-is (uploads); anything else goes as JSON
/**
 * @param {string} method
 * @param {string} path
 * @param {any} [body]
 * @param {{ signal?: AbortSignal, timeout?: number, headers?: Record<string, string> }} [options]
 */
async function request(method, path, body, { signal, timeout = TIMEOUT_MS, headers } = {}) {
    const isFile = body instanceof Blob;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller);

    let res;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: {
                Accept: "application/json",
                // a custom header forces a CORS preflight, so other sites can't forge requests
                "X-Requested-With": "XMLHttpRequest",
                "X-Tab-Id": tabId,
                ...(body !== undefined && { "Content-Type": isFile ? body.type || "application/octet-stream" : "application/json" }),
                ...headers,
            },
            body: body === undefined || isFile ? body : JSON.stringify(body),
            // the session lives in an httpOnly cookie set by the backend, never in JS
            credentials: "include",
            signal: controller.signal,
        });
    } catch (err) {
        if (signal?.aborted) throw err;
        setReachable(false);
        if (controller.signal.aborted) {
            throw new HttpError(0, "The server took too long to respond. Please try again.");
        }
        // fetch only rejects when the server can't be reached at all
        throw new HttpError(0, "Unable to reach the server. Please try again.");
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortFromCaller);
    }

    setReachable(true);
    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    if (!res.ok) {
        if (res.status === 401) unauthorizedListeners.forEach((listener) => listener());
        const message = data?.message ?? fallbackMessage(res.status);
        const retryAfter = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
        throw new HttpError(res.status, message, data, Number.isFinite(retryAfter) ? retryAfter : null);
    }
    return data;
}

const http = {
    get: (path, options) => request("GET", path, undefined, options),
    post: (path, body, options) => request("POST", path, body, options),
    put: (path, body, options) => request("PUT", path, body, options),
    patch: (path, body, options) => request("PATCH", path, body, options),
    delete: (path, options) => request("DELETE", path, undefined, options),
};

export default http;
