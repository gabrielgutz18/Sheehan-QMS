// the app's main path in a real browser, with the display screen open beside it, the way the shop runs it
import { expect, test } from '@playwright/test';

import { ADMIN } from './settings.js';

// a page that crashes fails its test, even if what the test looks at still happens to be on screen
const crashes = [];
const watch = (page) => page.on('pageerror', (err) => crashes.push(err.message));

test.beforeEach(({ page }) => {
    crashes.length = 0;
    watch(page);
});

test.afterEach(() => {
    expect(crashes).toEqual([]);
});

const signIn = async (page, username, password) => {
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
};

test('a wrong password is refused, and the staff pages stay behind the sign-in', async ({ page }) => {
    await page.goto('/staff/customer-order');
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();

    await signIn(page, ADMIN.username, 'not-the-password');

    await expect(page.getByRole('alert')).toContainText('Incorrect username or password.');
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeHidden();

    // the empty password box gets the cursor back, and the eye shows what's typed in it
    const passwordBox = page.getByLabel('Password', { exact: true });
    await expect(passwordBox).toBeFocused();
    await expect(passwordBox).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordBox).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();
});

test('a new tab of the same browser carries on signed in, with no sign-in page', async ({ page }) => {
    await page.goto('/staff/customer-order');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeVisible();

    // a second tab of the same browser opens straight onto the staff pages, with no sign-in
    const second = await page.context().newPage();
    watch(second);
    await second.goto('/staff/customer-order');
    await expect(second.getByRole('heading', { name: 'Customer order' })).toBeVisible();
    await second.close();
});

