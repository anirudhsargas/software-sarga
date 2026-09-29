# Sarga MIS — Functional Audit and Operating Guide

**Audit date:** 18 September 2026  
**Scope:** current workspace checkout at `D:\software sarga`  
**Verdict:** the client is production-buildable, but the software is **not fully verified or ready to be described as completely working**. Automated tests expose both real functional defects and a test harness that is not maintained. Database-backed, third-party, camera, email, cloud-storage, OCR, and payment flows require a configured non-production environment and were therefore source-reviewed rather than executed against live data.

## 1. What this application is

Sarga MIS is a multi-branch management system for a printing business. It combines a staff portal, an Express API, a MySQL data model, PWA/offline support, job production workflows, accounting, and a public-commerce/content surface.

The main application is split into these parts:

| Part | Location | Purpose |
|---|---|---|
| Staff portal | `client/` | React 19 + Vite user interface for operational staff and administrators. |
| API | `server/` | Express 5 REST API, JWT/RBAC, database access, uploads, scheduled jobs, Socket.IO. |
| Database definition | `server/schemas/`, `server/migrations/` | MySQL tables, indexes, data corrections, and migration scripts. |
| Supporting modules | `blog-module/`, `portfolio-module/`, `i18n-module/`, `mcp-server/` | Separately structured website/content, portfolio, localization, and MCP functionality. |
| Deployment/tooling | root scripts, `render.yaml`, `vercel.json`, `deployment/` | Startup, deployment, environment provisioning, and operations scripts. |

## 2. How a request moves through the system

1. The browser loads the Vite React application. Routes are lazy-loaded so most page code is downloaded only after navigation.
2. Users sign in at `/login`. The API authenticates them with a JWT; the client persists authentication state and requests server time to reduce device-clock manipulation.
3. `ProtectedRoute` and `ProtectedSubRoute` enforce page-level role access. The API independently verifies JWTs and role permissions, which is the authoritative guard.
4. React pages use the API client, query/cache utilities, notifications, error boundaries, and offline stores. The service worker caches selected static assets and selected GET responses.
5. Express validates input with Zod where schemas are applied, executes parameterized MySQL queries, returns JSON, writes audit records where configured, and invalidates Redis-style cache entries after updates.
6. The dashboard, detail pages, PDF/Excel utilities, and real-time socket clients present the returned data to the user.

The roles used by the code are **Admin**, **Accountant**, **Front Office**, **Designer**, **Printer**, and **Other Staff**. Front Office API requests are additionally constrained to their branch by the enhanced authentication middleware; server-side enforcement matters because UI hiding alone is not security.

## 3. Functional map

This table documents what the current code provides. “Build-verified” means the module was included in the successful production bundle. “Test-verified” only means a relevant test passed in this audit; it does not mean every data combination was tested.

