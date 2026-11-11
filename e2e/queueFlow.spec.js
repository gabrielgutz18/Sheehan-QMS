// the app's main path in a real browser, with the display screen open beside it, the way the shop runs it
import { expect, test } from "@playwright/test";

import { ADMIN } from "./settings.js";

// a page that crashes fails its test, even if what the test looks at still happens to be on screen
const crashes = [];
const watch = (page) => page.on("pageerror", (err) => crashes.push(err.message));

test.beforeEach(({ page }) => {
    crashes.length = 0;
    watch(page);
});

test.afterEach(() => {
    expect(crashes).toEqual([]);
});

const signIn = async (page, username, password) => {
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
};

test("a wrong password is refused, and the staff pages stay behind the sign-in", async ({ page }) => {
    await page.goto("/staff/customer-order");
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();

    await signIn(page, ADMIN.username, "not-the-password");

    await expect(page.getByRole("alert")).toContainText("Incorrect username or password.");
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeHidden();

    // the empty password box gets the cursor back, and the eye shows what's typed in it
    const passwordBox = page.getByLabel("Password", { exact: true });
    await expect(passwordBox).toBeFocused();
    await expect(passwordBox).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(passwordBox).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toBeVisible();
});

test("a new tab of the same browser carries on signed in, with no sign-in page", async ({ page }) => {
    await page.goto("/staff/customer-order");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeVisible();

    // a second tab of the same browser opens straight onto the staff pages, with no sign-in
    const second = await page.context().newPage();
    watch(second);
    await second.goto("/staff/customer-order");
    await expect(second.getByRole("heading", { name: "Customer order" })).toBeVisible();
    await second.close();
});

test("Serve stays in view on Customer order, and a stopped Serve puts the cursor on the first field to fix", async ({
    page,
}) => {
    // a short laptop screen, where the whole form can't fit
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/staff/customer-order");
    await signIn(page, ADMIN.username, ADMIN.password);
    const serve = page.getByRole("button", { name: "Serve", exact: true });
    await expect(serve).toBeInViewport();
    await expect(page.locator(".sale-actions")).toContainText("New ticket");

    // the summary beside Serve fills in as the form is
    await page.getByRole("button", { name: /^Type of order/ }).click();
    await page.getByRole("checkbox", { name: "Roofings", exact: true }).check();
    await page.getByRole("checkbox", { name: "Steel", exact: true }).check();
    await page.keyboard.press("Escape");
    await page.getByLabel("Invoice 1 number").fill("E2E-2001");
    await expect(page.locator(".sale-actions")).toContainText("RS --");
    await expect(page.locator(".sale-actions")).toContainText("Roofings, Steel · 1 invoice");

    // scrolled down to the last group, Serve is still there; pressed with no name, the name field gets the cursor
    await page.getByText(/^Returning:/).scrollIntoViewIfNeeded();
    await expect(serve).toBeInViewport();
    await serve.click();
    const name = page.getByRole("textbox", { name: "Customer name" });
    await expect(name).toBeFocused();
    await expect(name).toBeInViewport();
    await expect(page.getByText("Please enter the customer's name.")).toBeVisible();
});

test("a half-filled order is still there after going to another page and back, until Start over", async ({ page }) => {
    await page.goto("/staff/customer-order");
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.getByRole("textbox", { name: "Customer name" }).fill("Draft Customer");
    await page.getByLabel("Invoice 1 number").fill("E2E-DRAFT-1");

    // off to the Dashboard and back through the menu: the form comes back as it was left
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Customer order" }).click();
    await expect(page.getByRole("textbox", { name: "Customer name" })).toHaveValue("Draft Customer");
    await expect(page.getByLabel("Invoice 1 number")).toHaveValue("E2E-DRAFT-1");

    // Start over empties it, and it stays empty the next time round
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByRole("textbox", { name: "Customer name" })).toHaveValue("");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Customer order" }).click();
    await expect(page.getByRole("textbox", { name: "Customer name" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Start over" })).toBeHidden();
});

test("a customer goes from their ticket, through hand-over and loading, with the display following along", async ({
    page,
}) => {
    const customer = `Test Customer ${Date.now()}`;

    const display = await page.context().newPage();
    watch(display);
    await display.goto("/");
    await expect(display.getByRole("heading", { name: "Now Serving" })).toBeVisible();
    const upNext = display.getByRole("region", { name: "Up next" });
    const nowServing = display.getByRole("region", { name: "Now Serving" });

    // sales take the order; the ticket gets its number
    await page.goto("/staff/customer-order");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeVisible();
    await page.getByRole("textbox", { name: "Customer name" }).fill(customer);
    await page.getByRole("button", { name: /^Type of order/ }).click();
    await page.getByRole("checkbox", { name: "Roofings", exact: true }).check();
    await page.keyboard.press("Escape");
    await page.getByLabel("Invoice 1 number").fill("E2E-1001");
    await page.getByLabel("Salesman name").fill("Test Salesman");
    await page.getByRole("button", { name: "Serve", exact: true }).click();
    await expect(page.getByRole("button", { name: "New order" })).toBeVisible();

    // they show as next in line
    await expect(upNext.getByText(customer)).toBeVisible();

    // the counter hands them over to loading
    await page.goto("/staff/counter");
    await page
        .getByRole("listitem")
        .filter({ hasText: customer })
        .getByRole("button", { name: "Hand over to loading" })
        .click();
    await page.getByRole("dialog").getByRole("button", { name: "Hand over to loading" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    // a short note says it worked
    await expect(page.getByRole("status").filter({ hasText: /handed over to loading\.$/ })).toBeVisible();

    // loading's browser tab counts who can be called, so the crew sees it from another tab
    await page.goto("/staff/loading");
    await expect(page).toHaveTitle(/^\(\d+\) Loading$/);

    // loading calls them, and the display headlines them
    await page
        .getByRole("listitem")
        .filter({ hasText: customer })
        .getByRole("button", { name: "Call", exact: true })
        .click();
    await page.getByRole("dialog").getByRole("button", { name: "Call now" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: /^✓ Called / })).toBeVisible();
    await expect(nowServing.getByText(customer)).toBeVisible();
    // told which gate the Roofings yard is, on a line of its own
    await expect(nowServing.locator(".serving-gate")).toHaveText("(Gate Y: Yero)");

    // the truck arrives and the crew finishes, so the customer leaves the display
    const ticket = page.getByRole("listitem").filter({ hasText: customer });
    // the card says where they are and what to press next, with one main button at a time
    await expect(ticket.getByText("Called", { exact: true })).toBeVisible();
    await expect(ticket.getByText("Press Start loading once the truck is at the area.")).toBeVisible();
    await ticket.getByRole("button", { name: "Start loading at Roofings" }).click();
    await expect(ticket.getByText(/^Loading since /)).toBeVisible();
    await expect(ticket.getByRole("button", { name: "Call again" })).toHaveCount(0);
    await ticket.getByRole("button", { name: "Done at Roofings" }).click();
    await expect(page.getByRole("button", { name: "Done at Roofings" })).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: /done at Roofings\.$/ })).toBeVisible();
    await expect(nowServing.getByText(customer)).toBeHidden();
    await expect(upNext.getByText(customer)).toBeHidden();
});

// Tire and Battery's own page, at the address it got when the department stopped being called TBA
test("the Service page opens at its own address", async ({ page }) => {
    await page.goto("/staff/service");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByText(/^Waiting for service \(\d+\)$/)).toBeVisible();
});

// calls the API as the signed-in page does, to set up what a test needs
const api = (page, method, path, body) =>
    page.evaluate(
        async ([verb, url, payload]) => {
            const res = await fetch(`/api${url}`, {
                method: verb,
                headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    "X-Tab-Id": sessionStorage.getItem("tabId"),
                },
                body: payload && JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`${verb} ${url} failed (${res.status})`);
            return res.json();
        },
        [method, path, body],
    );

const sale = (name, purpose, invoices) => ({
    name,
    purpose,
    orders: [],
    invoices,
    salesman: "Maria Santos",
    team: "GIGA",
    pickupDate: null,
});

