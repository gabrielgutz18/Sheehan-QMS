// installing the staff area as an app (public/manifest.webmanifest): its own window and a desktop and Start menu
// icon, like any program, with no address bar to find it by
// Edge and Chrome say once, early in the page's loading, that it can be installed (beforeinstallprompt, only over
// https); that's usually before the staff pages have loaded (they're lazy-loaded), so main.jsx starts listening at
// once and keeps it here until the sidebar's Install app button asks for it
// browsers without it (Firefox, Safari) never say so, and the button stays hidden there

/** @type {any} the browser's install offer, kept until it's used or the app is installed */
let offer = null;
const listeners = new Set();
const changed = () => listeners.forEach((listener) => listener());

export const listenForInstall = () => {
    window.addEventListener("beforeinstallprompt", (event) => {
        // keep the browser's own little offer in the address bar, but show it from our button
        event.preventDefault();
        offer = event;
        changed();
    });
    window.addEventListener("appinstalled", () => {
        offer = null;
        changed();
    });
};

// for useSyncExternalStore: whether the app can be installed now
/** @param {() => void} listener */
export const subscribeToInstall = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
export const canInstall = () => offer !== null;

// shows the browser's Install dialog; true when the person installed it
export const installApp = async () => {
    if (!offer) return false;
    const shown = offer;
    offer = null;
    changed();
    await shown.prompt();
    const { outcome } = await shown.userChoice;
    return outcome === "accepted";
};
