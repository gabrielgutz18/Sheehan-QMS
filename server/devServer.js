// runs the dev API on its own (http://localhost:3000), for use without Vite
// usually not needed: `npm run dev` already serves /api; run with: npm run api
import { createServer } from 'node:http';

import { createApi } from './api.js';

const PORT = Number(process.env.PORT ?? 3000);
const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD in .env");
    process.exit(1);
}

createServer(createApi({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD })).listen(PORT, () => {
    console.log(`Dev API on http://localhost:${PORT} (admin user: ${ADMIN_USERNAME})`);
});