test('Serve stays in view on Customer order, and a stopped Serve puts the cursor on the first field to fix', async ({ page }) => {
    // a short laptop screen, where the whole form can't fit
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/staff/customer-order');
    await signIn(page, ADMIN.username, ADMIN.password);
    const serve = page.getByRole('button', { name: 'Serve', exact: true });
    await expect(serve).toBeInViewport();
    await expect(page.locator('.sale-actions')).toContainText('New ticket');

    // the summary beside Serve fills in as the form is
    await page.getByRole('button', { name: /^Type of order/ }).click();
    await page.getByRole('checkbox', { name: 'Roofings', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Steel', exact: true }).check();
    await page.keyboard.press('Escape');
    await page.getByLabel('Invoice 1 number').fill('E2E-2001');
    await expect(page.locator('.sale-actions')).toContainText('RS --');
    await expect(page.locator('.sale-actions')).toContainText('Roofings, Steel · 1 invoice');

    // scrolled down to the last group, Serve is still there; pressed with no name, the name field gets the cursor
    await page.getByText(/^Returning:/).scrollIntoViewIfNeeded();
    await expect(serve).toBeInViewport();
    await serve.click();
    const name = page.getByRole('textbox', { name: 'Customer name' });
    await expect(name).toBeFocused();
    await expect(name).toBeInViewport();
    await expect(page.getByText("Please enter the customer's name.")).toBeVisible();
});

test('a half-filled order is still there after going to another page and back, until Start over', async ({ page }) => {
    await page.goto('/staff/customer-order');
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.getByRole('textbox', { name: 'Customer name' }).fill('Draft Customer');
    await page.getByLabel('Invoice 1 number').fill('E2E-DRAFT-1');

    // off to the Dashboard and back through the menu: the form comes back as it was left
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await page.getByRole('link', { name: 'Customer order' }).click();
    await expect(page.getByRole('textbox', { name: 'Customer name' })).toHaveValue('Draft Customer');
    await expect(page.getByLabel('Invoice 1 number')).toHaveValue('E2E-DRAFT-1');

    // Start over empties it, and it stays empty the next time round
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(page.getByRole('textbox', { name: 'Customer name' })).toHaveValue('');
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await page.getByRole('link', { name: 'Customer order' }).click();
    await expect(page.getByRole('textbox', { name: 'Customer name' })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Start over' })).toBeHidden();
});

test('a customer goes from their ticket, through hand-over and loading, with the display following along', async ({ page }) => {
    const customer = `Test Customer ${Date.now()}`;

    const display = await page.context().newPage();
    watch(display);
    await display.goto('/');
    await expect(display.getByRole('heading', { name: 'Now Serving' })).toBeVisible();
    const upNext = display.getByRole('region', { name: 'Up next' });
    const nowServing = display.getByRole('region', { name: 'Now Serving' });

    // sales take the order; the ticket gets its number
    await page.goto('/staff/customer-order');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Customer name' }).fill(customer);
    await page.getByRole('button', { name: /^Type of order/ }).click();
    await page.getByRole('checkbox', { name: 'Roofings', exact: true }).check();
    await page.keyboard.press('Escape');
    await page.getByLabel('Invoice 1 number').fill('E2E-1001');
    await page.getByLabel('Salesman name').fill('Test Salesman');
    await page.getByRole('button', { name: 'Serve', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New order' })).toBeVisible();

    // they show as next in line
    await expect(upNext.getByText(customer)).toBeVisible();

    // the counter hands them over to loading
    await page.goto('/staff/counter');
    await page.getByRole('listitem').filter({ hasText: customer }).getByRole('button', { name: 'Hand over to loading' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Hand over to loading' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    // a short note says it worked
    await expect(page.getByRole('status').filter({ hasText: /handed over to loading\.$/ })).toBeVisible();

    // loading's browser tab counts who can be called, so the crew sees it from another tab
    await page.goto('/staff/loading');
    await expect(page).toHaveTitle(/^\(\d+\) Loading$/);

    // loading calls them, and the display headlines them
    await page.getByRole('listitem').filter({ hasText: customer }).getByRole('button', { name: 'Call', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Call now' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: /^✓ Called / })).toBeVisible();
    await expect(nowServing.getByText(customer)).toBeVisible();

    // the truck arrives and the crew finishes, so the customer leaves the display
    const ticket = page.getByRole('listitem').filter({ hasText: customer });
    // the card says where they are and what to press next, with one main button at a time
    await expect(ticket.getByText('Called', { exact: true })).toBeVisible();
    await expect(ticket.getByText('Press Start loading once the truck is at the area.')).toBeVisible();
    await ticket.getByRole('button', { name: 'Start loading at Roofings' }).click();
    await expect(ticket.getByText(/^Loading since /)).toBeVisible();
    await expect(ticket.getByRole('button', { name: 'Call again' })).toHaveCount(0);
    await ticket.getByRole('button', { name: 'Done at Roofings' }).click();
    await expect(page.getByRole('button', { name: 'Done at Roofings' })).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: /done at Roofings\.$/ })).toBeVisible();
    await expect(nowServing.getByText(customer)).toBeHidden();
    await expect(upNext.getByText(customer)).toBeHidden();
});

test('a red bar says so when the server can\'t be reached, and goes away by itself once it can', async ({ page }) => {
    await page.goto('/staff/loading');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Loading', exact: true })).toBeVisible();
    const bar = page.getByRole('alert').filter({ hasText: 'Connection lost.' });
    await expect(bar).toBeHidden();

    // the network drops: the next refresh can't get through
    await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
    await expect(bar).toBeVisible({ timeout: 15000 });

    // and comes back
    await page.unroute('**/api/**');
    await expect(bar).toBeHidden({ timeout: 15000 });
});

test('a message pops up in the corner of any page, and clicking it opens the conversation', async ({ page, browser }) => {
    const stamp = Date.now();
    const sender = { username: `e2e-sales-${stamp}`, password: 'e2e-password', name: `Sales ${stamp}`, role: 'sales' };

    await page.goto('/staff/account');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
    await page.evaluate(async (account) => {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Tab-Id': sessionStorage.getItem('tabId'),
            },
            body: JSON.stringify(account),
        });
        if (!res.ok) throw new Error(`Making the account failed (${res.status})`);
    }, sender);

    // someone else, on their own computer, writes from SheeChat
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto('/staff/sheechat');
    await signIn(other, sender.username, sender.password);
    await other.getByRole('button', { name: 'People' }).click();
    await other.getByRole('region', { name: /^Admin/ }).locator('.chat-list-item').first().click();
    const box = other.getByRole('textbox', { name: /^Message to / });
    await box.fill('The truck is here.');
    await box.press('Enter');
    await expect(other.getByRole('listitem').filter({ hasText: 'The truck is here.' })).toBeVisible();

    // it pops up where the admin is, on a page that has nothing to do with chat
    const popups = page.getByRole('region', { name: 'New messages' });
    await expect(popups.getByText('The truck is here.')).toBeVisible();
    await expect(popups.getByRole('button', { name: `Message from ${sender.name}: The truck is here.` })).toBeVisible();
    await expect(popups.getByText(sender.name)).toBeVisible();
    await expect(popups.locator('time')).toHaveText(/\d:\d\d/);
    const sheeChatDot = page.getByRole('link', { name: /SheeChat/ }).getByRole('img', { name: 'Unread messages' });
    await expect(sheeChatDot).toBeVisible();

    // the X takes it away, and neither that nor a reload brings it back, but it's still unread, so the dot stays
    await popups.getByRole('button', { name: `Dismiss message from ${sender.name}` }).click();
    await expect(popups.getByRole('button')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
    await expect(sheeChatDot).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(popups.getByRole('button')).toHaveCount(0);

    // the next message does, and clicking it opens the conversation, which reads it
    await box.fill('At Roofings now.');
    await box.press('Enter');
    await popups.getByRole('button', { name: /At Roofings now/ }).click();
    await expect(page).toHaveURL(/\/staff\/sheechat$/);
    await expect(page.getByRole('textbox', { name: `Message to ${sender.name}` })).toBeVisible();
    const thread = page.locator('.chat-messages');
    await expect(thread.getByText('At Roofings now.')).toBeVisible();
    await expect(popups.getByRole('button')).toHaveCount(0);
    await expect(sheeChatDot).toHaveCount(0);

    // with the conversation open, a new message shows in it, with no pop-up
    await box.fill('Are you there?');
    await box.press('Enter');
    await expect(thread.getByText('Are you there?')).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(popups.getByRole('button')).toHaveCount(0);

    await theirs.close();
});

test('a message shows one gray check until it is opened, then two red ones, and typing shows on the other side', async ({ page, browser }) => {
    const stamp = Date.now();
    const sender = { username: `e2e-ticks-${stamp}`, password: 'e2e-password', name: `Ticks ${stamp}`, role: 'sales' };

    await page.goto('/staff/sheechat');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'SheeChat' })).toBeVisible();
    await page.evaluate(async (account) => {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Tab-Id': sessionStorage.getItem('tabId'),
            },
            body: JSON.stringify(account),
        });
        if (!res.ok) throw new Error(`Making the account failed (${res.status})`);
    }, sender);

    // sent, but the admin hasn't opened it: one check, delivered
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto('/staff/sheechat');
    await signIn(other, sender.username, sender.password);
    await other.getByRole('button', { name: 'People' }).click();
    await other.getByRole('region', { name: /^Admin/ }).locator('.chat-list-item').first().click();
    const box = other.getByRole('textbox', { name: /^Message to / });
    await box.fill('Checking the ticks.');
    await box.press('Enter');
    const sent = other.getByRole('listitem').filter({ hasText: 'Checking the ticks.' });
    await expect(sent.getByRole('img', { name: 'Delivered' })).toBeVisible();

    // the admin opens it: two red checks, and only on the sender's own message
    await page.locator('.chat-list-item', { hasText: sender.name }).first().click();
    await expect(page.locator('.chat-messages').getByText('Checking the ticks.')).toBeVisible();
    await expect(sent.getByRole('img', { name: 'Seen' })).toBeVisible({ timeout: 8000 });
    await expect(sent.locator('.chat-ticks')).toHaveCSS('color', 'rgb(200, 32, 42)');
    await expect(page.locator('.chat-ticks')).toHaveCount(0);

    // writing shows on the admin's side, and sending ends it
    const typing = page.getByRole('status').filter({ hasText: `${sender.name} is typing` });
    await box.fill('Still there?');
    await expect(typing).toBeVisible();
    await box.press('Enter');
    await expect(page.locator('.chat-messages').getByText('Still there?')).toBeVisible();
    await expect(typing).toHaveCount(0);

    // the admin's tab goes behind another window: what arrives isn't seen, even with the conversation open
    const setHidden = (hidden) => page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, value });
        document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await setHidden(true);
    await box.fill('Are you looking?');
    await box.press('Enter');
    const unseen = other.getByRole('listitem').filter({ hasText: 'Are you looking?' });
    await expect(unseen.getByRole('img', { name: 'Delivered' })).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(unseen.getByRole('img', { name: 'Delivered' })).toBeVisible();

    // back on the tab, it's read
    await setHidden(false);
    await expect(unseen.getByRole('img', { name: 'Seen' })).toBeVisible({ timeout: 8000 });

    await theirs.close();
});

