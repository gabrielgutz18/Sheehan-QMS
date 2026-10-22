# Sheehan Inc. — Ordering & Queue

React + Vite front end with two areas:

| Path       | Who        | What                                             |
| ---------- | ---------- | ------------------------------------------------ |
| `/`        | Display screen | The queue board: who's being served and who's next (`/queue` still opens it) |
| `/admin/*` | Staff only | Sign in: admins run everything; sales staff take orders in Customer order and serve customers from My counter |
| `/sales`   | Sales staff | Short address for My counter (`/admin/counter`); asks them to sign in first if needed |

The admin code is lazy-loaded into its own bundle, so the display screen never downloads it.

## Getting started

Needs Node.js 22.13 or newer (24 LTS recommended); the database is built into Node, so there's nothing else to install.

```bash
npm install
cp .env.example .env         # then set ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev                  # http://localhost:5173
```

`npm run dev` also serves the API at `/api` (`server/api.js`). Orders, the display video and staff sign-ins are saved in a SQLite database in `data/` (see [Database](#database)), so they're still there after a restart. To run the API on its own instead, set `DEV_API=off` in `.env`, run `npm start` in a second terminal, and Vite forwards `/api/*` to it on port 3000.

## Project structure

```
src/
  api/http.js              shared HTTP client (cookies, timeout, 401 handling)
  api/orderController.js   customer endpoints
  components/  pages/  style/  data/   customer side
  admin/
    adminApp.jsx           admin routes (mounted at /admin/*)
    api/                   authController.js, adminOrderController.js
    auth/                  authProvider.jsx, protectedRoute.jsx, authContext.js
    components/            adminLayout.jsx
    hooks/                 useOrders.js (auto-refreshes every 10s)
    pages/                 loginPage, dashboardPage, ordersPage
    data/  style/
server/
  api.js                   every /api route
  db.js                    opens the database and runs migrations
  migrations/              numbered .sql files that create and change the tables
  server.js                production server: the built site + the API (npm start)
  backup.js                copies the database and video (npm run backup)
  seed.js                  adds sample customers to today's queue (npm run seed)
  seedLoading.js           adds Loading staff accounts, one per crew (npm run seed:loading)
  snapshot.js              saves / loads a snapshot of the real data (npm run snapshot, seed:snapshot)
tests/
  feature/                 API tests, e.g. ticketLifecycle.test.js (npm test)
  support/testApp.js       starts the API on a fresh, throwaway database for each test
data/                      created on first start, not in git: queue.db, videos/, backups/
```

## Tests

```bash
npm test                                          # every test
npm test -- --test-name-pattern="restoring"       # only tests whose name matches
```

Like `php artisan test` in Laravel: each test starts the real API with its own empty database in a temp folder (the way `RefreshDatabase` works), sends requests the way the kiosk, display and counters do, and checks the responses and the tables (`assertStatus`, `assertDatabaseHas`, `assertDatabaseMissing`, `assertDatabaseCount`). Nothing touches `data/` or `.env`. It uses Node's built-in test runner, so there's nothing to install.

## Sample customers

```bash
npm run seed                 # 5 customers in today's queue
npm run seed -- 12           # 12 customers (up to 50)
```

Like `php artisan db:seed`: adds made-up customers (names, one or two types of order, invoice numbers, salesmen, payment statuses, loading teams, and now and then a pick-up day for a returning customer) through the same `POST /orders` Customer order uses, so they get real queue numbers and show on the display and every counter. It writes to the data folder in `.env`, so don't run it on the live server.

## Loading staff accounts

```bash
npm run seed:loading                                # loading_roofing1 (Roofings) and loading_steel1 (Steel), password loading123
npm run seed:loading -- pedro steel-crew-1 Steel    # one account: your own username, password and team
```

Adds accounts with the Loading role on the loading crews (from [`src/data/teams.js`](src/data/teams.js)) through the same `POST /admin/users` an admin uses on Accounts. With no arguments it adds one demo account per crew, so you can take a Roofings and Steel order on Customer order and watch it pass from one crew to the other: sign in as `loading_roofing1` in one browser and `loading_steel1` in another (or a private window). Each signs in to the Loading page and My account only, and sees only the orders that go to its own team; every admin and sales page and route is refused. Running it again leaves existing accounts alone. Don't use the default password on the live server.

## Taking the current data to another computer

```bash
npm run snapshot                          # on this computer: saves seeders/snapshot.json
npm run seed:snapshot                     # on the other one, after copying seeders/ over
npm run seed:snapshot -- --replace        # if that computer already has tickets or accounts (backed up first)
npm run seed:snapshot -- --keep-dates     # keep the real dates (the tickets land in History)
```

A seeder made from the real database: staff accounts (same passwords), profiles and photos, every ticket with its order or concern, who served it, points, and settings. Loading it moves the dates so the snapshot's day is today, so its queue shows as today's queue. Sign-ins aren't carried, and the built-in admin uses the other computer's `.env`.

`seeders/` is in `.gitignore` because it holds staff password hashes and customers' names: copy it yourself (USB stick or your own drive), not through git or chat, and delete it when you're done.

## Database

The app keeps its data in one SQLite file, `queue.db`, in the data folder (`data/` in the project, or `DATA_DIR` in `.env`). It's created on first start. **Full walkthrough with the code behind every table and relationship: [DATABASE.md](DATABASE.md).**

| Table            | Holds                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `orders`         | one row per ticket: day, number, name, type(s) of order, invoice number, salesman, payment status, team, pick-up day, status, remarks |
| `order_items`    | the lines of tickets taken before invoices (item, qty, roofing color) |
| `queue_counters` | last number given out each day, so a deleted ticket's number isn't reused |
| `settings`       | the display video                                                    |
| `sessions`       | staff sign-ins (hashed), so a restart doesn't sign everyone out      |

Queue numbers start again at 1 every day (by the server's clock). The queue, the display and the admin show today's tickets; earlier days stay in the database as history.

**Deleting and restoring:** Delete in Admin → Orders doesn't erase a ticket; it moves it to Admin → History. Restore there puts it back in today's queue as waiting: a ticket from today keeps its number, one from an earlier day gets today's next number (History still shows the number it had first).

**Changing the tables:** add the next numbered file to `server/migrations/`, e.g. `002_add_counter_column.sql`. On the next start, the server runs every file it hasn't run yet, in order, and records it in `schema_migrations`. Existing data is kept. Never edit a migration that has already run; add a new one instead.

**Backups:** `npm run backup` writes a dated copy of the database and the uploaded video to `backups/` in the data folder (or `BACKUP_DIR`), keeping the last 14. It's safe while the app is running. To restore, stop the app, copy a backup's `queue.db` and `videos/` into the data folder, and start it again.

**Moving to another computer:** stop the app and copy the whole data folder across.

## Staff accounts and roles

| Role  | Can |
| ----- | --- |
| Admin | Everything: dashboard and sales graph, Customer order, Orders (including delete), History, display video, announcer voice and volume, printer, Accounts |
| Sales | Customer order: take a customer's name, one or more types of order (e.g. Roofings and Steel), the invoice number, salesman, payment status (Vale, Paid, Terms), loading team and, for a customer who picks up the items on a later day, that day, and print their ticket with its queue number (R 01); edit it straight after, or later with Edit on Orders; My counter: serve the next customer, recall, mark done, hand over to loading (sends a customer whose order goes to the loading teams on to the Loading page; it counts as a customer served), send back to waiting, put a served customer who comes back in line as returning; Orders: set any ticket's status (waiting, now serving, done, returning customer) and call it, but not delete; see their own customers served (today / week / month / year / all time); History and restore; announcer volume |
| Loading | The loading crews, each account on one team (Roofings or Steel, set by an admin on Accounts). Loading page: the customers whose order goes to their team, in queue order; call one to the team's area (the display shows "Please proceed to Roofings", which can be changed before calling), mark the team's part done (the order is done once every team on it is; until then the display keeps the customer under Now Serving as "Please wait" for the next team to call), or send them back to waiting. A customer is in one place at a time: while another team or a sales counter is serving them, Call is grayed out with "Please wait until Roofings finishes." My account; no admin or sales rights. A customer only reaches the Loading page once a sales counter has served them and pressed Hand over to loading, and each account only gets the orders that go to its own team |

- **Accounts:** admins create them in Admin → Accounts. Passwords are stored hashed (scrypt). An account is switched off instead of deleted, so the customers it served stay on record. Switching an account off, or changing its password or role, signs it out everywhere.
- **The built-in admin:** the account in `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) is created at the first start and always keeps the `.env` password and the admin role, so you can't lock yourself out.
- **Points:** whoever calls a customer is serving them. When the ticket is marked Done, that person gets one point. Reopening the ticket the same visit takes the point back; a restored ticket keeps the points from its earlier visit.
- **Enforced by the backend:** sales and loading accounts get only the routes listed for their role in `ROLE_ROUTES` (`server/api.js`); every other `/admin` route answers `403`.

## Security model

The front end can hide screens, but **only the backend can protect data**. Anyone can open dev tools and call the API directly, so the backend must enforce every rule below.

What the front end already does:

- Never stores tokens in JavaScript. The session is an **httpOnly cookie** set by the backend, so injected scripts can't steal it.
- **One sign-in per browser tab:** each tab sends its own id (`X-Tab-Id`) and the backend names that tab's session cookie after it, so a new tab or window starts signed out instead of borrowing someone else's sign-in. The cookie also ends when the browser closes.
- Sends `X-Requested-With: XMLHttpRequest` on every request. The backend should reject `/admin` and `/auth` requests without it, which blocks cross-site form forgery.
- Sends the user back to the login page on any `401`, and signs out after **15 minutes idle** (for shared counter PCs).
- Shows a generic "Incorrect username or password" message, so attackers can't tell which usernames exist.
- Marks admin pages `noindex` so search engines skip them if the site is public.

What the backend must do:

- Hash passwords (bcrypt/argon2). Never store them in plain text.
- Set the session cookie with `HttpOnly; SameSite=Strict; Secure` (`Secure` once served over HTTPS).
- Check the session **and** `role === "admin"` on every `/api/admin/*` route.
- Rate-limit `POST /api/auth/login` and return `429` when exceeded.
- Validate request bodies (lengths, allowed `status` values) instead of trusting the client.
- If the API is on a different origin, allow only the site's origin in CORS, with `credentials: true`.

## Backend API contract

All paths are relative to `VITE_API_URL` (default `/api`).

| Method | Path                     | Auth  | Body / returns                                            |
| ------ | ------------------------ | ----- | --------------------------------------------------------- |
| POST   | `/orders`                | —     | `{ name, purpose: "Roofings, Steel", orders: [], invoiceNo, salesman, paymentStatus, team: "Roofings, Steel", pickupDate: "YYYY-MM-DD" \| null }` → saved order; `paymentStatus` must be in [`src/data/paymentStatus.js`](src/data/paymentStatus.js) and each `team` in [`src/data/teams.js`](src/data/teams.js) (or `""`); `orders` (`[{ item, qty }]`) can only be empty when there's an invoice number |
| PUT    | `/orders/:queueNum`      | —     | same body → saved order                                   |
| POST   | `/auth/login`            | —     | `{ username, password }` → `{ id, username, name, role }` + cookie |
| GET    | `/auth/me`               | staff | → `{ id, username, name, role }`, or `401`                |
| POST   | `/auth/logout`           | staff | clears the cookie                                         |
| GET    | `/admin/orders`          | staff | → today's (a loading account gets only the ones that go to its team) `[{ queueNum, name, purpose, orders, invoiceNo?, salesman?, paymentStatus?, team?, pickupDate?, status, servedBy?: { id, name, photo }, servedAt? }]` (`servedAt`: when it was marked Done) |
| GET    | `/admin/orders/:queueNum`| admin, sales | → one of today's tickets, as above (Edit on Orders opens it on Customer order) |
| POST   | `/admin/orders/:queueNum/call` | staff | `{ remarks }` → order, served by the caller         |
| POST   | `/admin/orders/:queueNum/handover` | admin, sales | `{ team? }` (`"Roofings, Steel"`; the order's own teams if left out) → order, back in line for the loading crews with `handedOver: { by: { id, name }, at }`, and a point for whoever served them; `409` unless the customer is being served and not handed over yet |
| PATCH  | `/admin/orders/:queueNum`| staff | `{ status: "pending" \| "serving" \| "returning" \| "done" }` → order (`returning`: back in line after being served) |
| DELETE | `/admin/orders/:queueNum`| admin | moves the ticket to History → `204`                       |
| GET    | `/admin/history`         | staff | `?search=&day=YYYY-MM-DD&deleted=1` → tickets from any day, with `id` |
| POST   | `/admin/history/:id/restore` | staff | → the ticket, back in today's queue as waiting        |
| GET    | `/admin/me/stats`        | staff | `?period=day\|week\|month\|year` → your customers served  |
| PUT    | `/admin/announcer/volume`| staff | `{ volume: 0–1 }` → announcer settings                    |
| GET    | `/admin/users`           | admin | → staff accounts with customers served                    |
| POST   | `/admin/users`           | admin | `{ username, name, password, role, team }` → new account; `team` is required for `loading` |
| PATCH  | `/admin/users/:id`       | admin | any of `{ name, role, team, password, disabled }` → account |
| POST   | `/admin/loading/:queueNum/call` | loading, admin | `{ remarks, team }` → order, serving at the team (`team` only from an admin; loading staff act for their own); `409` "Please wait until Roofings finishes." while someone else is serving the customer |
| POST   | `/admin/loading/:queueNum/done` | loading, admin | `{ team }` → order: back in line for the teams still to go, or done when it was the last |
| POST   | `/admin/loading/:queueNum/back` | loading, admin | `{ team }` → order, back to waiting |
| PATCH  | `/admin/me`              | staff | `{ firstName, middleName, surname, employeeId, department }` → your account (My account) |
| PUT    | `/admin/me/photo`        | staff | the image itself (JPEG, PNG or WebP, up to 2 MB) → your account |
| DELETE | `/admin/me/photo`        | staff | removes your photo → your account                         |
| GET    | `/photos/:id`            | staff | an account's profile photo                                |

"staff" means any signed-in account (admin or sales); "admin" routes answer `403` to sales accounts.

`:queueNum` always means today's ticket with that number.

## Deployment

### Windows server (recommended)

`npm start` serves the built site and the API from one port, so cookies and `/api` work with no extra setup.

1. Install [Node.js 24 LTS](https://nodejs.org) on the server.
2. Copy the project to the server (e.g. `C:\SheehanQueue\app`) and run `npm ci` there.
3. Create `.env` from `.env.example`: set the admin login, `DATA_DIR=C:\SheehanQueue\data` (outside the app folder, so updates never touch it) and `BACKUP_DIR` on another drive.
4. `npm run build`, then `npm start`. The first start creates the database. Open `http://<server-ip>:3000` from another PC to check.
5. Make it start with Windows: install it as a service with [WinSW](https://github.com/winsw/winsw) or [NSSM](https://nssm.cc), running `node --env-file=C:\SheehanQueue\app\.env C:\SheehanQueue\app\server\server.js`, set to restart on failure.
6. Allow the port through Windows Defender Firewall for the local network, and give the server a fixed IP so kiosks and displays can find it.
7. Back up daily: a Task Scheduler job that runs `npm run backup` in the app folder.

Orders are taken by staff in Admin → Customer order; there is no customer kiosk. On each staff PC with a receipt printer, start the print service with `--origin http://<server-ip>:3000` so the page is allowed to print (see `src/printing/script/printService.py`).

On the display PC, open the display with [`deploy/display-screen.cmd`](deploy/display-screen.cmd) (set `SERVER` at the top to the server's address). It starts Microsoft Edge (for its natural voices; Chrome if Edge isn't installed) with sound allowed, so calls are read out without anyone clicking the page first; in an ordinary tab the browser keeps the display silent after every start or reload until someone clicks it.

**Updating:** stop the service, replace the app files (not the data folder), `npm ci`, `npm run build`, start the service. New migrations run by themselves.

### Ubuntu server (e.g. a Hyper-V VM)

Step by step in **[DEPLOY-UBUNTU.md](DEPLOY-UBUNTU.md)**: the code is a `git clone` of this repo in `/opt/sheehan-queue`, the data lives in `/var/lib/sheehan-queue`, a systemd service ([`deploy/sheehan-queue.service`](deploy/sheehan-queue.service)) keeps it running, and `bash deploy/update.sh` pulls `master` from GitHub, rebuilds and restarts. Optionally, a self-hosted GitHub Actions runner on the server runs it on every merge to `master` (the *Deploy to the Ubuntu server* job in the CI workflow).

**Public / online:** same setup behind HTTPS. If the API lives on another domain, set `VITE_API_URL=https://api.example.com/api` before building.
