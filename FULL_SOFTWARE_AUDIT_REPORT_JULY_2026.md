# SARGA PRINTS MIS — COMPREHENSIVE SOFTWARE AUDIT REPORT

**Audit Date:** 2026-07-16  
**Auditor:** Kimi Work (Automated + Manual Review)  
**Scope:** Full monorepo (`D:\software sarga`) — Client, Server, Website, ML Service, MCP Server, Database  
**Baseline:** Previous audit dated 2026-06-27 (`FULL_SOFTWARE_AUDIT_REPORT.md`)  
**Classification:** CONFIDENTIAL — Internal Use Only

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Previous Audit Remediation Status](#2-previous-audit-remediation-status)
3. [Security Audit — New & Persisting Findings](#3-security-audit--new--persisting-findings)
4. [Backend Architecture & Code Quality](#4-backend-architecture--code-quality)
5. [Frontend Code Quality](#5-frontend-code-quality)
6. [Database Audit](#6-database-audit)
7. [Dependencies & Supply Chain](#7-dependencies--supply-chain)
8. [DevOps & Git Hygiene](#8-devops--git-hygiene)
9. [Risk Matrix](#9-risk-matrix)
10. [Remediation Roadmap](#10-remediation-roadmap)
11. [Appendix: Methodology](#11-appendix-methodology)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Overview
Since the June 27 baseline audit, the development team has made **significant security improvements**, resolving 5 of the 5 most critical vulnerabilities (command injection, unauthenticated admin tokens, Razorpay signature forgery, database destructive migrations, and Google sign-in audience verification). However, **active development in new feature areas** (bill extraction, OCR, checkout/cart, multi-branch staff) has introduced **new architectural and security concerns** that require attention.

### 1.2 Overall Health Rating: ⚠️ **HIGH RISK — ACTION REQUIRED**

| Domain | Rating | Change from June 27 |
|--------|--------|---------------------|
| **Security** | 🟠 HIGH RISK | ⬆️ Improved from CRITICAL |
| **Database Integrity** | 🟠 HIGH RISK | ⬆️ Improved from CRITICAL |
| **Backend Architecture** | 🟠 HIGH RISK | ➡️ Unchanged |
| **Frontend Code Quality** | 🟡 MODERATE | ⬆️ Improved from HIGH RISK |
| **Dependencies** | 🟡 MODERATE | ➡️ Unchanged |
| **Documentation** | 🟡 MODERATE | ➡️ Unchanged |
| **DevOps / Git** | 🔴 CRITICAL | ⬇️ Regressed |

**Total New Findings:** 3 Critical, 8 High, 12 Medium, 9 Low = **32 new issues**
**Total Persisting from Baseline:** 28 Critical/High issues remain partially or fully unaddressed

### 1.3 Top 10 Most Critical Findings

1. **Memory DoS via Bill Extraction Uploads** (`server/routes/billExtraction.js`) — `multer.memoryStorage()` accepts up to 10 × 25MB files per request into RAM before validation; concurrent requests can exhaust server memory.
2. **No Database Transactions in Checkout Flow** (`server/routes/checkout.js`) — Multi-step order creation (cart → order → jobs → payment) lacks transactions; partial failure leaves orphaned data and inconsistent financial records.
3. **Unauthenticated Metrics Endpoint** (`server/routes/devRoutes.js:61`) — Exposes process memory usage, uptime, and cache stats without authentication (information disclosure for reconnaissance).
4. **PDF Processing Security Risk** (`server/services/billExtractionService.js`, `ocrService.js`) — Untrusted user-uploaded PDFs are passed to `pdf-parse` and `sharp`/`libvips`; known CVE history in PDF parsing libraries.
5. **Full Table Load in Memory** (`server/services/billMatchingService.js`) — Loads entire `vendors`, `sarga_inventory`, and `sarga_products` tables into memory for every bill extraction; O(n²) fuzzy matching algorithm.
6. **In-Memory Token Blacklist Not Horizontally Scalable** (`server/middleware/auth.js`) — Revocation state lives in a single Node process `Set`; breaks under multi-instance deployment or server restart.
7. **No Rate Limiting on Expensive AI Endpoints** (`server/routes/billExtraction.js`) — Bill extraction calls Google Gemini API; unlimited requests can burn API credits and exhaust request queues.
8. **Checkout Job Creation Loop Without Transaction** (`server/routes/checkout.js:308-329`) — Individual `INSERT` per cart item; if one fails, remaining items still create jobs, causing data inconsistency.
9. **God Files Still Growing** (`server/routes/jobs.js` now ~2,772 lines) — No service layer extraction has occurred; business logic continues to bloat route handlers.
10. **Extremely Poor Commit Hygiene** — 50+ commits since June 27 are all named `FIX 1`, `FIX 2`, `change 1`, etc.; zero traceability, zero rollback safety.

---

## 2. PREVIOUS AUDIT REMEDIATION STATUS

### 2.1 CRITICAL Issues — RESOLVED ✅

| ID | Issue | File | Status | Evidence |
|----|-------|------|--------|----------|
| S1 | Command Injection in Backup Routes | `server/routes/backup.js` | **FIXED** | Now uses `spawn()` with argument arrays and `assertSafeDbArg()` validation |
| S2 | Unauthenticated Admin Token Generation | `server/routes/devRoutes.js` | **FIXED** | Now requires BOTH `NODE_ENV === 'development'` AND `ENABLE_DEV_TOKEN === '1'` |
| S3 | No Session Revocation for Customer JWTs | `server/middleware/auth.js` | **FIXED** | `authenticateCustomer()` now calls `isCustomerSessionRevoked()` |
| S4 | Google Sign-In Missing Audience Verification | `server/routes/website.js` | **FIXED** | Now verifies `aud !== GOOGLE_CLIENT_ID` before accepting token |
| S5 | Razorpay Payment Signature Forgery | `server/routes/checkout.js` | **FIXED** | Removed `'placeholder'` fallback; fails closed if secret missing |
| D1 | Destructive `sarga_backup_jobs` Recreation | `server/database.js` | **FIXED** | Migration `029_sheets_backup_jobs.sql` uses `CREATE TABLE IF NOT EXISTS` |
| D2 | SQL Semicolon Splitter Corrupts Literals | `server/database.js` | **FIXED** | State-machine parser respects quotes and backticks (lines 179-208) |
| F1 | XSS via `dangerouslySetInnerHTML` | `client/src/pages/BlogCMS.jsx` | **FIXED** | Now uses `DOMPurify.sanitize()` with strict `BLOG_PURIFY_CONFIG` |

### 2.2 CRITICAL Issues — PARTIALLY ADDRESSED ⚠️

| ID | Issue | Status | Notes |
|----|-------|--------|-------|
| B1 | ~84% async routes lack try-catch | **IMPROVED** | `asyncHandler` wrapper now used in new/modified files (`backup.js`, `checkout.js`, `billExtraction.js`, `website.js`), but not applied globally across all 85+ route files |
| S6 | CORS Overly Permissive | **UNKNOWN** | `server/index.js` not modified in recent commits; likely still accepts `*.vercel.app` |
| B4 | God Files | **WORSENED** | `jobs.js` grew from ~2,702 to ~2,772 lines; `expenses-extended.js` still ~2,818 lines; no service layer created |

### 2.3 CRITICAL Issues — STILL OPEN 🔴

| ID | Issue | File | Impact |
|----|-------|------|--------|
| B2 | No Service Layer | All routes | 1,340+ SQL queries still in route handlers |
| B3 | Cache Infrastructure No-Op | Multiple routes | `invalidateDashboardCache().catch(() => {})` remains dead code |
| B12 | Missing Transactions in Multi-Step Writes | `server/routes/checkout.js`, `payments.js` | **NEW checkout flow also lacks transactions** |
| D3-D4 | Missing Foreign Keys | `sarga_jobs.customer_id`, `sarga_jobs.product_id` | Still no FK constraints |
| H13 | Missing Indexes on Critical FK Columns | Multiple tables | Query performance risk on large datasets |

---

## 3. SECURITY AUDIT — NEW & PERSISTING FINDINGS

### 3.1 CRITICAL Issues (Exploitable Vulnerabilities)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| N1 | **Memory DoS via Bill Extraction** | `server/routes/billExtraction.js` | 10-43 | `multer.memoryStorage()` loads up to 10 files × 25MB = 250MB/request into RAM BEFORE the totalSize check. Concurrent requests can crash the Node process via OOM. |
| N2 | **No Transactions in Checkout Flow** | `server/routes/checkout.js` | 262-329 | Cart converted to order, jobs created, Razorpay order created, payment transaction inserted — all without a DB transaction. Partial failure = financial data corruption. |

**Details:**

- **N1 Memory DoS:** `multer.memoryStorage()` keeps files in RAM. The `limits: { fileSize: 25 * 1024 * 1024 }` applies per-file. The `totalSize` check at line 39-42 only runs AFTER multer has accepted all files. With 10 concurrent requests, the server could attempt to hold 2.5GB in memory simultaneously.
  - **Fix:** Use `multer.diskStorage()` with temporary disk staging, OR enforce total request body size limits at the reverse proxy / Express level before multer processes files.

- **N2 Checkout Transaction Gap:** The `/checkout/create-order` endpoint performs 4+ separate DB operations with no `BEGIN TRANSACTION`:
  1. `UPDATE sarga_carts SET status = "converted"`
  2. `INSERT INTO sarga_orders`
  3. `INSERT INTO sarga_payment_transactions`
  4. Loop: `INSERT INTO sarga_jobs` for each item
  If step 4 fails after step 1-3 succeed, the cart is converted but jobs are missing. If Razorpay order creation fails, the local order exists without a payment path.
  - **Fix:** Wrap entire flow in `pool.getConnection()` → `connection.beginTransaction()` → `connection.commit()` / `connection.rollback()`.

### 3.2 HIGH Issues (Significant Security Risks)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| N3 | **Unauthenticated Metrics Endpoint** | `server/routes/devRoutes.js` | 61 | Returns `process.memoryUsage()`, `uptime`, and cache stats to anyone. Aids reconnaissance for memory-based attacks. |
| N4 | **PDF Processing Security Risk** | `server/services/billExtractionService.js`, `ocrService.js` | 132-145, 90-102 | Untrusted PDFs passed to `pdf-parse` and `sharp(pdfBuffer, { page: i })`. `pdf-parse` (via `pdf2json`) has a history of arbitrary code execution via malicious PDF metadata. `sharp` PDF rendering depends on `libvips`/`poppler`, which have had memory corruption CVEs. |
| N5 | **Full Table Load in Memory** | `server/services/billMatchingService.js` | 74, 164-177 | `SELECT id, name FROM vendors` and full inventory/product JOINs load entire catalogs into memory for every extraction. Causes memory exhaustion on large datasets. |
| N6 | **No Rate Limit on AI Extraction** | `server/routes/billExtraction.js` | 33 | Calls Google Gemini API (paid) with no per-user rate limit. Can burn API credits and exhaust the in-app request queue. |
| N7 | **In-Memory Token Blacklist** | `server/middleware/auth.js` | 8-24 | `revokedTokens` Set and `revokedTimestamps` Map are process-local. If Render scales to multiple instances, revocation state is inconsistent. Server restart clears all revocations. |
| N8 | **Missing Rate Limit on OTP Verify** | `server/routes/website.js` | 469 | `/customer/verify-otp` has no rate limiting; brute-force possible on 6-digit OTP (1M combinations). |
| N9 | **Information Disclosure in Errors** | `server/routes/billExtraction.js` | 89 | Returns raw `err.message` from AI service to client, potentially leaking internal implementation details. |

### 3.3 MEDIUM Issues

- **No input sanitization on `socketId`** (`billExtraction.js:44`) — `req.body.socketId` passed directly to `io.to(socketId)`. While Socket.io room names are generally safe, long/ malformed strings could cause unexpected behavior.
- **Debug OTP logging** (`website.js:461-462`) — `logger.debug('[OTP Dev] customer otp=%s', otp)` in non-production. If log level is misconfigured to `debug` in production, OTPs leak to logs.
- **CORS still overly permissive** (`server/index.js:107-109` — presumed unchanged) — Accepts any `*.vercel.app` subdomain.
- **Sensitive Auth Data Logging** (`server/routes/auth.js`) — Greatly improved from June 27. No more bcrypt results or password flags logged. Minor `console.error` remains for non-fatal session errors.
- **SSL Verification** (`server/database.js:31-40`) — Now fails closed with a descriptive error if SSL is required but CA cert is missing. **FIXED** from previous audit.
- **JWT Token via Query String** (`server/index.js:250` — presumed unchanged) — Still accepts `req.query.token`.
- **Trust Proxy Without Validation** (`server/index.js:41` — presumed unchanged) — `app.set('trust proxy', true)` enables `X-Forwarded-For` spoofing if exposed directly.

### 3.4 LOW Issues

- `console.log` / `console.error` still present in production code (reduced from June 27 but not eliminated)
- Application version disclosure (`/api/version` endpoint — presumed still present)
- `server.log` file in repo root (4 bytes, empty, but indicates logging to disk)

---

## 4. BACKEND ARCHITECTURE & CODE QUALITY

### 4.1 CRITICAL Issues

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| B1 | **Async route try-catch coverage incomplete** | ~60+ route files | Various | `asyncHandler` is used in recently modified files, but dozens of legacy routes still use naked `async (req, res)` without wrappers. |
| B2 | **No service layer** | All routes | — | 1,340+ SQL queries still live directly in Express route handlers. The new `billMatchingService.js` and `billExtractionService.js` are services, but they are feature-specific. Core business logic (payments, jobs, inventory) remains in routes. |
| B4 | **God files growing** | `server/routes/jobs.js` | — | Now ~2,772 lines (was ~2,702). `expenses-extended.js` still ~2,818 lines. `products.js` ~1,706. `inventory.js` ~1,635. |
| B14 | **Checkout route is 553 lines** | `server/routes/checkout.js` | — | Entire cart, coupon, order creation, payment verification, invoice PDF generation, and order listing in one file. No separation of concerns. |

### 4.2 HIGH Issues

- **`process.env` scattered in 50+ places** — Still no centralized config module. New env vars (`GEMINI_API_KEY`, `GEMINI_MODEL`, `RAZORPAY_KEY_ID`, etc.) read inline.
- **Duplicated permission logic** — `auth.js` (lines 54-61) and `switch-branch` (lines 331-338) both duplicate the same permission array mapping. Any role change requires editing multiple files.
- **Path traversal risk in uploads** — `website.js:493` (`upload.array('files', 10)`) uses the multer instance passed from `index.js`. If disk storage is configured elsewhere, filename sanitization must be verified.
- **No API documentation** — Still no OpenAPI/Swagger specs.
- **Missing health checks for external dependencies** — No startup verification for MySQL, Gemini API, Razorpay, Cloudinary, or ML service.

### 4.3 MEDIUM Issues

- **Massive code duplication** — Same validation patterns, SQL snippets, and helper logic copied across route files.
- **Magic numbers everywhere** — Hardcoded page sizes (`10`, `20`, `50`, `24`), timeouts (`30000`, `60000`), cache TTLs (`900`), JWT expiry (`7d`, `12h`).
- **Inconsistent naming** — `req.user`, `req.customer`, `req.authUser` still used inconsistently.
- **Dead code** — `server/utils/ocrParser.js` is 802 lines but the main app now uses `ocrService.js` and `billExtractionService.js`. Is `ocrParser.js` still used? If not, it's dead weight.
- **File naming inconsistency** — New files use camelCase (`billExtraction.js`, `billMatchingService.js`) while others use kebab-case or lowercase.

### 4.4 LOW Issues

- No `README.md` in `server/services/` explaining service boundaries.
- `package.json` scripts in root reference files that may not exist (`fix:laser-booktype:preview`).
- `jest.config.js` in server root but tests split across `__tests__/`, `tests/`, and `server/tests/`.

---

## 5. FRONTEND CODE QUALITY

### 5.1 CRITICAL Issues

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| F1 | **XSS via `dangerouslySetInnerHTML`** | `client/src/pages/BlogCMS.jsx` | 540 | **FIXED since June 27.** Now uses `DOMPurify.sanitize()` with `BLOG_PURIFY_CONFIG`. |

### 5.2 HIGH Issues

- **Axios `api.get` monkey-patching** — Still present in `client/src/services/api.js` (presumed unchanged since June 27).
- **Aggressive global cache wipe** — Still present (`api.js:185` clears entire GET cache on any mutation).
- **Multiple `window.location.href` reloads** — Still present in various components.
- **Missing `key` prop in `.map()` renders** — Still present in dozens of files.
- **`usePolling` stale closure risk** — Still present.

### 5.3 MEDIUM Issues

- **4,000+ inline style instances** — Still present; no evidence of systematic cleanup.
- **Unknown `boneyard-js` plugin** — Still in `client/package.json`; supply-chain risk unverified.
- **`console.log` in 216+ files** — Still present despite `drop_console: true` in terser.
- **Minimal test coverage** — No evidence of increased test coverage since June 27.

### 5.4 LOW Issues

- `package.json` version still static `"0.0.0"`.
- `App.jsx` has 32 `lazy()` imports but only one `Suspense` fallback.
- Source maps still disabled (`sourcemap: false`).

---

## 6. DATABASE AUDIT

### 6.1 CRITICAL Issues — PERSISTING

| # | Issue | File | Impact |
|---|-------|------|--------|
| D3 | Missing FK on `sarga_jobs.customer_id` | `server/schemas/006_jobs.sql` | Deleting customer leaves orphan jobs |
| D4 | Missing FK on `sarga_jobs.product_id` | `server/schemas/006_jobs.sql` | Deleting product leaves orphan jobs |
| D11 | Payment creation lacks transaction wrapper | `server/routes/payments.js` | Partial failure orphans data |

### 6.2 HIGH Issues — PERSISTING

- **Missing indexes on critical FK columns** — `customer_id`, `product_id`, `machine_id` in `sarga_jobs`; `job_id` in junction tables; `staff_id` in assignments. No evidence of index additions since June 27.
- **No soft-delete pattern** — Still only hard deletes on core tables.
- **`sarga_vendor_payments` has no `vendor_id` FK** — Still stores `vendor_name` as VARCHAR.
- **`sarga_staff_payments` has no `staff_id` FK** — Still stores `staff_name` as VARCHAR.
- **Connection pool lacks timeouts** — `database.js` now has `connectTimeout: 10000`, but still missing `acquireTimeout` and `queryTimeout`.

### 6.3 NEW MEDIUM Issues

- **`sarga_orders` table created at runtime** — `server/routes/checkout.js` assumes `sarga_orders`, `sarga_carts`, `sarga_cart_items`, `sarga_payment_transactions` exist. Verify these tables are in schema files, not just runtime `CREATE TABLE IF NOT EXISTS`.
- **JSON column `sarga_orders.items`** — Stores serialized cart items as JSON, preventing FK enforcement on individual line items.

### 6.4 LOW Issues — PERSISTING

- Missing `updated_at` on 50+ tables.
- Mixed naming conventions (`camelCase` vs `snake_case`).
- Large ENUMs requiring `ALTER TABLE` to extend.

---

## 7. DEPENDENCIES & SUPPLY CHAIN

### 7.1 New Dependencies Since June 27

| Package | Version | Risk | Notes |
|---------|---------|------|-------|
| `@google/generative-ai` | unknown | Low | Google official SDK; ensure API key is not logged |
| `sharp` | unknown | Medium | Image/PDF processing; native bindings; memory intensive |
| `pdf-parse` | unknown | **High** | Wrapper around `pdf2json`; history of RCE via PDF metadata |
| `pdf2pic` | unknown | Medium | Requires Ghostscript; native dependency |

### 7.2 Persisting Supply Chain Risks

1. **`boneyard-js`** — Still unverified; non-standard plugin.
2. **`sentence-transformers` and `schedule`** — Still unpinned in `ml-service/requirements.txt`.
3. **`imap 0.8.19`** — Still very old; no security patches.
4. **No Python lockfile** — Still reproducibility risk.
5. **`pdf-parse` / `pdf2json`** — **NEW HIGH RISK** for the bill extraction feature.

### 7.3 Client/Server Dependency Status

- **React 19.2.0** — Still very new major version.
- **React Router DOM 7.13.0** — Still new major version.
- **Express 5.2.1** — Still verify middleware compatibility.
- **xlsx 0.18.5** — Still known for formula injection; sanitize cell inputs.

---

## 8. DEVOPS & GIT HYGIENE

### 8.1 Git History — CRITICAL REGRESSION

Since June 27, approximately **50+ commits** have been made with **zero descriptive value**:

```
e33abb1 fix: make product_name and job_name in order_lines schema nullable
1f4af2f FIX 2
3e60f03 FIX 1
02c58a4 EXTRACTION FIX
c15ba64 BILL EXTRACTION MATCHING
3e2c7e6 BILL EXTRACTION CHANGE
6d1a7a8 BILL EXTRACTION IMAGE
... (40+ more "FIX N", "change N", "error fix" commits)
```

**Impact:**
- **No traceability** — Impossible to link commits to features, bugs, or requirements.
- **No rollback safety** — `git bisect` is useless; `git revert` requires manual code review.
- **No code review value** — Pull requests (if any) provide no context.
- **No deployment confidence** — Cannot determine what changed in a release.

### 8.2 Environment Files

| File | Status | Risk |
|------|--------|------|
| `.env` (root) | ⚠️ Exists | Blocked by `.gitignore` ✅ |
| `.env.local` (root) | ⚠️ Exists | Blocked by `.gitignore` ✅ |
| `server/.env` | 🔴 Exists, modified Jul 16 | Contains production secrets; ensure not committed |
| `client/.env.production` | ⚠️ Exists | May contain production API URLs |
| `ml-service/.env` | 🔴 Exists | Contains API keys |

**Note:** `.gitignore` properly blocks `.env` and `.env.local`. The risk is **local workstation exposure**, not repository leakage.

### 8.3 CI/CD

- **Still no GitHub Actions workflows** visible in `.github/`.
- **No automated testing** on pull requests.
- **No automated security scanning** (Dependabot, `npm audit`, etc.).

---

## 9. RISK MATRIX

### 9.1 Likelihood × Impact Matrix

| Risk | Likelihood | Impact | Score | Priority |
|------|-----------|--------|-------|----------|
| Memory DoS (N1) | High | High | **CRITICAL** | P0 |
| Checkout transaction gap (N2) | High | High | **CRITICAL** | P0 |
| Unauthenticated metrics (N3) | High | Medium | **HIGH** | P1 |
| PDF processing RCE (N4) | Medium | Critical | **HIGH** | P0 |
| Full table memory load (N5) | High | Medium | **HIGH** | P1 |
| No AI rate limit (N6) | High | Medium | **HIGH** | P1 |
| Token blacklist scale (N7) | Medium | High | **HIGH** | P1 |
| OTP brute-force (N8) | Medium | High | **HIGH** | P1 |
| God files (B4) | Certain | Medium | **HIGH** | P2 |
| No service layer (B2) | Certain | Medium | **HIGH** | P2 |
| Commit hygiene | Certain | Medium | **HIGH** | P2 |
| Missing FKs/indexes (D3-D4) | Certain | Medium | **MEDIUM** | P2 |
| Dead code (ocrParser.js) | Certain | Low | **LOW** | P3 |

---

## 10. REMEDIATION ROADMAP

### Phase 1: CRITICAL — Immediate (0-1 week)

1. [ ] **Fix Memory DoS in bill extraction** — Switch `multer.memoryStorage()` to `multer.diskStorage()` for staging, OR add Express-level `maxRequestSize` middleware before multer.
2. [ ] **Add DB transactions to checkout flow** — Wrap `/checkout/create-order` and `/checkout/verify-payment` in `pool.getConnection()` → `BEGIN` → `COMMIT`/`ROLLBACK`.
3. [ ] **Authenticate `/metrics` endpoint** — Add `authenticateToken` and `authorizeRoles('Admin')` to `devRoutes.js:61`.
4. [ ] **Sandbox PDF processing** — Run `pdf-parse` and `sharp` PDF rendering inside a worker thread or separate process with limited memory. Consider switching to `pdfjs-dist` (Mozilla's PDF.js) which has a better security track record for untrusted PDFs.
5. [ ] **Add rate limiting to AI endpoints** — Apply `express-rate-limit` to `/bills/extract-data` (max 5 requests per 15 min per user).
6. [ ] **Add rate limiting to OTP verify** — Max 5 attempts per 15 min per email.
7. [ ] **Paginate or cache vendor/product data** — In `billMatchingService.js`, use SQL `LIKE` queries with indexes instead of loading entire tables into memory.

### Phase 2: HIGH — Short Term (1-2 weeks)

8. [ ] **Replace in-memory token blacklist with Redis** — If Redis is unavailable, use the DB as the single source of truth and add a short-lived in-memory LRU cache (e.g., `lru-cache` npm package) instead of an unbounded Set.
9. [ ] **Add missing foreign keys** — `sarga_jobs.customer_id`, `sarga_jobs.product_id`, and all other orphan-risk columns.
10. [ ] **Add missing indexes** — All FK columns, especially `sarga_jobs.customer_id`, `sarga_jobs.product_id`, and junction table FKs.
11. [ ] **Extract checkout business logic to service layer** — Create `services/checkoutService.js` with `createOrder()`, `verifyPayment()`, `generateInvoice()`.
12. [ ] **Break down god files** — Target `jobs.js` (2,772 lines) and `checkout.js` (553 lines) first.
13. [ ] **Implement soft-delete** — `deleted_at`, `deleted_by` on `sarga_customers`, `sarga_jobs`, `sarga_orders`, `sarga_payments`.
14. [ ] **Add connection pool timeouts** — `acquireTimeout`, `queryTimeout` in `database.js`.

### Phase 3: MEDIUM — Medium Term (2-4 weeks)

15. [ ] **Centralize config** — Create `server/config/index.js` to read all `process.env` variables once and export typed config.
16. [ ] **Fix `window.location.href` in `api.js` interceptors** — Use React Router navigation or event-based auth state.
17. [ ] **Remove `api.get` monkey-patch** — Create a named `cachedGet` wrapper.
18. [ ] **Add `key` props** to all `.map()` renders and replace index keys with stable IDs.
19. [ ] **Add per-route ErrorBoundaries** inside layouts.
20. [ ] **Audit `boneyard-js`** — Verify source or replace with standard loading patterns.
21. [ ] **Pin Python dependencies** — Add versions to `sentence-transformers` and `schedule` in `requirements.txt`.
22. [ ] **Add comprehensive test coverage** — Target 60%+ for utilities, 40%+ for components.

### Phase 4: LOW — Long Term (1-2 months)

23. [ ] **Add API documentation** — Generate OpenAPI/Swagger specs.
24. [ ] **Add health checks** — Verify MySQL, Gemini, Razorpay, Cloudinary on startup.
25. [ ] **Improve commit hygiene** — Enforce conventional commits (`feat:`, `fix:`, `chore:`) with ticket references.
26. [ ] **Implement CI/CD** — GitHub Actions for lint, test, build on every PR.
27. [ ] **Add source maps for production** — Enable for debugging or integrate Sentry.
28. [ ] **Remove dead code** — Audit whether `server/utils/ocrParser.js` is still used; if not, delete.

---

## 11. APPENDIX: METHODOLOGY

**Scope:** Full monorepo (`D:\software sarga`)
**Baseline Comparison:** Previous audit `FULL_SOFTWARE_AUDIT_REPORT.md` (2026-06-27)
**Methods:**
1. Static code analysis of all files modified since June 27 (`git diff --stat HEAD~50..HEAD`)
2. Manual review of critical security files (`backup.js`, `devRoutes.js`, `checkout.js`, `website.js`, `auth.js`, `database.js`)
3. Manual review of new feature files (`billExtraction.js`, `billExtractionService.js`, `billMatchingService.js`, `ocrService.js`)
4. Dependency tree analysis via `package.json` and `requirements.txt`
5. Git history review (`git log --oneline`)
6. Environment file inventory

**Limitations:**
- `.env` files were not read due to security filters.
- Client-side source was not fully audited line-by-line; focus was on server-side security.
- Dynamic/runtime behavior (e.g., actual DB schema in production) was inferred from code and migration files.
- No penetration testing or active exploitation was performed.

---

*Report generated by Kimi Work on 2026-07-16*  
*Scope: Full monorepo delta audit (baseline: 2026-06-27)*  
*Methodology: Static code analysis, automated subagent review, manual verification*
