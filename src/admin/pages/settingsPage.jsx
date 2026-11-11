import { useEffect, useState, useSyncExternalStore } from "react";

import { canInstall, installApp, subscribeToInstall } from "../../installPrompt.js";

// Settings: the set-up for this PC or phone, in one place for every role, so nobody has to remember an address:
// putting the staff app on it (Install app) and making it trust the shop's own certificate (https with no warning)
// the certificate files and the setup page come from nginx on port 80 (deploy/nginx-https.conf), not from the app,
// so they're always reached over plain http on the same name, whether the app is open on https, port 80 or :3000

const ua = navigator.userAgent;
// which steps to show first; null on anything else (a Mac, Linux)
const DEVICE = /Android/i.test(ua)
    ? "android"
    : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? "iphone"
      : /Windows/i.test(ua)
        ? "windows"
        : null;

const host = location.hostname;
const SETUP = `http://${host}`;
const SECURE_HOME = `https://${host}/staff/settings`;
const secure = location.protocol === "https:";
// opened from the installed app's own icon rather than a browser tab
const standalone = window.matchMedia("(display-mode: standalone)").matches;

// whether this device trusts the server's certificate: a request to it over https only goes through when it does
// (the same check as the setup page, deploy/install.html); "checking", "trusted" or "untrusted"
function useCertificateCheck() {
    const [state, setState] = useState(secure ? "trusted" : "checking");
    const [round, setRound] = useState(0);

    useEffect(() => {
        if (secure) return;
        let cancelled = false;
        fetch(`https://${host}/`, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(6000) })
            .then(() => !cancelled && setState("trusted"))
            .catch(() => !cancelled && setState("untrusted"));
        return () => {
            cancelled = true;
        };
    }, [round]);

    const recheck = () => {
        setState("checking");
        setRound((n) => n + 1);
    };
    return { state, recheck };
}

/** @param {{ tone: "ok" | "wait", children: any }} props */
function Status({ tone, children }) {
    return (
        <p className={`settings-status is-${tone}`} role="status">
            {children}
        </p>
    );
}

function InstallAppCard() {
    const installable = useSyncExternalStore(subscribeToInstall, canInstall);
    const [installed, setInstalled] = useState(false);

    const install = async () => {
        if (await installApp()) setInstalled(true);
    };

    let body;
    if (standalone || installed) {
        body = (
            <Status tone="ok">
                {standalone
                    ? "You're in the installed app now."
                    : "Installed. Open Sheehan QMS from the desktop or the Start menu."}
            </Status>
        );
    } else if (installable) {
        body = (
            <>
                <p className="settings-text">
                    Puts a <strong>Sheehan QMS</strong> icon on the desktop and in the Start menu. It opens in its own
                    window, with no address bar or tabs, and stays up to date by itself.
                </p>
                <button type="button" className="admin-btn admin-btn-primary settings-action" onClick={install}>
                    Install app
                </button>
            </>
        );
    } else if (!secure) {
        body = (
            <>
                <Status tone="wait">Edge and Chrome only offer Install app over https.</Status>
                <p className="settings-text">
                    Install the certificate first (below), then open this page on the secure address and the button
                    shows up here.
                </p>
            </>
        );
    } else if (DEVICE === "android") {
        body = (
            <p className="settings-text">
                In Chrome, open its menu (&#8942;), then <strong>Add to home screen</strong> or{" "}
                <strong>Install app</strong>.
            </p>
        );
    } else if (DEVICE === "iphone") {
        body = (
            <p className="settings-text">
                In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            </p>
        );
    } else {
        body = (
            <p className="settings-text">
                The browser isn't offering it right now. If it's installed already, open <strong>Sheehan QMS</strong>{" "}
                from the desktop or the Start menu. If not, open this page in Edge or Chrome: Firefox and Safari can't
                install it.
            </p>
        );
    }

    return (
        <div className="admin-panel settings-card">
            <h2>Install app</h2>
            {body}
            {/* the desktop shortcut works over plain http and in any setup, for a Windows PC the button can't reach */}
            {DEVICE === "windows" && !standalone && !installable && !installed && (
                <p className="settings-text settings-alt">
                    Or make the desktop shortcut instead:{" "}
                    <a className="settings-inline-link" href={`${SETUP}/install-app.cmd`}>
                        download install-app.cmd
                    </a>
                    , open it, and choose <em>More info</em> then <em>Run anyway</em> if Windows asks.
                </p>
            )}
        </div>
    );
}

function CertificateCard() {
    const { state, recheck } = useCertificateCheck();

    return (
        <div className="admin-panel settings-card">
            <h2>Install certificate</h2>
            <p className="settings-text">
                Once per device, so the queue opens on <strong>https</strong> with no{" "}
                <em>Your connection isn't private</em> warning. It only makes the device trust the shop's own server.
            </p>

            {secure && <Status tone="ok">This device opens the queue securely.</Status>}
            {!secure && state === "checking" && <Status tone="wait">Checking this device...</Status>}
            {!secure && state === "trusted" && (
                <Status tone="ok">
                    This device is set up. <a href={SECURE_HOME}>Open the secure address</a> and sign in there.
                </Status>
            )}
            {!secure && state === "untrusted" && (
                <>
                    <Status tone="wait">
                        This device isn't set up yet.{" "}
                        <button type="button" className="settings-inline-link" onClick={recheck}>
                            Check again
                        </button>
                    </Status>
                    <a className="admin-btn admin-btn-primary settings-action" href={`${SETUP}/install`}>
                        Set up this device
                    </a>
                    <p className="settings-text">
                        The setup page shows this device's steps and, on Windows, downloads the installer by itself.
                    </p>
                </>
            )}

            <h3 className="settings-subhead">{secure ? "Setting up another device" : "Or download it yourself"}</h3>
            {secure && (
                <p className="settings-text">
                    Open <code>{SETUP}/install</code> on it, or use the files below.
                </p>
            )}
            <div className="settings-downloads">
                <a className="admin-btn" href={`${SETUP}/install-certificate.cmd`}>
                    Windows installer
                </a>
                <a className="admin-btn" href={`${SETUP}/sheehan-ca.crt`}>
                    Certificate for a phone
                </a>
            </div>
            <p className="settings-note">
                These come from the server once HTTPS is set up on it. If a link doesn't open, message the developers.
            </p>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <section className="admin-page">
            <div className="settings-head">
                <h1 className="admin-title">Settings</h1>
                <p className="settings-intro">Set up this PC or phone for the queue.</p>
            </div>
            <div className="settings-columns">
                <InstallAppCard />
                <CertificateCard />
            </div>
        </section>
    );
}
