# Sarga Prints MIS Server — Backend Audit Report

**Audit Date:** 2026-06-27 09:23 IST  
**Scope:** `D:\software sarga\server`  
**Focus:** Code Architecture, Maintainability, Bugs  
**Files Audited:** `index.js`, 85+ route files, 14 service files, 8 helper files, 4 utility files, 9 middleware files, `database.js`

---

## Executive Summary

The Sarga Prints MIS server is a monolithic Express application with **~85 route files**, **1,340+ raw SQL queries** embedded directly in route handlers, and **no meaningful service layer**. The codebase suffers from massive "god files" (some exceeding 2,700 lines), inconsistent error handling, disabled caching infrastructure, and significant architectural debt from rapid feature growth. While most SQL uses parameterized queries (preventing injection), the sheer volume of business logic in controllers, lack of centralized validation, and absence of structured logging create a high-risk maintenance burden.

---

## CRITICAL Issues

### 1. No Structured Logging (Winston Missing)
- **File:** `helpers/logger.js` (lines 1–17)
- **Issue:** The `helpers/logger.js` exports a plain console wrapper, not Winston. There is no log rotation, structured JSON logging, log levels, or persistence.
- **Impact:** Production debugging is impossible; logs are lost on container restart; no audit trail for compliance.
- **Fix:** Install and configure Winston with transports (file, console, rotating file).

### 2. Redis / Cache Infrastructure Completely Disabled
- **File:** `services/cacheService.js` (lines 1–88), `middleware/cache.js` (lines 1–32)
- **Issue:** `CACHE_ENABLED = false` and all cache functions are no-ops. The middleware still wraps routes but does nothing. Hundreds of `.catch(() => {})` calls to `invalidateDashboardCache()`, `invalidateCustomerCache()`, etc. are dead code.
- **Impact:** Every request hits the database; no performance scaling; cache invalidation code is maintenance noise.
- **Fix:** Remove dead code or implement Redis properly.

### 3. Massive "God" Route Files with Too Many Responsibilities
- **Files & Sizes:**
  - `routes/expenses-extended.js` — **2,818 lines**
  - `routes/jobs.js` — **2,702 lines**
  - `routes/products.js` — **1,706 lines**
  - `routes/inventory.js` — **1,635 lines**
  - `routes/vendors.js` — **1,282 lines**
  - `routes/finance.js` — **772 lines**
  - `routes/website.js` — **665 lines**
  - `routes/staff.js` — **345 lines**
- **Issue:** These files contain routing, business logic, pricing engines, inventory syncing, machine work entry sync, PDF generation, OCR, file uploads, and database migrations — all mixed together.
- **Impact:** Impossible to unit test; high cognitive load; merge conflicts; no separation of concerns.
- **Fix:** Extract business logic into `services/` modules; keep routes thin (HTTP in/out only).

### 4. No Service Layer — 1,340+ Raw SQL Queries in Routes
- **Evidence:** `grep -rn "pool.query" routes/*.js | wc -l` → **1,340 lines**
- **Issue:** Routes directly import `pool` from `../database` and execute SQL. There is no abstraction layer for queries, transactions, or business rules.
- **Impact:** Tight coupling to MySQL schema; impossible to swap database engines; business rules scattered across 85 files; no reusable data access patterns.
- **Fix:** Create a `repositories/` or `services/` layer with domain-specific data access methods.

### 5. ~440+ Async Route Handlers Without Try-Catch
- **Evidence:** 529 total `async (req, res)` handlers found; only ~85 have `try { ... } catch` blocks. Many routes look like:
  ```js
  router.get('/something', async (req, res) => {
      const [rows] = await pool.query(...); // no try-catch
      res.json(rows);
  });
  ```
