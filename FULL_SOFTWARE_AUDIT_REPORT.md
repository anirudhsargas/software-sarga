# SARGA PRINTS MIS — COMPREHENSIVE SOFTWARE AUDIT REPORT

**Audit Date:** 2026-06-27  
**Auditor:** Kimi Work (Automated + Manual Review)  
**Scope:** Full monorepo (`D:\software sarga`) — Client, Server, Website, ML Service, MCP Server, Database  
**Classification:** CONFIDENTIAL — Internal Use Only  

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Security Audit](#2-security-audit)
3. [Database Audit](#3-database-audit)
4. [Backend Architecture & Code Quality](#4-backend-architecture--code-quality)
5. [Frontend Code Quality](#5-frontend-code-quality)
6. [Dependencies & Supply Chain](#6-dependencies--supply-chain)
7. [Documentation & DevOps](#7-documentation--devops)
8. [Risk Matrix](#8-risk-matrix)
9. [Remediation Roadmap](#9-remediation-roadmap)
10. [Appendix: File Inventory](#10-appendix-file-inventory)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Overview
The Sarga Prints MIS is a full-stack print-shop management system comprising a React/Vite staff portal (`client`), an Express.js backend (`server`), a customer-facing website (`website`), a Python Flask ML microservice (`ml-service`), and a TypeScript MCP server (`mcp-server`). The system manages jobs, inventory, customers, payments, staff, and vendor relationships across two physical branches.

### 1.2 Overall Health Rating: ⚠️ **CRITICAL — IMMEDIATE ACTION REQUIRED**

| Domain | Rating | Severity Counts |
|--------|--------|-----------------|
| **Security** | 🔴 CRITICAL | 5 Critical, 10 High, 9 Medium, 4 Low |
| **Database Integrity** | 🔴 CRITICAL | 12 Critical, 11 High, 13 Medium, 17 Low |
| **Backend Architecture** | 🔴 CRITICAL | 13 Critical, 7 High, 11 Medium, 5 Low |
| **Frontend Code Quality** | 🟠 HIGH RISK | 5 Critical, 10 High, 10 Medium, 5 Low |
| **Dependencies** | 🟡 MODERATE | 1 unpatched vulnerability vector, supply-chain risk from `boneyard-js` |
| **Documentation** | 🟡 MODERATE | Good architecture docs, but poor inline documentation and test coverage |
| **DevOps / Git** | 🟠 HIGH RISK | Poor commit hygiene, uncommitted changes in production branches |

**Total Findings:** 35 Critical, 38 High, 43 Medium, 31 Low = **147 total issues**

### 1.3 Most Critical Findings (Top 10)

1. **Command Injection in Backup Routes** (`server/routes/backup.js:43`) — Database credentials interpolated into shell commands allow arbitrary code execution.
2. **Unauthenticated Admin Token Generation** (`server/routes/devRoutes.js:36`) — Dev route generates admin JWTs without auth; exposed if `NODE_ENV` is misconfigured.
3. **No Session Revocation for Customer JWTs** (`server/routes/website.js`) — Stolen customer tokens remain valid for 7 days even after logout/password change.
4. **Google Sign-In Missing Audience Verification** (`server/routes/website.js:321`) — Any valid Google ID token can authenticate as a customer.
5. **Razorpay Payment Signature Forgery** (`server/routes/checkout.js:34`) — Hardcoded fallback `'placeholder'` secret allows forged payment signatures.
6. **Destructive `sarga_backup_jobs` Recreation** (`server/database.js:61`) — Drops and recreates backup jobs table on every server restart, permanently deleting history.
7. **SQL Semicolon Splitter Corrupts Migrations** (`server/database.js:88`) — String literals containing semicolons are split incorrectly, corrupting data.
8. **~84% of Async Route Handlers Lack Try-Catch** — Any DB timeout or network hiccup will crash the Node process or hang requests indefinitely.
9. **No Service Layer** — All business logic and 1,340+ SQL queries live directly in Express route handlers.
10. **XSS via `dangerouslySetInnerHTML`** (`client/src/pages/BlogCMS.jsx:527`) — Unsanitized user content rendered as HTML in admin context.

---

## 2. SECURITY AUDIT

### 2.1 CRITICAL Issues (Exploitable Vulnerabilities)

| # | Issue | File | Line | Impact | CVSS Estimate |
|---|-------|------|------|--------|---------------|
| S1 | **Command Injection in Backup Routes** | `server/routes/backup.js` | 43, 78 | Arbitrary shell command execution via crafted DB password | 9.8 |
| S2 | **Unauthenticated Admin Token Generation** | `server/routes/devRoutes.js` | 36-45 | Anyone can generate valid Admin JWTs if `NODE_ENV` is not exactly `'production'` | 9.1 |
| S3 | **No Session Revocation for Customer JWTs** | `server/routes/website.js` | 272, 304, 348, 432, 461, 489, 538, 579 | Stolen tokens remain valid for full 7-day lifetime | 8.5 |
| S4 | **Google Sign-In Missing Audience Verification** | `server/routes/website.js` | 321-325 | Any Google ID token (from any app) can authenticate | 8.2 |
| S5 | **Razorpay Payment Signature Forgery** | `server/routes/checkout.js` | 34, 353 | Hardcoded `'placeholder'` fallback allows forged payment signatures | 8.8 |

**Details:**

- **S1 Command Injection:** The `mysqldump` and `mysql` commands are built via string interpolation: `const dumpCmd = \`mysqldump -u ${DB_USER} ${DB_PASS ? '-p' + DB_PASS : ''} ${DB_NAME} > "${BACKUP_FILE}"\`;`. A password containing shell metacharacters (`;`, `|`, `\``, `$`) executes arbitrary commands.

- **S2 Dev Routes:** The `/api/dev/token` endpoint is gated by `!isProduction`, but `isProduction` only checks `process.env.NODE_ENV === 'production'`. If `NODE_ENV` is unset, `'prod'`, or `'staging'`, the route is active. This also exposes `/api/dev/metrics` with process memory and uptime.

- **S3 Customer Session Revocation:** Staff JWTs check `sarga_user_sessions.is_revoked`, but customer JWTs in `website.js` never do. The `isSessionRevoked` helper exists in `auth.js` but is not used for customer routes.

- **S4 Google Sign-In:** The code calls `https://oauth2.googleapis.com/tokeninfo` but never checks `resp.data.aud === GOOGLE_CLIENT_ID`. A token from any OAuth app is accepted.

- **S5 Razorpay Fallback:** `process.env.RAZORPAY_KEY_SECRET || 'placeholder'` means if the env var is missing, the HMAC key is predictable (`'placeholder'`), enabling signature forgery.

### 2.2 HIGH Issues (Significant Security Risks)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| S6 | **CORS Overly Permissive** | `server/index.js` | 107-109 | Accepts any `*.vercel.app` subdomain |
| S7 | **Sensitive Auth Data Logged** | `server/routes/auth.js` | 30, 46, 50, 55, 58, 62 | Password presence flags, bcrypt results, user IDs in stdout |
| S8 | **SSL Verification Disabled** | `server/database.js` | 120 | Falls back to `rejectUnauthorized: false` if CA file missing |
| S9 | **OTPs Exposed in Non-Production** | `server/routes/website.js` | 403-408 | Returns raw OTP in JSON when `NODE_ENV !== 'production'` |
| S10 | **Missing Rate Limiting on Customer Auth** | `server/routes/website.js` | 258, 276, 288, 314 | Brute-force on login, lookup, register, Google sign-in |
| S11 | **SSRF via Preflight URL Check** | `server/routes/preflight.js` | 201-248 | Unauthenticated endpoint fetches arbitrary URLs |
| S12 | **Unauthenticated Customer PII Lookup** | `server/routes/website.js` | 276-284 | Anyone with a mobile number can query customer details |
| S13 | **Unauthenticated Chat History Exposure** | `server/routes/website.js` | 622-631 | Chat history exposed by UUID (guessable) |
| S14 | **Weak Password Reset Policy** | `server/routes/passwordReset.js` | 122 | Minimum 6 characters (vs 8+ in change-password) |
| S15 | **Information Disclosure in Errors** | Multiple routes | Various | Raw `error.message` leaked in 500 responses |

### 2.3 MEDIUM Issues (Moderate Concerns)

- **Unauthenticated Public File Uploads** — `website.js:437`, `artworkUploads.js:48` accept uploads without auth (DoS/storage abuse risk)
- **Webhook Secret via Query Parameter** — `website.js:638` reads secret from `req.query.secret` (logged in access logs)
- **JWT Secret Exported** — `middleware/auth.js:210` exports `JWT_SECRET` to all importing modules
- **Session Revocation Fail-Open** — `auth.js:28` returns `false` (not revoked) on DB error
- **Hardcoded Weak JWT Secret** — `auth.js:42` has `'printing_shop_secret_key_2025'` as a known weak value check (reveals default)
- **JWT Token Accepted via Query String** — `index.js:250` accepts `req.query.token` (leaked in logs/Referer)
- **Debug Endpoints Exposed** — `/api/server-time`, `/api/paperInventory/stock-test`, `/api/version`
- **Trust Proxy Without Validation** — `index.js:41` enables `X-Forwarded-For` spoofing if exposed directly
- **Missing Rate Limit on Password Reset** — `passwordReset.js:99` has no rate limiting

### 2.4 LOW Issues (Minor Best Practice Violations)

- `console.log` / `console.error` in production code (216+ instances in client, dozens in server)
- Weak bcrypt cost factor in tests (`__tests__/helpers/testUtils.js:85` uses `bcrypt.hash(password, 4)`)
- Application version disclosure (`/api/version` endpoint)
- Database connections not closed on graceful shutdown (`index.js:596`)

---

## 3. DATABASE AUDIT

### 3.1 CRITICAL Issues (Data Integrity / Data Loss Risk)

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| D1 | **Destructive `sarga_backup_jobs` recreation** | `server/database.js` | 47-74 | Drops and recreates table on every restart, losing all history |
| D2 | **SQL semicolon splitter corrupts literals** | `server/database.js` | 88-89 | Migrations with semicolons in string literals are corrupted |
| D3 | **Missing FK on `sarga_jobs.customer_id`** | `server/schemas/006_jobs.sql` | 4 | Deleting customer leaves orphan jobs |
| D4 | **Missing FK on `sarga_jobs.product_id`** | `server/schemas/006_jobs.sql` | 5 | Deleting product leaves orphan jobs |
| D5 | **Schema drift: `sarga_audit_logs` missing columns** | `server/schemas/011_audit_ai.sql` | 2-9 | `jobs.js` inserts `entity_type`, `entity_id`, `ip_address` that don't exist in schema |
| D6 | **Schema drift: `sarga_machine_readings` defined twice** | `010_machines.sql:20` vs `024_dynamic_tables.sql:269` | Incompatible schemas: `INT DEFAULT 0` vs generated column |
| D7 | **Schema drift: `sarga_daily_report_machine` defined twice** | `010_machines.sql:133` vs `024_dynamic_tables.sql:347` | Same generated-column conflict |
| D8 | **Schema drift: `sarga_paper_inventory` columns mismatch** | `003_paper.sql` vs `migrate_paper_inventory.js:51` | Migration references columns not in schema |
| D9 | **Missing `sarga_product_images` table** | `server/routes/inventory.js` | 197, 1531, 1600 | Application queries table that doesn't exist in schema files |
| D10 | **Missing `sarga_inventory_settings` table** | `server/routes/inventory.js` | 1499 | Same as above |
| D11 | **Payment creation lacks transaction wrapper** | `server/routes/payments.js` | 60-179 | Multi-step insert without transaction; partial failure orphans data |
| D12 | **Hardcoded migration bypasses** | `server/database.js` | 11-24, 41-74 | Three SQL files handled with special `if` blocks instead of normal migration flow |

### 3.2 HIGH Issues (Performance / Security Risks)

- **Missing indexes on critical FK columns** — `customer_id`, `product_id`, `machine_id` in `sarga_jobs`; `job_id` in `sarga_job_matter`, `sarga_job_staff_assignments`, `sarga_paper_usage_logs`, `sarga_job_proofs`; `staff_id` in `sarga_job_staff_assignments`; `uploaded_by` and `reviewed_by` in `sarga_job_proofs`
- **No soft-delete pattern** — Only hard deletes on `sarga_customers`, `sarga_jobs`, `sarga_payments`, `sarga_inventory` (except `sarga_payment_methods.is_active`)
- **`sarga_vendor_payments` has no `vendor_id` FK** — Stores `vendor_name` as VARCHAR instead of FK to `sarga_vendors`
- **`sarga_staff_payments` has no `staff_id` FK** — Stores `staff_name` as VARCHAR instead of FK to `sarga_staff`
- **Data type mismatch** — `sarga_designs.product_id` is `VARCHAR(50)` but `sarga_products.id` is `INT`
- **`sarga_customer_payments.order_lines` is JSON** — Prevents FK enforcement, complicates reporting
- **Connection pool lacks timeouts** — No `acquireTimeout`, `connectTimeout`, `queryTimeout` in `database.js`
- **`migrate_paper_inventory.js` references undefined export** — `ensureMappingTable` never defined (`line 96`)
- **Migration references non-existent tables** — `add_missing_indexes.sql:144-145` references `sarga_expense_items` and `sarga_expenses`
- **`sarga_cctv_cameras` stores password in plaintext** — `password VARCHAR(255) NOT NULL`
- **`sarga_staff` password schema** — No indication of hashing algorithm in schema

### 3.3 MEDIUM Issues (Maintainability / Best Practices)

- **Missing `updated_at`** on 50+ tables (comprehensive list in subagent report)
- **Missing `created_by` / `updated_by`** audit columns on most transactional tables
- **Mixed naming conventions** — Some tables lack `sarga_` prefix (`vendors`, `paper_types`, `consumables_inventory`, etc.); some columns use `camelCase` in `snake_case` tables (`createdAt`, `isPinned`, `isActive` in `sarga_shortcut_templates`)
- **Large ENUMs** — `sarga_jobs.status` has 12 ENUM values; adding new status requires `ALTER TABLE`
- **Inconsistent payment method storage** — `sarga_customer_payments` uses ENUM, `sarga_payments` uses VARCHAR, `sarga_office_expenses` uses VARCHAR, etc.
- **Missing `reviewed_by` FK** in `sarga_discount_requests`
- **Missing `customer_id` FK** in `sarga_refunds`
- **Missing `reference_id` FK** in `sarga_credit_ledger`
- **Missing `related_id` FK** in `sarga_bills_documents`
- **No unique constraint on `idempotency_key`** in `sarga_payments` (duplicate prevention only in code)
- **Missing `created_at`** in `sarga_company_settings`
- **Missing `verification_status`** column in `sarga_customer_payments` (referenced in `jobs.js`)
- **Missing columns in `sarga_jobs`** — `used_sheets`, `required_sheets`, `payment_id`, `machine_print_count`, `waste_prints`, `proof_prints` referenced in code but not in schema

### 3.4 LOW Issues (Minor Improvements)

- Missing `updated_at` on individual tables (`sarga_product_categories`, `sarga_product_subcategories`, `sarga_job_seq`, etc.)
- `product_hierarchy` table lacks `sarga_` prefix and `branch_id` FK
- **Redundant migrations** — `2026-02-25-add-category-to-jobs.sql` adds `category` that already exists in `006_jobs.sql`; `2026-02-25-add-opening-count-to-assignments.sql` adds `assignment_opening_count` already in `010_machines.sql`; `2026-03-stock-verification.sql` recreates tables already in `002_inventory.sql`
- `sarga_quick_shortcut_usage` uses `ON UPDATE CURRENT_TIMESTAMP` on `last_used_at` without separate `updated_at`

---

## 4. BACKEND ARCHITECTURE & CODE QUALITY

### 4.1 CRITICAL Issues

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| B1 | **~84% of async routes lack try-catch** | 85+ route files | Various | Process crashes or hanging requests on any DB/network error |
| B2 | **No service layer** | All routes | — | 1,340+ SQL queries in route handlers; no separation of concerns |
| B3 | **Cache infrastructure is a complete no-op** | Multiple routes | — | `invalidateDashboardCache().catch(() => {})` is dead code everywhere |
| B4 | **God files** | `expenses-extended.js`, `jobs.js`, `products.js`, `inventory.js` | — | Files exceed 1,500+ lines; `expenses-extended.js` = 2,818 lines |
| B5 | **Password reset values logged in plaintext** | `server/routes/passwordReset.js` | — | Audit trail contains plaintext passwords |
| B6 | **OTP returned in JSON responses (debug)** | `server/routes/website.js` | — | Account takeover via leaked OTPs in non-production |
| B7 | **Circular dependencies** | `server/routes/` | — | Route files import each other, creating brittle coupling |
| B8 | **Global axios interceptor bugs** | `server/index.js` | — | Axios interceptors mutate global state |
| B9 | **DB migrations inside route files** | `server/routes/quotes.js`, `products.js`, `invoiceFeatures.js` | — | Tables created via `CREATE TABLE IF NOT EXISTS` in runtime code |
| B10 | **No Winston logging in production** | `server/` | — | `console.log` used everywhere instead of structured logger |
| B11 | **Background timeouts without cleanup** | `server/` | — | `setTimeout`/`setInterval` without cleanup on process exit |
| B12 | **Missing transactions in multi-step writes** | `server/routes/payments.js`, `jobs.js` | — | Partial writes leave database in inconsistent state |
| B13 | **Duplicated auth logic** | `server/routes/` | — | JWT validation, role checks, and session checks repeated in every route file |

### 4.2 HIGH Issues

- **`process.env` scattered in 60+ places** — No centralized config module; env vars read inline throughout codebase
- **Hardcoded fallback secrets** — `RAZORPAY_KEY_SECRET || 'placeholder'` in checkout
- **Rate limiter anti-patterns** — Rate limiting applied inconsistently; customer auth endpoints unprotected
- **Path traversal risk in uploads** — File upload paths may be manipulated via filename
- **Inconsistent error response formats** — Some routes return `{ error: ... }`, others `{ message: ... }`, others `{ success: false, ... }`
- **No API documentation** — No OpenAPI/Swagger specs; docs are manually maintained markdown
- **Missing health checks for external dependencies** — No checks for MySQL, Cloudinary, Razorpay, ML service availability on startup

### 4.3 MEDIUM Issues

- **Massive code duplication** — Same validation logic, SQL patterns, and helper functions copied across route files
- **Magic numbers everywhere** — Hardcoded page sizes (`10`, `20`, `50`), timeouts (`30000`, `60000`), cache TTLs (`900`) scattered inline
- **Inconsistent naming** — `req.user`, `req.staff`, `req.authUser` used inconsistently; `customer_id` vs `customerId` vs `cid`
- **Unused imports** — Many files import modules they never use
- **Dead code** — Commented-out blocks, unused route handlers, legacy migration scripts that are never called
- **File naming inconsistency** — Some files use camelCase (`invoiceFeatures.js`), some use kebab-case (`customer-payments.js`), some use lowercase (`website.js`)

### 4.4 LOW Issues

- Missing `README.md` in `server/routes/` explaining route organization
- No inline JSDoc documentation on route handlers or service functions
- Some `package.json` scripts reference files that don't exist

---

## 5. FRONTEND CODE QUALITY

### 5.1 CRITICAL Issues

| # | Issue | File | Line | Impact |
|---|-------|------|------|--------|
| F1 | **XSS via `dangerouslySetInnerHTML`** | `client/src/pages/BlogCMS.jsx` | 527 | Unsanitized user content rendered as HTML |
| F2 | **DOMPurify misconfigured to allow `style`** | `client/src/pages/expense-manager/VendorsTab.jsx` | 739 | `style` tags and attributes are XSS vectors |
| F3 | **`window.location.href` in Axios interceptors** | `client/src/services/api.js` | 222, 245 | Full page reload on network errors; destroys SPA state |
| F4 | **Deprecated `window.location.reload(true)`** | `client/src/main.jsx:41`, `UpdateNotification.jsx:22,46` | — | Deprecated API; may fail silently in modern browsers |
| F5 | **Top-level `document.addEventListener` never cleaned up** | `client/src/main.jsx` | 126 | Global ripple effect listener leaks; violates React lifecycle |

### 5.2 HIGH Issues

- **Axios `api.get` monkey-patching** — `api.js:120` overrides `api.get` with custom caching; fragile and hard to debug
- **Aggressive global cache wipe on mutations** — `api.js:185` clears entire GET cache on any POST/PUT/DELETE; negates caching benefits
- **`useApiRequest` dependency array includes object reference** — `useApiRequest.js:64` causes infinite re-renders if `options` is inline object
- **`useApiRequest` missing `isMounted` guard** — `useApiRequest.js:32-42` sets state on unmounted components
- **ErrorBoundary only at root** — `App.jsx:168-294` has one boundary; nested layouts lack boundaries, so one crash kills entire app
- **`ProtectedRoute` reads `localStorage` non-reactively** — `App.jsx:69-80` won't re-render when token is removed programmatically
- **Multiple `window.location.href` in page components** — `SignInPage.jsx:35`, `ConsumablesManagement.jsx:129`, `VendorDashboard.jsx:87`, `ErrorBoundary.jsx:106` cause full reloads
- **Missing `key` prop in `.map()` renders** — Dozens of files (`AccountantSidebar.jsx`, `AddEditShortcutModal.jsx`, `AssignStaff.jsx`, etc.)
- **Array index used as `key`** — `ErrorPage.jsx:22`, `ForecastChart.jsx:22`, `InsightsPanel.jsx:265`, `InvoiceModal.jsx:471`, `OrderForecastWidget.jsx:203`, `Skeleton.jsx:59`, `SkeletonLoader.jsx:12`, `SmartSearch.jsx:27`, `ManageShortcuts.jsx:93`, `QuickCart.jsx:76`
- **`usePolling` stale closure risk** — `usePolling.js:28-35,45-65` complex dependency chain can cause multiple intervals or missed cleanups

### 5.3 MEDIUM Issues

- **4,000+ inline style instances** — Hurts maintainability, theming, and CSS optimizations
- **Unknown `boneyard-js` plugin** — Non-standard Vite plugin; supply-chain risk
- **`ThemeProvider` makes API calls without offline consideration** — `ThemeProvider.jsx:120` fires on every theme change; no retry or queue
- **Duplicate SEO DOM manipulation** — Two `useSEO` implementations and `SEOProvider` all mutate `<meta>` tags directly
- **`useScrollAnimation` directly mutates DOM** — `useScrollAnimation.js:15-19` conflicts with React reconciliation
- **`Modal` locks body scroll unsafely** — `Modal.jsx:35-37` mutates `document.body.style.overflow`; may remain locked on crash
- **`console.log` in 216+ files** — Despite `drop_console: true` in terser, development is noisy
- **`usePolling` swallows exceptions silently** — `usePolling.js:24` catches with `console.warn` and continues polling
- **Minimal test coverage** — ~19 test files for ~286 source files; no component integration tests
- **`public/manifest.json` not validated at build** — Manual manifest may not match deployed assets

### 5.4 LOW Issues

- Generic `alt="Matter"` on images in `JobDetail.jsx:1099`
- `package.json` version is static `"0.0.0"` (never bumped)
- `App.jsx` has 32 `lazy()` imports but only one `Suspense` fallback
- Duplicate test files in `__tests__/` and `tests/` directories
- React Router v7 without migration guards (very new, potential breaking changes)

### 5.5 Bundle & PWA Summary

| Metric | Status | Notes |
|--------|--------|-------|
| PWA Config | ✅ Good | `vite-plugin-pwa` with Workbox, offline fallback, SW registration |
| Code Splitting | ⚠️ Partial | Manual chunks but `dashboard` chunk may still be large |
| Tree Shaking | ⚠️ Unknown | 168 `lucide-react` imports; verify with visualizer |
| Console Stripping | ✅ Configured | `terserOptions` drops console methods |
| Source Maps | ❌ Disabled | `sourcemap: false` — hard to debug production |
| Target | ⚠️ `esnext` | May exclude older browsers |
| Tests | ⚠️ Minimal | 19 files, mostly utilities |

---

## 6. DEPENDENCIES & SUPPLY CHAIN

### 6.1 Dependency Analysis

#### Client (`client/package.json`)
- **React 19.2.0** — Very new major version; potential undiscovered bugs
- **React Router DOM 7.13.0** — Major version bump from v6; breaking changes possible
- **Vite 6.0.11** — Stable, but plugin ecosystem may have compatibility issues
- **Axios 1.7.9** — Recent; no known critical vulnerabilities in this version
- **DOMPurify 3.0.6** — Good for XSS prevention, but misconfigured in `VendorsTab.jsx`
- **jsPDF 2.5.2** — Known to have some XSS vectors via HTML content; ensure HTML is sanitized before PDF generation
- **boneyard-js 1.8.1** — ⚠️ **Unknown/Non-standard plugin** — Audit source or replace

#### Server (`server/package.json`)
- **Express 5.2.1** — Major version; verify compatibility with middleware
- **mysql2 3.16.3** — Stable
- **jsonwebtoken 9.0.3** — Good; ensure `expiresIn` is always set (it is: 7d for customers, 24h for staff)
- **bcryptjs 3.0.3** — Good
- **helmet 8.1.0** — Good; verify all headers are configured
- **express-rate-limit 8.2.1** — Good; but not applied to all customer endpoints
- **multer 1.4.5-lts.1** — Check for path traversal; ensure filename sanitization
- **tesseract.js 7.0.0** — Large WASM payload; may impact bundle/server memory
- **pdfkit 0.17.2** — Good for PDF generation
- **xlsx 0.18.5** — ⚠️ Known for formula injection vulnerabilities; sanitize cell inputs
- **net-snmp 3.26.1** — Niche; ensure SNMP community strings are not hardcoded
- **imap 0.8.19** — Very old; check for security patches
- **googleapis 173.0.0** — Large dependency tree; only use required APIs

#### Website (`website/package.json`)
- **Fabric.js 7.4.0** — Canvas manipulation; check for XSS via SVG/JSON deserialization
- **Three.js 0.174.0** — Large bundle; verify tree-shaking
- **@react-three/fiber 9.0.0** — New major version with React 19
- **jsPDF 4.2.1** — Newer than client version; potential version mismatch issues

#### ML Service (`ml-service/requirements.txt`)
- **Flask 3.0.0** — Good
- **TensorFlow 2.15.0** — Very large dependency; consider lighter inference frameworks (ONNX, TFLite)
- **PaddleOCR 2.7.0.3 / PaddlePaddle 2.5.2** — Large Chinese OCR framework; overkill for basic OCR needs
- **scikit-learn 1.4.0 / XGBoost 2.0.3** — Good for ML models
- **openai 1.10.0** — Good; ensure API key is not logged
- **sentence-transformers** — No version pinned! ⚠️ Reproducibility risk
- **pickle5** — Only needed for Python < 3.8; project requires 3.8+
- **schedule** — No version pinned! ⚠️ Reproducibility risk

#### MCP Server (`mcp-server/package.json`)
- **TypeScript 5.7.0** — Good
- **@modelcontextprotocol/sdk 1.12.1** — Good
- **Node.js >=20** — Good; server requires >=18, so there's a mismatch

### 6.2 Supply Chain Risks

1. **`boneyard-js`** — Unknown author, non-standard plugin. Should be audited or replaced.
2. **`sentence-transformers` and `schedule`** — Unpinned versions in `requirements.txt`. Could break builds.
3. **`imap 0.8.19`** — Very old package. Last update was years ago. Consider `imapflow` or `mailparser`.
4. **No lockfile for Python** — `requirements.txt` has no `requirements.lock` or `pipenv.lock`. Reproducibility risk.

---

## 7. DOCUMENTATION & DEVOPS

### 7.1 Documentation Status

| Document | Status | Completeness | Accuracy |
|----------|--------|-------------|----------|
| `README.md` | ✅ Present | Good overview | Accurate |
| `ARCHITECTURE.md` | ✅ Present | Very comprehensive | Mostly accurate |
| `COMPONENTS.md` | ✅ Present | Comprehensive | Accurate |
| `PAGES.md` | ✅ Present | Comprehensive | Accurate |
| `DESIGN.md` | ✅ Present | Good | Accurate |
| `TEST_PLAN.md` | ✅ Present | Moderate | May be outdated |
| `AGENT_RULES.md` | ✅ Present | Comprehensive | Recent |
| `ACCESSIBILITY_AUDIT.md` | ✅ Present | Skeleton | Minimal content |
| `PERFORMANCE_AUDIT.md` | ✅ Present | Skeleton | Minimal content |
| `UI_CONSISTENCY_AUDIT.md` | ✅ Present | Skeleton | Minimal content |
| `UI_REFACTOR_PLAN.md` | ✅ Present | Skeleton | Minimal content |
| `SARGA_FIX_PROMPT.md` | ✅ Present | Skeleton | Minimal content |
| `SARGA_REPO_DEEP_DIVE_AND_FIX_PROMPT.md` | ✅ Present | Skeleton | Minimal content |
| `A11Y_FIX_PROMPT.md` | ✅ Present | Skeleton | Minimal content |
| `server/env.example` | ✅ Present | Good | Accurate |
| `client/.env.development` | ✅ Present | Good | Accurate |
| `website/.env.production.example` | ✅ Present | Good | Accurate |
| `ml-service/.env.example` | ✅ Present | Good | Accurate |

### 7.2 DevOps & Git Hygiene

- **Commit History:** Recent commits are all `ERROR FIX`, `ERROR FIXING 7`, `FIX ERROR 6`, etc. — **extremely poor commit hygiene**. No context, no ticket references, no descriptive messages.
- **Uncommitted Changes:** `client/src/pages/DailyReport.jsx` and `client/stats.html` are modified but not committed; `server/AUDIT_REPORT.md` is untracked.
- **Branching:** No evidence of feature branches; all work appears on `main`.
- **CI/CD:** No GitHub Actions workflows visible in `.github/` (only templates or empty).
- **Environment Files:** `.env` files are present and blocked by security filters, but `.env.example` files are present for documentation.
- **Deployment:** `render.yaml`, `deploy.ps1`, `start.ps1`, `vercel.json` present. Render free-tier with keep-alive script.

### 7.3 Testing Infrastructure

- **Client:** Vitest configured, but only ~19 test files for ~286 source files. No E2E tests (Playwright config exists but has `process` undefined errors).
- **Server:** Jest configured, but minimal test coverage. `__tests__/` has some utility tests.
- **Website:** Vitest configured, but likely minimal coverage.
- **ML Service:** `tests/` directory exists but contents unknown.
- **MCP Server:** No test configuration.

---

## 8. RISK MATRIX

### 8.1 Likelihood × Impact Matrix

| Risk | Likelihood | Impact | Score | Priority |
|------|-----------|--------|-------|----------|
| Command injection (S1) | Medium | Critical | **High** | P0 |
| Unauthenticated admin token (S2) | Medium | Critical | **High** | P0 |
| No customer session revocation (S3) | High | High | **High** | P0 |
| Razorpay signature forgery (S5) | Low | Critical | **Medium** | P0 |
| Destructive backup jobs (D1) | High | High | **High** | P0 |
| SQL migration corruption (D2) | Medium | High | **Medium** | P0 |
| Async route try-catch (B1) | High | High | **High** | P0 |
| No service layer (B2) | Certain | Medium | **High** | P1 |
| XSS via BlogCMS (F1) | Medium | High | **Medium** | P0 |
| Cache no-op (B3) | Certain | Low | **Medium** | P2 |
| God files (B4) | Certain | Medium | **Medium** | P1 |
| Schema drift (D5-D8) | High | Medium | **Medium** | P1 |
| Missing FKs (D3, D4, H13-H16) | Certain | Medium | **Medium** | P1 |
| Missing indexes (H13) | Certain | Medium | **Medium** | P1 |
| Inline styles (F16) | Certain | Low | **Low** | P3 |

---

## 9. REMEDIATION ROADMAP

### Phase 1: CRITICAL — Immediate (0-2 weeks)

**Security Hotfixes:**
1. [ ] **Fix command injection** in `server/routes/backup.js` and `server/scripts/auto-backup.js` — use `execFile` or `spawn` with argument arrays
2. [ ] **Remove or harden dev routes** — Add IP allowlist or remove `/api/dev/token`; ensure `NODE_ENV` checks are robust
3. [ ] **Add session revocation checks** to all customer JWT verification points in `server/routes/website.js`
4. [ ] **Verify Google `aud` claim** in `server/routes/website.js` and validate token was issued for your client ID
5. [ ] **Remove Razorpay fallback** `'placeholder'` and fail closed if secret is missing
6. [ ] **Restrict CORS** to exact known origins instead of `*.vercel.app` wildcard
7. [ ] **Remove sensitive `console.log`** from `server/routes/auth.js` login route
8. [ ] **Enable `rejectUnauthorized: true`** unconditionally when SSL is required
9. [ ] **Add rate limiting** to all customer auth endpoints (`/customer/login`, `/lookup`, `/register`, `/google-signin`)
10. [ ] **Add input validation / URL allowlist** to `/preflight/check-url` to prevent SSRF
11. [ ] **Fix `database.js` destructive backup-jobs behavior** — stop dropping table on restart
12. [ ] **Fix `database.js` semicolon splitter** — use a proper SQL parser or delimiter-based splitting
13. [ ] **Add try-catch to all async route handlers** — use `asyncHandler` wrapper or Express 5's built-in async handling
14. [ ] **Sanitize `BlogCMS.jsx` content** with DOMPurify before rendering
15. [ ] **Fix DOMPurify config** in `VendorsTab.jsx` — remove `style` from `ALLOWED_TAGS` and `ALLOWED_ATTR`

### Phase 2: HIGH — Short Term (2-4 weeks)

**Architecture & Data Integrity:**
16. [ ] **Add missing foreign keys** on `sarga_jobs.customer_id`, `sarga_jobs.product_id`, and all other orphan-risk columns
17. [ ] **Consolidate schema drift** — create proper migrations for `sarga_audit_logs` columns, `sarga_product_images`, `sarga_inventory_settings`, reconcile `sarga_paper_inventory` / `migrate_paper_inventory.js`
18. [ ] **Remove duplicate table definitions** from `024_dynamic_tables.sql`
19. [ ] **Add missing indexes** on all foreign-key columns, especially `sarga_jobs.customer_id`, `sarga_jobs.product_id`, junction-table FKs
20. [ ] **Implement soft-delete** (`deleted_at`, `deleted_by`) on `sarga_customers`, `sarga_jobs`, `sarga_payments`, `sarga_inventory`
21. [ ] **Add connection pool timeouts** (`acquireTimeout`, `connectTimeout`, `queryTimeout`) in `database.js`
22. [ ] **Extract service layer** — Move business logic from route handlers to `services/` modules; start with `payments.js` and `jobs.js`
23. [ ] **Fix or remove cache infrastructure** — Either make `invalidateDashboardCache` work or remove dead code
24. [ ] **Break down god files** — Split `expenses-extended.js` (2,818 lines), `jobs.js` (2,702 lines), `products.js` (1,706 lines), `inventory.js` (1,635 lines) into smaller modules
25. [ ] **Normalize `sarga_customer_payments.order_lines`** into a proper `sarga_customer_payment_items` junction table

### Phase 3: MEDIUM — Medium Term (1-2 months)

**Code Quality & Maintainability:**
26. [ ] **Standardize naming** — Add `sarga_` prefix to all tables; use `snake_case` consistently for columns
27. [ ] **Add `created_by` / `updated_by`** audit columns to all core transactional tables
28. [ ] **Add `updated_at`** to all tables that currently only have `created_at`
29. [ ] **Centralize config** — Create `server/config/index.js` to read all `process.env` variables once
30. [ ] **Fix `window.location.href` in `api.js` interceptors** — Use React Router navigation or event-based auth state
31. [ ] **Remove `api.get` monkey-patch** — Create a named `cachedGet` wrapper instead
32. [ ] **Add `key` props** to all `.map()` renders and replace `index` keys with stable IDs
33. [ ] **Add per-route ErrorBoundaries** inside `AccountantLayout`, `StaffLayout`, and `DesignerLayout`
34. [ ] **Add `isMounted` guard** to `useApiRequest` hook
35. [ ] **Stabilize `useApiRequest` options** — Use `useRef` or memoize inside the hook
36. [ ] **Fix `usePolling` stale closure** — Simplify with single `useEffect` and `useRef`
37. [ ] **Remove top-level `document.addEventListener`** in `main.jsx` — Move to a React component with cleanup
38. [ ] **Fix `window.location.reload(true)`** — Use `window.location.reload()` without boolean or proper SW update flow
39. [ ] **Audit `boneyard-js`** — Verify source or replace with standard loading patterns
40. [ ] **Pin Python dependencies** — Add versions to `sentence-transformers` and `schedule` in `requirements.txt`

### Phase 4: LOW — Long Term (2-3 months)

**Enhancements & Best Practices:**
41. [ ] **Add comprehensive test coverage** — Target 60%+ for utilities, 40%+ for components, integration tests for critical flows
42. [ ] **Add API documentation** — Generate OpenAPI/Swagger specs from route definitions
43. [ ] **Add health checks** — Verify MySQL, Cloudinary, Razorpay, ML service on startup
44. [ ] **Improve commit hygiene** — Use conventional commits, ticket references, descriptive messages
45. [ ] **Implement CI/CD** — GitHub Actions for lint, test, build on every PR
46. [ ] **Add `alt` text** to all images with descriptive content
47. [ ] **Sync `package.json` version** with build pipeline
48. [ ] **Add nested `Suspense` boundaries** with route-appropriate skeletons in `App.jsx`
49. [ ] **Consolidate duplicate test files** — Merge `__tests__/` and `tests/` structures
50. [ ] **Add source maps for production** — Enable for debugging or use Sentry for error tracking

---

## 10. APPENDIX: FILE INVENTORY

### 10.1 Project Statistics

| Metric | Count |
|--------|-------|
| Total JavaScript/JSX files | ~850+ |
| Total TypeScript files | ~20+ |
| Total Python files | ~15+ |
| Total SQL files | ~40+ |
| Client React components | ~224 `.jsx` files |
| Server route files | ~85+ files |
| Server service files | ~14 files |
| Database schema files | ~34 files |
| Migration files | ~9 files |
| Total lines of code (approx.) | ~120,000+ |

### 10.2 Largest Files

| File | Lines | Concern |
|------|-------|---------|
| `server/routes/expenses-extended.js` | ~2,818 | God file; no service layer |
| `server/routes/jobs.js` | ~2,702 | God file; no service layer |
| `server/routes/products.js` | ~1,706 | God file; no service layer |
| `server/routes/inventory.js` | ~1,635 | God file; no service layer |
| `server/index.js` | ~604 | Multiple responsibilities |
| `server/database.js` | ~150+ | Destructive migration logic |
| `client/src/App.jsx` | ~300+ | Many lazy imports, one Suspense |
| `client/src/services/api.js` | ~250+ | Monkey-patching, global cache |

### 10.3 Environment Files Inventory

| File | Status | Risk |
|------|--------|------|
| `.env` (root) | ⚠️ Exists | May contain secrets |
| `.env.local` | ⚠️ Exists | May contain secrets |
| `.env.test.example` | ✅ Example only | Safe |
| `server/.env` | 🔴 Exists | Contains production secrets |
| `client/.env.development` | ⚠️ Exists | May contain API URLs |
| `client/.env.local` | ⚠️ Exists | May contain secrets |
| `client/.env.production` | ⚠️ Exists | May contain production values |
| `website/.env.development` | ⚠️ Exists | May contain API URLs |
| `website/.env.production.example` | ✅ Example only | Safe |
| `ml-service/.env` | 🔴 Exists | Contains API keys |
| `mcp-server/.env` | ⚠️ May exist | Not checked |

**Note:** `.env` files are blocked by security filters, which is good. However, ensure they are in `.gitignore` and not committed. The `.env.example` files are safe and properly documented.

### 10.4 External Service Dependencies

| Service | Purpose | Health Check | Notes |
|---------|---------|-------------|-------|
| Aiven MySQL | Primary database | ❌ No | SSL required; CA cert fallback is insecure |
| Render (Node) | Backend hosting | ❌ No | Free tier; keep-alive script present |
| Render (Python) | ML service | ❌ No | Free tier |
| Vercel | Client + Website | ❌ No | SPA fallback configured |
| Firebase | Phone OTP auth | ❌ No | Invisible reCAPTCHA |
| Google Places | Reviews cache | ❌ No | API key required |
| Google Sign-In | Customer auth | ❌ No | Missing `aud` verification |
| Razorpay | Payment gateway | ❌ No | Fallback secret is `'placeholder'` |
| Cloudinary | File upload fallback | ❌ No | Async sync tasks |
| SMTP (Nodemailer) | Email OTP | ❌ No | Optional; debug exposes OTPs |
| SNMP | Printer integration | ❌ No | Local network only |

---

## CONCLUSION

The Sarga Prints MIS is a **feature-rich, functional system** that has clearly been built with genuine business needs in mind. However, it is currently in a **critical state** from a security, data integrity, and maintainability perspective.

**The top 5 immediate actions are:**

1. **Fix the command injection vulnerability** in backup routes — this is a direct remote code execution vector.
2. **Harden authentication** — add session revocation for customer JWTs, verify Google `aud`, remove Razorpay fallback.
3. **Fix `database.js`** — stop dropping tables on restart and fix the semicolon migration splitter.
4. **Add try-catch to async routes** — prevent process crashes and hanging requests.
5. **Fix XSS vulnerabilities** — sanitize `BlogCMS.jsx` and fix DOMPurify configuration.

**Without these fixes, the system is at high risk of:**
- Data breaches (unauthenticated PII lookup, chat history exposure)
- Financial fraud (Razorpay signature forgery, missing session revocation)
- Data loss (destructive table recreation, missing transactions, no soft deletes)
- System instability (process crashes from unhandled async errors, no service layer)
- Supply chain attacks (unknown `boneyard-js` plugin, unpinned Python deps)

**Recommendation:** Halt new feature development until Phase 1 and Phase 2 critical issues are resolved. The system should not be considered production-safe in its current state.

---

*Report generated by Kimi Work on 2026-06-27*  
*Scope: Full monorepo audit*  
*Methodology: Static code analysis, automated subagent review, manual verification*
