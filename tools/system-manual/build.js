// makes public/system-manual.pdf, the guide to the whole system (the ticket's path, each role and its pages), out of
// manual.html, with fresh screenshots of the app
// run: npm run manual:system   (builds the site first; uses the browser tests' throwaway server and database, port 3100)
// a sample day is made through the API first, one account per role and tickets at every stage, so each page has
// something on it; nothing here touches the real data
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { ADMIN, PORT } from "../../e2e/settings.js";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = here("../../public/system-manual.pdf");
const PASSWORD = "manual-pass-1";
const VIEWPORT = { width: 1440, height: 860 };
// a page of the site that asks the server nothing (the not-found page): every staff member's tab waits there while
// it isn't being shot, since many tabs polling from one computer would run into the API's limit per computer
const PARKED = `${BASE}/manual-parked`;

const dataUri = (buffer, type) => `data:${type};base64,${buffer.toString("base64")}`;
const jpeg = { type: /** @type {const} */ ("jpeg"), quality: 82 };

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

// calls the API as the signed-in page does
const api = (page, method, path, body) =>
    page.evaluate(
        async ([verb, url, payload]) => {
            const res = await fetch(`/api${url}`, {
                method: verb,
                headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    "X-Tab-Id": sessionStorage.getItem("tabId") ?? "",
                },
                body: payload && JSON.stringify(payload),
            });
            const text = await res.text();
            if (!res.ok) throw new Error(`${verb} ${url} failed (${res.status}): ${text}`);
            return text ? JSON.parse(text) : null;
        },
        [method, path, body],
    );

// the staff who work the sample day, one or two per role
const STAFF = {
    maria: { username: "maria.santos", name: "Maria Santos", role: "sales", team: "GIGA", department: "Sales" },
    paolo: { username: "paolo.garcia", name: "Paolo Garcia", role: "sales", team: "MEGA", department: "Sales" },
    pedro: {
        username: "pedro.reyes",
        name: "Pedro Reyes",
        role: "loading",
        loadingArea: "Roofings",
        department: "Warehouse",
    },
    ben: { username: "ben.torres", name: "Ben Torres", role: "loading", loadingArea: "Steel", department: "Warehouse" },
    rico: { username: "rico.dizon", name: "Rico Dizon", role: "service", department: "Service" },
    nina: { username: "nina.flores", name: "Nina Flores", role: "hardware", department: "Hardware" },
    arnel: { username: "arnel.bautista", name: "Arnel Bautista", role: "security", department: "Security" },
    rosa: { username: "rosa.bayad", name: "Rosa Bayad", role: "cashier", department: "Accounting" },
    lea: { username: "lea.ramos", name: "Lea Ramos", role: "inventory", department: "Inventory" },
    kevin: { username: "kevin.uy", name: "Kevin Uy", role: "developer", department: "IT" },
};

const proceed = {
    Roofings: "Please proceed to Roofings (Gate Y: Yero)",
    Steel: "Please proceed to Steel (Gate B: Bakalan)",
};

// a browser of one staff member's own, signed in and waiting on their home page
async function signedIn(browser, username, password = PASSWORD) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.6 });
    const page = await context.newPage();
    await page.goto(`${BASE}/staff`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByLabel("Username").waitFor({ state: "detached" });
    await page.goto(PARKED);
    return page;
}

const park = (page) => page.goto(PARKED);

// a page, once it has loaded and its first poll has answered, with the pop-ups about new orders put away; a sign-in
// page instead means the server turned a request away for a moment, so it tries again; the tab shot before it goes
// back to waiting, so only one staff tab asks the server anything at a time
let lastOpened;
async function open(page, path) {
    if (lastOpened && lastOpened !== page) await park(lastOpened);
    lastOpened = page;
    for (let tries = 0; ; tries++) {
        await page.goto(`${BASE}${path}`);
        await page.locator("main").first().waitFor();
        await page.waitForTimeout(1800);
        if (!(await page.getByRole("heading", { name: "Staff sign in" }).isVisible())) break;
        if (tries === 10) throw new Error(`${path} kept showing the sign-in page`);
        await page.waitForTimeout(6000);
    }
    await page.addStyleTag({ content: '[class*="order-notice"] { display: none !important; }' });
    await page.waitForTimeout(200);
}

