// adds a Loading staff account (the roofing and steel loading crews), like Laravel's db:seed, for trying the
// Loading page; it can sign in to the admin area for Loading and My account only, with no admin or sales rights
// it's made through the same POST /admin/users an admin uses on Accounts, signed in as the built-in admin from .env;
// safe to run while the app is running, and running it again leaves an existing account alone
// run: npm run seed:loading                          username loading, password loading123
//      npm run seed:loading -- pedro steel-crew-1    your own username and password
// don't run it on the live server with the default password
import { createServer } from 'node:http';

import { createApi } from './api.js';

const DEFAULT_USERNAME = "loading";
const DEFAULT_PASSWORD = "loading123";
const NAME = "Loading Staff";

const [username = DEFAULT_USERNAME, password = DEFAULT_PASSWORD] = process.argv.slice(2);

const { ADMIN_USERNAME, ADMIN_PASSWORD, DATA_DIR } = process.env;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

const api = createApi({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD, dataDir: DATA_DIR });
const server = createServer(api);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

// one signed-in browser: keeps its session cookie and sends the header the admin pages send
const browser = () => {
    let cookie = "";
    return async (method, path, body) => {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                ...(body !== undefined && { "Content-Type": "application/json" }),
                ...(cookie && { Cookie: cookie }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = res.headers.get("set-cookie");
        if (setCookie) cookie = setCookie.split(";")[0];
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
    };
};

try {
    const admin = browser();
    const signIn = await admin("POST", "/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    if (signIn.status !== 200) throw new Error(`The built-in admin couldn't sign in (${signIn.status}): ${signIn.body?.message}`);

    const created = await admin("POST", "/admin/users", { username, name: NAME, password, role: "loading" });
    if (created.status === 409) {
        const existing = (await admin("GET", "/admin/users")).body.find((a) => a.username.toLowerCase() === username.toLowerCase());
        console.log(`There's already an account named ${username} (role: ${existing?.role ?? "unknown"}); left it as it is.`);
    } else if (created.status !== 201) {
        throw new Error(`The API refused the account (${created.status}): ${created.body?.message}`);
    } else {
        // sign in as them to show what they can and can't do
        const staff = browser();
        await staff("POST", "/auth/login", { username, password });
        const me = (await staff("GET", "/auth/me")).body;
        const orders = (await staff("GET", "/admin/orders")).status;
        console.log(`Added ${me.name}: username ${username}, password ${password}, role ${me.role}`);
        console.log(`  signs in to the Loading page and My account; admin and sales pages refused (${orders})`);
    }
    console.log(`Data folder: ${api.dataDir}`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    server.closeAllConnections();
    server.close();
    api.close();
}
