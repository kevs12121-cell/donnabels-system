# DONZ Flower Shop Management System

Internal operations software for Donz Flower Shop: point of sale, inventory, supplier purchasing, expenses, reports, staff and audit logs. It is an owner/cashier system only — there is no customer portal or online ordering.

## Stack

- **Frontend:** React 19, Vite, React Router, Axios, responsive CSS (phones, tablets, desktop)
- **Backend:** Node.js 22+, Express 5, JWT auth, bcrypt, centralized error handling
- **Database:** MySQL 8 (InnoDB, foreign keys, transactions with row locks)

```text
src/            React app (components, context, hooks, layouts, pages, services, utils)
server/         Express API (config, controllers, db, middleware, routes, services, utils)
database/       MySQL schema (01_schema.sql) and legacy seed SQL
```

In production Express serves both the API (`/api/*`) and the built React app from one origin.

## Roles

| Area | Owner | Cashier |
| --- | --- | --- |
| Dashboard | Shop-wide KPIs | "My sales today" + shop KPIs |
| Sales & POS | Sell, view history, **void sales** | Sell, view history, reprint receipts |
| Inventory | View, adjust, movement history | View, adjust, movement history |
| Purchases | Create, receive, **cancel** | Create, receive |
| Expenses | Record, **edit, void/restore** | Record |
| Products, categories, suppliers | **Create, edit, (de)activate** | View only |
| Reports, employees, user accounts, activity logs | Yes | — |
| Settings | Shop profile + own password | Own password (shop profile read-only) |

## Sample accounts

Seeded automatically into an empty database (change these before real use):

| Role | Username | Password |
| --- | --- | --- |
| Owner | `owner` | `password` |
| Cashier | `cashier` | `password` |
| Cashier | `lina` | `password` |

Set `OWNER_PASSWORD` / `CASHIER_PASSWORD` before the first boot to seed different passwords.

## Run locally

```bash
cp .env.example .env      # then fill in your MySQL credentials
npm install
npm run dev               # API on :5004, app on http://localhost:5177 (Vite proxies /api)
```

On startup the server creates any missing tables (`AUTO_MIGRATE`) and, **if the `users` table is empty**, seeds accounts, catalog, suppliers and ~90 days of realistic, stock-consistent history (`SEED_DEMO_DATA`).

To rebuild a database with fresh sample data (this **deletes all data**):

```bash
npm run db:reset -- --confirm
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/db` (Railway: `${{MySQL.MYSQL_URL}}`). Otherwise `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (Railway `MYSQL*` vars also work) |
| `JWT_SECRET` | dev value | **Required in production** — long random string |
| `TZ` | `Asia/Manila` | Business timezone for "today", reports and receipts |
| `AUTO_MIGRATE` | `true` | Create tables on boot |
| `SEED_DEMO_DATA` | `true` | Seed an empty database with sample history |
| `DEMO_MODE` | `false` | Keep simulating shop activity every hour so a demo never looks stale, and show demo-account shortcuts on the login page. **Never enable on a real shop database.** |
| `RESET_DATABASE_ON_BOOT` | — | Set to `yes-delete-everything` for **one** deploy to rebuild sample data, then remove it |
| `CLIENT_ORIGIN` | `http://localhost:5177` | Comma-separated origins allowed by CORS (only needed if the app is served from another domain) |

## Deploy on Railway

1. Create a project with a **MySQL** database and a service from this repository.
2. On the app service set `DATABASE_URL=${{MySQL.MYSQL_URL}}`, `JWT_SECRET=<random>`, `NODE_ENV=production`, `TZ=Asia/Manila` (and `DEMO_MODE=true` for a demo).
3. Railway builds with `npm run build` and starts with `npm start`; tables and sample data are created on first boot.
4. Generate a public domain under the service's *Networking* settings.

## Checks

```bash
npm run lint
npm run build
```

Health endpoints: `GET /api/health` and `GET /api/health/database`.

## API overview

- Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/change-password`
- Dashboard: `GET /api/dashboard/summary`, `GET /api/dashboard/details`
- Master data: `/api/products`, `/api/categories`, `/api/suppliers`, `/api/employees` (GET list/one, POST, PUT `/:id`, PATCH `/:id/status`)
- Inventory: `GET /api/inventory`, `GET /api/inventory/low-stock`, `GET /api/inventory/:productId`, `POST /api/inventory/adjust`
- Purchases: `GET/POST /api/purchases`, `GET /api/purchases/:id`, `POST /api/purchases/:id/receive`, `POST /api/purchases/:id/cancel`
- Sales: `GET /api/sales` (filters + pagination), `GET /api/sales/:id`, `POST /api/sales`, `POST /api/sales/:id/void`
- Expenses: `GET/POST /api/expenses`, `PUT /api/expenses/:id`, `PATCH /api/expenses/:id/status`
- Reports (owner): `/api/reports/sales`, `/inventory`, `/inventory-movements`, `/purchases`, `/expenses`, `/profit-summary`
- Admin (owner): `/api/admin/users`, `/api/admin/activity-logs`; settings at `/api/admin/settings`

Sales, receiving, adjustments and voids run in SQL transactions with row locks; password hashes are never returned; deactivating a user or employee takes effect on their next request.
