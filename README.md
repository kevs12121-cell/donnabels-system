# DONZ Flower Shop Management System

Internal operations software for Donz Flower Shop. This is an owner/employee management system only; it contains no customer portal, shopping cart, online ordering, or customer payment flow.

## Part 1 Foundation

Part 1 established the React/Vite frontend, Express REST API, MySQL schema, JWT authentication, role authorization, activity logging foundation, dashboard shell, and protected module routes. Part 2 added the daily operations layer: product and supplier management, inventory adjustments, purchases and receiving, internal POS sales, payments, sale voiding, and expenses. Part 3 adds owner reporting, dashboard analytics, CSV/print actions, employee and user administration, activity-log viewing, settings, and password changes.

## Stack

- Frontend: React 19, Vite, React Router, Axios, responsive CSS
- Backend: Node.js, Express, JWT, bcryptjs, centralized error handling
- Database: MySQL 8.x with InnoDB and foreign keys

## Structure

```text
src/            React frontend (context, layouts, pages, routes, services)
server/         Express API (config, controllers, middleware, routes, services)
database/       MySQL schema and development seed SQL
```

## Environment

Copy `.env.example` to `.env` and set local MySQL values:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=donnasFlowerShop
PORT=5004
JWT_SECRET=replace_with_a_long_local_secret
CLIENT_ORIGIN=http://localhost:5177
```

Production secrets must never be committed.

## Install and Run

```bash
npm install
npm run dev
```

`npm run dev` starts both services together.

Frontend: `http://localhost:5177`  
API: `http://localhost:5004/api`

Use `npm run server:dev` for automatic backend restarts.

## Initialize MySQL

Run the files in order against MySQL 8.x:

```bash
mysql -u root -p < database/01_schema.sql
mysql -u root -p donnasFlowerShop < database/02_seed_data.sql
```

The schema creates the isolated `donnasFlowerShop` database and these tables: `employees`, `users`, `categories`, `products`, `suppliers`, `inventory_transactions`, `purchases`, `purchase_items`, `sales`, `sale_items`, `payments`, `expenses`, `activity_logs`, and `settings`.

## Development Accounts

The seed uses a bcrypt hash for development password `password`:

- Owner: `owner` / `password`
- Employee: `mara` / `password`
- Employee: `lina` / `password`

Change or remove these development accounts before deployment.

## API Foundation

- `GET /api/health`
- `GET /api/health/database`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/dashboard/summary`
- CRUD foundation for `/api/products`, `/api/categories`, `/api/suppliers`, and `/api/employees`
- `GET /api/inventory`, `GET /api/inventory/low-stock`, `GET /api/inventory/:productId`, `POST /api/inventory/adjust`
- `GET /api/purchases`, `GET /api/purchases/:id`, `POST /api/purchases`, `POST /api/purchases/:id/receive`, `POST /api/purchases/:id/cancel`
- `GET /api/sales`, `GET /api/sales/:id`, `POST /api/sales`, `POST /api/sales/:id/void`
- `GET /api/expenses`, `POST /api/expenses`, `PUT /api/expenses/:id`, `PATCH /api/expenses/:id/status`
- `GET /api/dashboard/details`
- Owner-only reports: `/api/reports/sales`, `/api/reports/inventory`, `/api/reports/inventory-movements`, `/api/reports/purchases`, `/api/reports/expenses`, `/api/reports/profit-summary`
- Owner-only administration: `/api/admin/users`, `/api/admin/activity-logs`; settings at `/api/admin/settings`
- `POST /api/auth/change-password`
- Status updates at `PATCH /api/{resource}/:id/status`

Resource endpoints require a JWT. Product, category, supplier, and employee writes require owner authorization; operational sales, purchases, and adjustments are available to owner and employee roles; purchase cancellation, sale voiding, and expense editing are owner-only. Password hashes are never returned. Sales, purchase receiving, stock adjustments, and sale voiding use SQL transactions and row locks.

## Checks

```bash
npm run build
npm run lint
```

Database health, authentication, and transaction checks require a running MySQL instance configured through `.env`. MySQL live integration was not available in this environment: the `mysql` client was not installed, so schema execution and end-to-end database checks remain to be run locally.
