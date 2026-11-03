# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The ordering and queue system for Sheehan, Inc., running on one office server. A React + Vite front end has a public queue display at `/` and a role-based staff area at `/staff/*` (lazy-loaded, so the display never downloads it). The backend is plain Node (`node:http`, no framework) with SQLite through the built-in `node:sqlite`. The code is JavaScript, not TypeScript. Node 24 is what CI and the server run (`.nvmrc`).

## Commands

```bash
npm run dev                # site + API on :5173; needs ADMIN_USERNAME and ADMIN_PASSWORD in .env
npm run build && npm start # production server: built site + API on :3000
npm run lint

npm test                                     # every API test
node --test tests/feature/loading.test.js    # one file
npm test -- --test-name-pattern="restoring"  # tests whose name matches
npm run test:coverage                        # with the coverage minimums CI enforces

npm run test:e2e                             # builds, then runs the Playwright browser tests
npx playwright test -g "wrong password"      # one browser test, against the existing dist/

npm run seed -- 12                           # sample customers (also seed:loading, seed:security, seed:handover)
```

CI blocks on lint, `npm run typecheck` (non-strict `--checkJs`), `test:coverage`, build and the browser tests. Types are JSDoc comments, with `src/global.d.ts` for browser globals; add a JSDoc type to fix an error rather than `@ts-ignore`, and mark optional component props there, because TypeScript treats destructured props as required.

`npm run knip` (dead code) and `npm run format:check` are reports, not gates, because each has existing findings. Prettier hasn't been applied to the code yet, so format only the files you're changing (`npm run format -- <file>`), never the whole repo.

`npm run dev` and `npm start` use the same data folder (`DATA_DIR`, default `data/`), and the seed scripts write to it. `seeders/` holds real password hashes and customer names and stays out of git.

## Architecture

**One API, two hosts.** `createApi()` in `server/api.js` holds every route, as one `handle()` function of sequential path checks. `vite.config.js` mounts it in dev and `server/server.js` mounts it in production. `tests/support/testApp.js` also boots it, on a fresh temp database per test, so API tests run the real routes and SQL.

**`src/data/` is shared with the server.** `server/api.js` imports from it, so lists like payment statuses, teams and loading areas are defined once. Keep those modules free of browser and React code. `src/admin/data/` is mostly for the staff pages, though the Google sheet sync also imports from it.

**Authorization is deny-by-default.** `ROLE_ROUTES` in `server/api.js` lists what each role may call; any other `/admin` route is admin-only. Route guards in `src/admin/adminApp.jsx` only decide which pages show, so every rule must also be enforced on the server.

**Sessions are per browser tab.** The page sends `X-Tab-Id` and the session cookie is named after it, so two tabs can be signed in as different people. `<img>` requests can't send that header and accept any of the browser's sessions. `/admin` and `/auth` requests must also send `X-Requested-With: XMLHttpRequest`.

**A ticket's path:** Customer order creates it → My counter hands it over → each department calls, starts and finishes it, one area at a time → Security checks it at the gate → done. `src/data/loadingAreas.js` maps order types to areas and departments, and `DepartmentLine` is the shared page for Loading, TBA, Chassis and Hardware. A customer is in one place at a time, and the server refuses calls that break this.

**Queue numbers restart daily.** `:queueNum` in a route always means today's ticket; `:id` routes work across days (Order sheet, Cashier, history). Tickets are soft-deleted and can be restored.

**Screens update by polling** every few seconds; there are no WebSockets or server-sent events.

**Google Sheets is one-way.** `server/googleSheet.js` pushes changed rows to the Apps Script in `tools/google-apps-script/`, and only when `GOOGLE_SHEET_URL` is set. Sync errors go only to the server log.

**Printing** runs from the browser (`src/admin/printing/`), optionally through the Python service in `tools/print-service/` on the PC with the printer.

## Making changes

- **Database:** add the next numbered file to `server/migrations/`; never edit one that has run. SQLite can't alter a CHECK, so changing the allowed roles means rebuilding `users` (see `031_chassis_staff.sql`). Add a case to `tests/feature/migrations.test.js`, and update `docs/DATABASE.md`, which documents every table.
- **New role or department:** this crosses many files. Use commit `2e66d46` (Chassis) as the checklist: `ROLES` and `ROLE_ROUTES`, a migration, `src/admin/auth/roles.js`, `navItems.js`, `adminApp.jsx`, `loadingAreas.js`, the account and chat lists, and tests.
- **API changes:** the route table in `README.md` is the API contract, so keep it current.
- **Limits exist on both sides:** constants like `MAX_NAME` are repeated between pages and `server/api.js`, so change them together.
- **Deployment:** pushes to `master` deploy through a self-hosted runner running `deploy/update.sh`. Its two `sudo` commands must match `deploy/sudoers` word for word. Migrations run on restart. `docs/DEPLOY-UBUNTU.md` has the server setup.
- **Commit log:** after every commit, add an entry to `COMMITS.md` at the top of the list, with the hash, branch, date and what changed. It's a local record, ignored by git.
- **Comments:** the code uses plain lowercase comments explaining what something means for the shop and why; match that style.