- **Files:** Widespread. Examples:
  - `routes/branches.js` (6 async handlers, 0 try-catch visible in audit)
  - `routes/accounts.js` (4 async handlers, 0 try-catch)
  - `routes/anomalies.js` (2 async handlers, 0 try-catch)
  - `routes/artworkUploads.js` (3 async handlers, 0 try-catch)
  - `routes/auditInvoice.js` (1 async handler, 0 try-catch)
  - `routes/backup.js` (5 async handlers, 0 try-catch)
  - `routes/businessHub.js` (7 async handlers, 0 try-catch)
  - `routes/chatbot.js` (4 async handlers, 0 try-catch)
  - `routes/checkout.js` (1 async handler, 0 try-catch)
  - `routes/coupons.js` (1 async handler, 0 try-catch)
  - `routes/customerDesigns.js` (7 async handlers, 0 try-catch)
  - `routes/dashboardInit.js` (1 async handler, 0 try-catch)
  - `routes/designCheck.js` (1 async handler, 0 try-catch)
  - `routes/devRoutes.js` (1 async handler, 0 try-catch)
  - `routes/forecast.js` (1 async handler, 0 try-catch)
  - `routes/frontOffice.js` (11 async handlers, 0 try-catch)
  - `routes/insights.js` (1 async handler, 0 try-catch)
  - `routes/internalBooks.js` (1 async handler, 0 try-catch)
  - `routes/internalTransactions.js` (1 async handler, 0 try-catch)
  - `routes/internalTransfers.js` (2 async handlers, 0 try-catch)
  - `routes/jobPriority.js` (4 async handlers, 0 try-catch)
  - `routes/machines.js` (27 async handlers, 0 try-catch)
  - `routes/ocr.js` (1 async handler, 0 try-catch)
  - `routes/orderForecast.js` (1 async handler, 0 try-catch)
  - `routes/orderPredictions.js` (2 async handlers, 0 try-catch)
  - `routes/paperLayout.js` (4 async handlers, 0 try-catch)
  - `routes/pickupSlots.js` (1 async handler, 0 try-catch)
  - `routes/portfolio.js` (1 async handler, 0 try-catch)
  - `routes/preflight.js` (2 async handlers, 0 try-catch)
  - `routes/premiumFeatures.js` (12 async handlers, 0 try-catch)
  - `routes/productionTracker.js` (1 async handler, 0 try-catch)
  - `routes/promotions.js` (6 async handlers, 0 try-catch)
  - `routes/proofs.js` (2 async handlers, 0 try-catch)
  - `routes/quotes.js` (7 async handlers, 0 try-catch)
  - `routes/requests.js` (4 async handlers, 0 try-catch)
  - `routes/search.js` (1 async handler, 0 try-catch)
  - `routes/seasonal.js` (1 async handler, 0 try-catch)
  - `routes/seo.js` (1 async handler, 0 try-catch)
  - `routes/settingsDailyBook.js` (5 async handlers, 0 try-catch)
  - `routes/shortcuts.js` (9 async handlers, 0 try-catch)
  - `routes/staffDashboard.js` (11 async handlers, 0 try-catch)
  - `routes/staffPortal.js` (6 async handlers, 0 try-catch)
  - `routes/stockPlanning.js` (3 async handlers, 0 try-catch)
  - `routes/stockRequests.js` (2 async handlers, 0 try-catch)
  - `routes/stockVerification.js` (3 async handlers, 0 try-catch)
  - `routes/translations.js` (5 async handlers, 0 try-catch)
  - `routes/upsell.js` (1 async handler, 0 try-catch)
  - `routes/utilityEmail.js` (1 async handler, 0 try-catch)
  - `routes/variableData.js` (3 async handlers, 0 try-catch)
  - `routes/websiteReviews.js` (1 async handler, 0 try-catch)
  - `routes/whatsappAnalytics.js` (2 async handlers, 0 try-catch)
  - `routes/whatsapp.js` (1 async handler, 0 try-catch)
- **Impact:** Any unhandled `await` rejection will crash the Node process (or leave requests hanging), especially with `pool.query` failures, network timeouts, or schema mismatches.
- **Fix:** Wrap all async handlers in `try-catch` or use `asyncHandler` utility consistently. The `asyncHandler` exists in `helpers/index.js` but is not used in most routes.

### 6. Database Migration Logic Inside Route Files
- **File:** `routes/inventory.js` (lines 59–80)
- **Issue:** A `setTimeout` inside the route module runs `ALTER TABLE sarga_inventory ADD COLUMN reserved_quantity ...` on startup. This is migration logic mixed with HTTP handling.
- **Impact:** Race conditions during deployment; schema changes in unexpected places; module side effects.
- **Fix:** Move all migrations to `migrations/` folder and run them via `database.js` init only.