test('Orders & history shows every ticket as one size of card, and a deleted ticket can be restored', async ({ page, browser }) => {
    const stamp = Date.now();
    const full = `Full Order ${stamp}`;
    const report = `Report ${stamp}`;
    const salesAccount = { username: `e2e-orders-${stamp}`, password: 'e2e-password', name: `Orders ${stamp}`, role: 'sales' };

    await page.goto('/staff/customer-order?tab=orders');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeVisible();
    await page.evaluate(async ([tickets, account]) => {
        const post = async (path, body) => {
            const res = await fetch(path, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Tab-Id': sessionStorage.getItem('tabId'),
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`${path} failed (${res.status})`);
        };
        for (const ticket of tickets) await post('/api/orders', ticket);
        await post('/api/admin/users', account);
    }, [[
        {
            name: full,
            purpose: 'Roofings, Tire, Steel, Hardwares, Chassis',
            invoices: [{ invoiceNo: '5001', type: 'Roofings' }, { invoiceNo: '5002', type: 'Steel' }, { invoiceNo: '5003', type: 'Tire' }],
            paymentStatus: 'Paid',
            salesman: 'Test Salesman',
            runner: 'Boy Reyes',
        },
        { name: report, purpose: 'Customer Report', concern: 'The sheets are leaking at the joints. '.repeat(5) },
    ], salesAccount]);

    await page.getByRole('radio', { name: 'Orders & history' }).click();

    // a ticket with a lot on it and one with very little are the same size, with the rest behind See all details
    const fullCard = page.getByRole('listitem').filter({ hasText: full });
    const reportCard = page.getByRole('listitem').filter({ hasText: report });
    await expect(fullCard.getByRole('button', { name: /^Call/ })).toBeVisible();
    await expect(reportCard.getByRole('button', { name: /^Call/ })).toBeVisible();
    const fullBox = await fullCard.boundingBox();
    const reportBox = await reportCard.boundingBox();
    expect([fullBox.width, fullBox.height]).toEqual([reportBox.width, reportBox.height]);

    await expect(fullCard.getByText('Boy Reyes')).toHaveCount(0);
    await fullCard.getByRole('button', { name: /^See all details/ }).click();
    const details = page.getByRole('dialog');
    await expect(details.getByText('Boy Reyes')).toBeVisible();
    await details.getByRole('button', { name: 'Close' }).click();
    await expect(details).toHaveCount(0);

    // a customer report has no order to edit, so its Edit stays in its place, grayed out
    await expect(reportCard.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await expect(fullCard.getByRole('link', { name: /^Edit/ })).toBeVisible();

    // sales see the same cards, with Delete (for a ticket made by mistake) but without Call; on Deleted, nothing to
    // pick, since purging is for admins and developers
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto('/staff/customer-order?tab=orders');
    await signIn(other, salesAccount.username, salesAccount.password);
    await other.getByRole('radio', { name: 'Orders & history' }).click();
    const theirCard = other.getByRole('listitem').filter({ hasText: full });
    await expect(theirCard.getByRole('link', { name: /^View ticket/ })).toBeVisible();
    await expect(theirCard.getByRole('button', { name: /^Delete/ })).toBeVisible();
    await expect(theirCard.getByRole('button', { name: /^Call/ })).toHaveCount(0);
    await other.getByRole('radio', { name: 'Deleted' }).click();
    await expect(other.getByRole('radio', { name: 'Deleted' })).toHaveAttribute('aria-checked', 'true');
    await expect(other.getByText('Loading...')).toHaveCount(0);
    await expect(other.getByRole('checkbox')).toHaveCount(0);
    await other.getByRole('radio', { name: 'Today' }).click();
    // sales don't call customers: not with the status either, and not from My counter, where they hand them over
    await expect(theirCard.getByRole('option', { name: 'Now serving' })).toHaveCount(0);
    await other.goto('/staff/counter');
    const atCounter = other.getByRole('listitem').filter({ hasText: full });
    // the admin made this ticket, so its hand-over is theirs, and hovering it says so; sales can Assist the customer,
    // which lets them hand it over themselves
    const handOverButton = atCounter.getByRole('button', { name: /^Hand over/ });
    await expect(handOverButton).toBeDisabled();
    await expect(atCounter.getByText('ticket by')).toBeVisible();
    await expect(atCounter.locator('.hint')).toHaveAttribute('data-hint', /^This order is created by .+\. Press Assist/);
    await atCounter.getByRole('button', { name: 'Assist', exact: true }).click();
    await expect(atCounter.getByText('Assisted by')).toBeVisible();
    await expect(handOverButton).toBeEnabled();
    await atCounter.getByRole('button', { name: 'Stop assisting' }).click();
    await expect(atCounter.getByRole('button', { name: 'Assist', exact: true })).toBeVisible();
    await expect(other.getByRole('button', { name: /^(Call|Serve|Recall)/ })).toHaveCount(0);
    await theirs.close();

    // deleted, it leaves Today and waits on Deleted, where Restore puts it back
    page.once('dialog', (confirm) => confirm.accept());
    await fullCard.getByRole('button', { name: /^Delete/ }).click();
    await expect(fullCard).toHaveCount(0);
    await page.getByRole('radio', { name: 'Deleted' }).click();
    await fullCard.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: "back in today's queue" })).toBeVisible();
    await expect(fullCard).toHaveCount(0);
    await page.getByRole('radio', { name: 'Today' }).click();
    await expect(fullCard).toBeVisible();
});