test("By product splits the Cashier's orders by type, and a mixed ticket has one payment status across its lines", async ({
    page,
}) => {
    const stamp = Date.now();
    const customer = `Cashier Buyer ${stamp}`;
    await page.goto("/staff/cashier");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Cashier", exact: true })).toBeVisible();
    await api(
        page,
        "POST",
        "/orders",
        sale(customer, "Steel, Hardwares", [
            { invoiceNo: `S${stamp}`, type: "Steel" },
            { invoiceNo: `H${stamp}`, type: "Hardwares" },
        ]),
    );

    await page.getByRole("tab", { name: "By product" }).click();
    await expect(page).toHaveURL(/tab=products/);
    await page.getByRole("searchbox").fill(customer);

    const steel = page.getByRole("region", { name: "Steel" }).getByRole("row").filter({ hasText: customer });
    const hardwares = page.getByRole("region", { name: "Hardwares" }).getByRole("row").filter({ hasText: customer });
    await expect(steel).toContainText(`S${stamp}`);
    await expect(steel).not.toContainText(`H${stamp}`);
    await expect(steel).toContainText("Also: Hardwares");
    await expect(hardwares).toContainText(`H${stamp}`);

    // paid on one line is paid on the other, as it's one ticket
    await steel.getByRole("button", { name: "Paid", exact: true }).click();
    await expect(hardwares.getByRole("button", { name: "Paid", exact: true })).toHaveAttribute("aria-pressed", "true");

    // every type has its own button, and one shows only its own orders
    const products = page.getByRole("group", { name: "Product" });
    for (const name of [
        "Roofings",
        "Roofings Accessories",
        "Steel",
        "Hardwares",
        "Tire",
        "Battery",
        "Chassis",
        "Stainless",
    ]) {
        await expect(products.getByRole("button", { name: new RegExp(`^${name} \\d+$`) })).toBeVisible();
    }
    await products.getByRole("button", { name: /^Hardwares/ }).click();
    await expect(hardwares).toBeVisible();
    await expect(steel).toBeHidden();

    // an invoice number finds only the group it's in
    await products.getByRole("button", { name: /^All products/ }).click();
    await page.getByRole("searchbox").fill(`S${stamp}`);
    await expect(steel).toBeVisible();
    await expect(hardwares).toBeHidden();

    // the search carries across to the Orders tab, where the ticket is one row
    await page.getByRole("tab", { name: "Orders", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: customer })).toHaveCount(1);

    // on a phone the page itself never scrolls sideways
    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole("tab", { name: "By product" }).click();
    await expect(steel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Security has the page heading the other staff pages have, with Verified as the one main button", async ({
    page,
}) => {
    const stamp = Date.now();
    const customer = `Gate Buyer ${stamp}`;
    await page.goto("/staff/security");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { level: 1, name: "Security check" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Orders today" })).toBeVisible();

    const { queueNum } = await api(
        page,
        "POST",
        "/orders",
        sale(customer, "Steel", [{ invoiceNo: `G${stamp}`, type: "Steel" }]),
    );
    await api(page, "POST", `/admin/orders/${queueNum}/handover`);
    await api(page, "POST", `/admin/loading/${queueNum}/start`, { area: "Steel" });
    await api(page, "POST", `/admin/loading/${queueNum}/done`);

    await page.getByRole("searchbox").fill(customer);
    const row = page.getByRole("row").filter({ hasText: customer });
    const verified = row.getByRole("button", { name: /^Verified:/ });
    const problem = row.getByRole("button", { name: /^Report a problem with/ });
    await expect(verified).toBeVisible();
    expect((await verified.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await problem.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await problem.boundingBox()).width).toBeCloseTo((await verified.boundingBox()).width, 0);
    await expect(row).not.toContainText("⚠");

    // a report doesn't go through until the guard has said whether the customer leaves or goes back to an area
    await problem.click();
    const report = page.getByRole("dialog");
    await report.getByRole("textbox").fill("One sheet short");
    await report.getByRole("button", { name: "Report", exact: true }).click();
    await expect(report.getByRole("alert")).toContainText("what happens next");
    await report.getByRole("button", { name: "Cancel" }).click();
    await expect(report).toBeHidden();

    await verified.click();
    await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
    await expect(row).toContainText("Verified by");
});

test("a red bar says so when the server can't be reached, and goes away by itself once it can", async ({ page }) => {
    await page.goto("/staff/loading");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Loading", exact: true })).toBeVisible();
    const bar = page.getByRole("alert").filter({ hasText: "Connection lost." });
    await expect(bar).toBeHidden();

    // the network drops: the next refresh can't get through
    await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
    await expect(bar).toBeVisible({ timeout: 15000 });

    // and comes back
    await page.unroute("**/api/**");
    await expect(bar).toBeHidden({ timeout: 15000 });
});

test("the display and printer settings are one menu item, and SheeChat holds Message developer, with old links still working", async ({
    page,
}) => {
    await page.goto("/staff");
    await signIn(page, ADMIN.username, ADMIN.password);
    const menu = page.getByRole("navigation", { name: "Admin" });
    await expect(menu.getByRole("link", { name: "Display & printer" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Printer", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Message developer" })).toHaveCount(0);

    // an old address opens its tab
    await page.goto("/staff/printer");
    await expect(page).toHaveURL(/\/staff\/display\?tab=printer$/);
    await expect(page.getByRole("tab", { name: "Printer" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Receipt printer" })).toBeVisible();
    await page.getByRole("tab", { name: "Announcer" }).click();
    await expect(page.getByRole("heading", { name: "Call announcements" })).toBeVisible();

    await page.goto("/staff/message-developer");
    await expect(page).toHaveURL(/\/staff\/sheechat\?tab=developer$/);
    await expect(page.getByRole("heading", { name: "Message developer" })).toBeVisible();
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(page.getByRole("heading", { name: "SheeChat" })).toBeVisible();
});

test("a message pops up in the corner of any page, and clicking it opens the conversation", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const sender = { username: `e2e-sales-${stamp}`, password: "e2e-password", name: `Sales ${stamp}`, role: "sales" };

    await page.goto("/staff/account");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
    await page.evaluate(async (account) => {
        const res = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "X-Tab-Id": sessionStorage.getItem("tabId"),
            },
            body: JSON.stringify(account),
        });
        if (!res.ok) throw new Error(`Making the account failed (${res.status})`);
    }, sender);

    // someone else, on their own computer, writes from SheeChat
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto("/staff/sheechat");
    await signIn(other, sender.username, sender.password);
    await other.getByRole("button", { name: "People" }).click();
    await other
        .getByRole("region", { name: /^Admin/ })
        .locator(".chat-list-item")
        .first()
        .click();
    const box = other.getByRole("textbox", { name: /^Message to / });
    await box.fill("The truck is here.");
    await box.press("Enter");
    await expect(other.getByRole("listitem").filter({ hasText: "The truck is here." })).toBeVisible();

    // it pops up where the admin is, on a page that has nothing to do with chat
    const popups = page.getByRole("region", { name: "New messages" });
    await expect(popups.getByText("The truck is here.")).toBeVisible();
    await expect(popups.getByRole("button", { name: `Message from ${sender.name}: The truck is here.` })).toBeVisible();
    await expect(popups.getByText(sender.name)).toBeVisible();
    await expect(popups.locator("time")).toHaveText(/\d:\d\d/);
    const sheeChatDot = page.getByRole("link", { name: /SheeChat/ }).getByRole("img", { name: "Unread messages" });
    await expect(sheeChatDot).toBeVisible();

    // the X takes it away, and neither that nor a reload brings it back, but it's still unread, so the dot stays
    await popups.getByRole("button", { name: `Dismiss message from ${sender.name}` }).click();
    await expect(popups.getByRole("button")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
    await expect(sheeChatDot).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(popups.getByRole("button")).toHaveCount(0);

    // the next message does, and clicking it opens the conversation, which reads it
    await box.fill("At Roofings now.");
    await box.press("Enter");
    await popups.getByRole("button", { name: /At Roofings now/ }).click();
    await expect(page).toHaveURL(/\/staff\/sheechat$/);
    await expect(page.getByRole("textbox", { name: `Message to ${sender.name}` })).toBeVisible();
    const thread = page.locator(".chat-messages");
    await expect(thread.getByText("At Roofings now.")).toBeVisible();
    await expect(popups.getByRole("button")).toHaveCount(0);
    await expect(sheeChatDot).toHaveCount(0);

    // with the conversation open, a new message shows in it, with no pop-up
    await box.fill("Are you there?");
    await box.press("Enter");
    await expect(thread.getByText("Are you there?")).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(popups.getByRole("button")).toHaveCount(0);

    await theirs.close();
});