### 7. Global Axios Interceptor Throws for ML URLs
- **File:** `index.js` (lines 8–24)
- **Issue:** A global `axios.interceptors.request.use` is registered that throws an error for any request starting with `ML_SERVICE_URL` when `ENABLE_ML !== 'true'`. This affects **all** axios instances across the entire app, not just ML calls.
- **Impact:** Third-party libraries or unrelated modules using axios could be blocked if their URLs coincidentally match the prefix. Unhandled interceptor rejections can leak.
- **Fix:** Use a dedicated axios instance for ML calls instead of a global interceptor.

### 8. OTP Exposed in Response Body (Debug Mode)
- **File:** `routes/website.js` (line 408)
- **Code:**
  ```js
  if (debugExpose) resp.otp = otp;
  res.json(resp);
  ```
- **Issue:** If `NODE_ENV !== 'production'` (or `DEBUG_EMAIL_OTPS=1`), the plaintext OTP is returned in the JSON response. This bypasses the entire purpose of OTP security.
- **Impact:** Authentication bypass in staging/dev environments; potential production exposure if env is misconfigured.
- **Fix:** Never return OTP in any response. Log to console only for dev testing.

### 9. Password Reset Value Logged in Audit Trail
- **File:** `routes/staff.js` (line 335)
- **Code:**
  ```js
  auditLog(req.user.id, 'STAFF_PASSWORD_RESET', `Reset password for staff member ${users[0].name} (${id}) to ${normalizedMobile}@Sarga`);
  ```
- **Issue:** The generated password is written to the `sarga_audit_logs` table in plaintext.
- **Impact:** Credential exposure in database logs; anyone with audit log access can impersonate staff.
- **Fix:** Never log passwords. Log only the action, not the value.

### 10. Circular Dependencies Between Route Files
- **Files:** `routes/jobs.js`, `routes/inventory.js`, `routes/products.js`, `routes/expenses-extended.js`, `routes/expenses.js`
- **Issue:**
  - `routes/inventory.js` imports `invalidateHierarchyCache` from `./jobs` (line 6)
  - `routes/products.js` imports `invalidateHierarchyCache` from `./jobs` (line 4)
  - `routes/expenses-extended.js` imports `invalidateHierarchyCache` from `./jobs` (line 9)
  - `routes/expenses.js` dynamically requires `./expenses` inside `trackPaymentFrequency` to call itself
- **Impact:** Module loading order is fragile; potential for infinite loops or undefined exports; hard to test in isolation.
- **Fix:** Extract `invalidateHierarchyCache` and shared logic into a `services/` or `helpers/` module. Remove dynamic self-requires.

### 11. Global Polyfills Mutating `globalThis`
- **File:** `index.js` (lines 2–4)
- **Code:**
  ```js
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix { constructor() {} };
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData { constructor(w, h) { this.width = w; this.height = h; } };
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D { constructor() {} };
  ```
- **Issue:** Mutates global namespace for `pdf-parse` compatibility. This affects all modules and can conflict with other libraries.
- **Impact:** Unpredictable side effects in third-party code; hard to debug global state pollution.
- **Fix:** Isolate `pdf-parse` in a worker thread or use a Node-specific PDF parser that doesn't require DOM polyfills.

### 12. Inconsistent Error Response Formats Across API
- **Evidence:** Grep found 4 different error formats in use:
  - `{ message: '...' }` — used in `auth.js`, `jobs.js`, `customers.js`
  - `{ error: '...' }` — used in `finance.js`, `expenses-extended.js`, `vendors.js`
  - `{ success: false, message: '...' }` — used in `vendors.js`, `inventory.js`
  - `{ success: false, error: '...' }` — used in `expenses.js`, `vendors.js`
- **Impact:** Frontend must handle multiple error shapes; debugging is harder; API contract is undefined.
- **Fix:** Standardize on `AppError` classes from `utils/AppError.js` and use the `errorHandler.js` middleware exclusively. The `AppError` infrastructure exists but is underutilized in routes.

### 13. Missing Request Validation in Most Routes
- **Evidence:** Only ~15 route files use `validate(someSchema)` middleware. The remaining ~70 files accept `req.body` directly.
- **Examples:**
  - `routes/jobs.js` bulk create validates manually with a loop (lines 558–575) but many other endpoints accept raw body
  - `routes/inventory.js` PUT `/inventory/:id` uses `validate(addInventorySchema)` but GET `/inventory` has no query validation
  - `routes/website.js` `/customer/register` has no Zod validation; only manual checks
