# Sheehan Inc. — Ordering & Queue

React + Vite front end with two areas:

| Path       | Who        | What                                             |
| ---------- | ---------- | ------------------------------------------------ |
| `/`        | Customers  | Fill in an order and get a queue number (SHN 01) |
| `/admin/*` | Staff only | Sign in, see the queue, update or delete orders  |

The admin code is lazy-loaded into its own bundle, so the customer page never downloads it.

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — defaults to /api
npm run dev                  # http://localhost:5173
```

In development, `npm run dev` also serves an in-memory test API at `/api` (`server/api.js`), with the admin login taken from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`. Orders reset when the dev server restarts. Once a real backend exists, set `DEV_API=off` in `.env` and Vite forwards `/api/*` to `http://localhost:3000` instead (see `vite.config.js`).

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
```

## Security model

The front end can hide screens, but **only the backend can protect data**. Anyone can open dev tools and call the API directly, so the backend must enforce every rule below.

What the front end already does:

- Never stores tokens in JavaScript. The session is an **httpOnly cookie** set by the backend, so injected scripts can't steal it.
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
| POST   | `/orders`                | —     | `{ name, purpose, orders: [{ item, qty }] }` → saved order |
| PUT    | `/orders/:queueNum`      | —     | same body → saved order                                   |
| POST   | `/auth/login`            | —     | `{ username, password }` → `{ id, name, role }` + cookie  |
| GET    | `/auth/me`               | admin | → `{ id, name, role }`, or `401`                          |
| POST   | `/auth/logout`           | admin | clears the cookie                                         |
| GET    | `/admin/orders`          | admin | → `[{ queueNum, name, purpose, orders, status }]`         |
| PATCH  | `/admin/orders/:queueNum`| admin | `{ status: "pending" \| "serving" \| "done" }` → order    |
| DELETE | `/admin/orders/:queueNum`| admin | → `204`                                                   |

## Deployment

```bash
npm run build      # outputs dist/
```

**Local company server (recommended):** serve `dist/` and the API from the same machine, so cookies and `/api` work with no CORS setup. The web server must send unknown paths to `index.html` so links like `/admin/orders` load. For example, with nginx:

```nginx
location /api/ { proxy_pass http://127.0.0.1:3000; }
location /     { try_files $uri /index.html; }
```

**Public / online:** same setup behind HTTPS. If the API lives on another domain, set `VITE_API_URL=https://api.example.com/api` before building.

**GitHub Pages:** the CI workflow builds with the repo sub-path and copies `index.html` to `404.html` so deep links work. Pages only hosts static files, so the admin still needs a backend reachable from the browser.
