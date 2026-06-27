# Implementation Plan

## Overview

This task list covers all 11 confirmed bugs (B1–B11) across the Sarga Prints MIS monorepo. Tasks are grouped by dependency into four phases: Group 1 creates new infrastructure (mlAxios module and customer auth helpers), Group 2 applies targeted fixes to individual files (depends on Group 1 for B4), Group 3 bulk-wraps async route handlers across 50+ files (independent, can run in parallel), and Group 4 writes exploration, preservation, and integration tests for all fixes.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"] },
    { "wave": 3, "tasks": ["15", "16"] },
    { "wave": 4, "tasks": ["17"] }
  ],
  "dependencies": {
    "3":  ["1", "2"],
    "5":  ["2"],
    "14": ["1"],
    "15": ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"],
    "16": ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"],
    "17": ["15", "16"]
  }
}
```

## Tasks

## Group 1 — New Infrastructure (no dependencies on each other)

- [x] 1. Create `server/helpers/mlAxios.js` — scoped axios instance for ML calls (B11)
  - Create new file `server/helpers/mlAxios.js`
  - `const mlAxios = axios.create()` — dedicated instance, never the global default
  - Register the ML interceptor on `mlAxios` only: check `ENABLE_ML`, block localhost in production
  - Use `logger` from `../helpers` (or `./logger`) for `logger.debug('[AI_DISABLED] ML skipped')`
  - Export `module.exports = mlAxios`
  - Do NOT touch the global `axios` instance in this file
  - _Bug_Condition: isBugCondition_B11(axiosInstance) — axiosInstance === require('axios') AND interceptor registered on global AND URL is non-ML_
  - _Expected_Behavior: ML interceptor is scoped to mlAxios; global axios instance is unmodified_
  - _Preservation: ENABLE_ML=false short-circuits ML requests; production localhost guard still active (Requirements 3.19, 3.20, 3.21)_
  - _Requirements: 2.19, 2.20_

- [x] 2. Add `authenticateCustomer`, `isCustomerSessionRevoked`, `revokeCustomerSessionInCache` to `server/middleware/auth.js` (B4)
  - Add `isCustomerSessionRevoked(token)`: hash token with sha256, check in-memory `revokedTokens` Set first (O(1) fast path), then query `sarga_customer_sessions WHERE session_token = ? AND is_revoked = 1`; fail-closed on DB error
  - Add `authenticateCustomer` Express middleware: read `Authorization: Bearer` header, call `verifyWithAnySecret(token)`, assert `decoded.role === 'Customer'` (401 if not), call `isCustomerSessionRevoked` (401 if revoked), set `req.customer = decoded`, call `next()`; set `Cache-Control: no-store` headers
  - Add `revokeCustomerSessionInCache(token)`: mirrors `revokeSessionInCache` — adds sha256 hash to `revokedTokens` Set with timestamp
  - Add all three to `module.exports`
  - No schema changes needed — `sarga_customer_sessions` with `is_revoked` column already exists
  - _Bug_Condition: isBugCondition_B4(token, db) — decoded.role == 'Customer' AND sarga_customer_sessions.is_revoked = 1_
  - _Expected_Behavior: authenticateCustomer returns HTTP 401 for any revoked customer token_
  - _Preservation: Non-revoked customer JWTs fulfil requests without friction; staff JWT revocation via isSessionRevoked flow unchanged (Requirements 3.7, 3.8)_
  - _Requirements: 2.7, 2.8_

---

## Group 2 — Startup Guards and Small Targeted Fixes (depends on Group 1)

- [x] 3. Fix `server/index.js` — remove global axios interceptor, add startup guards (B1, B2, B3, B11)
  - **B11:** Remove lines 8–24 (the global `axios.interceptors.request.use(...)` block); the interceptor now lives in `server/helpers/mlAxios.js` only
  - **B1:** Add startup assertion for `DB_USER` and `DB_NAME`: if either contains characters outside `[A-Za-z0-9_-]`, call `logger.error('FATAL: ...')` and `process.exit(1)`
  - **B2:** Add startup warning block: if `RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET` is absent or empty, log `logger.warn('[startup] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set — payment routes will be disabled')` (do not exit; `getRazorpay()` will throw on first use)
  - **B3:** Add startup warning: if `GOOGLE_CLIENT_ID` is not set, log `logger.warn('[startup] GOOGLE_CLIENT_ID not set — Google sign-in audience check is disabled')`
  - No changes to the `asyncHandler` defined locally in `server/index.js` (used for inline registrations only)
  - _Bug_Condition: isBugCondition_B1 (unsafe DB_USER/DB_NAME), isBugCondition_B2 (absent RAZORPAY_KEY_SECRET), isBugCondition_B11 (global interceptor)_
  - _Expected_Behavior: Process exits on unsafe env vars; startup warnings logged for missing payment/Google creds; global axios untouched_
  - _Preservation: All existing startup logic, JWT_SECRET checks, and route registrations unchanged (Requirements 3.1, 3.3, 3.19–3.21)_
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.19_

- [x] 4. Fix `server/routes/backup.js` — add `assertSafeDbArg` validator before spawn (B1)
  - Add `assertSafeDbArg(value, name)` helper at top of file (after imports): throws `Error` if value is empty or contains characters outside `[A-Za-z0-9_-]`
  - In `POST /backups`: call `assertSafeDbArg(DB_USER, 'DB_USER')` and `assertSafeDbArg(DB_NAME, 'DB_NAME')` before the `spawn` call; `asyncHandler` will forward any thrown error to the Express error handler (HTTP 500)
  - In `POST /backups/restore`: same — add `assertSafeDbArg` calls before the `spawn` call
  - Do NOT change the `spawn` call signature; `MYSQL_PWD` env-var approach for password is already correct
  - _Bug_Condition: isBugCondition_B1(env) — DB_USER or DB_NAME contains characters outside [A-Za-z0-9_-]_
  - _Expected_Behavior: assertSafeDbArg throws before spawn; error forwarded to Express error handler; no unsanitized value reaches child process argv_
  - _Preservation: Valid backup produces .sql file; valid restore replays database; spawn call signature unchanged (Requirements 3.1, 3.2)_
  - _Requirements: 2.1, 2.2_

- [x] 5. Fix `server/routes/website.js` — customer session revocation, strip PII from login response, add logout endpoint, add OTP dev logger (B4, B7, B8)
  - **B4:** Import `authenticateCustomer` and `revokeCustomerSessionInCache` from `../middleware/auth`; remove the local `isCustomerSessionRevoked` function and local `authenticateCustomer` helper; update `GET /customer/dashboard`, `GET /job/:id`, `POST /jobs/:id/proofs/:proofId/review-customer`, `GET /invoices/:invoiceId/download` to use `authCustomerMiddleware` as route middleware and replace `req.headers.authorization` inline JWT decode with `req.customer.id`
  - **B7:** In `POST /customer/send-otp`, after the `mailSent = false` branch, add: `if (!mailSent && process.env.NODE_ENV !== 'production') { logger.debug('[OTP Dev] customer_id=%d otp=%s', customer.id, otp); }` — no change to response body
  - **B8 (login response):** In `POST /customer/login`, remove `customer` from the `res.json(...)` call — return only `{ message, token, customerId: customer.id, customerName: customer.name }`
  - **B8 (logout endpoint):** Add `POST /customer/logout`: read Bearer token, `UPDATE sarga_customer_sessions SET is_revoked = 1 WHERE session_token = ?`, call `revokeCustomerSessionInCache(token)`, return `{ message: 'Logged out' }`; wrap with `asyncHandler`
  - _Bug_Condition: isBugCondition_B4 (revoked token accepted), isBugCondition_B7 (OTP invisible when SMTP fails), isBugCondition_B8 (email in login response)_
  - _Expected_Behavior: Revoked tokens return 401 on all customer routes; OTP written to logger.debug in dev; login response contains no email/address_
  - _Preservation: Non-revoked JWTs fulfil requests; SMTP OTP delivery and response shape unchanged; authenticated lookup still returns full PII (Requirements 3.7, 3.12, 3.13, 3.14)_
  - _Requirements: 2.7, 2.8, 2.12, 2.13, 2.14, 2.15_

- [x] 6. Fix `server/routes/staff.js` — redact password in audit log (B9)
  - In `PUT /:id/reset-password` (line ~335), change the `auditLog` call: replace `` `... to ${normalizedMobile}@Sarga` `` with `` `... to [REDACTED]` ``
  - `normalizedMobile` variable is NOT removed — it is still used to hash the password
  - Single-line string change only; no logic changes
  - _Bug_Condition: isBugCondition_B9(auditDetails) — auditDetails contains normalizedMobile@Sarga in plaintext_
  - _Expected_Behavior: sarga_audit_logs.details contains '[REDACTED]' instead of the plaintext password formula_
  - _Preservation: Password hashing, is_first_login = 1, and success response to admin caller all unchanged; audit log still records actor, action type, staff name and ID (Requirements 3.15, 3.16)_
  - _Requirements: 2.16_

- [x] 7. Fix `client/src/pages/BlogCMS.jsx` — add explicit ALLOWED_TAGS config to DOMPurify call (B5)
  - Verify `import DOMPurify from 'dompurify'` is present at top of file
  - Define `BLOG_PURIFY_CONFIG` constant (outside the render function): `{ ALLOWED_TAGS: ['p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','a','blockquote','code','pre','br','hr','img','table','thead','tbody','tr','th','td','span','div'], ALLOWED_ATTR: ['href','src','alt','class','id','target','rel','colspan','rowspan'], FORCE_BODY: true }`
  - Update the `dangerouslySetInnerHTML` assignment at line ~527 to pass `BLOG_PURIFY_CONFIG` as the second argument to `DOMPurify.sanitize(..., BLOG_PURIFY_CONFIG)`
  - _Bug_Condition: isBugCondition_B5(content) — content contains executable HTML AND DOMPurify called without explicit ALLOWED_TAGS_
  - _Expected_Behavior: sanitized output has all executable content stripped; ALLOWED_TAGS locks down permitted tag set_
  - _Preservation: Safe HTML tags (p, h2, ul, li, strong, em, a) continue to render correctly in preview; edit tab raw HTML textarea unaffected (Requirements 3.9, 3.10)_
  - _Requirements: 2.9_

- [x] 8. Fix `client/src/pages/expense-manager/VendorsTab.jsx` — add FORCE_BODY: true to DOMPurify call (B6)
  - At line 739, update the `DOMPurify.sanitize` options object to add `FORCE_BODY: true`
  - Final config: `{ ALLOWED_TAGS: ['div','table','thead','tbody','tr','th','td','h2'], ALLOWED_ATTR: ['id','colspan'], FORCE_BODY: true }`
  - Confirm `'style'` is not in `ALLOWED_TAGS` (it is already absent; preserve that)
  - _Bug_Condition: isBugCondition_B6(allowedTags) — 'style' IN allowedTags (already removed; FORCE_BODY gap remains)_
  - _Expected_Behavior: sanitized output contains no style tag or CSS injection vector; FORCE_BODY ensures full document wrapping_
  - _Preservation: Table structure (headers, rows, totals) renders correctly after sanitization (Requirements 3.11)_
  - _Requirements: 2.10, 2.11_

---

## Group 3 — asyncHandler Bulk Wrap (independent, can run in parallel)

- [-] 9. Add asyncHandler to route files batch A (B10)
  - Files: `server/routes/branches.js`, `server/routes/accounts.js`, `server/routes/anomalies.js`, `server/routes/artworkUploads.js`, `server/routes/auditInvoice.js`, `server/routes/businessHub.js`, `server/routes/chatbot.js`, `server/routes/coupons.js`, `server/routes/customerDesigns.js`, `server/routes/dashboardInit.js`
  - For each file: add `const { asyncHandler } = require('../helpers');` at the top (remove any local `asyncHandler` definition if present)
  - Wrap every `async (req, res) => { ... }` route handler with `asyncHandler(...)`
  - Do not alter any route logic, response bodies, or middleware chains
  - _Bug_Condition: isBugCondition_B10(handler) — handler is async AND not wrapped in asyncHandler AND contains at least one await_
  - _Expected_Behavior: DB errors propagate to next(err); Express error handler returns HTTP 500; process does not crash_
  - _Preservation: Successful handler responses return identical status code and body (Requirements 3.17, 3.18)_
  - _Requirements: 2.17, 2.18_

- [-] 10. Add asyncHandler to route files batch B (B10)
  - Files: `server/routes/designCheck.js`, `server/routes/devRoutes.js`, `server/routes/forecast.js`, `server/routes/frontOffice.js`, `server/routes/insights.js`, `server/routes/internalBooks.js`, `server/routes/internalTransactions.js`, `server/routes/internalTransfers.js`, `server/routes/jobPriority.js`, `server/routes/machines.js`
  - For each file: add `const { asyncHandler } = require('../helpers');` at the top (remove any local `asyncHandler` definition if present)
  - Wrap every `async (req, res) => { ... }` route handler with `asyncHandler(...)`
  - Do not alter any route logic, response bodies, or middleware chains
  - _Bug_Condition: isBugCondition_B10(handler) — handler is async AND not wrapped in asyncHandler AND contains at least one await_
  - _Expected_Behavior: DB errors propagate to next(err); Express error handler returns HTTP 500; process does not crash_
  - _Preservation: Successful handler responses return identical status code and body (Requirements 3.17, 3.18)_
  - _Requirements: 2.17, 2.18_

- [-] 11. Add asyncHandler to route files batch C (B10)
  - Files: `server/routes/ocr.js`, `server/routes/orderForecast.js`, `server/routes/orderPredictions.js`, `server/routes/paperLayout.js`, `server/routes/pickupSlots.js`, `server/routes/portfolio.js`, `server/routes/preflight.js`, `server/routes/premiumFeatures.js`, `server/routes/productionTracker.js`, `server/routes/promotions.js`
  - For each file: add `const { asyncHandler } = require('../helpers');` at the top (remove any local `asyncHandler` definition if present)
  - Wrap every `async (req, res) => { ... }` route handler with `asyncHandler(...)`
  - Do not alter any route logic, response bodies, or middleware chains
  - _Bug_Condition: isBugCondition_B10(handler) — handler is async AND not wrapped in asyncHandler AND contains at least one await_
  - _Expected_Behavior: DB errors propagate to next(err); Express error handler returns HTTP 500; process does not crash_
  - _Preservation: Successful handler responses return identical status code and body (Requirements 3.17, 3.18)_
  - _Requirements: 2.17, 2.18_

- [-] 12. Add asyncHandler to route files batch D (B10)
  - Files: `server/routes/proofs.js`, `server/routes/quotes.js`, `server/routes/requests.js`, `server/routes/search.js`, `server/routes/seasonal.js`, `server/routes/seo.js`, `server/routes/settingsDailyBook.js`, `server/routes/shortcuts.js`, `server/routes/staffDashboard.js`, `server/routes/staffPortal.js`
  - For each file: add `const { asyncHandler } = require('../helpers');` at the top (remove any local `asyncHandler` definition if present)
  - Wrap every `async (req, res) => { ... }` route handler with `asyncHandler(...)`
  - Do not alter any route logic, response bodies, or middleware chains
  - _Bug_Condition: isBugCondition_B10(handler) — handler is async AND not wrapped in asyncHandler AND contains at least one await_
  - _Expected_Behavior: DB errors propagate to next(err); Express error handler returns HTTP 500; process does not crash_
  - _Preservation: Successful handler responses return identical status code and body (Requirements 3.17, 3.18)_
  - _Requirements: 2.17, 2.18_

- [-] 13. Add asyncHandler to route files batch E (B10)
  - Files: `server/routes/stockPlanning.js`, `server/routes/stockRequests.js`, `server/routes/stockVerification.js`, `server/routes/translations.js`, `server/routes/upsell.js`, `server/routes/utilityEmail.js`, `server/routes/variableData.js`, `server/routes/websiteReviews.js`, `server/routes/whatsappAnalytics.js`, `server/routes/whatsapp.js`, `server/routes/websiteInquiries.js`, `server/routes/websiteDesigns.js`
  - For each file: add `const { asyncHandler } = require('../helpers');` at the top; for `websiteReviews.js` and `whatsappAnalytics.js` which have a local `asyncHandler` definition, remove the local definition and use the canonical import
  - Wrap every `async (req, res) => { ... }` route handler with `asyncHandler(...)`
  - Do not alter any route logic, response bodies, or middleware chains
  - _Bug_Condition: isBugCondition_B10(handler) — handler is async AND not wrapped in asyncHandler AND contains at least one await_
  - _Expected_Behavior: DB errors propagate to next(err); Express error handler returns HTTP 500; process does not crash_
  - _Preservation: Successful handler responses return identical status code and body (Requirements 3.17, 3.18)_
  - _Requirements: 2.17, 2.18_

- [ ] 14. Update ML route files to use `mlAxios` instead of global `axios` (B11)
  - Files: `server/routes/anomalies.js`, `server/routes/chatbot.js`, `server/routes/expenseCategorizer.js`, `server/routes/forecast.js`, `server/routes/insights.js`, `server/routes/orderForecast.js`, `server/routes/seasonal.js`, `server/routes/stockPlanning.js`, `server/routes/aiUpsell.js`, `server/routes/aiTurnaround.js`
  - For each file: replace `const axios = require('axios')` with `const axios = require('../helpers/mlAxios')`
  - No logic changes; all existing `axios.get/post` call sites remain identical
  - **Do NOT change `server/routes/website.js`** — the Google tokeninfo call in `POST /customer/google-signin` uses global axios intentionally (non-ML call)
  - _Bug_Condition: isBugCondition_B11 — ML route using global axios instance picks up the interceptor_
  - _Expected_Behavior: mlAxios carries the ML interceptor; ENABLE_ML=false short-circuits ML calls; production localhost guard active_
  - _Preservation: All ML route calls work identically when ENABLE_ML=true; non-ML axios usage (website.js google-signin) completely unaffected (Requirements 3.19, 3.20, 3.21)_
  - _Requirements: 2.19, 2.20_

---

## Group 4 — Tests (depends on all implementation tasks above)

- [~] 15. Write unit tests for B1–B9 fixes
  - **B1 — assertSafeDbArg:** Unit test the helper with valid identifiers (`sarga_db`, `root`) → no throw; invalid identifiers (containing space, `;`, `--`) → throws `Error`. Test that backup route returns HTTP 500 when DB_USER is unsafe.
  - **B2 — Razorpay startup guard:** Test that server startup emits `logger.warn` when `RAZORPAY_KEY_SECRET` is absent; test that `getRazorpay()` throws when the key is missing.
  - **B3 — Google audience enforcement:** Test `POST /customer/google-signin` with a token whose `aud` does not match `GOOGLE_CLIENT_ID` (when set) → HTTP 401. With matching `aud` → proceeds to customer lookup.
  - **B4 — Customer session revocation:** Test `authenticateCustomer` middleware: revoked token (DB `is_revoked = 1`) → HTTP 401; non-revoked valid token → `req.customer` set and `next()` called; in-memory blacklist fast path → no DB query on second check.
  - **B5 — Blog XSS prevention:** Test that `DOMPurify.sanitize(content, BLOG_PURIFY_CONFIG)` strips `<script>`, `onerror=`, and `<img src=x onerror=alert(1)>` payloads; safe tags (`<p>`, `<h2>`, `<ul>`) pass through intact.
  - **B6 — VendorsTab DOMPurify:** Test that `DOMPurify.sanitize(html, config)` with the updated config does not produce any `<style>` tag in output; structural table tags (`<table>`, `<tr>`, `<td>`) are preserved; `FORCE_BODY: true` wraps fragment correctly.
  - **B7 — OTP response body:** Test that `POST /customer/send-otp` response body never contains an `otp` field (both when SMTP succeeds and when it fails); test that when `mailSent = false` and `NODE_ENV !== 'production'`, `logger.debug` is called with the OTP value.
  - **B8 — Login PII strip:** Test that `POST /customer/login` response does not contain `email` or `address` fields; test that it still contains `token`, `customerId`, `customerName`. Test that `GET /customer/lookup` (authenticated) still returns full PII.
  - **B9 — Audit log redaction:** Test that triggering `PUT /staff/:id/reset-password` results in an audit log `details` string that does not match `/@Sarga/` or any mobile number pattern; assert it contains `[REDACTED]`; assert it still contains the staff member's name and ID.
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 2.1–2.16, 3.1–3.16_

- [ ] 16. Write property-based and integration tests for B10 (asyncHandler) and B11 (mlAxios isolation)

  - [~] 16.1 Write bug condition exploration test
    - **Property 1: Bug Condition** — Async Route Handler Crash on DB Error (B10)
    - **CRITICAL**: Write this test BEFORE implementing the fix (Tasks 9–13) if running in exploratory mode; it MUST FAIL on unfixed code to confirm the bug
    - **GOAL**: Surface a counterexample demonstrating that an unwrapped async handler causes an unhandled promise rejection
    - **Scoped PBT Approach**: Pick a single concrete route from each batch (e.g., one handler in `branches.js`); inject a mock DB error (`ECONNREFUSED`); assert the process does NOT crash and receives HTTP 500
    - For each of the 5 batches (Tasks 9–13), select a representative route; create a minimal Express app with the route wired to a mock `pool` that rejects; send a request; assert `process.on('unhandledRejection')` is NOT triggered and HTTP 500 is returned
    - On UNFIXED code: unhandled rejection fires → test FAILS (confirms bug)
    - Document counterexamples found (e.g., `branches.js GET /` causes unhandled rejection with ECONNREFUSED)
    - _Requirements: 1.13, 1.14_

  - [~] 16.2 Write preservation property tests (BEFORE implementing fix)
    - **Property 2: Preservation** — Successful Route Handler Response Integrity (B10)
    - **IMPORTANT**: Follow observation-first methodology — run against unfixed code for non-error inputs first
    - Observe: for each sampled route, a successful DB response returns the same HTTP status and body with or without asyncHandler
    - Write property-based test: for all (route, mock-success-response) pairs across the 50 affected files, assert the response body and status code are identical after wrapping with asyncHandler
    - Run tests on UNFIXED code for the success path → MUST PASS (confirms baseline behavior to preserve)
    - _Requirements: 3.17, 3.18_

  - [~] 16.3 Write bug condition exploration test for mlAxios interceptor isolation (B11)
    - **Property 1: Bug Condition** — Global Axios Interceptor Pollution (B11)
    - **CRITICAL**: Write this test BEFORE Task 1 (mlAxios creation) if running in exploratory mode; MUST FAIL on unfixed code
    - **GOAL**: Confirm the global axios instance is intercepted before the fix
    - Register a spy on `require('axios').interceptors.request.handlers`; call a non-ML endpoint that internally uses `require('axios')` (e.g., Google tokeninfo call); assert the spy was triggered
    - On UNFIXED code: spy triggered → test FAILS (confirms global pollution)
    - Document counterexample: "google-signin axios.get to googleapis.com is intercepted by ML guard"
    - _Requirements: 1.15, 1.16_

  - [~] 16.4 Write preservation property tests for mlAxios (B11)
    - **Property 2: Preservation** — ML Service Gating Still Active on mlAxios (B11)
    - Observe on unfixed code: ML calls with `ENABLE_ML=false` throw the disabled error; production localhost calls are blocked
    - Write property-based test: for all (ML route, ENABLE_ML setting) combinations, assert `mlAxios` continues to gate ML calls identically to the original global interceptor
    - Run tests on UNFIXED code for the ML gating path (using the global interceptor as baseline) → MUST PASS
    - _Requirements: 3.19, 3.20, 3.21_

  - [~] 16.5 Integration test — full B4 customer revocation flow
    - Full flow: customer login → receive JWT → `POST /customer/logout` → `is_revoked = 1` in DB → re-use token on `GET /customer/dashboard` → assert HTTP 401
    - Assert non-revoked sibling token on dashboard → HTTP 200
    - Assert staff JWT revocation via existing `isSessionRevoked` flow is unaffected
    - _Requirements: 2.7, 2.8, 3.7, 3.8_

  - [~] 16.6 Integration test — B10 full Express server DB failure
    - Boot full Express server with a mock DB pool that fails on demand via a per-request flag
    - Send requests to one route from each of the 5 batches (Tasks 9–13) with DB failure active
    - Assert: HTTP 500 returned, response body contains `{ message: ... }`, process still alive after all requests
    - Send the same requests with DB success → assert original response body and status code unchanged
    - _Requirements: 2.17, 2.18, 3.17, 3.18_

  - [~] 16.7 Integration test — B11 axios isolation with full server
    - Boot full Express server; send `POST /customer/google-signin` with a valid (mocked) Google token; assert the Google tokeninfo axios call completes and is NOT intercepted by the ML guard
    - Send a request to an ML route with `ENABLE_ML=false`; assert the route returns the ML-disabled error and the process continues normally
    - Assert `require('axios').interceptors.request.handlers` is empty (no handlers registered on global instance)
    - _Requirements: 2.19, 2.20, 3.19, 3.20, 3.21_

  - [~] 16.8 Integration test — B9 audit log no plaintext password in DB
    - Trigger `PUT /staff/:id/reset-password` with a test staff record
    - Query `sarga_audit_logs` for the `STAFF_PASSWORD_RESET` action
    - Assert `details` column does not match `/@Sarga/` regex or any 10-digit mobile pattern
    - Assert `details` contains `[REDACTED]`, the staff member's name, and their ID
    - _Requirements: 2.16, 3.15, 3.16_

- [~] 17. Checkpoint — Ensure all tests pass
  - Run full test suite; confirm all unit tests (Task 15) pass
  - Confirm Property 1 (Bug Condition) tests now PASS after fixes are applied (Tasks 9–14, 3–8)
  - Confirm Property 2 (Preservation) tests still PASS after fixes
  - Confirm all integration tests (Tasks 16.5–16.8) pass
  - Ensure no unhandled promise rejections or process crashes in the test run output
  - Ask the user if any questions arise during this checkpoint

## Notes

- **Group 1 tasks (1–2)** must be completed before Tasks 3, 5, and 14. Task 4, 6, 7, 8 are independent and can proceed in parallel with Group 1.
- **Group 3 tasks (9–13)** only add `asyncHandler` imports and wrapping — they have no cross-dependency on each other or on Group 2 (except Task 14 which needs Task 1).
- **Property 1: Bug Condition** tests (Tasks 16.1, 16.3) are designed to FAIL on unfixed code and PASS after fixes are applied. Do not treat their initial failure as a test framework problem.
- **Property 2: Preservation** tests (Tasks 16.2, 16.4) must PASS on both unfixed and fixed code. If they fail after the fix, a regression was introduced.
- The `asyncHandler` canonical source is `server/helpers/index.js`. Any local redefinitions in route files (e.g., `websiteReviews.js`, `whatsappAnalytics.js`) should be removed and replaced with the import.
- `server/routes/website.js` Google tokeninfo call must remain on global `axios` (not `mlAxios`) — it is a non-ML HTTP call.
- B3 and B5 are already fixed in the current codebase per design.md; Tasks 7 and the B3 portion of Task 3 add hardening (explicit config / startup warning) and test coverage rather than new functional fixes.