- **Impact:** Type coercion bugs, injection risks (though SQL is parameterized), missing field errors, malformed data in database.
- **Fix:** Apply Zod validation middleware to every POST/PUT/PATCH endpoint. Validate query params too.

---

## HIGH Issues

### 14. Background `setTimeout` Tasks Without Cleanup
- **Files:**
  - `index.js` (lines 559, 572) — migration timeouts (15s, 12s)
  - `routes/inventory.js` (lines 59, 1609) — schema migration timeouts (10s)
  - `services/scheduler.js` (lines 45, 69) — cron startup delays
  - `services/dailyBookScheduler.js` (line 180) — scheduler timeout
- **Issue:** These `setTimeout` calls are never cleared. If the server shuts down before they fire, the callbacks may still execute against a closed pool or connection.
- **Impact:** Race conditions during shutdown; potential exceptions after pool closure.
- **Fix:** Track all timeout handles and clear them in the graceful shutdown handler. Stop cron jobs before exit.

### 15. `process.env` Scattered in Routes Instead of Central Config
- **Evidence:** 60+ occurrences of `process.env.` in `routes/*.js`
- **Examples:**
  - `routes/aiTurnaround.js` line 14: `const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';`
  - `routes/checkout.js` lines 33–34: `key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder'`
  - `routes/invoiceFeatures.js` line 16: `user: process.env.EMAIL_FROM || ''`
  - `routes/passwordReset.js` line 60: `const baseUrl = process.env.CLIENT_URL;`
- **Impact:** No single source of truth for configuration; typos in env names are hard to catch; no config validation at startup; defaults like `'rzp_test_placeholder'` could accidentally reach production.
- **Fix:** Centralize all env access in `config/` (e.g., `config/app.js`, `config/ml.js`) and validate at startup.

### 16. Rate Limiters Created Inside Conditional Middleware
- **File:** `index.js` (lines 186–206)
- **Code:**
  ```js
  app.use('/api', (req, res, next) => {
      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
          return writeLimiter(req, res, next);
      }
      next();
  });
  ```
- **Issue:** The `writeLimiter` and `uploadLimiter` are instantiated once at module load, but the conditional wrapper is a new middleware function. This is acceptable, but the pattern is fragile. More importantly, the rate limiters are applied globally without per-route customization.
- **Impact:** Upload limiter checks `req.path.includes('/upload')` on every request, adding overhead.
- **Fix:** Apply rate limiters directly to specific route mounts.

### 17. Missing Transaction Isolation in Multi-Step Operations
- **Files:** Multiple routes update multiple tables without transactions.
- **Examples:**
  - `routes/payments.js` lines 137–153: After inserting a payment, it inserts a staff salary payment — but if the second insert fails, the first payment is orphaned.
  - `routes/finance.js` lines 356–374: EMI payment records a payment, then syncs to `sarga_payments` — no transaction wrapper.
  - `routes/customers.js` line 129: Customer add runs `auditLog` and `invalidateCustomerCache` outside the DB transaction.
- **Impact:** Partial data writes; database inconsistency on failures.
- **Fix:** Use `pool.getConnection()` + `beginTransaction()` / `commit()` / `rollback()` for all multi-table writes.

### 18. `website.js` Duplicates Auth Logic Instead of Using Middleware
- **File:** `routes/website.js` (lines 258–274, 276–285, 288–311, 314–354, 455–481, 484–500)
- **Issue:** Customer-facing routes manually call `jwt.verify(token, JWT_SECRET)` and query the database for auth. They do not use the centralized `authenticateToken` middleware.
- **Impact:** Auth logic duplicated in 6+ places; token validation rules diverge; no session revocation check for customers.
- **Fix:** Create a customer-specific auth middleware and reuse it.

### 19. `branchFilter` is a Function, Not Middleware, But Lives in `middleware/`
- **File:** `middleware/branchFilter.js` (lines 1–43)
- **Issue:** `branchFilter` is an async function called inside route handlers (`await branchFilter(req, ...)`). It is not an Express middleware (`(req, res, next) => ...`). The naming is confusing.
- **Impact:** Inconsistent usage; some routes call it inline, others don't call it at all.
- **Fix:** Convert to proper middleware that attaches `req.branchFilter` to the request object, or move it to `helpers/`.