test("a message shows one gray check until it is opened, then two red ones, and typing shows on the other side", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const sender = { username: `e2e-ticks-${stamp}`, password: "e2e-password", name: `Ticks ${stamp}`, role: "sales" };

    await page.goto("/staff/sheechat");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "SheeChat" })).toBeVisible();
    await page.evaluate(async (account) => {
        const res = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "X-Tab-Id": sessionStorage.getItem("tabId"),
            },
            body: JSON.stringify(account),
        });
        if (!res.ok) throw new Error(`Making the account failed (${res.status})`);
    }, sender);

    // sent, but the admin hasn't opened it: one check, delivered
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto("/staff/sheechat");
    await signIn(other, sender.username, sender.password);
    await other.getByRole("button", { name: "People" }).click();
    await other
        .getByRole("region", { name: /^Admin/ })
        .locator(".chat-list-item")
        .first()
        .click();
    const box = other.getByRole("textbox", { name: /^Message to / });
    await box.fill("Checking the ticks.");
    await box.press("Enter");
    const sent = other.getByRole("listitem").filter({ hasText: "Checking the ticks." });
    await expect(sent.getByRole("img", { name: "Delivered" })).toBeVisible();

    // the admin opens it: two red checks, and only on the sender's own message
    await page.locator(".chat-list-item", { hasText: sender.name }).first().click();
    await expect(page.locator(".chat-messages").getByText("Checking the ticks.")).toBeVisible();
    await expect(sent.getByRole("img", { name: "Seen" })).toBeVisible({ timeout: 8000 });
    await expect(sent.locator(".chat-ticks")).toHaveCSS("color", "rgb(200, 32, 42)");
    await expect(page.locator(".chat-ticks")).toHaveCount(0);

    // writing shows on the admin's side, and sending ends it
    const typing = page.getByRole("status").filter({ hasText: `${sender.name} is typing` });
    await box.fill("Still there?");
    await expect(typing).toBeVisible();
    await box.press("Enter");
    await expect(page.locator(".chat-messages").getByText("Still there?")).toBeVisible();
    await expect(typing).toHaveCount(0);

    // the admin's tab goes behind another window: what arrives isn't seen, even with the conversation open
    const setHidden = (hidden) =>
        page.evaluate((value) => {
            Object.defineProperty(document, "hidden", { configurable: true, value });
            document.dispatchEvent(new Event("visibilitychange"));
        }, hidden);
    await setHidden(true);
    await box.fill("Are you looking?");
    await box.press("Enter");
    const unseen = other.getByRole("listitem").filter({ hasText: "Are you looking?" });
    await expect(unseen.getByRole("img", { name: "Delivered" })).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(unseen.getByRole("img", { name: "Delivered" })).toBeVisible();

    // back on the tab, it's read
    await setHidden(false);
    await expect(unseen.getByRole("img", { name: "Seen" })).toBeVisible({ timeout: 8000 });

    await theirs.close();
});

test("Orders & history shows every ticket as one size of card, and a deleted ticket can be restored", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const full = `Full Order ${stamp}`;
    const report = `Report ${stamp}`;
    const salesAccount = {
        username: `e2e-orders-${stamp}`,
        password: "e2e-password",
        name: `Orders ${stamp}`,
        role: "sales",
    };

    await page.goto("/staff/customer-order?tab=orders");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeVisible();
    await page.evaluate(
        async ([tickets, account]) => {
            const post = async (path, body) => {
                const res = await fetch(path, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Tab-Id": sessionStorage.getItem("tabId"),
                    },
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error(`${path} failed (${res.status})`);
            };
            for (const ticket of tickets) await post("/api/orders", ticket);
            await post("/api/admin/users", account);
        },
        [
            [
                {
                    name: full,
                    purpose: "Roofings, Tire, Steel, Hardwares, Chassis",
                    invoices: [
                        { invoiceNo: "5001", type: "Roofings" },
                        { invoiceNo: "5002", type: "Steel" },
                        { invoiceNo: "5003", type: "Tire" },
                    ],
                    paymentStatus: "Paid",
                    salesman: "Test Salesman",
                    runner: "Boy Reyes",
                },
                {
                    name: report,
                    purpose: "Customer Report",
                    concern: "The sheets are leaking at the joints. ".repeat(5),
                },
            ],
            salesAccount,
        ],
    );

    await page.getByRole("radio", { name: "Orders & history" }).click();

    // a ticket with a lot on it and one with very little are the same size, with the rest behind See all details
    const fullCard = page.getByRole("listitem").filter({ hasText: full });
    const reportCard = page.getByRole("listitem").filter({ hasText: report });
    await expect(fullCard.getByRole("button", { name: /^Call/ })).toBeVisible();
    await expect(reportCard.getByRole("button", { name: /^Call/ })).toBeVisible();
    const fullBox = await fullCard.boundingBox();
    const reportBox = await reportCard.boundingBox();
    expect([fullBox.width, fullBox.height]).toEqual([reportBox.width, reportBox.height]);

    await expect(fullCard.getByText("Boy Reyes")).toHaveCount(0);
    await fullCard.getByRole("button", { name: /^See all details/ }).click();
    const details = page.getByRole("dialog");
    await expect(details.getByText("Boy Reyes")).toBeVisible();
    await details.getByRole("button", { name: "Close" }).click();
    await expect(details).toHaveCount(0);

    // a customer report has no order to edit, so its Edit stays in its place, grayed out
    await expect(reportCard.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
    await expect(fullCard.getByRole("link", { name: /^Edit/ })).toBeVisible();

    // sales see the same cards, with Delete (for a ticket made by mistake) but without Call; on Deleted, nothing to
    // pick, since purging is for admins and developers
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto("/staff/customer-order?tab=orders");
    await signIn(other, salesAccount.username, salesAccount.password);
    await other.getByRole("radio", { name: "Orders & history" }).click();
    const theirCard = other.getByRole("listitem").filter({ hasText: full });
    await expect(theirCard.getByRole("link", { name: /^View ticket/ })).toBeVisible();
    await expect(theirCard.getByRole("button", { name: /^Delete/ })).toBeVisible();
    await expect(theirCard.getByRole("button", { name: /^Call/ })).toHaveCount(0);
    await other.getByRole("radio", { name: "Deleted" }).click();
    await expect(other.getByRole("radio", { name: "Deleted" })).toHaveAttribute("aria-checked", "true");
    await expect(other.getByText("Loading...")).toHaveCount(0);
    await expect(other.getByRole("checkbox")).toHaveCount(0);
    await other.getByRole("radio", { name: "Today" }).click();
    // sales don't call customers: not with the status either, and not from My counter, where they hand them over
    await expect(theirCard.getByRole("option", { name: "Now serving" })).toHaveCount(0);
    await other.goto("/staff/counter");
    const atCounter = other.getByRole("listitem").filter({ hasText: full });
    // the admin made this ticket, so its hand-over is theirs, and hovering it says so; sales can Assist the customer,
    // which lets them hand it over themselves
    const handOverButton = atCounter.getByRole("button", { name: /^Hand over/ });
    await expect(handOverButton).toBeDisabled();
    await expect(atCounter.getByText("ticket by")).toBeVisible();
    await expect(atCounter.locator(".hint")).toHaveAttribute(
        "data-hint",
        /^This order is created by .+\. Press Assist/,
    );
    await atCounter.getByRole("button", { name: "Assist", exact: true }).click();
    await expect(atCounter.getByText("Assisted by")).toBeVisible();
    await expect(handOverButton).toBeEnabled();
    await atCounter.getByRole("button", { name: "Stop assisting" }).click();
    await expect(atCounter.getByRole("button", { name: "Assist", exact: true })).toBeVisible();
    await expect(other.getByRole("button", { name: /^(Call|Serve|Recall)/ })).toHaveCount(0);
    await theirs.close();

    // deleted, it leaves Today and waits on Deleted, where Restore puts it back
    page.once("dialog", (confirm) => confirm.accept());
    await fullCard.getByRole("button", { name: /^Delete/ }).click();
    await expect(fullCard).toHaveCount(0);
    await page.getByRole("radio", { name: "Deleted" }).click();
    await fullCard.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("status").filter({ hasText: "back in today's queue" })).toBeVisible();
    await expect(fullCard).toHaveCount(0);
    await page.getByRole("radio", { name: "Today" }).click();
    await expect(fullCard).toBeVisible();
});

