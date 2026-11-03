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
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
};

test('a wrong password is refused, and the staff pages stay behind the sign-in', async ({ page }) => {
    await page.goto('/staff/customer-order');
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();

    await signIn(page, ADMIN.username, 'not-the-password');

    await expect(page.getByRole('alert')).toHaveText('Incorrect username or password.');
    await expect(page.getByRole('heading', { name: 'Customer order' })).toBeHidden();
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

    // loading calls them, and the display headlines them
    await page.goto('/staff/loading');
    await page.getByRole('listitem').filter({ hasText: customer }).getByRole('button', { name: 'Call', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Call now' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(nowServing.getByText(customer)).toBeVisible();

    // the truck arrives and the crew finishes, so the customer leaves the display
    const ticket = page.getByRole('listitem').filter({ hasText: customer });
    await ticket.getByRole('button', { name: 'Loading at Roofings' }).click();
    await ticket.getByRole('button', { name: 'Done at Roofings' }).click();
    await expect(page.getByRole('button', { name: 'Done at Roofings' })).toBeHidden();
    await expect(nowServing.getByText(customer)).toBeHidden();
    await expect(upNext.getByText(customer)).toBeHidden();
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

    // sales see the same cards, without Call and Delete
    const theirs = await browser.newContext();
    const other = await theirs.newPage();
    watch(other);
    await other.goto('/staff/customer-order?tab=orders');
    await signIn(other, salesAccount.username, salesAccount.password);
    await other.getByRole('radio', { name: 'Orders & history' }).click();
    const theirCard = other.getByRole('listitem').filter({ hasText: full });
    await expect(theirCard.getByRole('link', { name: /^View ticket/ })).toBeVisible();
    await expect(theirCard.getByRole('button', { name: /^(Call|Delete)/ })).toHaveCount(0);
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