### 20. Hardcoded Fallback Values for Secrets
- **Files:**
  - `routes/checkout.js` line 34: `key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder'`
  - `routes/checkout.js` line 353: `.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'placeholder')`
  - `routes/backup.js` lines 38–39: `DB_USER = process.env.DB_USER || 'root'`, `DB_PASS = process.env.DB_PASS || ''`
  - `routes/website.js` line 299: `branchId = 1` (hardcoded default branch)
- **Impact:** Placeholder secrets could be used in production if env vars are missing, leading to security issues or data loss.
- **Fix:** Fail fast at startup if required secrets are missing. Do not provide insecure defaults.

---

## MEDIUM Issues

### 21. Massive Code Duplication Across Routes
- **Duplicate patterns found:**
  - **Mobile normalization:** `normalizeMobileWithCountry` is imported and called in `auth.js`, `customers.js`, `staff.js`, `website.js`, `middleware/phone.js`
  - **Cloudinary upload fallback:** Upload buffer + fallback to base64 pattern exists in `auth.js`, `staff.js`, `products.js`, `inventory.js` (not DRY)
  - **Branch ownership check:** `!['Admin', 'Accountant'].includes(req.user.role)` appears in 20+ route files
  - **Pagination boilerplate:** `const { limit, offset, _page, response } = paginate(req.query, req.query.page, req.query.limit);` copied into ~40 route files
  - **Cache invalidation:** `.catch(() => {})` chains for `invalidateDashboardCache()`, `invalidateCustomerCache()` appear in 10+ files
  - **Inventory movement logging:** `logInventoryMovement` is defined in `inventory.js` but could be reused elsewhere
- **Impact:** Maintenance burden; copy-paste bugs; inconsistent behavior.
- **Fix:** Extract common patterns into `helpers/` or `services/` modules.

### 22. `console.log` / `console.error` Used Instead of Logger
- **Evidence:** 40+ files use `console.log/error/warn` directly. `routes/jobs.js` alone has 51 console calls.
- **Impact:** No log level control; no log persistence; mixed output formats.
- **Fix:** Replace all `console.*` with `logger.info/error/warn`.

### 23. Magic Numbers Throughout the Codebase
- **File:** `index.js` and many routes
- **Examples:**
  - `index.js` line 42: `PORT = process.env.PORT || 3000` (okay, but no constant)
  - `index.js` line 170: `windowMs: 5 * 60 * 1000` — rate limit window (repeated 3 times)
  - `index.js` line 171: `max: isProduction ? 200 : 2000` — magic limits
  - `index.js` line 180: `max: isProduction ? 60 : 600` — write limit
  - `index.js` line 226: `limits: { fileSize: 10 * 1024 * 1024 }` — 10MB upload limit (repeated in many routes)
  - `index.js` line 153: `express.json({ limit: '50mb' })` — 50MB for designs
  - `index.js` line 157: `express.json({ limit: '1mb' })` — 1MB default
  - `middleware/websiteSecurity.js` line 15: `windowMs: 15 * 60 * 1000, max: 100`
  - `middleware/websiteSecurity.js` line 23: `windowMs: 60 * 1000, max: 20`
  - `routes/jobs.js` line 407: `INTERVAL 90 DAY` — hardcoded retention
  - `routes/website.js` line 138: `displayCount = Math.max(32450, liveCount)` — hardcoded baseline for marketing
  - `routes/inventory.js` line 286: `LIMIT 200` — low stock limit
  - `routes/auth.js` line 13: `windowMs: 15 * 60 * 1000, max: 15`
  - `routes/auth.js` line 88: `expiresIn: '12h'` — JWT expiry (repeated in `middleware/auth.js` line 6: `SESSION_CACHE_TTL = 43200`)
- **Impact:** Hard to adjust system behavior; inconsistent limits; no documentation of business rules.
- **Fix:** Create a `constants.js` file with named constants for all limits, timeouts, and magic numbers.