test("an admin picks several tickets on All tickets to delete them, then purges them for good from Deleted", async ({
    page,
}) => {
    const stamp = Date.now();
    const names = [`Purge One ${stamp}`, `Purge Two ${stamp}`, `Purge Three ${stamp}`];

    await page.goto("/staff/customer-order?tab=orders");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeVisible();
    await page.evaluate(async (tickets) => {
        for (const name of tickets) {
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, purpose: "Steel", invoices: [{ invoiceNo: "7001", type: "Steel" }] }),
            });
            if (!res.ok) throw new Error(`taking a ticket failed (${res.status})`);
        }
    }, names);

    // only this test's tickets are shown, so Select all can't reach anyone else's
    await page.getByRole("radio", { name: "Orders & history" }).click();
    await page.getByRole("radio", { name: "All tickets" }).click();
    await page.getByPlaceholder("Search name or ticket no.").fill(`${stamp}`);
    const cards = page.getByRole("listitem").filter({ hasText: `${stamp}` });
    await expect(cards).toHaveCount(3);

    // one picked, then all of them
    await cards.filter({ hasText: names[0] }).getByRole("checkbox").check();
    await expect(page.getByText("1 ticket picked")).toBeVisible();
    await page.getByRole("checkbox", { name: "Select all shown" }).check();
    page.once("dialog", (confirm) => {
        expect(confirm.message()).toContain("Delete 3 tickets?");
        confirm.accept();
    });
    await page.getByRole("button", { name: "Delete 3 tickets" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Deleted 3 tickets." })).toBeVisible();
    // deleted, they have nothing left to delete on All tickets, so no box
    await expect(cards.getByRole("checkbox")).toHaveCount(0);

    await page.getByRole("radio", { name: "Deleted" }).click();
    await page.getByPlaceholder("Search name or ticket no.").fill(`${stamp}`);
    await expect(cards).toHaveCount(3);
    await page.getByRole("checkbox", { name: "Select all shown" }).check();
    // turning it down purges nothing
    page.once("dialog", (confirm) => confirm.dismiss());
    await page.getByRole("button", { name: "Purge 3 tickets" }).click();
    await expect(cards).toHaveCount(3);
    page.once("dialog", (confirm) => {
        expect(confirm.message()).toContain("can't be restored");
        confirm.accept();
    });
    await page.getByRole("button", { name: "Purge 3 tickets" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Purged 3 tickets." })).toBeVisible();
    await expect(cards).toHaveCount(0);
    await page.getByRole("radio", { name: "All tickets" }).click();
    await page.getByPlaceholder("Search name or ticket no.").fill(`${stamp}`);
    await expect(page.getByText("No tickets found.")).toBeVisible();
});

test("a developer purges deleted tickets from their Deleted tickets page, with no Restore there", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const name = `Dev Purge ${stamp}`;
    const developer = {
        username: `e2e-dev-${stamp}`,
        password: "e2e-password",
        name: `Dev ${stamp}`,
        role: "developer",
    };

    // an admin makes the developer's account and a ticket, and deletes it
    await page.goto("/staff/customer-order?tab=orders");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeVisible();
    await page.evaluate(
        async ([ticketName, account]) => {
            const call = async (method, path, body) => {
                const res = await fetch(path, {
                    method,
                    headers: {
                        "Content-Type": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Tab-Id": sessionStorage.getItem("tabId"),
                    },
                    body: body && JSON.stringify(body),
                });
                if (!res.ok) throw new Error(`${path} failed (${res.status})`);
                return res.status === 204 ? null : res.json();
            };
            const ticket = await call("POST", "/api/orders", {
                name: ticketName,
                purpose: "Steel",
                invoices: [{ invoiceNo: "7101", type: "Steel" }],
            });
            await call("DELETE", `/api/admin/orders/${ticket.queueNum}`);
            await call("POST", "/api/admin/users", account);
        },
        [name, developer],
    );

    const theirs = await browser.newContext();
    const dev = await theirs.newPage();
    watch(dev);
    await dev.goto("/staff/deleted-tickets");
    await signIn(dev, developer.username, developer.password);
    await expect(dev.getByRole("heading", { name: "Deleted tickets" })).toBeVisible();
    await dev.getByPlaceholder("Search name or ticket no.").fill(`${stamp}`);
    const card = dev.getByRole("listitem").filter({ hasText: name });
    await expect(card).toBeVisible();
    // the queue's buttons aren't theirs
    await expect(card.getByRole("button", { name: "Restore" })).toHaveCount(0);
    await expect(dev.getByRole("button", { name: /Export/ })).toHaveCount(0);

    await card.getByRole("checkbox").check();
    dev.once("dialog", (confirm) => confirm.accept());
    await dev.getByRole("button", { name: "Purge 1 ticket" }).click();
    await expect(dev.getByRole("status").filter({ hasText: "Purged 1 ticket." })).toBeVisible();
    await expect(card).toHaveCount(0);
    await theirs.close();
});

test("an order sales takes fills in its ticket, date and time in on the Order sheet, and Edit keeps the time", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const customer = `Timed Order ${stamp}`;
    const salesAccount = {
        username: `e2e-timein-${stamp}`,
        password: "e2e-password",
        name: `Time In ${stamp}`,
        role: "sales",
    };

    await page.goto("/staff/customer-order");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeVisible();
    await page.evaluate(async (account) => {
        const res = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "X-Tab-Id": sessionStorage.getItem("tabId"),
            },
            body: JSON.stringify(account),
        });
        if (!res.ok) throw new Error(`creating the account failed (${res.status})`);
    }, salesAccount);

    const theirs = await browser.newContext();
    const sales = await theirs.newPage();
    watch(sales);
    await sales.goto("/staff/customer-order");
    await signIn(sales, salesAccount.username, salesAccount.password);
    await expect(sales.getByRole("heading", { name: "Customer order" })).toBeVisible();

    // the time in is left blank; Serve fills it in
    await sales.getByRole("textbox", { name: "Customer name" }).fill(customer);
    await sales.getByRole("button", { name: /^Type of order/ }).click();
    await sales.getByRole("checkbox", { name: "Roofings", exact: true }).check();
    await sales.keyboard.press("Escape");
    await sales.getByLabel("Invoice 1 number").fill(`T${stamp}`);
    await expect(sales.getByLabel(/^Time in/)).toHaveValue("");
    await sales.getByRole("button", { name: "Serve", exact: true }).click();

    // Edit starts from the time it was given, so Update doesn't clear it or count as a change
    await sales.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(sales.getByLabel(/^Time in/)).toHaveValue(/^\d{2}:\d{2}$/);
    await sales.getByRole("button", { name: "Update", exact: true }).click();
    await expect(sales.getByRole("button", { name: "New order" })).toBeVisible();

    await sales.getByRole("radio", { name: "Order sheet" }).click();
    const row = sales.getByRole("row").filter({ hasText: customer });
    await expect(row.locator(".sheet-date")).toHaveText(/^[A-Z][a-z]{2}-\d{2}-\d{2}$/);
    await expect(row.locator(".sheet-que")).toHaveText(/^R \d+$/);
    await expect(row.locator(".sheet-time").first()).toHaveText(/^\d{4}H$/);
    await expect(row.locator(".sheet-time").last()).toHaveText("");
    await expect(row.getByText("Edited by")).toHaveCount(0);
    await theirs.close();
});

