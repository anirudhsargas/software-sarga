# Sarga Prints MIS — REST API Reference

This document catalogs the Express.js HTTP API served by the Sarga backend. It is for staff/backend developers who build against `server/routes/*` and for anyone debugging network calls. See [ARCHITECTURE.md](ARCHITECTURE.md) for routing topology and the data flow between the client, backend, and Aiven MySQL.

**Last updated:** 2026-08-04

> [!NOTE]
> All internal routes return JSON. Public `/api/website` and `/api/checkout` routes require no token. Every other `/api` route requires a Bearer JWT unless noted. This reference is a living catalog — new routes are registered in `server/index.js` via `registerRoute`.

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Global Middleware & Pagination](#2-global-middleware--pagination)
3. [Auth & Staff](#3-auth--staff)
4. [Jobs & Production](#4-jobs--production)
5. [Customers & Payments](#5-customers--payments)
6. [Inventory & Stock](#6-inventory--stock)
7. [Vendor & Procurement](#7-vendor--procurement)
8. [Finance, Expenses & Reports](#8-finance-expenses--reports)
9. [Three Books & Machines](#9-three-books--machines)
10. [AI Features](#10-ai-features)
11. [Public Website & Checkout](#11-public-website--checkout)
12. [Admin & CMS](#12-admin--cms)
13. [System & Health](#13-system--health)

---

## 1. Authentication & Authorization

Defined in `server/middleware/auth.js`. Two token families exist: **staff** JWTs and **customer** JWTs.

- `authenticateToken` — verifies `Authorization: Bearer <token>` against `JWT_SECRET`/`JWT_SECRET_PREVIOUS`, checks the session is not revoked (in-memory blacklist then `sarga_user_sessions`), sets `req.user`, and auto-writes an audit entry for `POST/PUT/PATCH/DELETE`. Applied to almost all internal `/api` routes.
- `authenticate` — verifies the token and then re-fetches the live `sarga_staff` row by `decoded.id`. Used by the three-books and machines systems. Implements the **Front Office branch lock**:
  - `GET/DELETE/HEAD`: overrides `req.query.branch_id` with the user's `branch_id`.
  - `POST/PUT/PATCH`: rejects with `403` if a provided `req.body.branch_id` mismatches, and forces it to the assigned branch.
- `authorizeRoles(...roles)` / `requireRole(...roles)` — pure role checks returning `403`. Canonical roles via `normalizeRole`: `Admin`, `Front Office`, `Designer`, `Printer`, `Accountant`, `Other Staff`. `Customer` is handled by `authenticateCustomer` for `/api/website` routes.

### Role access model

| Role | Typical access (varies per route) | Branch lock |
|---|---|---|
| `Admin` | All modules, destructive ops | No |
| `Accountant` | Finance, verification, approvals | No |
| `Front Office` | Jobs, customers, inventory, daily report | Yes (via `authenticate`) |
| `Designer` | Design workspace, proofs, jobs | No |
| `Printer` | Machines, readings, work entries | No |
| `Other Staff` | Staff portal, own profile | No |

### Login example

`POST /api/auth/login` — body `{ user_id, password, [countryCode] }`. Staff login lives here; there is **no** `POST /api/staff/login` endpoint.

```http
POST /api/auth/login
Content-Type: application/json

{
  "user_id": "9999999999",
  "password": "secret"
}
```

```json
{
  "token": "<JWT, expires in 12h>",
  "user": {
    "id": 1,
    "user_id": "9999999999",
    "role": "Admin",
    "name": "Anirudh",
    "branch_id": 1,
    "branch_short_name": "Main",
    "image_url": null,
    "settings": {},
    "is_first_login": false
  }
}
```

Send the token on all authenticated calls:

```
Authorization: Bearer <token>
```

---

## 2. Global Middleware & Pagination

Configured in `server/index.js`, in this order: CORS → helmet → compression → body parsers → request logger → rate limiters → routes → `notFound` → `errorHandler`.

### Body size limits

| Content type | Limit | Notes |
|---|---|---|
| `express.json` (default) | `1mb` | Applied globally |
| `/api/website/designs` JSON | `50mb` | For large base64 designs/image uploads |

### Rate limits (`express-rate-limit`)

| Limiter | Window | Max (prod / dev) | Applies to |
|---|---|---|---|
| `generalLimiter` | 5 min | 300 / 2000 | All `/api` |
| `writeLimiter` | 5 min | 120 / 600 | `POST`, `PUT`, `DELETE` |
| `uploadLimiter` | 5 min | 20 / 120 | `POST` paths containing `/upload` or `/image` |
| `versionLimiter` | 1 min | 1 | `GET /api/version` |

Skipped for `/api/company-settings`, `/api/i18n/*`, `/api/health`, `/api/version`, `/api/server-time`, and all `OPTIONS`.

### Pagination envelope (shared `paginate` helper)

```json
{
  "data": [],
  "total": 0,
  "page": 1,
  "limit": 20,
  "totalPages": 0,
  "hasNext": false,
  "hasPrev": false
}
```

Query params: `page` (1-based), `limit` (max 100, default 20). Some list endpoints support `no_pagination=true`.

### Idempotency

Payment and customer-payment creation require an `Idempotency-Key` header. A replay returns `200` with `duplicate: true` instead of creating a second record.

---

## 3. Auth & Staff

`server/routes/auth.js` (mounted `/api`) and `server/routes/staff.js` (mounted `/api/staff`).

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | none | Staff login |
| POST | `/api/auth/change-password` | auth | Validated `changePasswordSchema` |
| GET | `/api/staff/me` | auth | Current user |
| PUT | `/api/staff/me` | auth | Update profile image (`multipart`, `image`) |
| PATCH | `/api/staff/settings` | auth | Update UI settings |
| POST | `/api/auth/logout` | auth | Revokes session |
| POST | `/api/auth/switch-branch` | auth | Switch active branch |
| GET | `/api/staff` | auth | List staff |
| POST | `/api/staff` | Admin | Create staff (`multipart`) |
| PUT | `/api/staff/:id` | auth | Update staff + salary |
| DELETE | `/api/staff/:id` | Admin | Delete staff |
| DELETE | `/api/staff/:id/image` | auth | Remove avatar |
| GET/POST/PUT/DELETE | `/api/staff/:id/branches[...]` | Admin | Branch assignments |
| GET | `/api/staff/my-branches` | auth | User branches |
| PUT | `/api/staff/:id/reset-password` | Admin | Reset password |

---

## 4. Jobs & Production

`server/routes/jobs.js` (mounted `/api`), `server/routes/quotes.js`, `server/routes/jobPriority.js`, `server/routes/productionTracker.js`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/jobs` | auth | Paginated job list |
| POST | `/api/jobs` | auth | Create job |
| POST | `/api/jobs/bulk` | auth | Bulk create |
| GET | `/api/jobs/:id` | auth | Job detail bundle (see example below) |
| PUT | `/api/jobs/:id` | auth | Update job / status |
| DELETE | `/api/jobs/:id` | Admin | Delete job |
| POST | `/api/jobs/:id/repeat` | auth | Repeat/reorder job |
| GET | `/api/customers/:id/jobs` | auth | Jobs for a customer |
| GET | `/api/jobs/offset-pending` | auth | Offset jobs awaiting plates |
| GET | `/api/product-hierarchy` | auth | Cached product tree |
| POST | `/api/product-hierarchy/refresh` | Admin/Accountant | Rebuild cache |
| GET/POST/PUT/DELETE | `/api/jobs/:id/assignments` + `/api/jobs/:id/assign[...]` | auth | Staff assignments |
| GET/POST/DELETE | `/api/jobs/:id/proofs[...]` | auth | Upload/review/delete proofs |
| GET/POST/DELETE | `/api/jobs/:id/matter[...]` | auth | Job matter (artwork) |
| GET/POST/DELETE | `/api/jobs/:id/paper-logs[...]` | auth | Paper usage logs |
| POST | `/api/jobs/:id/consume-paper` | auth | Deduct paper |
| GET/POST/PUT | `/api/quotes` + `/api/quotes/:id` | auth | Quotations |
| POST | `/api/quotes/:id/convert` | auth | Convert quote to job |
| POST | `/api/quotes/:id/send-email` | auth | Email quote |
| GET | `/api/job-priority/queue` | auth | Priority queue |
| GET | `/api/job-priority/stats` | auth | Priority stats |
| POST | `/api/job-priority/override` | auth | Override priority |
| GET | `/api/production-tracker` | auth | Production progress |

### `GET /api/jobs/:id` response (bundle)

```json
{
  "job": {
    "id": 1,
    "status": "Processing",
    "customer_name": "Walk-in",
    "customer_mobile": "9999999999",
    "branch_name": "Perambra",
    "product_name": "ID Cards",
    "calculation_type": "per_piece",
    "...": ""
  },
  "assignments": [
    { "job_id": 1, "role": "Designer", "status": "in_progress", "staff_name": "...", "staff_role": "Designer" }
  ],
  "payments": [],
  "statusHistory": [
    { "status": "Pending", "staff_name": "..." }
  ]
}
```

---

## 5. Customers & Payments

`server/routes/customers.js`, `server/routes/customerPayments.js`, `server/routes/payments.js`, `server/routes/customerDesigns.js`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/customers` | auth + role | Cached list |
| GET | `/api/customers/:id` | auth + role | Customer detail |
| POST | `/api/customers` | auth + role | Create customer |
| PUT | `/api/customers/:id` | auth + role | Update customer |
| DELETE | `/api/customers/:id` | Admin/Accountant | Delete customer |
| GET | `/api/customers/:id/dashboard` | auth + role | Dashboard aggregate |
| GET | `/api/customers/:id/designs` | auth | Design library |
| POST | `/api/customers/:id/designs` | auth | Upload design |
| DELETE | `/api/customers/:id/designs/:designId` | auth | Delete design |
| GET | `/api/customer-payments` | auth + role | Payments list |
| POST | `/api/customer-payments` | auth + role | Create payment (+ order/job) — see example |
| POST | `/api/customer-payments/refund` | auth + role | Refund |
| PATCH | `/api/customer-payments/:id/verify` | Admin/Accountant | Verify payment |
| GET | `/api/customer-payments/pending-verification` | Admin/Accountant | Pending queue |
| GET | `/api/customer-payments/verification-stats` | Admin/Accountant | Stats |
| GET | `/api/customer-payments/debug-logs` | none | Public debug |
| GET | `/api/payments` | auth | Ledger payments |
| POST | `/api/payments` | auth | Create payment (Idempotency-Key) |
| DELETE | `/api/payments/:id` | Admin/Accountant | Delete payment |
| GET/POST/PUT/DELETE | `/api/payment-methods` | auth / Admin | Payment methods |

### `POST /api/customer-payments` (201)

```http
POST /api/customer-payments
Authorization: Bearer <token>
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "customer_id": 3,
  "total_amount": 1200,
  "bill_amount": 1200,
  "advance_paid": 1200,
  "payment_method": "UPI",
  "net_amount": 1200,
  "sgst_amount": 0,
  "cgst_amount": 0,
  "book_type": "offset"
}
```

```json
{
  "id": 123,
  "invoice_number": "INV-2026-0123",
  "balance_amount": 0,
  "message": "Customer payment recorded"
}
```

---

## 6. Inventory & Stock

`server/routes/inventory.js`, `server/routes/paperInventory.js` (mounted `/api/paperInventory`), `server/routes/consumablesInventory.js`, `server/routes/stockRequests.js`, `server/routes/stockVerification.js`, `server/routes/cuttingTransfers.js`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/inventory` | auth | Inventory list (branches, filters) |
| GET | `/api/inventory/:id` | auth | Item detail |
| POST | `/api/inventory` | Admin/Accountant/FO | Create item |
| PUT | `/api/inventory/:id` | Admin/Accountant/FO | Update item |
| DELETE | `/api/inventory/:id` | Admin/Accountant/FO | Delete item |
| POST | `/api/inventory/:id/consume` | Admin/Accountant/FO | Consume stock |
| POST | `/api/inventory/:id/restock` | Admin/Accountant/FO | Restock |
| POST | `/api/inventory/transfer` | Admin/Accountant/FO | Inter-branch transfer |
| GET | `/api/inventory/by-sku/:sku` | auth | Lookup by SKU |
| GET | `/api/inventory/:id/branch-availability` | auth | Availability per branch |
| POST | `/api/inventory/generate-labels` | Admin/Accountant/FO | Generate labels |
| POST | `/api/inventory/extract-bill` | Admin/Accountant/FO | OCR bill extract |
| GET | `/api/paperInventory/stock` | auth | Paper stock |
| POST | `/api/paperInventory/inward` | auth | Paper inward |
| POST | `/api/paperInventory/outward` | auth | Paper outward |
| POST | `/api/paperInventory/transfer` | auth | Paper transfer |
| GET | `/api/paperInventory/movements` | auth | Movements |
| GET | `/api/paperInventory/alerts` | auth | Low-stock alerts |
| CRUD | `/api/consumablesInventory` | auth | Consumables |
| GET/POST/PUT | `/api/stock-requests` | auth | Stock requests |
| PUT | `/api/stock-requests/:id/approve` | auth | Approval |
| PUT | `/api/stock-requests/:id/send` / `receive` | auth | Transfers |
| GET/POST | `/api/stock-verification` | Accountant/Admin | Periodic audits |
| CRUD | `/api/cutting-jobs`, `/api/stock-transfers` | auth | Cutting & transfers |

> [!NOTE]
> Front Office sees inventory without cost-price columns on the client; cost-visible columns are gated on the client by `auth.getUser()?.role`. See [PAGES.md](PAGES.md#inventory--stock).

---

## 7. Vendor & Procurement

`server/routes/vendors.js` (mounted `/api`).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/vendors` | auth | List |
| POST | `/api/vendors` | Admin/Accountant/FO | Create |
| PUT | `/api/vendors/:id` | Admin/Accountant | Update |
| DELETE | `/api/vendors/:id` | Admin | Delete |
| GET | `/api/vendors/:id` | auth | Detail |
| GET | `/api/vendors/:id/statement` | auth | Reconciliation statement |
| GET | `/api/vendors/:id/ledger` / `ledger/pdf` | auth | Ledger + PDF |
| GET | `/api/vendors/:id/balance` | auth | Balance |
| GET | `/api/vendors/dashboard/stats` | auth | Analytics |
| GET | `/api/vendors/:id/spend-trend` | auth | Trend chart |
| CRUD | `/api/vendor-invoices` | auth / role | Vendor bills |
| CRUD | `/api/vendor-payments` | auth / role | Payments |
| POST | `/api/vendor-invoices/:id/upload-bill` | auth + role | Upload (multipart) |
| POST | `/api/vendors/:id/upload-statement` | Admin/Accountant | Upload statement |
| POST | `/api/vendor-statements/:id/reconcile` | Admin/Accountant | Reconcile |
| POST | `/api/vendors/:id/recalculate` | auth | Recompute balances |

See [VENDOR_FEATURES_REPORT.md](VENDOR_FEATURES_REPORT.md) for the vendor ledger reconciliation feature deep-dive.

---

## 8. Finance, Expenses & Reports

`server/routes/finance.js`, `server/routes/expenses.js`, `server/routes/expenses-extended.js`, `server/routes/accounts.js`, `server/routes/invoiceFeatures.js` (mounted `/api`), `server/routes/billExtraction.js`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/expense-dashboard` | Admin/Accountant/FO | Expense KPIs |
| GET | `/api/expense-categories` | Admin/Accountant/FO | Categories |
| CRUD | `/api/rent-locations` | Admin/Accountant | Rent trackers |
| CRUD | `/api/expense-vendors` | Admin/Accountant | Expense vendors |
| GET/POST/PUT | `/api/vendor-requests` | Admin/Accountant/FO | Vendor/expense requests |
| PUT | `/api/vendor-requests/:id/review` | Admin/Accountant | Review |
| CRUD | `/api/payment-suggestions` | Admin/Accountant | Recurring suggestions |
| GET | `/api/accounts/gst-summary` | Admin/Accountant | GST summary |
| GET | `/api/accounts/sales-register` | Admin/Accountant | Sales register |
| GET | `/api/accounts/purchase-register` | Admin/Accountant | Purchase register |
| GET | `/api/accounts/gst-report` | Admin/Accountant | GST report |
| GET/PUT | `/api/company-settings` | auth / Admin | Company invoice config |
| CRUD | `/api/tax-settings` | auth / Admin | GST rates |
| CRUD | `/api/payment-modes` | auth / Admin | Ledger payment modes |
| CRUD | `/api/recurring-invoices` | Admin/Accountant | B2B recurring invoices |
| POST | `/api/recurring-invoices/process` | Admin/Accountant | Generate |
| POST | `/api/bills-documents/extract-details` | auth + role | OCR extraction |
| POST | `/api/bills-documents/upload` | auth + role | Upload bill |

### GST report example

```http
GET /api/accounts/gst-report?from=2026-08-01&to=2026-08-31
Authorization: Bearer <token>
```

```json
{
  "summary": { "outward_supply": 1200000, "inward_supply": 400000, "net_gst": 144000 },
  "rows": []
}
```

> [!NOTE]
> The exact response keys above are inferred; verify against `server/routes/accounts.js` before relying on the shape. See [ARCHITECTURE.md](ARCHITECTURE.md#finance--expenses) for the underlying tables.

---

## 9. Three Books & Machines

`server/routes/dailyReportUnified.js` (mounted `/api/daily-report`), `server/routes/machines.js` (mounted `/api/machines`), `server/routes/internalTransfers.js`, `server/routes/internalTransactions.js`, `server/routes/internalBooks.js`. These use `auth.authenticate` (DB-user lookup + Front Office branch lock).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET/PUT | `/api/daily-report/opening-balance` | auth | Opening balance |
| GET | `/api/daily-report/laser-live` | auth | Laser machine live |
| GET | `/api/daily-report/offset-live` | auth | Offset live |
| GET | `/api/daily-report/previous-closing` | auth | Prior closing |
| GET | `/api/daily-report/live-counts` | auth | Live counts |
| GET/POST/DELETE | `/api/daily-report/credits` | auth | Credit ledger |
| POST | `/api/daily-report/change-request` | auth | Override request |
| GET | `/api/daily-report/change-requests` | auth | List requests |
| POST | `/api/daily-report/change-requests/:id/review` | auth | Review |
| GET | `/api/machines` | auth | Machine list |
| POST/PUT/DELETE | `/api/machines` | Admin | CRUD |
| GET | `/api/machines/:id/readings` | auth | Meter readings |
| POST | `/api/machines/:id/readings` | auth | Add reading |
| POST | `/api/machines/:id/work` | auth | Work entry |
| DELETE | `/api/machines/:id/work/:entryId` | auth | Delete work |
| POST | `/api/machines/:id/assign-staff` | Admin/Accountant | Assign staff |
| GET | `/api/machines/:id/mpr-meter-data` | auth | MPR SNMP/HTTP data |
| POST | `/api/machines/:id/verify-count` | auth | Verify count |
| GET | `/api/machines/:id/production-summary` | auth | Summary |
| CRUD | `/api/internal-transfers` | auth | Internal transfers |
| CRUD | `/api/internal-transactions` | auth | Internal transactions |
| CRUD | `/api/admin/internal-books` | auth | Book management |

---

## 10. AI Features

`server/routes/aiMonitoring.js` (mounted `/api/ai/monitoring`), `server/routes/aiSearch.js` + `designCheck.js` (mounted `/api/ai`), `server/routes/paperLayout.js` (mounted `/api/ai/paper-layout`). ML calls proxy to the Flask service via `ML_SERVICE_URL` (see [ARCHITECTURE.md](ARCHITECTURE.md#33-ml-microservice-call-flow)).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/ai/monitoring/dashboard` | auth | Monitoring KPIs |
| GET | `/api/ai/monitoring/alerts` | auth | Anomaly alerts |
| POST | `/api/ai/monitoring/analyze` | auth | Trigger analysis |
| PUT | `/api/ai/monitoring/alerts/:id/resolve` | auth | Resolve alert |
| POST | `/api/ai/paper-layout/calculate` | auth | Layout calculation |
| POST | `/api/ai/paper-layout/compare` | auth | Compare layouts |
| POST | `/api/design-check/analyze` | auth | Preflight design check |

> [!NOTE]
> Additional AI routes (forecast, stock planning, order predictions, expense categorization) were referenced in [PAGES.md](PAGES.md#reports--analytics) but were not fully enumerated during this pass — confirm against `server/routes/` before integration.

---

## 11. Public Website & Checkout

`server/routes/website.js` (mounted `/api/website`), `server/routes/websiteDesigns.js`, `server/routes/checkout.js` (mounted `/api`), `server/routes/websiteReviews.js`, `server/routes/websiteInquiries.js`. These are public; interactive-only rate limits apply.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/website/products` | none | Product catalog |
| GET | `/api/website/categories` | none | Categories |
| GET | `/api/website/services` | none | Services |
| GET | `/api/website/branches` | none | Branches |
| GET | `/api/website/stats` | none | Public stats |
| GET | `/api/website/track/:jobCode` | none | Order tracking |
| POST | `/api/website/inquiry` | inquiryLimiter | Contact form |
| POST | `/api/website/customer/login` | customerAuthLimiter | Customer login |
| POST | `/api/website/customer/google-signin` | customerAuthLimiter | Google sign-in |
| POST | `/api/website/customer/send-otp` | inquiryLimiter | Email OTP |
| POST | `/api/website/customer/verify-otp` | none | Verify OTP |
| POST | `/api/website/customer/register` | customerAuthLimiter | Register |
| GET | `/api/website/job/:id` | authenticateCustomer | Job detail |
| POST | `/api/website/jobs/:id/proofs/:proofId/review-customer` | authenticateCustomer | Proof review |
| GET | `/api/website/invoices/:invoiceId/download` | authenticateCustomer | Invoice PDF |
| POST | `/api/website/webhook/sync` | none | Sync webhook |
| POST | `/api/checkout/create-order` | none | Create order (see example) |
| POST | `/api/checkout/verify-payment` | none | Verify Razorpay signature |
| CRUD | `/api/checkout/cart[...]` | none | Cart using `x-sarga-uuid` |
| POST | `/api/checkout/coupon/apply` | none | Apply coupon |
| GET | `/api/checkout/order/:orderNumber` | none | Order status |

### `POST /api/checkout/create-order` (201)

```json
{
  "cart_id": 9,
  "payment_method": "full",
  "customer_name": "Rahul",
  "customer_phone": "9999999999",
  "customer_email": "rahul@example.com"
}
```

```json
{
  "order_id": 1,
  "order_number": "SRG-001",
  "amount": 1500,
  "advance_amount": 1500,
  "payment_type": "full",
  "razorpay_order_id": "order_abc123",
  "razorpay_key_id": "rzp_key_xxx",
  "razorpay_amount": 150000,
  "message": "Order created successfully"
}
```

### `POST /api/checkout/verify-payment`

Body `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, [method] }`. The backend verifies the HMAC-SHA256 signature; see [ARCHITECTURE.md](ARCHITECTURE.md#public-web-checkout-flow-razorpay).

```json
{ "verified": true, "message": "Payment verified successfully" }
```

---

## 12. Admin & CMS

`server/routes/blog.js` (mounted `/api/blog`), `server/routes/portfolio.js`, `server/routes/promotions.js`, `server/routes/translations.js`, `server/routes/artworkUploads.js`, `server/routes/pickupSlots.js`, `server/routes/deliveryEstimates.js`, `server/routes/cctvCameras.js` + `cctvAttendance.js` (mounted `/api/cctv`), `server/routes/premiumFeatures.js`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| CRUD | `/api/blog/admin/posts`, `/authors`, `/analytics` | Admin/FO/Designer | Blog CMS |
| GET | `/api/blog/posts/:slug` | public | Public post |
| CRUD | `/api/portfolio` + upload | Admin | Portfolio |
| CRUD | `/api/promotions` | Admin | Promotions |
| CRUD | `/api/translations` | Admin | i18n overrides |
| CRUD | `/api/artwork/list`, `:id` | Admin | Artwork manager |
| CRUD | `/api/pickup/bookings` | Admin | Pickup bookings |
| CRUD | `/api/delivery/rules` | Admin | Delivery rules |
| CRUD | `/api/cctv/cameras` | Admin | Cameras |
| CRUD | `/api/cctv/face-data` | Admin | Biometric data |
| POST | `/api/cctv/attendance` | Admin/Accountant | Match attendance |
| GET | `/api/cctv/attendance/summary` | auth | Summary |

---

## 13. System & Health

Defined inline in `server/index.js`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | none | Liveness + uptime |
| GET | `/api/ping` | none | DB connectivity (`SELECT 1`) |
| GET | `/api/version` | none | Version + critical flag |
| GET | `/api/server-time` | auth | Tamper-proof server time |
| GET | `/` | none | Service banner |

```http
GET /api/health
```

```json
{ "status": "ok", "uptime": 145.8 }
```

```http
GET /api/ping
```

```json
{ "status": "ok", "db": "connected", "time": "2026-08-04T00:00:00.000Z" }
```

`/api/ping` returns `503 { status: "error", db: "disconnected" }` when the DB pool is unreachable. Endpoints under `/api/backup`, `/api/vendors`, `/api/vendor-payments`, `/api/vendor-invoices`, `/api/inventory`, `/api/products`, `/api/paperInventory`, `/api/consumablesInventory`, `/api/cutting-jobs`, and `/api/stock-transfers` are guarded by the `migrationGuard`, returning `503` while schema migrations are still running.

---

## Appendix: Build & Test Commands

- Backend tests: `cd server && npm test` (Jest + Supertest, mocked DB).
- Full CI: see [CI-CD.md](CI-CD.md) and `.github/workflows/test.yml`.
- See [TEST_PLAN.md](TEST_PLAN.md) for per-phase test coverage.

---

## Last Updated

**Timestamp:** 2026-08-04 — Initial API reference generated from `server/index.js` route registration and `server/routes/*`.