### 24. Dynamic SQL WHERE Clause Building Could Be Centralized
- **Issue:** Many routes build `where` strings and `params` arrays manually. E.g., `routes/jobs.js` lines 350–435, `routes/inventory.js` lines 116–180, `routes/finance.js` lines 22–41.
- **Impact:** Repetitive, error-prone string concatenation; some params might be misaligned.
- **Fix:** Use a query builder (Knex, Kysely) or a centralized `buildWhereClause` helper.

### 25. `compressImageUpload` Middleware Uses Sharp Without Error Handling
- **File:** `middleware/compressImageUpload.js` (lines 10–25)
- **Issue:** `await sharp(file.path).resize(...).jpeg(...).toFile(compressedPath)` has no try-catch. If `sharp` fails (e.g., corrupt image), the error will be thrown into Express without being caught.
- **Impact:** Unhandled exception crashes the request or process.
- **Fix:** Wrap sharp operations in try-catch and call `next(err)`.

### 26. `uploads` Static Route Has Potential Path Traversal (Partially Mitigated)
- **File:** `index.js` (lines 248–290)
- **Issue:** The route uses `path.basename(req.path)` and `path.join(uploadsDir, fileName)`, then checks `filePath.startsWith(uploadsDir)`. This is mostly safe, but the `basename` check might be bypassed with certain encoded paths. Also, the Cloudinary fallback makes a network call for every missing file.
- **Impact:** Potential path traversal if the `startsWith` check is bypassed; performance hit on missing files.
- **Fix:** Harden path validation; consider removing the Cloudinary fallback from the static file handler.

### 27. `helpers/index.js` has an Unused Import (`_sortByPositionThenName`)
- **File:** `helpers/index.js` line 350
- **Issue:** The export list includes `_sortByPositionThenName` but the function is named `sortByPositionThenName` (no underscore). In `routes/jobs.js` line 4, it's imported as `getUsageMap, _sortByPositionThenName, sortByUsageThenPosition` — but `_sortByPositionThenName` will be `undefined` because it's not exported with that name.
- **Impact:** Silent bug if any code tries to use `_sortByPositionThenName`.
- **Fix:** Fix export name or remove unused import.

### 28. `auth.js` Imports `normalizeRole` Inside Route Handler
- **File:** `routes/auth.js` (line 64)
- **Code:** `const { normalizeRole } = require('../middleware/auth');` inside the login route handler.
- **Issue:** This is inside the async handler, so it runs on every login request instead of at module load. Minor performance hit and unusual pattern.
- **Fix:** Move to top-level imports.

### 29. `expenses.js` Dynamically Requires Itself
- **File:** `routes/payments.js` (lines 156–161)
- **Code:**
  ```js
  if (type === 'Other') {
      const expensesRouter = require('./expenses');
      if (expensesRouter.trackPaymentFrequency) {
          await expensesRouter.trackPaymentFrequency(payee_name, type, amount);
      }
  }
  ```
- **Issue:** `payments.js` requires `expenses.js` at runtime. This creates a circular dependency risk and is unnecessary.
- **Fix:** Move `trackPaymentFrequency` to a shared service module.

### 30. `website.js` Hardcodes Default Branch ID = 1
- **File:** `routes/website.js` (line 299)
- **Code:** `const branchId = 1; // default public branch`
- **Issue:** If branch IDs change or the first branch is deleted, new website registrations will fail or be assigned to the wrong branch.
- **Fix:** Fetch the default branch from config or database.

### 31. `database.js` Hardcodes Special Schema File Handling
- **File:** `database.js` (lines 11–76)
- **Issue:** Individual `.sql` files are hardcoded with special logic (`022_add_description...`, `023_fix_credit_transactions...`, `029_sheets_backup_jobs...`). This is not scalable.
- **Impact:** Adding a new migration requires editing `database.js`.
- **Fix:** Use a proper migration framework (e.g., `umzug`, `db-migrate`, or `knex` migrations).

---

## LOW Issues

### 32. Dead Code / Unused Imports
- **File:** `routes/auth.js` line 3: `authorizeRoles: _authorizeRoles` — imported with underscore but never used.
- **File:** `routes/branches.js` line 5: `branchSchema` is imported but never validated in the visible route handlers.
- **File:** `routes/accounts.js` line 108: `const { limit, offset, _page, response } = paginate(...)` — `_page` is unused (underscore prefix is used inconsistently).
- **File:** `middleware/validate.js` line 4: `mobile10` is declared but unused.
- **File:** `middleware/validate.js` line 73: `branchSchema` is declared but unused in the export.