const shotOf = async (page) => dataUri(await page.screenshot(jpeg), "image/jpeg");
const shotOfLocator = async (locator) => dataUri(await locator.screenshot(jpeg), "image/jpeg");

async function takeScreenshots(browser) {
    const shots = {};

    // the sign-in page, before anyone signs in
    {
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.6 });
        const page = await context.newPage();
        await page.goto(`${BASE}/staff`);
        await page.getByLabel("Username").waitFor();
        await page.waitForTimeout(1500);
        await page.getByLabel("Username").fill("maria.santos");
        shots.login = await shotOf(page);
        await context.close();
    }

    // the accounts, made by the admin
    const admin = await signedIn(browser, ADMIN.username, ADMIN.password);
    const ids = {};
    for (const [key, person] of Object.entries(STAFF)) {
        const made = await api(admin, "POST", "/admin/users", {
            username: person.username,
            name: person.name,
            password: PASSWORD,
            role: person.role,
            team: person.team ?? "",
            loadingArea: person.loadingArea ?? "",
        });
        ids[key] = made.id;
    }

    // each one's name and department, as they'd fill in on My account
    const profile = (name, department) => {
        const [firstName, ...rest] = name.split(" ");
        return { firstName, middleName: "", surname: rest.join(" "), employeeId: "", department };
    };
    await api(admin, "PATCH", "/admin/me", profile("Office Admin", "Management"));
    const pages = {};
    for (const [key, person] of Object.entries(STAFF)) {
        pages[key] = await signedIn(browser, person.username);
        await api(pages[key], "PATCH", "/admin/me", profile(person.name, person.department));
    }
    const { maria, paolo, pedro, ben, rico, nina, arnel, rosa } = pages;

    // the sample day's tickets, made by sales
    const sale = (name, purpose, invoices, salesman, team) => ({
        name,
        purpose,
        orders: [],
        invoices: invoices.map(([invoiceNo, type]) => ({ invoiceNo, type })),
        salesman,
        team,
        pickupDate: null,
    });
    const order = async (who, ...args) => (await api(who, "POST", "/orders", sale(...args))).queueNum;
    const juan = await order(
        maria,
        "Juan Dela Cruz",
        "Roofings, Steel",
        [
            ["43355521", "Roofings"],
            ["43355522", "Steel"],
        ],
        "Maria Santos",
        "GIGA",
    );
    const ana = await order(paolo, "Ana Lim", "Steel", [["43355530", "Steel"]], "Paolo Garcia", "MEGA");
    const grace = await order(maria, "Grace Tan", "Roofings", [["43355541", "Roofings"]], "Maria Santos", "GIGA");
    const liza = await order(
        paolo,
        "Liza Gomez",
        "Tire, Battery",
        [
            ["43355550", "Tire"],
            ["43355551", "Battery"],
        ],
        "Paolo Garcia",
        "MEGA",
    );
    const carlo = await order(
        maria,
        "Carlo Mendoza",
        "Roofings, Hardwares",
        [
            ["43355560", "Roofings"],
            ["43355561", "Hardwares"],
        ],
        "Maria Santos",
        "GIGA",
    );
    const ramon = await order(maria, "Ramon Cruz", "Hardwares", [["43355570", "Hardwares"]], "Maria Santos", "GIGA");
    await order(maria, "Mark Villanueva", "Chassis", [["43355580", "Chassis"]], "Maria Santos", "GIGA");
    await order(paolo, "Joy Santiago", "Stainless", [["43355590", "Stainless"]], "Paolo Garcia", "MEGA");
    const rey = await order(maria, "Rey Aquino", "Hardwares", [["43355595", "Hardwares"]], "Maria Santos", "GIGA");

    // sales hand most of them over
    await api(maria, "POST", `/admin/orders/${juan}/handover`);
    await api(paolo, "POST", `/admin/orders/${ana}/handover`);
    await api(maria, "POST", `/admin/orders/${grace}/handover`);
    await api(paolo, "POST", `/admin/orders/${liza}/handover`);
    await api(maria, "POST", `/admin/orders/${carlo}/handover`);
    await api(maria, "POST", `/admin/orders/${ramon}/handover`);

    // the departments work them: Juan is done at Roofings and now at Steel, Ana and Grace are loaded and at the gate,
    // Ramon's order is being prepared at Hardware
    await api(pedro, "POST", `/admin/loading/${juan}/call`, { area: "Roofings", remarks: proceed.Roofings });
    await api(pedro, "POST", `/admin/loading/${juan}/start`, { area: "Roofings" });
    await api(pedro, "POST", `/admin/loading/${juan}/done`);
    await api(ben, "POST", `/admin/loading/${ana}/call`, { area: "Steel", remarks: proceed.Steel });
    await api(ben, "POST", `/admin/loading/${ana}/start`, { area: "Steel" });
    await api(ben, "POST", `/admin/loading/${ana}/done`);
    await api(pedro, "POST", `/admin/loading/${grace}/call`, { area: "Roofings", remarks: proceed.Roofings });
    await api(pedro, "POST", `/admin/loading/${grace}/start`, { area: "Roofings" });
    await api(pedro, "POST", `/admin/loading/${grace}/done`);
    await api(nina, "POST", `/admin/hardware/${ramon}/call`, {
        area: "Hardware",
        remarks: "Please proceed to Hardware",
    });
    await api(nina, "POST", `/admin/hardware/${ramon}/start`, { area: "Hardware" });
    await api(ben, "POST", `/admin/loading/${juan}/call`, { area: "Steel", remarks: proceed.Steel });

    // the gate lets Ana out, and the cashier marks how a few are paid
    await api(arnel, "POST", `/admin/security/${ana}/check`, { result: "verified" });
    const payments = await api(rosa, "GET", "/admin/payments");
    const paid = { "Ana Lim": "Paid", "Juan Dela Cruz": "Terms", "Grace Tan": "COD", "Carlo Mendoza": "Vale" };
    for (const row of payments) {
        if (paid[row.name]) await api(rosa, "PATCH", `/admin/payments/${row.id}`, { paymentStatus: paid[row.name] });
    }

    // two returning customers: Rey was done at the counter (never handed over) and comes back to sales; Ana was
    // loaded and let out at the gate, and comes back, so she goes straight back to the loading crew's line
    await api(maria, "PATCH", `/admin/orders/${rey}`, { status: "done" });
    await api(maria, "PATCH", `/admin/orders/${rey}`, { status: "returning" });
    await api(paolo, "PATCH", `/admin/orders/${ana}`, { status: "returning" });

    // ---------- the pages ----------

    // the queue display, as the customers see it
    {
        const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.4 });
        const page = await context.newPage();
        await page.goto(`${BASE}/`);
        await page.getByRole("heading", { name: "Now Serving" }).waitFor();
        await page.waitForTimeout(2500);
        shots.display = await shotOf(page);
        await context.close();
    }

    await open(admin, "/staff");
    shots["dash-admin"] = await shotOf(admin);
    await open(maria, "/staff");
    shots["dash-sales"] = await shotOf(maria);

    // Customer order: a new customer's form, filled in, then the ticket as it will print
    await open(maria, "/staff/customer-order");
    await maria.getByRole("textbox", { name: "Customer name" }).fill("Elena Navarro");
    await maria.getByRole("button", { name: /^Type of order/ }).click();
    await maria.getByRole("checkbox", { name: "Roofings", exact: true }).check();
    await maria.getByRole("checkbox", { name: "Steel", exact: true }).check();
    await maria.keyboard.press("Escape");
    await maria.getByLabel("Invoice 1 number").fill("43355600");
    await maria.waitForTimeout(400);
    shots["order-form"] = await shotOf(maria);
    await maria.getByRole("tab", { name: "Ticket preview" }).click();
    await maria.waitForTimeout(800);
    shots["order-preview"] = await shotOf(maria);
    // a pick-up: the customer comes back on a later day for the items
    await maria.getByRole("tab", { name: "Order", exact: true }).click();
    await maria.getByRole("checkbox", { name: /^Returning: the customer picks up/ }).check();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    await maria
        .getByLabel("Pick-up date")
        .fill(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`);
    await maria.waitForTimeout(300);
    shots["returning-pickup"] = await shotOfLocator(maria.locator(".sale-returning"));
    await maria
        .getByRole("button", { name: "Start over" })
        .click()
        .catch(() => {});

    await open(maria, "/staff/customer-order?tab=sheet");
    shots["order-sheet"] = await shotOf(maria);
    await open(admin, "/staff/customer-order?tab=orders");
    shots["order-history"] = await shotOf(admin);

    // My counter, and the hand-over it asks to confirm
    await open(maria, "/staff/counter");
    shots.counter = await shotOf(maria);
    // the returning customers on My counter: back in Waiting, and the Returning button on a served one
    shots["returning-waiting"] = await shotOfLocator(
        maria.locator(".admin-panel").filter({ has: maria.getByRole("heading", { name: /^Waiting/ }) }),
    );
    shots["returning-served"] = await shotOfLocator(
        maria
            .locator("li")
            .filter({ hasText: "Grace Tan" })
            .filter({ has: maria.getByRole("button", { name: "Returning", exact: true }) }),
    );
    await maria
        .getByRole("listitem")
        .filter({ hasText: "Mark Villanueva" })
        .getByRole("button", { name: "Hand over to loading" })
        .click();
    const handover = maria.getByRole("dialog");
    await handover.waitFor();
    await maria.waitForTimeout(300);
    shots["counter-handover"] = await shotOfLocator(handover);
    await handover.getByRole("button", { name: "Cancel" }).click();

    // the loading crew: the line, and the Call dialog
    await open(pedro, "/staff/loading");
    shots.loading = await shotOf(pedro);
    await pedro
        .getByRole("listitem")
        .filter({ hasText: "Carlo Mendoza" })
        .getByRole("button", { name: "Call", exact: true })
        .click();
    const call = pedro.getByRole("dialog");
    await call.waitFor();
    await pedro.waitForTimeout(300);
    shots["loading-call"] = await shotOfLocator(call);
    await call.getByRole("button", { name: "Cancel" }).click();

    await open(ben, "/staff/loading");
    const serving = ben.getByRole("listitem").filter({ hasText: "Juan Dela Cruz" }).first();
    shots["loading-serving"] = await shotOfLocator(serving);
    // a returning customer who was loaded before: back in the crew's line, not with sales
    shots["returning-loading"] = await shotOfLocator(ben.getByRole("listitem").filter({ hasText: "Ana Lim" }).first());

    await open(rico, "/staff/service");
    shots.service = await shotOf(rico);
    await open(nina, "/staff/hardware");
    shots.hardware = await shotOf(nina);

    await open(arnel, "/staff/security");
    shots.security = await shotOf(arnel);
    await open(rosa, "/staff/cashier");
    shots.cashier = await shotOf(rosa);
    await open(pages.kevin, "/staff/order-status");
    shots["order-status"] = await shotOf(pages.kevin);
    await open(pages.lea, "/staff");
    shots["dash-inventory"] = await shotOf(pages.lea);

    await open(admin, "/staff/accounts");
    shots.accounts = await shotOf(admin);
    await open(admin, "/staff/display");
    shots["display-settings"] = await shotOf(admin);
    await open(pedro, "/staff/account");
    shots.account = await shotOf(pedro);

    // SheeChat, with a short conversation between sales and loading
    await api(maria, "POST", `/admin/sheechat/${ids.pedro}`, { body: "Juan Dela Cruz's truck is at the gate now." });
    await api(pedro, "POST", `/admin/sheechat/${ids.maria}`, { body: "Got it, we'll load the roofing sheets first." });
    await open(maria, `/staff/sheechat`);
    const conversation = maria.getByText("Pedro Reyes").first();
    await conversation.click().catch(() => {});
    await maria.waitForTimeout(1200);
    shots.sheechat = await shotOf(maria);

    // a rush, last so the pages above keep the quieter day: many more customers in line and several called at once,
    // to show how the display copes when it's busy
    await park(maria);
    const rush = [
        ["Jose Ramirez", "Roofings"],
        ["Lorna Villar", "Steel"],
        ["Dante Robles", "Roofings, Steel"],
        ["Marites Cabrera", "Tire"],
        ["Noel Pascual", "Hardwares"],
        ["Cora Domingo", "Roofings Accessories"],
        ["Ramil Ocampo", "Chassis"],
        ["Susan Medina", "Battery"],
        ["Arturo Lim", "Steel, Hardwares"],
        ["Bea Navarro", "Roofings"],
        ["Ely Gutierrez", "Stainless"],
        ["Fe Manalo", "Roofings, Tire"],
        ["Gil Santos", "Steel"],
        ["Hazel Reyes", "Hardwares"],
        ["Ian Castro", "Roofings"],
        ["Jenny Uy", "Tire, Battery"],
    ];
    const rushNums = [];
    for (const [i, [name, purpose]] of rush.entries()) {
        const who = i % 2 ? paolo : maria;
        const salesman = i % 2 ? "Paolo Garcia" : "Maria Santos";
        // an invoice for each type of order on the ticket
        const invoices = purpose.split(", ").map((type, k) => [`4336${String(i).padStart(2, "0")}${k}0`, type]);
        rushNums.push(await order(who, name, purpose, invoices, salesman, i % 2 ? "MEGA" : "GIGA"));
    }
    // the first few are handed over and called, so the display has several numbers at counters at once
    const calls = [
        [pedro, "loading", 0, "Roofings"],
        [ben, "loading", 1, "Steel"],
        [rico, "service", 3, "Service"],
        [nina, "hardware", 4, "Hardware"],
        [pedro, "loading", 5, "Roofings"],
    ];
    for (const [who, department, i, area] of calls) {
        await api(i % 2 ? paolo : maria, "POST", `/admin/orders/${rushNums[i]}/handover`);
        await api(who, "POST", `/admin/${department}/${rushNums[i]}/call`, {
            area,
            remarks: proceed[area] ?? `Please proceed to ${area}`,
        });
    }
    {
        const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.4 });
        const page = await context.newPage();
        await page.goto(`${BASE}/`);
        await page.getByRole("heading", { name: "Now Serving" }).waitFor();
        await page.waitForTimeout(2500);
        shots["display-busy"] = await shotOf(page);
        await context.close();
    }

    // a ticket on its paper, as the printer gets it: the print styles put it alone on half a long sheet, 6.5 × 8.5 in
    // (624 × 816 px), filling it and turned a quarter turn, since the paper goes in standing up; the last thing done
    // with Maria's tab, since it leaves the page in print mode
    await open(maria, "/staff/customer-order");
    await maria.getByRole("textbox", { name: "Customer name" }).fill("Elena Navarro");
    await maria.getByRole("button", { name: /^Type of order/ }).click();
    await maria.getByRole("checkbox", { name: "Roofings", exact: true }).check();
    await maria.keyboard.press("Escape");
    await maria.getByLabel("Invoice 1 number").fill("43355600");
    await maria.getByRole("button", { name: "Serve", exact: true }).click();
    await maria.getByRole("button", { name: "New order" }).waitFor();
    await maria.emulateMedia({ media: "print" });
    await maria.setViewportSize({ width: 624, height: 816 });
    await maria.waitForTimeout(400);
    shots["ticket-page"] = dataUri(
        await maria.screenshot({ ...jpeg, clip: { x: 0, y: 0, width: 624, height: 816 } }),
        "image/jpeg",
    );
    // and the same ticket read the right way round, as staff hold the printed paper
    await maria.addStyleTag({
        content:
            ".receipt-section { position: static !important; width: auto !important; height: auto !important; } .receipt-section .ticket-sheet { --ticket-px: 1px !important; position: static !important; margin: 25px 36px !important; transform: none !important; }",
    });
    await maria.setViewportSize({ width: 816, height: 610 });
    await maria.waitForTimeout(300);
    shots.ticket = dataUri(
        await maria.screenshot({ ...jpeg, clip: { x: 0, y: 0, width: 816, height: 610 } }),
        "image/jpeg",
    );

    return shots;
}

const server = spawn(process.execPath, [here("../../e2e/startServer.js")], { stdio: "ignore" });
let browser;
try {
    await waitForServer();
    browser = await chromium.launch();
    const shots = await takeScreenshots(browser);
    // SHOTS_DIR=<folder> saves the screenshots there to look at, and makes no PDF
    if (process.env.SHOTS_DIR) {
        for (const [name, uri] of Object.entries(shots)) {
            writeFileSync(`${process.env.SHOTS_DIR}/${name}.jpg`, Buffer.from(uri.split(",")[1], "base64"));
        }
    } else {
        await makePdf(shots);
    }
} finally {
    await browser?.close();
    server.kill();
}

async function makePdf(shots) {
    const images = {
        ...shots,
        logo: dataUri(readFileSync(here("../../src/assets/SheehanLogo.png")), "image/png"),
        // the front page, a picture of its own (public/QUEUing magement SYSTEM.png)
        cover: dataUri(readFileSync(here("../../public/QUEUing magement SYSTEM.png")), "image/png"),
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
            display: flex; justify-content: space-between;"><span>Sheehan QMS · System manual</span>
            <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    console.log(`Made ${OUT}`);
}