test("a long queue code stays whole on the Order sheet: its column widens, and the page itself never scrolls sideways", async ({
    page,
}) => {
    const customer = `Long Code ${Date.now()}`;

    // a small office screen, where the columns are at their narrowest
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/staff/customer-order");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeVisible();

    // a long code, one letter or two for each type of order on the ticket
    await page.getByRole("textbox", { name: "Customer name" }).fill(customer);
    await page.getByRole("button", { name: /^Type of order/ }).click();
    for (const type of ["Roofings", "Roofings Accessories", "Steel", "Hardwares", "Tire", "Battery"]) {
        await page.getByRole("checkbox", { name: type, exact: true }).check();
    }
    await page.keyboard.press("Escape");
    await page.getByLabel("Invoice 1 number").fill(`L${Date.now()}`);
    await page.getByLabel("Salesman name").fill("CORONACION");
    await page.getByRole("button", { name: "Serve", exact: true }).click();
    await expect(page.getByRole("button", { name: "New order" })).toBeVisible();

    await page.getByRole("radio", { name: "Order sheet" }).click();
    const row = page.getByRole("row").filter({ hasText: customer });
    await expect(row.locator(".sheet-que-btn")).toHaveText(/^[A-Z]{6,} \d+$/);

    // each on one line and inside its own cell; the column that widened for the code leaves the salesman room too
    const fits = (cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const text = range.getBoundingClientRect();
        return (
            text.height <= parseFloat(getComputedStyle(cell).lineHeight) + 1 &&
            text.right <= cell.getBoundingClientRect().right
        );
    };
    expect(await row.locator(".sheet-que").evaluate(fits)).toBe(true);
    expect(await row.locator("td", { hasText: "CORONACION" }).locator(".sheet-cell").evaluate(fits)).toBe(true);

    // the sheet scrolls inside its frame, not the page
    const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways).toBeLessThanOrEqual(0);
});

test("the Order sheet works like a spreadsheet: cells change where they are, a new row makes a ticket, and a column can be added", async ({
    page,
}) => {
    const stamp = Date.now();
    const customer = `Sheet Row ${stamp}`;
    const renamed = `Renamed ${stamp}`;
    const column = `Truck ${stamp % 100000}`;

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/staff/customer-order");
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.getByRole("radio", { name: "Order sheet" }).click();

    // a new row: nothing to tick, it's a ticket as soon as it has what it needs
    await page.getByRole("button", { name: "Add row" }).click();
    const fillNew = async (label, value) => {
        await page.getByRole("button", { name: `${label} for the new row` }).click();
        await page.getByRole("textbox", { name: `${label} for the new row` }).fill(value);
        await page.keyboard.press("Tab");
    };
    await fillNew("Customer's name", customer);
    await fillNew("Type of order", "roofings");
    await expect(page.getByText("Needs a customer")).toBeVisible();
    await fillNew("Roofing", `R${stamp}`);
    await expect(page.getByText("Needs a customer")).toHaveCount(0);

    const row = page.getByRole("row").filter({ hasText: customer });
    await expect(row.locator(".sheet-que-btn")).toHaveText(/^R \d+$/);
    await expect(row.locator(".sheet-time").first()).toHaveText(/^\d{4}H$/);
    const ticket = await row.locator(".sheet-que-btn").innerText();

    // the terms and the customer change right in the row
    await row.getByRole("combobox", { name: `Terms for ${ticket}` }).selectOption("Vale");
    await expect(row.getByText("Edited by")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();

    await row.getByRole("button", { name: `Customer's name for ${ticket}` }).click();
    await row.getByRole("textbox", { name: `Customer's name for ${ticket}` }).fill(renamed);
    await page.keyboard.press("Enter");
    const same = page.getByRole("row").filter({ hasText: renamed });
    await expect(same.locator(".sheet-que-btn")).toHaveText(ticket);

    // a value it can't take says why, and goes back
    await same.getByRole("button", { name: `TBA for ${ticket}` }).click();
    await same.getByRole("textbox", { name: `TBA for ${ticket}` }).fill("999");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toContainText("invoice 999 is under TBA");
    await expect(same.getByRole("button", { name: `TBA for ${ticket}` })).toHaveText("");

    // the date, number and status can't be typed in
    await expect(same.locator(".sheet-date button, .sheet-date textarea")).toHaveCount(0);
    await expect(same.locator(".sheet-status textarea")).toHaveCount(0);

    // a column of their own, filled in on the row, and still there after a reload
    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("New column's name").fill(column);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await same.getByRole("button", { name: `${column} for ${ticket}` }).click();
    await same.getByRole("textbox", { name: `${column} for ${ticket}` }).fill("Isuzu");
    await page.keyboard.press("Enter");
    await expect(same.getByRole("button", { name: `${column} for ${ticket}` })).toHaveText("Isuzu");
    await page.screenshot({ path: process.env.SHEET_SHOT ?? "test-results/order-sheet.png" });

    await page.reload();
    await page.getByRole("radio", { name: "Order sheet" }).click();
    await expect(same.getByRole("button", { name: `${column} for ${ticket}` })).toHaveText("Isuzu");

    // and it can be taken off again
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: `Remove the ${column} column` }).click();
    await expect(page.getByRole("columnheader", { name: column })).toHaveCount(0);
});

test("a cover photo shows on the Dashboard, and a coworker can open that profile from SheeChat", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const coworker = {
        username: `e2e-cover-${stamp}`,
        password: "e2e-password",
        name: `Cover ${stamp}`,
        role: "sales",
    };
    // a 1 by 1 red PNG, a real picture for the browser to open and crop
    const picture = {
        name: "cover.png",
        mimeType: "image/png",
        buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
            "base64",
        ),
    };

    await page.goto("/staff/account");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
    await page.evaluate(async (account) => {
        const res = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "X-Tab-Id": sessionStorage.getItem("tabId"),
            },
            body: JSON.stringify(account),
        });
        if (!res.ok) throw new Error(`Making the account failed (${res.status})`);
    }, coworker);

    // the coworker picks a cover on My account, cropped to a wide banner, and sees it on their Dashboard
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto("/staff/account");
    await signIn(other, coworker.username, coworker.password);
    await other.getByLabel("Cover photo file").setInputFiles(picture);
    await expect(other.getByRole("button", { name: "Remove cover" })).toBeVisible();
    const preview = other.locator(".cover-photo-field img");
    await expect(preview).toHaveJSProperty("naturalWidth", 1200);
    await expect(preview).toHaveJSProperty("naturalHeight", 400);

    await other.getByRole("link", { name: "Dashboard" }).click();
    const onDashboard = other.getByRole("region", { name: "Your profile" }).locator(".profile-summary-cover-img");
    await expect(onDashboard).toHaveJSProperty("naturalWidth", 1200);

    // the admin finds them on SheeChat's People and opens their profile from their photo, without opening the conversation
    await page.goto("/staff/sheechat");
    await page.getByRole("button", { name: "People" }).click();
    await page.getByRole("button", { name: `View ${coworker.name}'s profile` }).click();
    const profile = page.getByRole("dialog", { name: `${coworker.name}'s profile` });
    await expect(profile.getByRole("heading", { name: coworker.name })).toBeVisible();
    await expect(profile.getByText("Online")).toBeVisible();
    await expect(profile.locator(".profile-summary-cover-img")).toHaveJSProperty("naturalWidth", 1200);
    await expect(page.getByRole("textbox", { name: `Message to ${coworker.name}` })).toHaveCount(0);

    // Send a message goes on to the conversation, and the name above it opens the profile again
    await profile.getByRole("button", { name: "Send a message" }).click();
    await expect(profile).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: `Message to ${coworker.name}` })).toBeVisible();
    await page.locator(".chat-panel").getByRole("button", { name: coworker.name }).click();
    await expect(page.getByRole("dialog", { name: `${coworker.name}'s profile` })).toBeVisible();
    // already talking to them, so there's nowhere for it to go
    await expect(page.getByRole("button", { name: "Send a message" })).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await theirs.close();
});