test('an admin picks several tickets on All tickets to delete them, then purges them for good from Deleted', async ({ page }) => {
    const stamp = Date.now();
    const names = [`Purge One ${stamp}`, `Purge Two ${stamp}`, `Purge Three ${stamp}`];

    await page.goto('/staff/customer-order?tab=orders');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeVisible();
    await page.evaluate(async (tickets) => {
        for (const name of tickets) {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, purpose: 'Steel', invoices: [{ invoiceNo: '7001', type: 'Steel' }] }),
            });
            if (!res.ok) throw new Error(`taking a ticket failed (${res.status})`);
        }
    }, names);

    // only this test's tickets are shown, so Select all can't reach anyone else's
    await page.getByRole('radio', { name: 'Orders & history' }).click();
    await page.getByRole('radio', { name: 'All tickets' }).click();
    await page.getByPlaceholder('Search name or ticket no.').fill(`${stamp}`);
    const cards = page.getByRole('listitem').filter({ hasText: `${stamp}` });
    await expect(cards).toHaveCount(3);

    // one picked, then all of them
    await cards.filter({ hasText: names[0] }).getByRole('checkbox').check();
    await expect(page.getByText('1 ticket picked')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select all shown' }).check();
    page.once('dialog', (confirm) => {
        expect(confirm.message()).toContain('Delete 3 tickets?');
        confirm.accept();
    });
    await page.getByRole('button', { name: 'Delete 3 tickets' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Deleted 3 tickets.' })).toBeVisible();
    // deleted, they have nothing left to delete on All tickets, so no box
    await expect(cards.getByRole('checkbox')).toHaveCount(0);

    await page.getByRole('radio', { name: 'Deleted' }).click();
    await page.getByPlaceholder('Search name or ticket no.').fill(`${stamp}`);
    await expect(cards).toHaveCount(3);
    await page.getByRole('checkbox', { name: 'Select all shown' }).check();
    // turning it down purges nothing
    page.once('dialog', (confirm) => confirm.dismiss());
    await page.getByRole('button', { name: 'Purge 3 tickets' }).click();
    await expect(cards).toHaveCount(3);
    page.once('dialog', (confirm) => {
        expect(confirm.message()).toContain("can't be restored");
        confirm.accept();
    });
    await page.getByRole('button', { name: 'Purge 3 tickets' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Purged 3 tickets.' })).toBeVisible();
    await expect(cards).toHaveCount(0);
    await page.getByRole('radio', { name: 'All tickets' }).click();
    await page.getByPlaceholder('Search name or ticket no.').fill(`${stamp}`);
    await expect(page.getByText('No tickets found.')).toBeVisible();
});

test('a developer purges deleted tickets from their Deleted tickets page, with no Restore there', async ({ page, browser }) => {
    const stamp = Date.now();
    const name = `Dev Purge ${stamp}`;
    const developer = { username: `e2e-dev-${stamp}`, password: 'e2e-password', name: `Dev ${stamp}`, role: 'developer' };

    // an admin makes the developer's account and a ticket, and deletes it
    await page.goto('/staff/customer-order?tab=orders');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeVisible();
    await page.evaluate(async ([ticketName, account]) => {
        const call = async (method, path, body) => {
            const res = await fetch(path, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Tab-Id': sessionStorage.getItem('tabId'),
                },
                body: body && JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`${path} failed (${res.status})`);
            return res.status === 204 ? null : res.json();
        };
        const ticket = await call('POST', '/api/orders', { name: ticketName, purpose: 'Steel', invoices: [{ invoiceNo: '7101', type: 'Steel' }] });
        await call('DELETE', `/api/admin/orders/${ticket.queueNum}`);
        await call('POST', '/api/admin/users', account);
    }, [name, developer]);

    const theirs = await browser.newContext();
    const dev = await theirs.newPage();
    watch(dev);
    await dev.goto('/staff/deleted-tickets');
    await signIn(dev, developer.username, developer.password);
    await expect(dev.getByRole('heading', { name: 'Deleted tickets' })).toBeVisible();
    await dev.getByPlaceholder('Search name or ticket no.').fill(`${stamp}`);
    const card = dev.getByRole('listitem').filter({ hasText: name });
    await expect(card).toBeVisible();
    // the queue's buttons aren't theirs
    await expect(card.getByRole('button', { name: 'Restore' })).toHaveCount(0);
    await expect(dev.getByRole('button', { name: /Export/ })).toHaveCount(0);

    await card.getByRole('checkbox').check();
    dev.once('dialog', (confirm) => confirm.accept());
    await dev.getByRole('button', { name: 'Purge 1 ticket' }).click();
    await expect(dev.getByRole('status').filter({ hasText: 'Purged 1 ticket.' })).toBeVisible();
    await expect(card).toHaveCount(0);
    await theirs.close();
});

test('an order sales takes fills in its ticket, date and time in on the Order sheet, and Edit keeps the time', async ({ page, browser }) => {
    const stamp = Date.now();
    const customer = `Timed Order ${stamp}`;
    const salesAccount = { username: `e2e-timein-${stamp}`, password: 'e2e-password', name: `Time In ${stamp}`, role: 'sales' };

    await page.goto('/staff/customer-order');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeVisible();
    await page.evaluate(async (account) => {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Tab-Id': sessionStorage.getItem('tabId'),
            },
            body: JSON.stringify(account),
        });
        if (!res.ok) throw new Error(`creating the account failed (${res.status})`);
    }, salesAccount);

    const theirs = await browser.newContext();
    const sales = await theirs.newPage();
    watch(sales);
    await sales.goto('/staff/customer-order');
    await signIn(sales, salesAccount.username, salesAccount.password);
    await expect(sales.getByRole('heading', { name: 'Customer order' })).toBeVisible();

    // the time in is left blank; Serve fills it in
    await sales.getByRole('textbox', { name: 'Customer name' }).fill(customer);
    await sales.getByRole('button', { name: /^Type of order/ }).click();
    await sales.getByRole('checkbox', { name: 'Roofings', exact: true }).check();
    await sales.keyboard.press('Escape');
    await sales.getByLabel('Invoice 1 number').fill(`T${stamp}`);
    await expect(sales.getByLabel(/^Time in/)).toHaveValue('');
    await sales.getByRole('button', { name: 'Serve', exact: true }).click();

    // Edit starts from the time it was given, so Update doesn't clear it or count as a change
    await sales.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(sales.getByLabel(/^Time in/)).toHaveValue(/^\d{2}:\d{2}$/);
    await sales.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(sales.getByRole('button', { name: 'New order' })).toBeVisible();

    await sales.getByRole('radio', { name: 'Order sheet' }).click();
    const row = sales.getByRole('row').filter({ hasText: customer });
    await expect(row.locator('.sheet-date')).toHaveText(/^[A-Z][a-z]{2}-\d{2}-\d{2}$/);
    await expect(row.locator('.sheet-que')).toHaveText(/^R \d+$/);
    await expect(row.locator('.sheet-time').first()).toHaveText(/^\d{4}H$/);
    await expect(row.locator('.sheet-time').last()).toHaveText('');
    await expect(row.getByText('Edited by')).toHaveCount(0);
    await theirs.close();
});