| Area | User-facing work | Main implementation | Current audit evidence |
|---|---|---|---|
| Authentication and account recovery | Login, logout, JWT/session handling, password change/reset, role routing | `routes/auth.js`, `routes/passwordReset.js`, `useAuth`, `services/auth` | Some API/auth tests pass; broader server auth route suite fails, so end-to-end verification is incomplete. |
| Dashboard and navigation | Role-sensitive sidebar, quick actions, KPI/home screens, error/offline states | `pages/Dashboard.jsx`, layouts, `dashboardInit` | Build-verified. Role routes are source-reviewed. |
| Customers and sales | Customer records, customer detail, orders/jobs, quotations, invoices, payments, receipts | `routes/customers.js`, `jobs.js`, `quotes.js`, `customerPayments.js`, invoice routes | Customer/server test suites have failures. Do not consider all sales mutations verified. |
| Billing and payments | Invoice creation, payment tracking/verification, recurring invoices, coupons, customer credit and refunds | `Billing`, `Invoices`, `CustomerPayments`, `payments.js`, `invoiceFeatures.js` | UI builds; payment tests fail in the server suite. Live gateway behavior was not exercised. |
| Vendors and expenses | Vendor directory, payables, bills/document upload, OCR extraction review, office/transport/misc/petty-cash/rent/utility expenses, reports | `vendors.js`, `expenses.js`, `expenses-extended.js`, `billExtraction.js` | Vendor unit tests pass; full expense suite fails. OCR needs local temporary storage and credentials. |
| Inventory and paper | General inventory, product hierarchy, paper inward/outward/movement/alerts/transfers/cutting, consumables, stock verification and requests | `inventory.js`, `paperInventory.js`, `consumablesInventory.js`, stock routes | Source/build-verified, but inventory and stock-request server suites fail; migration work is also scheduled at module load. |
| Production | Jobs, job priority, machine counters/management, production tracker, imposition, paper layout, plate tools | `jobs.js`, `machines.js`, `productionTracker.js`, `imposition.js`, `paperLayout.js` | Imposition calculator tests pass. Jobs suite fails, so workflow completion is not verified. |
| Finance/accounting | Daily cash book, three internal books, internal transfers/transactions, GST registers, EMI/Kuri, financial reports | daily-report, accounts, finance and internal-book routes | Build-verified; relies on database schema and role permissions. No clean integration suite result. |
| Staff and attendance | Staff profiles, tasks, leave, attendance/salary, CCTV attendance and cameras | staff routes/pages, `cctvAttendance.js`, `cctvCameras.js` | Build-verified. Camera/SNMP/face data require hardware and were not live-tested. |
| Design and customer assets | Designer work area, bookings, product library, design check, artwork upload, proofs, portfolio | designer pages, `designWorkspace.js`, `designCheck.js`, `artworkUploads.js` | Build-verified. AI/design-file and Cloudinary-dependent behavior needs configured integrations. |
| Admin and governance | Branches, schedules, settings, audit trail/dashboard, backups, chatbot training, translations, promotions/reviews/pickup/delivery configuration | admin pages and matching routes | Build-verified; destructive backup restore and external publishing were not run. |
| Public/commerce and content | Cart/order checkout, artwork tracking, delivery estimates, blog, portfolio, SEO, business profile | checkout/blog/portfolio/SEO/business routes and separate modules | Source-reviewed. A payment provider configuration and real customer data are required for full proof. |
| Platform capabilities | PWA cache/update prompt, offline database/sync, Socket.IO, PDF/Excel/WhatsApp output, image crop/compression | Vite PWA config; client services/utilities; server services | Build-verified. Offline conflict handling, mail, WhatsApp and device/browser permissions were not simulated. |

## 4. Main portal routes and access rules

The root routes redirect `/` to `/dashboard`; `/signin` redirects to `/login`. Public account-recovery routes are `/forgot-password` and `/reset-password`. All dashboard routes require a signed-in user.

Within `/dashboard`, the major route groups are:

| Route family | Purpose | Permitted roles in the UI |
|---|---|---|
| `sales/*` | Customers, orders/jobs, quotations, invoices, payment collection | Admin, Front Office, Accountant; some job detail views also include Designer/Printer/Other Staff. |
| `inventory/*`, `paper/*`, stock-transfer | Inventory, scanning, paper stock/movements/transfers/cutting, consumables | Admin, Front Office, Accountant. |
| `products`, `machines`, production pages | Product library, machines, tracker, design/paper tools, priorities | Depends on function; Designers use design tools, Front Office manages selected production pages, Admin is widest. |
| `expenses`, `vendors`, `accounts`, `daily-report` | Expenses, bills/OCR, supplier records, GST, daily book, finance | Admin, Accountant and often Front Office; higher-risk verification/settings are Admin/Accountant only. |
| `staff`, `branches`, `schedules`, `settings`, audit/admin pages | People, branches, configuration, governance and CMS-like pages | Admin predominates; accountants/front-office receive only selected operational pages. |
| `/staff/*`, `/designer/*`, `/accounting/*` | Dedicated staff, designer and accounting workspaces | Each protected by a top-level role gate. |

Direct links are not a permission bypass: API endpoints repeat authentication and authorization. Any new endpoint must keep this property, especially for Front Office branch isolation.

## 5. API surface and operational behavior

`server/index.js` registers more than sixty route modules and the route files declare approximately **576 HTTP handlers**. The main mounts include `/api` (most business features), `/api/staff`, `/api/machines`, `/api/daily-report`, `/api/backup`, `/api/ai`, `/api/cctv`, `/api/blog`, and `/api/stock-verification`.

Baseline behavior at API startup:

- CORS, Helmet, compression, JSON/body limits, global API rate limits, validation, request tracing, error normalization, and a not-found handler are installed.
- The root `GET /` reports service status. `GET /api/ping` performs a database ping and returns 200 or 503. `GET /api/version` reports the configured version. `GET /api/server-time` requires an authorization header and returns an authoritative date/time object.
- A migration guard returns HTTP 503 for selected database-heavy APIs until background migrations complete.
- Uploaded files are served from `/uploads`; missing local files are optionally looked up in Cloudinary before returning 404.
- Cache middleware is intended to use Redis-backed cache services; mutating flows invalidate affected key patterns.
- Socket/server scheduling, bill extraction/matching, daily-book generation, mail, Google Sheets backup, OCR and chat services are enabled only to the extent their environment configuration and remote dependencies are available.

Important safety note: backup restore, database migration/cleanup scripts, and payment-related scripts change data. They were deliberately not run as part of this read-and-test audit.

## 6. Data and integrations required for full operation

A genuine end-to-end verification requires a disposable MySQL database populated with representative users, branches, products, customers, inventory, jobs, vendors, invoices, and payments. Required server configuration is documented in `server/env.example`.

| Dependency | Used for | Requirement |
|---|---|---|
| MySQL (and optional SSL/Aiven certificate) | All business state | Valid `DB_*` values; production SSL must be enabled where required. |
| JWT secret | Authentication | Random secret of at least 32 characters; never use a development placeholder. |
| Cloudinary | Asset and bill/image storage fallback | Cloud name, API key, API secret. |
| SMTP/Gmail | Daily reports, notifications, inbound bill parsing | Email credentials/app password and correct host/port. |
| Google service account + Sheet ID | Backup/reporting | A service-account JSON value and shared target spreadsheet. |
| Gemini/AI configuration | AI search, monitoring, OCR/design-adjacent intelligence | Valid API key/model and permitted network access. |
| Browser devices/hardware | Camera scanning, CCTV, printer/machine integrations | User permission, reachable camera/SNMP hardware, valid device configuration. |
| Redis/cache service | Shared response cache | Runtime connection appropriate to the deployment. |

## 7. Verification performed in this audit

| Command | Result | Meaning |
|---|---|---|
| `client: npm run build` | **Passed** | Vite transformed 4,236 modules, generated a PWA/service worker and a deployable `dist/` bundle. This is the strongest positive result from this audit. |
| `client: npm run lint` | **Passed with warning** | No lint failure. ESLint warns that `eslint-env` comments in `e2e/playwright.config.js` will become errors under ESLint v10. |
| `client: npm test -- --run` | **Failed** | 7 files/161 assertions passed; 14 files/5 assertions failed, with 3 unhandled errors. Details below. |
| `server: npm test` | **Failed** | 12 suites/240 assertions passed; 25 suites/83 assertions failed. Details below. |
| Runtime database/external integration test | **Not run** | No safe dedicated test database, credentials, hardware, or third-party sandbox was established for this audit. |

## 8. Reproducible issues found

### Critical / release-blocking verification issues

1. **The server test suite is substantially red: 25 of 37 suites fail and 83 of 323 tests fail.** A significant portion is caused by startup side effects and test setup, but it means backend behavior is not reliably regression-protected.
2. **Server modules use a Unix absolute temporary directory (`/tmp/sarga_ocr/`).** On this Windows checkout Multer tries to create `D:\tmp` and gets `EPERM`. This prevents any suite importing the full server routing graph from initializing. Use an OS-safe directory such as `path.join(os.tmpdir(), 'sarga_ocr')`, create it deliberately, and inject/override it in tests.
3. **Several test suites leave asynchronous work running after Jest exits.** Inventory migration messages are logged after the tests complete and Jest reports open handles. Module-load migrations/timers must be moved behind explicit startup lifecycle hooks and stopped in test teardown.
4. **The frontend test command accidentally collects Playwright E2E specs without Playwright installed.** Five specs fail to resolve `@playwright/test`. Either install/configure Playwright and run it via a dedicated E2E command, or exclude `e2e/` from Vitest.

### Client functional/test defects

