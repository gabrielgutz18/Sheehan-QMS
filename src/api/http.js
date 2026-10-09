// base URL for the backend; override with VITE_API_URL in a .env.local file
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

// full URL for things the browser loads directly, like <video src>
export const apiUrl = (path) => `${BASE_URL}${path}`;

// give up on a request that hangs instead of leaving the UI spinning
const TIMEOUT_MS = 15000;

export class HttpError extends Error {
    constructor(status, message, data) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.data = data;
    }
}

// the admin area listens here so an expired session sends the user back to login
const unauthorizedListeners = new Set();

export function onUnauthorized(listener) {
    unauthorizedListeners.add(listener);
    return () => unauthorizedListeners.delete(listener);
}

// a File/Blob body is sent as-is (uploads); anything else goes as JSON
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
        if (controller.signal.aborted) {
            throw new HttpError(0, "The server took too long to respond. Please try again.");
        }
        // fetch only rejects when the server can't be reached at all
        throw new HttpError(0, "Unable to reach the server. Please try again.");
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortFromCaller);
    }

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
        const message = data?.message ?? `Request failed (${res.status})`;
        throw new HttpError(res.status, message, data);
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
