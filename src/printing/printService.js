// talks to the Python print service running on the kiosk computer (src/printing/script/printService.py)
// it finds the USB receipt printer by itself, so nothing has to be approved in the browser first
// override the address with VITE_PRINT_SERVICE_URL in a .env.local file
const SERVICE_URL = import.meta.env.VITE_PRINT_SERVICE_URL ?? "http://127.0.0.1:9123";

const TIMEOUT_MS = 15000;

// fetch rejects with a TypeError only when nothing answers, i.e. the service isn't running
const isNotRunning = (err) => err instanceof TypeError;

async function call(path, options) {
    const res = await fetch(`${SERVICE_URL}${path}`, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Print service error (${res.status})`);
    return data;
}

// { running: false }, or { running: true, printer: { name, connection, detail } | null }
export async function checkPrintService() {
    try {
        const { printer } = await call("/printer");
        return { running: true, printer };
    } catch (err) {
        if (isNotRunning(err)) return { running: false };
        throw err;
    }
}

// sends ESC/POS bytes to the printer the service finds
// resolves to { printer } with its name, or null when the service isn't running;
// rejects when it's running but can't print (no printer found, or it wouldn't take the ticket)
export async function printWithService(bytes) {
    try {
        return await call("/print", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: bytes,
        });
    } catch (err) {
        if (isNotRunning(err)) return null;
        throw err;
    }
}