1. `calculateProductPrice` fails the slab double-side test: expected total is 700, received 7. This is a high-priority pricing correctness issue; confirm the intended rate/quantity units before fixing.
2. `validateTime('25:00')` is accepted although the test expects rejection. Invalid time values can enter forms using this validator.
3. `usePagination` does not update data in the refresh test and emits React `act(...)` warnings. Its async state contract or test waiting logic needs correction.
4. `deduplicatedGet` calls `.finally()` on a value that can be undefined in its test path; the request mock/test setup and defensive promise handling are inconsistent. The related assertion records zero GET calls.
5. `App.test.jsx` mocks server-time incompletely: `waitForServer` is absent and `initServerTime()` returns undefined, causing `.catch` access failure. The production bundle compiles, but this test does not validate app startup.
6. Three unit test files contain JSX or incomplete JavaScript while named `.js`: `useAuth.test.js`, `Pagination.test.js`, and `services/__tests__/api.test.js`. Vite/Vitest cannot parse them as configured. Rename JSX tests to `.jsx` or configure the transformer; repair truncated source.

### Server test/dependency defects

1. `__tests__/not-found.test.js` requires `node-mocks-http`, but it is not declared/installed in the server package.
2. The failing server suites include API, cache middleware, health/auth route, analytics, customers, error middleware, auth middleware, database, jobs, stock planning, payments, base64, stock requests, server time, products, migrations, inventory, expenses, and branches. These cannot be treated as verified.
3. The suite expects `/api/ai/stock-planning/stock-status`, while the live route registration returns 404 for it. Decide whether the endpoint should be implemented/registered or the obsolete test/client reference removed.
4. Test output confirms DB-dependent requests, auth failures, validation failures, and not-found behavior are being exercised, but the full app import is blocked before many fixtures can test their intended behavior. Fix test bootstrapping first, then address remaining assertion failures one suite at a time.

### Documentation/configuration drift to resolve

1. The root README still describes `ml-service/`, but that directory is absent from this checkout; the active code has AI-related routes instead. Update the startup instructions to match the actual repository.
2. The README says the server starts on port 5000; the Vite development proxy targets port 3000. Confirm and standardize the backend port/environment documentation before onboarding new developers.
3. The README describes NodeCache while the current server bootstrap says caching has been moved toward Redis cache services. Documentation should state the actual production dependency and fallback behavior.

## 9. Recommended repair order

1. Make tests deterministic: isolate server startup from route imports, replace hard-coded `/tmp`, add the missing test dependency, and separate Vitest from Playwright.
2. Fix confirmed business-rule defects: slab double-side pricing and invalid-time validation. Add focused unit tests with realistic values before changing production code.
3. Fix client async contract/mocks: pagination refresh, request de-duplication, and App server-time mocks.
4. Re-run backend suites after boot cleanup; then resolve failures by domain in this order: auth/health/database, customers/jobs/payments, inventory/stock, expenses/analytics, branches/cache.
5. Provision a disposable MySQL database and seeded accounts for each role. Run protected API smoke tests and browser Playwright flows against it.
6. Test integration features only in sandboxes: SMTP/Google Sheets/Cloudinary/AI; use a non-production camera or mocked hardware. Record results per integration.
7. Update README/deployment documentation and add a CI workflow that runs lint, unit tests, client build, and separately-configured E2E tests.

## 10. Deployment and operations checklist

Before production deployment, confirm all of the following:

- [ ] `client npm run build` passes.
- [ ] Client unit tests and server tests are fully green.
- [ ] Playwright runs through a dedicated installed browser-test setup.
- [ ] Production database migrations are backed up, ordered, and applied in a maintenance-safe way.
- [ ] JWT, DB, email, Cloudinary, Google, AI and CORS secrets are stored only in deployment secret stores.
- [ ] Every permitted client origin is in `CORS_ORIGIN`.
- [ ] A health probe verifies `/api/ping` after deployment.
- [ ] Admin, Accountant, Front Office, Designer, Printer and Other Staff acceptance flows have each been checked with actual role accounts.
- [ ] A restore drill has been performed from a non-production backup; never first-test restore on production.
- [ ] Offline/PWA cache updates, upload fallback, PDF/Excel output, camera permission denial, and API/network outage states have been exercised in supported browsers.

## 11. Bottom line

The current codebase is feature-rich and its React production build is healthy. It implements a broad, role-gated printing-shop workflow from lead/customer intake through job production, inventory, accounting, administration and commerce. However, the present test results do **not** support a claim that every function works: tests are broken in multiple areas, there are at least two confirmed client business/validation defects, server startup is not test-portable on Windows, and integration-heavy flows still need controlled environment testing. The recommended repair order above should be completed before declaring the system fully operational.