// an admin signs in, makes a department account (crew) and takes an order that is handed over to it at once
const handOverToNewCrew = async (page, crew, order) => {
    await page.goto("/staff/counter");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "My counter" })).toBeVisible();
    await page.evaluate(
        async ([account, ticket]) => {
            const post = async (path, body) => {
                const res = await fetch(path, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Tab-Id": sessionStorage.getItem("tabId"),
                    },
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error(`${path} failed (${res.status})`);
                return res.json();
            };
            await post("/api/admin/users", account);
            const { queueNum } = await post("/api/orders", ticket);
            await post(`/api/admin/orders/${queueNum}/handover`, {});
        },
        [crew, order],
    );
};

test("a Hardware account finds the order it prepared on its History tab, one day at a time", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const customer = `HW ${stamp}`;
    const invoice = `H-${stamp}`;
    const crew = { username: `e2e-hw-${stamp}`, password: "e2e-password", name: `Hardware ${stamp}`, role: "hardware" };

    // an admin makes the account, takes the order and hands it over
    await handOverToNewCrew(page, crew, {
        name: customer,
        purpose: "Hardwares",
        invoices: [{ invoiceNo: invoice, type: "Hardwares" }],
        salesman: "Test Salesman",
    });

    // the Hardware account prepares it: called, started (Hardware says preparing, not loading), Done
    const theirs = await browser.newContext();
    const hardware = await theirs.newPage();
    watch(hardware);
    await hardware.goto("/staff/hardware");
    await signIn(hardware, crew.username, crew.password);
    const ticket = hardware.getByRole("listitem").filter({ hasText: customer });
    await ticket.getByRole("button", { name: "Call", exact: true }).click();
    await hardware.getByRole("dialog").getByRole("button", { name: "Call now" }).click();
    await expect(ticket.getByText("Press Start preparing when you start getting the items ready.")).toBeVisible();
    await ticket.getByRole("button", { name: "Start preparing at Hardware" }).click();
    await ticket.getByRole("button", { name: "Done at Hardware" }).click();
    await expect(hardware.getByRole("status").filter({ hasText: /done at Hardware\.$/ })).toBeVisible();

    // History, today only: the order, its invoice and who prepared it
    await hardware.getByRole("tab", { name: "History" }).click();
    await hardware.getByRole("radio", { name: "One day" }).click();
    const row = hardware.getByRole("listitem").filter({ hasText: customer });
    await expect(row.getByText(invoice)).toBeVisible();
    await expect(row.getByText(crew.name)).toBeVisible();
    await expect(row.getByText("Prepared at Hardware")).toBeVisible();

    // a search that finds nothing says so, and the filter is still there after a reload
    await hardware.getByRole("searchbox", { name: "Search" }).fill(`nobody-${stamp}`);
    await expect(hardware.getByText(`No orders match "nobody-${stamp}".`)).toBeVisible();
    await hardware.reload();
    await expect(hardware.getByRole("radio", { name: "One day" })).toHaveAttribute("aria-checked", "true");
    await expect(hardware.getByRole("searchbox", { name: "Search" })).toHaveValue(`nobody-${stamp}`);

    // crews use phones at the areas: Range's two dates and the search fit a phone's width, with no sideways scroll
    await hardware.setViewportSize({ width: 375, height: 800 });
    await hardware.getByRole("radio", { name: "Range" }).click();
    await expect(hardware.getByLabel("From")).toBeVisible();
    expect(await hardware.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await theirs.close();
});

test("the History tab never shows another filter's orders after a failed read, and says which day had none", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const customer = `HW fail ${stamp}`;
    const crew = {
        username: `e2e-hwf-${stamp}`,
        password: "e2e-password",
        name: `Hardware F ${stamp}`,
        role: "hardware",
    };
    await handOverToNewCrew(page, crew, {
        name: customer,
        purpose: "Hardwares",
        invoices: [{ invoiceNo: `HF-${stamp}`, type: "Hardwares" }],
        salesman: "Test Salesman",
    });

    const theirs = await browser.newContext();
    const hardware = await theirs.newPage();
    watch(hardware);
    await hardware.goto("/staff/hardware");
    await signIn(hardware, crew.username, crew.password);
    await hardware.getByRole("tab", { name: "History" }).click();
    // the order is on Line too, so wait for History's own list before looking for it
    await expect(hardware.getByRole("heading", { name: "Hardware history" })).toBeVisible();
    const row = hardware.getByRole("listitem").filter({ hasText: customer });
    await expect(row).toBeVisible();

    // the server fails while they search (it answers, but with an error): the error shows, and All's orders don't stay
    // under it as if they were the search's, nor does a "No orders match" that was never checked
    await hardware.route("**/api/admin/department-history/**", (route) =>
        route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Something went wrong." }),
        }),
    );
    await hardware.getByRole("searchbox", { name: "Search" }).fill(`nobody-${stamp}`);
    await expect(hardware.getByRole("alert").filter({ hasText: "Something went wrong." })).toBeVisible();
    // checked once, not retried: the error and whatever list is under it come in the same render, and a retried check
    // could pass in the moment "Loading..." stands in for both
    expect(await row.count()).toBe(0);
    expect(await hardware.getByText("No orders match").count()).toBe(0);
    expect(await hardware.getByRole("button", { name: "Show more" }).count()).toBe(0);

    // back again: a Range with only its From day is that one day, and says so
    await hardware.unroute("**/api/admin/department-history/**");
    await hardware.getByRole("searchbox", { name: "Search" }).fill("");
    await hardware.getByRole("radio", { name: "Range" }).click();
    await hardware.getByLabel("From").fill("2001-01-01");
    await expect(hardware.getByText("No Hardware orders were handed over on Jan 1, 2001.")).toBeVisible();
    await theirs.close();
});

