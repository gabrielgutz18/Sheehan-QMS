// browser tests of the built site: npm run test:e2e (e2e/startServer.js runs it on a throwaway database)
import { defineConfig, devices } from '@playwright/test';

import { PORT } from './e2e/settings.js';

const CI = Boolean(process.env.CI);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: 'e2e',
    // every test shares the one server and queue, so one at a time
    workers: 1,
    forbidOnly: CI,
    reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    // the display and the staff pages poll every few seconds
    expect: { timeout: 10_000 },
    use: {
        baseURL,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'node e2e/startServer.js',
        url: `${baseURL}/api/queue`,
        // never a server that's already running: it could be using the real data
        reuseExistingServer: false,
    },
});
