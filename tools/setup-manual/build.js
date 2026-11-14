// makes public/setup-manual.pdf (linked from Settings) out of manual.html, with fresh screenshots of the app
// run: npm run manual   (builds the site first; uses the browser tests' throwaway server and database, port 3100)
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { ADMIN, PORT } from "../../e2e/settings.js";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = here("../../public/setup-manual.pdf");

const dataUri = (buffer, type) => `data:${type};base64,${buffer.toString("base64")}`;

async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        try {
            if ((await fetch(`${BASE}/api/queue`)).ok) return;
        } catch {
            // not up yet
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`The test server didn't start on ${BASE}`);
}

// the app's pages the manual shows, as JPEG data URIs
async function takeScreenshots(browser) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
    const shot = async (locator) => dataUri(await locator.screenshot({ type: "jpeg", quality: 88 }), "image/jpeg");
    const shots = {};

    await page.goto(`${BASE}/staff/settings`);
    await page.getByLabel("Username").fill(ADMIN.username);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    // the certificate check has answered (the test server has no https, so: not set up yet)
    await page.getByText("This device isn't set up yet.").waitFor();

    // Settings in the menu, outlined
    await page.addStyleTag({
        content: 'a.admin-nav-link[href="/staff/settings"] { outline: 3px solid #f59e0b; outline-offset: -2px; }',
    });
    shots["settings-full"] = dataUri(await page.screenshot({ type: "jpeg", quality: 88 }), "image/jpeg");
    const cards = page.locator(".settings-card");
    shots["settings-cert"] = await shot(cards.filter({ hasText: "Install certificate" }));

    // the browser's install offer, as Edge and Chrome make it over https
    await page.evaluate(() => {
        const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
            prompt: async () => {},
            userChoice: new Promise(() => {}),
        });
        window.dispatchEvent(offer);
    });
    await page.getByRole("main").getByRole("button", { name: "Install app" }).waitFor();
    shots["settings-install"] = await shot(cards.filter({ hasText: "Puts a Sheehan QMS icon" }));

    // a ticket, on its paper, as it prints
    await page.goto(`${BASE}/staff/customer-order`);
    await page.getByRole("textbox", { name: "Customer name" }).fill("Juan Dela Cruz");
    await page.getByRole("button", { name: /^Type of order/ }).click();
    await page.getByRole("checkbox", { name: "Roofings", exact: true }).check();
    await page.keyboard.press("Escape");
    await page.getByLabel("Invoice 1 number").fill("SI-10234");
    await page.getByLabel("Salesman name").fill("Maria Santos");
    await page.getByRole("button", { name: "Serve", exact: true }).click();
    await page.getByRole("button", { name: "New order" }).waitFor();
    // as the printer gets it: the print styles put the ticket alone on an 8.5 × 13 in long page (816 × 1248 px),
    // enlarged to fill it and turned a quarter turn, since the paper goes in standing up
    await page.emulateMedia({ media: "print" });
    await page.setViewportSize({ width: 816, height: 1248 });
    const jpeg = { type: /** @type {const} */ ("jpeg"), quality: 88 };
    shots["ticket-page"] = dataUri(
        await page.screenshot({ ...jpeg, clip: { x: 0, y: 0, width: 816, height: 1248 } }),
        "image/jpeg",
    );
    // and the same ticket read the right way round, as staff hold the printed paper
    await page.addStyleTag({
        content:
            ".receipt-section { position: static !important; width: auto !important; height: auto !important; } .receipt-section .ticket-sheet { --ticket-px: 1px !important; position: static !important; margin: 25px 36px !important; transform: none !important; }",
    });
    await page.setViewportSize({ width: 816, height: 528 });
    shots.ticket = dataUri(
        await page.screenshot({ ...jpeg, clip: { x: 0, y: 0, width: 816, height: 528 } }),
        "image/jpeg",
    );

    await page.close();
    return shots;
}

const server = spawn(process.execPath, [here("../../e2e/startServer.js")], { stdio: "ignore" });
let browser;
try {
    await waitForServer();
    browser = await chromium.launch();
    const images = {
        ...(await takeScreenshots(browser)),
        logo: dataUri(readFileSync(here("../../src/assets/SheehanLogo.png")), "image/png"),
    };
    const html = readFileSync(here("manual.html"), "utf8").replace(/\{\{([\w-]+)\}\}/g, (match, name) => {
        if (!images[name]) throw new Error(`manual.html asks for a picture there's none of: ${match}`);
        return images[name];
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
        path: OUT,
        format: "Letter",
        printBackground: true,
        margin: { top: "0.55in", bottom: "0.65in", left: "0.6in", right: "0.6in" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="width: 100%; padding: 0 0.6in; font: 8px 'Segoe UI', sans-serif; color: #8a8a93;
            display: flex; justify-content: space-between;"><span>Sheehan QMS · Device setup manual</span>
            <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    console.log(`Made ${OUT}`);
} finally {
    await browser?.close();
    server.kill();
}