test('a long queue code stays whole on the Order sheet: its column widens, and the page itself never scrolls sideways', async ({ page }) => {
    const customer = `Long Code ${Date.now()}`;

    // a small office screen, where the columns are at their narrowest
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/staff/customer-order');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeVisible();

    // a long code, one letter or two for each type of order on the ticket
    await page.getByRole('textbox', { name: 'Customer name' }).fill(customer);
    await page.getByRole('button', { name: /^Type of order/ }).click();
    for (const type of ['Roofings', 'Roofings Accessories', 'Steel', 'Hardwares', 'Tire', 'Battery']) {
        await page.getByRole('checkbox', { name: type, exact: true }).check();
    }
    await page.keyboard.press('Escape');
    await page.getByLabel('Invoice 1 number').fill(`L${Date.now()}`);
    await page.getByLabel('Salesman name').fill('CORONACION');
    await page.getByRole('button', { name: 'Serve', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New order' })).toBeVisible();

    await page.getByRole('radio', { name: 'Order sheet' }).click();
    const row = page.getByRole('row').filter({ hasText: customer });
    await expect(row.locator('.sheet-que-btn')).toHaveText(/^[A-Z]{6,} \d+$/);

    // each on one line and inside its own cell; the column that widened for the code leaves the salesman room too
    const fits = (cell) => {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const text = range.getBoundingClientRect();
        return text.height <= parseFloat(getComputedStyle(cell).lineHeight) + 1 && text.right <= cell.getBoundingClientRect().right;
    };
    expect(await row.locator('.sheet-que').evaluate(fits)).toBe(true);
    expect(await row.locator('td', { hasText: 'CORONACION' }).locator('.sheet-cell').evaluate(fits)).toBe(true);

    // the sheet scrolls inside its frame, not the page
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);
});

test('the Order sheet works like a spreadsheet: cells change where they are, a new row makes a ticket, and a column can be added', async ({ page }) => {
    const stamp = Date.now();
    const customer = `Sheet Row ${stamp}`;
    const renamed = `Renamed ${stamp}`;
    const column = `Truck ${stamp % 100000}`;

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/staff/customer-order');
    await signIn(page, ADMIN.username, ADMIN.password);
    await page.getByRole('radio', { name: 'Order sheet' }).click();

    // a new row: nothing to tick, it's a ticket as soon as it has what it needs
    await page.getByRole('button', { name: 'Add row' }).click();
    const fillNew = async (label, value) => {
        await page.getByRole('button', { name: `${label} for the new row` }).click();
        await page.getByRole('textbox', { name: `${label} for the new row` }).fill(value);
        await page.keyboard.press('Tab');
    };
    await fillNew("Customer's name", customer);
    await fillNew('Type of order', 'roofings');
    await expect(page.getByText('Needs a customer')).toBeVisible();
    await fillNew('Roofing', `R${stamp}`);
    await expect(page.getByText('Needs a customer')).toHaveCount(0);

    const row = page.getByRole('row').filter({ hasText: customer });
    await expect(row.locator('.sheet-que-btn')).toHaveText(/^R \d+$/);
    await expect(row.locator('.sheet-time').first()).toHaveText(/^\d{4}H$/);
    const ticket = await row.locator('.sheet-que-btn').innerText();

    // the terms and the customer change right in the row
    await row.getByRole('combobox', { name: `Terms for ${ticket}` }).selectOption('Vale');
    await expect(row.getByText('Edited by')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

    await row.getByRole('button', { name: `Customer's name for ${ticket}` }).click();
    await row.getByRole('textbox', { name: `Customer's name for ${ticket}` }).fill(renamed);
    await page.keyboard.press('Enter');
    const same = page.getByRole('row').filter({ hasText: renamed });
    await expect(same.locator('.sheet-que-btn')).toHaveText(ticket);

    // a value it can't take says why, and goes back
    await same.getByRole('button', { name: `TBA for ${ticket}` }).click();
    await same.getByRole('textbox', { name: `TBA for ${ticket}` }).fill('999');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('invoice 999 is under TBA');
    await expect(same.getByRole('button', { name: `TBA for ${ticket}` })).toHaveText('');

    // the date, number and status can't be typed in
    await expect(same.locator('.sheet-date button, .sheet-date textarea')).toHaveCount(0);
    await expect(same.locator('.sheet-status textarea')).toHaveCount(0);

    // a column of their own, filled in on the row, and still there after a reload
    await page.getByRole('button', { name: 'Add column' }).click();
    await page.getByLabel("New column's name").fill(column);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await same.getByRole('button', { name: `${column} for ${ticket}` }).click();
    await same.getByRole('textbox', { name: `${column} for ${ticket}` }).fill('Isuzu');
    await page.keyboard.press('Enter');
    await expect(same.getByRole('button', { name: `${column} for ${ticket}` })).toHaveText('Isuzu');
    await page.screenshot({ path: process.env.SHEET_SHOT ?? 'test-results/order-sheet.png' });

    await page.reload();
    await page.getByRole('radio', { name: 'Order sheet' }).click();
    await expect(same.getByRole('button', { name: `${column} for ${ticket}` })).toHaveText('Isuzu');

    // and it can be taken off again
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: `Remove the ${column} column` }).click();
    await expect(page.getByRole('columnheader', { name: column })).toHaveCount(0);
});

