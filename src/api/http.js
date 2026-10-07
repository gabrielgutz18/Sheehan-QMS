// base URL for the backend; override with VITE_API_URL in a .env.local file
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export class HttpError extends Error {
    constructor(status, message, data) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.data = data;
    }
}

async function request(method, path, body) {
    let res;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch {
        // fetch only rejects when the server can't be reached at all
        throw new HttpError(0, "Unable to reach the server. Please try again.");
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
        const message = data?.message ?? `Request failed (${res.status})`;
        throw new HttpError(res.status, message, data);
    }
    return data;
}

const http = {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    put: (path, body) => request("PUT", path, body),
    patch: (path, body) => request("PATCH", path, body),
    delete: (path) => request("DELETE", path),
};

export default http;