### 33. Inconsistent Naming Conventions
- **Examples:**
  - `snake_case` files: `expenses-extended.js`, `customerPayments.js`, `dailyReportUnified.js`
  - `camelCase` files: `websiteDesigns.js`, `stockRequests.js`
  - Mixed: `customer_designs.js` doesn't exist, but `customerDesigns.js` does
- **Impact:** Minor navigation friction.
- **Fix:** Standardize on kebab-case or camelCase.

### 34. `package.json` Scripts Not Verified
- **File:** `package.json`
- **Issue:** Not read during this audit, but common issues in this codebase might include missing `lint` script, `start` script not setting `NODE_ENV`, etc.
- **Recommendation:** Verify `scripts` block for `start`, `test`, `lint`, and `migrate` commands.

### 35. `README` / Documentation Gaps
- **Issue:** No API contract documentation (OpenAPI/Swagger), no architecture decision records (ADRs), no developer onboarding guide.
- **Recommendation:** Add `swagger-ui-express` or at least a `docs/` folder with route documentation.

### 36. Missing Health Check for External Dependencies
- **File:** `index.js` (lines 45–59)
- **Issue:** The `/api/health` endpoint checks DB connectivity but does not verify Cloudinary, Redis (if enabled), or ML Service availability.
- **Fix:** Add dependency health checks to the health endpoint.

---

## Architecture Scorecard

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Separation of Concerns** | ❌ Poor | Business logic in routes; no service layer |
| **Error Handling** | ❌ Poor | ~84% of async routes lack try-catch |
| **Request Validation** | ⚠️ Weak | Zod exists but only ~15 files use it |
| **Logging** | ❌ Poor | Console wrapper only; no Winston |
| **Caching** | ❌ Broken | All cache code is no-op |
| **Code Size / Maintainability** | ❌ Poor | 4 files > 1,500 lines each |
| **Database Access** | ⚠️ Weak | 1,340+ raw queries; no repository layer |
| **Security (Auth)** | ⚠️ Weak | Passwords logged; OTP exposed in dev; debug mode |
| **Security (SQL Injection)** | ✅ Mostly Safe | Parameterized queries used, but dynamic WHERE building needs review |
| **Config Management** | ❌ Poor | `process.env` scattered in 60+ places |
| **Testing** | ⚠️ Unknown | `__tests__/` exists but coverage of route logic is unclear |
| **Documentation** | ❌ Missing | No API docs, no architecture docs |

---

## Recommended Priority Action Plan

### Phase 1 (Immediate — 1–2 weeks)
1. **Fix unhandled async rejections:** Wrap all route handlers in `asyncHandler` or add `try-catch`.
2. **Remove password from audit logs:** `routes/staff.js` line 335.
3. **Remove OTP from response:** `routes/website.js` line 408.
4. **Fix global axios interceptor:** Move ML-specific logic to a dedicated axios instance.
5. **Remove DB migration from `routes/inventory.js`:** Move to `migrations/`.

### Phase 2 (Short-term — 1 month)
1. **Implement real Winston logging:** Replace `helpers/logger.js`.
2. **Standardize error responses:** Use `AppError` + `errorHandler` middleware everywhere.
3. **Centralize config:** Create `config/index.js` with Joi/Zod validation at startup.
4. **Add Zod validation to all write endpoints:** Extend `middleware/validate.js` usage.
5. **Fix circular dependencies:** Extract shared helpers from `routes/jobs.js`.

### Phase 3 (Medium-term — 2–3 months)
1. **Extract service layer:** Move business logic from `routes/jobs.js`, `routes/inventory.js`, `routes/expenses-extended.js` into `services/`.
2. **Implement repository pattern:** Abstract all `pool.query` calls into domain repositories.
3. **Re-enable or remove cache:** Either implement Redis properly or delete dead cache code.
4. **Add API documentation:** Swagger/OpenAPI spec.
5. **Refactor god files:** Break `jobs.js`, `expenses-extended.js`, `inventory.js` into focused modules.

---

*End of Report*