test('a cover photo shows on the Dashboard, and a coworker can open that profile from SheeChat', async ({ page, browser }) => {
    const stamp = Date.now();
    const coworker = { username: `e2e-cover-${stamp}`, password: 'e2e-password', name: `Cover ${stamp}`, role: 'sales' };
    // a 1 by 1 red PNG, a real picture for the browser to open and crop
    const picture = {
        name: 'cover.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'),
    };

    await page.goto('/staff/account');
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
    await page.evaluate(async (account) => {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Tab-Id': sessionStorage.getItem('tabId'),
            },
            body: JSON.stringify(account),
        });
        if (!res.ok) throw new Error(`Making the account failed (${res.status})`);
    }, coworker);

    // the coworker picks a cover on My account, cropped to a wide banner, and sees it on their Dashboard
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto('/staff/account');
    await signIn(other, coworker.username, coworker.password);
    await other.getByLabel('Cover photo file').setInputFiles(picture);
    await expect(other.getByRole('button', { name: 'Remove cover' })).toBeVisible();
    const preview = other.locator('.cover-photo-field img');
    await expect(preview).toHaveJSProperty('naturalWidth', 1200);
    await expect(preview).toHaveJSProperty('naturalHeight', 400);

    await other.getByRole('link', { name: 'Dashboard' }).click();
    const onDashboard = other.getByRole('region', { name: 'Your profile' }).locator('.profile-summary-cover-img');
    await expect(onDashboard).toHaveJSProperty('naturalWidth', 1200);

    // the admin finds them on SheeChat's People and opens their profile from their photo, without opening the conversation
    await page.goto('/staff/sheechat');
    await page.getByRole('button', { name: 'People' }).click();
    await page.getByRole('button', { name: `View ${coworker.name}'s profile` }).click();
    const profile = page.getByRole('dialog', { name: `${coworker.name}'s profile` });
    await expect(profile.getByRole('heading', { name: coworker.name })).toBeVisible();
    await expect(profile.getByText('Online')).toBeVisible();
    await expect(profile.locator('.profile-summary-cover-img')).toHaveJSProperty('naturalWidth', 1200);
    await expect(page.getByRole('textbox', { name: `Message to ${coworker.name}` })).toHaveCount(0);

    // Send a message goes on to the conversation, and the name above it opens the profile again
    await profile.getByRole('button', { name: 'Send a message' }).click();
    await expect(profile).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: `Message to ${coworker.name}` })).toBeVisible();
    await page.locator('.chat-panel').getByRole('button', { name: coworker.name }).click();
    await expect(page.getByRole('dialog', { name: `${coworker.name}'s profile` })).toBeVisible();
    // already talking to them, so there's nowhere for it to go
    await expect(page.getByRole('button', { name: 'Send a message' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await theirs.close();
});