test("a loading account reports a bug through the guided chat, and a developer marks it Done from Reports", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const crew = { username: `e2e-report-${stamp}`, password: "e2e-password", name: `Crew ${stamp}`, role: "loading" };
    const developer = {
        username: `e2e-fixer-${stamp}`,
        password: "e2e-password",
        name: `Fixer ${stamp}`,
        role: "developer",
    };

    // an admin makes both accounts
    await page.goto("/staff/account");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
    await page.evaluate(
        async (accounts) => {
            for (const account of accounts) {
                const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Tab-Id": sessionStorage.getItem("tabId"),
                    },
                    body: JSON.stringify(account),
                });
                if (!res.ok) throw new Error(`Making the account failed (${res.status})`);
            }
        },
        [crew, developer],
    );

    // the loading crew member answers the bot's questions on Message developer
    const theirs = await browser.newContext();
    const staff = await theirs.newPage();
    watch(staff);
    await staff.goto("/staff/sheechat?tab=developer");
    await signIn(staff, crew.username, crew.password);
    await staff.getByRole("tab", { name: "Message developer" }).click();
    await expect(staff.getByRole("heading", { name: "Message developer" })).toBeVisible();
    await staff.getByRole("button", { name: "Report a bug" }).click();
    const thread = staff.locator(".chat-messages");
    await expect(thread.getByText("Which page were you on?")).toBeVisible();
    const choices = staff.getByRole("group", { name: "Choices" });
    await choices.getByRole("button", { name: "Loading", exact: true }).click();
    await expect(thread.getByText("What were you doing, and what happened?")).toBeVisible();
    const box = staff.getByRole("textbox", { name: "Message to the developers" });
    await box.fill(`Start does nothing ${stamp}`);
    await box.press("Enter");
    await choices.getByRole("button", { name: "Can't work" }).click();
    await staff.getByRole("button", { name: "Skip" }).click();
    await staff.getByRole("button", { name: "Send report" }).click();
    const card = staff.getByRole("article", { name: /^Bug #\d+$/ });
    await expect(card).toBeVisible();
    await expect(card.locator(".concern-status")).toHaveText("Open");
    // the bot is done, so the box writes to the developers again
    await expect(staff.getByRole("button", { name: "Report a bug" })).toBeEnabled();

    // a developer signs in to their Dashboard, where it waits under Staff concerns beside who is in charge of each
    // customer, and opens it from there, then marks it Done with a note
    const devs = await browser.newContext();
    const dev = await devs.newPage();
    watch(dev);
    await dev.goto("/staff/login");
    await signIn(dev, developer.username, developer.password);
    await expect(dev).toHaveURL(/\/staff$/);
    await expect(dev.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(dev.getByRole("heading", { name: "In charge" })).toBeVisible();
    const concerns = dev.getByRole("region", { name: "Staff concerns" });
    await concerns.locator(".report-row", { hasText: crew.name }).click();
    await expect(dev).toHaveURL(/\/staff\/sheechat\?tab=concerns$/);
    await expect(dev.getByRole("heading", { name: "Staff concerns", exact: true })).toBeVisible();
    // it's on Reports too
    await dev.getByRole("button", { name: /^Reports/ }).click();
    await expect(dev.locator(".report-row", { hasText: crew.name })).toBeVisible();
    const devCard = dev.getByRole("article", { name: /^Bug #\d+$/ });
    await expect(devCard).toContainText(`Start does nothing ${stamp}`);
    await devCard.getByRole("textbox").fill("Fixed it, refresh the page.");
    await devCard.getByRole("button", { name: "Done" }).click();
    await expect(devCard.locator(".concern-status")).toHaveText("Done");

    // the staff member gets the bot's message, and their card says Done
    await expect(thread.getByText(/is Done: "Fixed it, refresh the page\."/)).toBeVisible({ timeout: 8000 });
    await expect(card.locator(".concern-status")).toHaveText("Done");

    await theirs.close();
    await devs.close();
});

// the loading crew by area: on Accounts, the Loading tab has its own browser-style tabs, Roofings, Steel, Logistics and
// Chassis, and an admin moves someone to another area from the table below
test("Accounts groups the loading crew into Roofings, Steel, Logistics and Chassis tabs", async ({ page }) => {
    const stamp = Date.now();
    const steel = {
        username: `e2e-steel-${stamp}`,
        password: "e2e-password",
        name: `Steel ${stamp}`,
        role: "loading",
        loadingArea: "Steel",
    };
    const logistics = { ...steel, username: `e2e-logi-${stamp}`, name: `Logistics ${stamp}`, loadingArea: "Logistics" };
    const chassis = { ...steel, username: `e2e-chas-${stamp}`, name: `Chassis ${stamp}`, loadingArea: "Chassis" };

    await page.goto("/staff/accounts");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await page.evaluate(
        async (accounts) => {
            for (const account of accounts) {
                const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Tab-Id": sessionStorage.getItem("tabId"),
                    },
                    body: JSON.stringify(account),
                });
                if (!res.ok) throw new Error(`making ${account.username} failed (${res.status})`);
            }
        },
        [steel, logistics, chassis],
    );
    await page.reload();

    await page
        .getByRole("tablist", { name: "Departments" })
        .getByRole("tab", { name: /^Loading/ })
        .click();
    const areas = page.getByRole("tablist", { name: "Loading areas" });
    for (const name of ["All loading", "Roofings", "Steel", "Logistics", "Chassis"]) {
        await expect(areas.getByRole("tab", { name: new RegExp(`^${name} \\d+$`) })).toBeVisible();
    }
    const grid = page.locator(".employee-grid");
    await expect(grid.getByRole("article", { name: steel.name })).toBeVisible();
    await expect(grid.getByRole("article", { name: logistics.name })).toBeVisible();

    await areas.getByRole("tab", { name: /^Steel/ }).click();
    await expect(areas.getByRole("tab", { name: /^Steel/ })).toHaveAttribute("aria-selected", "true");
    await expect(grid.getByRole("article", { name: steel.name })).toBeVisible();
    await expect(grid.getByRole("article", { name: logistics.name })).toBeHidden();
    await page.screenshot({ path: "test-results/crew-tabs.png", fullPage: false });
    await areas.getByRole("tab", { name: /^Chassis/ }).click();
    await expect(grid.getByRole("article", { name: chassis.name })).toBeVisible();
    await expect(grid.getByRole("article", { name: steel.name })).toBeHidden();
    await areas.getByRole("tab", { name: /^Steel/ }).click();

    // moved to Roofings, they leave the Steel tab and show under Roofings
    await page.getByLabel(`Loading area for ${steel.name}`).selectOption("Roofings");
    await expect(page.getByRole("status").filter({ hasText: `${steel.name} now works at Roofings.` })).toBeVisible();
    await areas.getByRole("tab", { name: /^Roofings/ }).click();
    await expect(grid.getByRole("article", { name: steel.name })).toBeVisible();
    await expect(grid.getByRole("article", { name: logistics.name })).toBeHidden();
});

// a loading member's own view of the crew: the Loading page's Crew tab, the same Roofings, Steel, Logistics and Chassis
// tabs, opening on their own area
test("a loading account sees its crew by area on the Loading page's Crew tab", async ({ page, browser }) => {
    const stamp = Date.now();
    const me = {
        username: `e2e-roof-${stamp}`,
        password: "e2e-password",
        name: `Roofer ${stamp}`,
        role: "loading",
        loadingArea: "Roofings",
    };
    const mate = { ...me, username: `e2e-mate-${stamp}`, name: `Logi ${stamp}`, loadingArea: "Logistics" };

    await page.goto("/staff/accounts");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await page.evaluate(
        async (accounts) => {
            for (const account of accounts) {
                const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Tab-Id": sessionStorage.getItem("tabId"),
                    },
                    body: JSON.stringify(account),
                });
                if (!res.ok) throw new Error(`making ${account.username} failed (${res.status})`);
            }
        },
        [me, mate],
    );

    const theirs = await browser.newContext();
    const loading = await theirs.newPage();
    watch(loading);
    await loading.goto("/staff/loading");
    await signIn(loading, me.username, me.password);
    await loading.getByRole("tab", { name: "Crew" }).click();

    const areas = loading.getByRole("tablist", { name: "Loading areas" });
    for (const name of ["All loading", "Roofings", "Steel", "Logistics", "Chassis"]) {
        await expect(areas.getByRole("tab", { name: new RegExp(`^${name} \\d+$`) })).toBeVisible();
    }
    // it opens on their own area, with them on it, online
    await expect(areas.getByRole("tab", { name: /^Roofings/ })).toHaveAttribute("aria-selected", "true");
    const grid = loading.locator(".employee-grid");
    const mine = grid.getByRole("article", { name: me.name });
    await expect(mine).toContainText("(you)");
    await expect(mine).toContainText("Online");
    await expect(grid.getByRole("article", { name: mate.name })).toBeHidden();
    await loading.screenshot({ path: "test-results/loading-crew.png" });

    await areas.getByRole("tab", { name: /^Logistics/ }).click();
    await expect(grid.getByRole("article", { name: mate.name })).toBeVisible();
    await expect(mine).toBeHidden();
    await theirs.close();
});

