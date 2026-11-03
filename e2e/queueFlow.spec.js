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
    await other.getByRole('region', { name: /^Admin/ }).getByRole('button').first().click();
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
