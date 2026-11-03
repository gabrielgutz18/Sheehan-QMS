// the real server (server/server.js) for the browser tests, on an empty database in the system's temp folder
// nothing from .env reaches it: the tests must never touch the real data or send test orders to the Google sheet
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ADMIN, PORT } from './settings.js';

const dataDir = join(tmpdir(), 'sheehan-queue-e2e');
rmSync(dataDir, { recursive: true, force: true });

Object.assign(process.env, {
    ADMIN_USERNAME: ADMIN.username,
    ADMIN_PASSWORD: ADMIN.password,
    DATA_DIR: dataDir,
    PORT: String(PORT),
});
delete process.env.GOOGLE_SHEET_URL;
delete process.env.GOOGLE_SHEET_TOKEN;

// read after the settings above, since the server takes them from the environment as it loads
await import('../server/server.js');