// the staff area installs as an app (public/manifest.webmanifest): the browser offers it once, early (over https,
// or on this test's localhost), and the sidebar's Install app button shows that offer, then goes once it's used
test("the staff area can be installed as an app from the Install app button", async ({ page }) => {
    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
    const app = await manifest.json();
    expect(app).toMatchObject({ name: "Sheehan QMS", start_url: "/staff", display: "standalone" });
    for (const { src } of app.icons) expect((await page.request.get(src)).ok()).toBe(true);

    await page.goto("/staff/customer-order");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Customer order" })).toBeVisible();
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

    // no offer, no button (a browser that can't install it, or plain http)
    const install = page.getByRole("button", { name: "Install app" });
    await expect(install).toBeHidden();

    // the browser's offer, as Edge and Chrome make it, answered "installed"
    await page.evaluate(() => {
        const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
            prompt: async () => {
                window.installPrompted = true;
            },
            userChoice: Promise.resolve({ outcome: "accepted" }),
        });
        window.dispatchEvent(offer);
    });
    await expect(install).toBeVisible();
    await install.click();
    await expect.poll(() => page.evaluate(() => window.installPrompted)).toBe(true);
    await expect(install).toBeHidden();
});

// a coworker's profile opens from their photo or name outside SheeChat too: on Accounts and from the developers' chat
// heads on Message developer, where a developer's specialization (what they do in the IT department) shows
test("a profile opens from Accounts and from the developer heads, with a developer's specialization", async ({ page, browser }) => {
    const stamp = Date.now();
    const dev = { username: `e2e-it-${stamp}`, password: "e2e-password", name: `Ivy Tech${stamp}`, role: "developer" };

    await page.goto("/staff/accounts");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await api(page, "POST", "/admin/users", dev);

    // the developer types their specialization on My account
    const theirs = await browser.newContext();
    const devPage = await theirs.newPage();
    watch(devPage);
    await devPage.goto("/staff/account");
    await signIn(devPage, dev.username, dev.password);
    await devPage.getByLabel(/^Specialization/).fill("Network and systems");
    await devPage.getByRole("button", { name: "Update account" }).click();
    await expect(devPage.getByRole("status").filter({ hasText: "Account updated." })).toBeVisible();
    await theirs.close();

    // on Accounts, their name opens the profile
    await page.reload();
    const grid = page.locator(".employee-grid");
    await grid.getByRole("button", { name: `View ${dev.name}'s profile` }).click();
    const profile = page.getByRole("dialog", { name: `${dev.name}'s profile` });
    await expect(profile).toBeVisible();
    await expect(profile.getByText("Network and systems")).toBeVisible();
    await page.screenshot({ path: "test-results/profile-from-accounts.png" });
    await profile.getByRole("button", { name: "Close" }).click();
    await expect(profile).toBeHidden();

    // on Message developer, their chat head opens it too
    await page.goto("/staff/sheechat?tab=developer");
    await page.getByRole("tab", { name: "Message developer" }).click();
    await page.getByRole("button", { name: `View ${dev.name}'s profile` }).click();
    await expect(profile).toBeVisible();
    await expect(profile.getByText("Specialization")).toBeVisible();
    await page.screenshot({ path: "test-results/profile-from-developer-heads.png" });
});

// Send a message on anyone's profile opens your conversation with them on SheeChat, from any page; the developers'
// SheeChat has every department on People, and their old Chat page is its Staff concerns tab
test("Send a message on a profile opens SheeChat with them, and a developer's SheeChat has everyone and Staff concerns", async ({
    page,
    browser,
}) => {
    const stamp = Date.now();
    const dev = { username: `e2e-msg-dev-${stamp}`, password: "e2e-password", name: `Dina Dev${stamp}`, role: "developer" };
    const crew = { username: `e2e-msg-crew-${stamp}`, password: "e2e-password", name: `Lito Load${stamp}`, role: "loading" };

    await page.goto("/staff/accounts");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await api(page, "POST", "/admin/users", dev);
    await api(page, "POST", "/admin/users", crew);

    // an admin opens the developer's profile on Accounts and writes to them from it
    await page.reload();
    await page.locator(".employee-grid").getByRole("button", { name: `View ${dev.name}'s profile` }).click();
    const profile = page.getByRole("dialog", { name: `${dev.name}'s profile` });
    await profile.getByRole("button", { name: "Send a message" }).click();
    await expect(profile).toBeHidden();
    await expect(page).toHaveURL(/\/staff\/sheechat\?tab=staff$/);
    const box = page.getByRole("textbox", { name: `Message to ${dev.name}` });
    await box.fill(`Hello from the office ${stamp}`);
    await box.press("Enter");
    await expect(page.locator(".chat-messages").getByText(`Hello from the office ${stamp}`)).toBeVisible();
    // the staff see the developers on People too, as a department of their own
    await page.getByRole("button", { name: "People", exact: true }).click();
    await expect(
        page.getByRole("navigation", { name: "People" }).getByRole("heading", { name: /^Developer/ }),
    ).toBeVisible();

    // the developer: one SheeChat in the menu, no Chat, with the admin's message and every department on People
    const theirs = await browser.newContext();
    const devPage = await theirs.newPage();
    watch(devPage);
    await devPage.goto("/staff/login");
    await signIn(devPage, dev.username, dev.password);
    const menu = devPage.getByRole("navigation", { name: "Admin" });
    await expect(menu.getByRole("link", { name: "Chat", exact: true })).toHaveCount(0);
    await menu.getByRole("link", { name: "SheeChat" }).click();
    await expect(devPage.getByRole("tab", { name: "Staff", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(devPage.getByRole("tab", { name: "Staff concerns" })).toBeVisible();
    const list = devPage.getByRole("navigation", { name: "Conversations" });
    await expect(list.getByText(`Hello from the office ${stamp}`)).toBeVisible();

    await devPage.getByRole("button", { name: "People", exact: true }).click();
    const people = devPage.getByRole("navigation", { name: "People" });
    await expect(people.getByRole("heading", { name: /^Loading/ })).toBeVisible();
    await people.locator(".chat-list-item", { hasText: crew.name }).click();
    await expect(devPage.getByRole("textbox", { name: `Message to ${crew.name}` })).toBeVisible();

    // the old Chat address opens Staff concerns
    await devPage.goto("/staff/chat");
    await expect(devPage).toHaveURL(/\/staff\/sheechat\?tab=concerns$/);
    await expect(devPage.getByRole("heading", { name: "Staff concerns", exact: true })).toBeVisible();

    // their own chat head opens their profile, with no Send a message on it
    await devPage.getByRole("button", { name: `View ${dev.name}'s profile` }).click();
    const own = devPage.getByRole("dialog", { name: `${dev.name}'s profile` });
    await expect(own.getByText("Developer", { exact: true })).toBeVisible();
    await expect(own.getByRole("button", { name: "Send a message" })).toHaveCount(0);
    await theirs.close();
});

// Recall: a customer sent away with the wrong receipt is called straight back from Done at loading today, with a
// reason, and the crew sees why on the customer it's serving again
test("Recall calls a done customer back to Roofings with a reason, from Done at loading today", async ({ page }) => {
    const stamp = Date.now();
    const customer = `Recall ${stamp}`;

    await page.goto("/staff/loading");
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole("heading", { name: "Loading", exact: true })).toBeVisible();
    // an order loaded at Roofings and done, as the crew would have it
    const { queueNum } = await api(page, "POST", "/orders", sale(customer, "Roofings", [{ invoiceNo: `R-${stamp}`, type: "Roofings" }]));
    await api(page, "POST", `/admin/orders/${queueNum}/handover`, {});
    await api(page, "POST", `/admin/loading/${queueNum}/start`, { area: "Roofings" });
    await api(page, "POST", `/admin/loading/${queueNum}/done`);

    const done = page.getByRole("listitem").filter({ hasText: customer });
    await done.getByRole("button", { name: "Recall" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Please proceed to Roofings (Gate Y: Yero)")).toBeVisible();
    // no reason, no recall
    await expect(dialog.getByRole("button", { name: "Recall now" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Wrong receipt" }).click();
    await dialog.getByRole("button", { name: "Recall now" }).click();

    await expect(page.getByRole("status").filter({ hasText: /^✓ Recalled .* to Roofings\.$/ })).toBeVisible();
    const serving = page.locator(".serving-card").filter({ hasText: customer });
    await expect(serving.getByText("Recalled to Roofings · “Wrong receipt”")).toBeVisible();
    await expect(serving.getByRole("button", { name: "Start loading at Roofings" })).toBeVisible();
});
