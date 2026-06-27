# Security & Stability Fixes — Bugfix Design

## Overview

This design covers 11 confirmed bugs (B1–B11) across the Sarga Prints MIS monorepo:
9 critical-security bugs and 2 critical-stability bugs. The fixes are targeted and
minimal — each change is scoped to the exact file and function described below, with
no architectural rewrites.

**Current-state clarifications after source inspection:**

- **B1 (backup.js)** — `spawn` with array args is already used, so no shell-interpolation
  injection exists for the password. The remaining risk is that `DB_USER` and `DB_NAME`
  are read directly from `process.env` without any character validation; a `.my.cnf`
  approach or input-sanitization guard is the appropriate fix.
- **B2 (checkout.js)** — The `getRazorpay()` helper already throws when credentials are
  absent; however, `verify-payment` reads `process.env.RAZORPAY_KEY_SECRET` a second time
  without a startup-time check, meaning the process can start without the secret and only
  fail at runtime. The fix is a startup-time assertion.
- **B7 (website.js)** — The plaintext OTP is NOT returned in the HTTP response body in the
  current code. The gap is that `mailSent = false` causes the OTP to be silently swallowed
  with only a `warning` key. A `logger.debug` line ensures it is visible in non-production
  server logs without exposing it in the response.
- **B8 (website.js)** — `GET /customer/lookup` already guards with `authenticateCustomer`
  and constrains the SQL query to `WHERE id = decoded.id`. The remaining gap is the
  `POST /customer/login` endpoint, which returns the full customer row (including `email`)
  to any caller who supplies a matching phone number without authentication.

---

## Glossary

- **Bug_Condition (C)**: The specific input or state that triggers the defective behaviour.
- **Property (P)**: The observable correct behaviour that the fixed function must produce.
- **Preservation**: Existing correct behaviour that must not change after the fix.
- **asyncHandler**: `(fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`
  — defined canonically in `server/helpers/index.js` and re-exported from `server/index.js`.
- **mlAxios**: A dedicated `axios` instance created with `axios.create()` in `server/index.js`;
  the ML interceptor is registered on this instance only, leaving global `axios` unmodified.
- **isCustomerSessionRevoked**: A new helper in `server/middleware/auth.js` that queries
  `sarga_customer_sessions` and checks `is_revoked = 1`, mirroring the existing
  `isSessionRevoked` for staff sessions.
- **authenticateCustomer (middleware)**: A new Express middleware exported from
  `server/middleware/auth.js` that verifies a Bearer JWT with `JWT_SECRET`, confirms the
  decoded payload carries `role: 'Customer'`, and calls `isCustomerSessionRevoked`.

---

## Bug Details

### B1 — Command Injection in Backup Routes

**File:** `server/routes/backup.js` — `POST /backups` (line 43) and `POST /backups/restore` (line 78)

**Bug Condition:**

```
FUNCTION isBugCondition_B1(env)
  INPUT: process.env object at time of backup/restore request
  OUTPUT: boolean

  RETURN env.DB_USER contains characters outside [A-Za-z0-9_]
      OR env.DB_NAME contains characters outside [A-Za-z0-9_-]
END FUNCTION
```

**Current state:** `spawn` is correctly used (no shell string interpolation for the password,
which is passed via `MYSQL_PWD` env var). However `DB_USER` and `DB_NAME` are passed directly
as argv elements without sanitization. A maliciously crafted `DB_USER` value of e.g.
`root --execute=DROP DATABASE sarga_db` would inject extra flags into the `mysqldump` argv array.

**Examples:**
- `DB_USER=root` → safe; no injection.
- `DB_USER=root --execute="DROP DATABASE sarga_db"` → spawned as
  `['mysqldump', '-u', 'root --execute=...', 'sarga_db']` — mysqldump treats the space-separated
  parts as a single token; however the shell is NOT invoked so this is benign in practice.
  The real risk is `DB_NAME` injection: `DB_NAME=sarga_db --all-databases` causes mysqldump to
  dump all databases, not just the intended one.

### B2 — Razorpay HMAC Key Fallback

**File:** `server/routes/checkout.js` — `getRazorpay()` (line 30) and `POST /checkout/verify-payment` (line 353)

**Bug Condition:**

```
FUNCTION isBugCondition_B2(env)
  INPUT: process.env at server startup
  OUTPUT: boolean

  RETURN env.RAZORPAY_KEY_SECRET is absent or empty string
END FUNCTION
```

**Current state:** `getRazorpay()` throws when credentials are absent (good), but the process
can start successfully without `RAZORPAY_KEY_SECRET` because there is no startup-time
assertion. If the variable is set post-startup or arrives via a config reload, the window
between startup and first request would silently use an undefined key.

The `verify-payment` endpoint reads `process.env.RAZORPAY_KEY_SECRET` independently of
`getRazorpay()` and returns HTTP 500 when absent — correct behaviour at runtime, but the
process should never reach production without this variable.

**Examples:**
- `RAZORPAY_KEY_SECRET=` (empty) → `getRazorpay()` throws; `verify-payment` returns 500.
- `RAZORPAY_KEY_SECRET` absent → same result; however process starts normally, allowing
  non-payment routes to function while payment is silently broken.

### B3 — Google Sign-In Missing Audience Verification

**File:** `server/routes/website.js` — `POST /customer/google-signin` (line 371)

**Bug Condition:**

```
FUNCTION isBugCondition_B3(payload, env)
  INPUT: Google tokeninfo payload, process.env
  OUTPUT: boolean

  RETURN env.GOOGLE_CLIENT_ID is non-empty
     AND payload.aud != env.GOOGLE_CLIENT_ID
END FUNCTION
```

**Current state:** The `aud` check exists but is wrapped in `if (GOOGLE_CLIENT_ID && aud !== GOOGLE_CLIENT_ID)`.
`GOOGLE_CLIENT_ID` is read at module load time as `process.env.GOOGLE_CLIENT_ID || ''`.
When the env var is set, the check works. The bug is that the guard is defensive only —
if an attacker submits a token issued for a different Google OAuth client the check fires,
but the warning log alone does not prevent the 400 response that already rejects it.
Re-reading the code: **this bug is already fixed** in the current codebase. The design
includes it for test coverage completeness and the `GOOGLE_CLIENT_ID` startup-time warning.

### B4 — No Session Revocation Check for Customer JWTs

**File:** `server/routes/website.js` — eight authenticated customer routes (lines 272, 304, 348, 432, 461, 489, 538, 579)
**Fix file:** `server/middleware/auth.js`

**Bug Condition:**

```
FUNCTION isBugCondition_B4(token, db)
  INPUT: Bearer JWT token string, database state
  OUTPUT: boolean

  decoded = jwt.verify(token, JWT_SECRET)
  RETURN decoded.role == 'Customer'
     AND sarga_customer_sessions WHERE session_token = token AND is_revoked = 1 EXISTS
END FUNCTION
```

**Current state:** The `authenticateCustomer` helper in `website.js` already calls
`isCustomerSessionRevoked(token)`. However, `isCustomerSessionRevoked` is defined
**locally inside website.js** and only queries the DB — it has no in-memory blacklist,
no periodic cleanup, and is not exported. Logout / revocation never populates the
`is_revoked` column because there is no customer logout endpoint.

The eight routes that call `authenticateCustomer` are protected. The remaining unprotected
path is `GET /customer/dashboard`, `GET /job/:id`, and others that do their own inline
`jwt.verify` without calling `isCustomerSessionRevoked`.

### B5 — XSS via Unsanitized `dangerouslySetInnerHTML`

**File:** `client/src/pages/BlogCMS.jsx` — preview pane (line 527)

**Bug Condition:**

```
FUNCTION isBugCondition_B5(content)
  INPUT: postForm.content string
  OUTPUT: boolean

  RETURN content contains executable HTML
         (<script>, onerror=, <img src=x onerror=...>, etc.)
     AND DOMPurify.sanitize is NOT called before assignment
END FUNCTION
```

**Current state (after inspection):** `DOMPurify.sanitize(postForm.content || '...')` IS
already called at line 527. **This bug is already fixed.** The design retains it for test
coverage and to document the correct pattern.

### B6 — DOMPurify Configured to Allow `style` Tags

**File:** `client/src/pages/expense-manager/VendorsTab.jsx` — line 739

**Bug Condition:**

```
FUNCTION isBugCondition_B6(allowedTags)
  INPUT: ALLOWED_TAGS array passed to DOMPurify.sanitize
  OUTPUT: boolean

  RETURN 'style' IN allowedTags
END FUNCTION
```

**Current state (after inspection):** The DOMPurify call at line 739 uses:
`{ ALLOWED_TAGS: ['div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h2'], ALLOWED_ATTR: ['id', 'colspan'] }`

`'style'` is **not** in the current `ALLOWED_TAGS` array. The requirements doc described an
earlier state. The design retains this item to add `FORCE_BODY: true` as an additional
hardening measure and to document the correct allowed-tag set.

### B7 — OTP Returned in API Response Body

**File:** `server/routes/website.js` — `POST /customer/send-otp` (~line 468)

**Bug Condition:**

```
FUNCTION isBugCondition_B7(env, mailSent)
  INPUT: NODE_ENV string, boolean mailSent flag
  OUTPUT: boolean

  RETURN mailSent == false
     AND resp does not include otp in plaintext    // already fixed
     AND otp is not written to server logger       // the actual gap
END FUNCTION
```

**Current state:** The OTP is **not** returned in the HTTP response body in the current code.
`resp = { message: 'OTP sent' }` with an optional `warning` key when SMTP fails. The actual
gap is that when `mailSent = false` (SMTP not configured), the OTP is generated, hashed, and
stored in the DB — but is **completely invisible** to any developer trying to test the flow
because there is no `logger.debug` output. The fix: add `logger.debug('[OTP Dev] customer=%d otp=%s', customer.id, otp)` guarded by `NODE_ENV !== 'production'`.

### B8 — Unauthenticated Customer PII Lookup

**File:** `server/routes/website.js` — `POST /customer/login` (line 311)

**Bug Condition:**

```
FUNCTION isBugCondition_B8(req)
  INPUT: HTTP POST /customer/login request
  OUTPUT: boolean

  RETURN req carries a valid phone number
     AND req carries no authentication token
     AND response includes customer.email AND customer.address
END FUNCTION
```

**Current state:** `GET /customer/lookup` is correctly auth-gated. The gap is
`POST /customer/login`: any unauthenticated caller who supplies a matching phone number
receives `{ ..., customer: { id, name, mobile, email } }` — full PII with no authentication
required. The fix removes `customer` from the login response and returns only the token,
`customerId`, and `customerName`.

### B9 — Plaintext Password in Audit Log

**File:** `server/routes/staff.js` — `PUT /:id/reset-password` (line 335)

**Bug Condition:**

```
FUNCTION isBugCondition_B9(auditDetails)
  INPUT: string passed to auditLog() for STAFF_PASSWORD_RESET
  OUTPUT: boolean

  RETURN auditDetails contains passwordWithSuffix in plaintext
         (e.g. "+919876543210@Sarga")
END FUNCTION
```

**Current state:** Line 335 reads:
```js
auditLog(req.user.id, 'STAFF_PASSWORD_RESET',
  `Reset password for staff member ${users[0].name} (${id}) to ${normalizedMobile}@Sarga`);
```
The `@Sarga` suffix formula and the mobile number together constitute the plaintext password.

### B10 — ~440 Async Route Handlers Without Try-Catch

**Files:** 50+ route files listed in the requirements document

**Bug Condition:**

```
FUNCTION isBugCondition_B10(handler)
  INPUT: Express route callback function
  OUTPUT: boolean

  RETURN handler is async
     AND handler is NOT wrapped in asyncHandler
     AND handler contains at least one await expression
END FUNCTION
```

**Current state:** `asyncHandler` is canonically defined in `server/helpers/index.js` and
is already imported + used in: `backup.js`, `checkout.js`, `website.js` (partially),
`whatsappAnalytics.js`, `websiteReviews.js`. Many route files define their own local copy.
Files like `websiteInquiries.js`, `websiteDesigns.js`, `whatsapp.js` use plain
`async (req, res) => { try { ... } catch (err) { ... } }` — the try-catch is present but
inconsistent. The true gap is files with no try-catch at all.

### B11 — Global Axios Interceptor Affects All Modules

**File:** `server/index.js` — lines 8–24

**Bug Condition:**

```
FUNCTION isBugCondition_B11(axiosInstance)
  INPUT: the axios instance used by a third-party library or non-ML route
  OUTPUT: boolean

  RETURN axiosInstance === require('axios')   // global default instance
     AND interceptor is registered on global axios
     AND request URL does NOT start with ML_SERVICE_URL
END FUNCTION
```

**Current state:** `axios.interceptors.request.use(...)` is called on the global singleton.
Every `require('axios')` in the process shares the same interceptor chain. Libraries like
`nodemailer` (uses its own http stack, not axios — safe), Google OAuth token verification
in `website.js` (`const axios = require('axios')` inside handler — **affected**), and any
other route that calls `axios` will be intercepted. The ML-URL check only skips non-ML
URLs, so those pass through, but the interceptor still adds overhead and is fragile.

---

## Expected Behavior

### Preservation Requirements

**B1:** Backup creation still produces a valid `.sql` file; restore still replays it.
No change to spawn usage pattern, only add a startup-time env-var validation check.

**B2:** Valid Razorpay payments continue to be verified; only the startup guard changes.

**B3:** Valid Google tokens with correct `aud` continue to authenticate customers.

**B4:** Non-revoked customer JWTs continue to fulfill requests without additional latency
(in-memory blacklist provides O(1) fast path). Staff JWT revocation via the existing
`isSessionRevoked` flow is completely unchanged.

**B5 / B6:** Safe HTML (`<p>`, `<table>`, `<h2>`, etc.) continues to render correctly in
the blog preview and vendor statement output.

**B7:** SMTP-backed OTP delivery remains unchanged. The `{ message: 'OTP sent' }` response
shape is unchanged. Only a server-side `logger.debug` line is added.

**B8:** Authenticated customers can still look up their own details through
`GET /customer/lookup`. The `POST /customer/login` response still returns `token`,
`customerId`, and `customerName` — sufficient for the client to populate the session.

**B9:** Password hashing, `is_first_login = 1`, and the success response to the admin
caller are all unchanged. Only the audit log message string changes.

**B10:** All route handlers that currently return correct responses continue to do so.
Wrapping with `asyncHandler` is transparent when no error occurs.

**B11:** All ML route calls continue to work exactly as before when `ENABLE_ML=true`.
Non-ML outbound HTTP calls (e.g., Google tokeninfo in `website.js`) are unaffected.

---

## Hypothesized Root Cause

1. **B1** — `DB_USER`/`DB_NAME` env vars are passed to `spawn` argv without sanitization.
   Root cause: no input validation at the point of reading env vars for subprocess arguments.

2. **B2** — No startup assertion for `RAZORPAY_KEY_SECRET`. Root cause: the credential
   check is deferred to the first request instead of being enforced at process start.

3. **B3** — Already mitigated in current code. Root cause was: `GOOGLE_CLIENT_ID` check
   was conditional on the env var being set at module-load time.

4. **B4** — `isCustomerSessionRevoked` is defined locally inside `website.js` with no
   in-memory cache and is not called from all authenticated paths. Root cause: the revocation
   pattern was implemented for staff in `auth.js` but never extracted as a shared utility
   for customer routes.

5. **B5** — Already mitigated. Root cause was: `DOMPurify.sanitize` was missing from the
   `dangerouslySetInnerHTML` assignment.

6. **B6** — Already mitigated. Root cause was: `'style'` was included in `ALLOWED_TAGS`.

7. **B7** — No `logger.debug` output for dev OTP. Root cause: developer experience
   oversight when SMTP is not configured.

8. **B8** — `POST /customer/login` returns full customer object without authentication.
   Root cause: login endpoints typically return user data, but the response was not
   stripped down to the minimum needed by the client.

9. **B9** — Audit log message includes `normalizedMobile@Sarga` which is the plaintext
   password. Root cause: the audit message was written before the password was hashed,
   using the raw input formula directly in the string.

10. **B10** — Many route files were written before `asyncHandler` was standardized in
    `server/helpers/index.js`. Root cause: no linting rule or code review gate enforced
    wrapping of async route handlers.

11. **B11** — Interceptor registered on global `axios` instance affects all consumers.
    Root cause: the interceptor was added at the top of `server/index.js` for convenience
    without creating a scoped instance.

---

## Correctness Properties

Property 1: Bug Condition — Backup Env-Var Sanitization (B1)

_For any_ server startup where `DB_USER` or `DB_NAME` contains characters outside the
alphanumeric-underscore-hyphen set, the system SHALL refuse to start (or refuse the backup
request) with a clear error message, and SHALL NOT pass unsanitized values to the child
process argv.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Backup Operations (B1)

_For any_ well-formed `DB_USER` and `DB_NAME` (containing only `[A-Za-z0-9_-]`), the backup
and restore operations SHALL continue to produce the same file output and database state as
the original code.

**Validates: Requirements 3.1, 3.2**

Property 3: Bug Condition — Razorpay Startup Guard (B2)

_For any_ server startup where `RAZORPAY_KEY_SECRET` is absent or empty, the system SHALL
exit (or log a fatal error and refuse payment routes) rather than starting normally with a
broken payment verification path.

**Validates: Requirements 2.3, 2.4**

Property 4: Preservation — Razorpay Payment Verification (B2)

_For any_ request to `POST /checkout/verify-payment` where `RAZORPAY_KEY_SECRET` is set and
the HMAC signature is valid, the system SHALL continue to return `{ verified: true }` and
mark the order paid.

**Validates: Requirements 3.3, 3.4**

Property 5: Bug Condition — Google Audience Enforcement (B3)

_For any_ Google `id_token` where `aud` does not match `process.env.GOOGLE_CLIENT_ID`
(when that variable is set and non-empty), the system SHALL return HTTP 401 and SHALL NOT
create or retrieve a customer session.

**Validates: Requirements 2.5**

Property 6: Preservation — Valid Google Token Acceptance (B3)

_For any_ Google `id_token` with a matching `aud`, the system SHALL continue to authenticate
the customer and return a signed JWT.

**Validates: Requirements 2.6, 3.5, 3.6**

Property 7: Bug Condition — Customer Session Revocation Check (B4)

_For any_ customer JWT where `sarga_customer_sessions.is_revoked = 1` for the corresponding
session token, all authenticated customer routes (dashboard, job details, proof review,
invoice download) SHALL return HTTP 401 and SHALL NOT return customer data.

**Validates: Requirements 2.7**

Property 8: Preservation — Valid Customer JWT Acceptance (B4)

_For any_ customer JWT that is properly signed and NOT revoked, the system SHALL continue
to fulfil the request and return the expected data without additional latency overhead
beyond a single in-memory Set lookup.

**Validates: Requirements 2.8, 3.7, 3.8**

Property 9: Bug Condition — Blog XSS Prevention (B5)

_For any_ `postForm.content` string containing executable HTML payloads (`<script>`,
`onerror=`, etc.), the blog preview pane SHALL render sanitized output with all executable
content stripped.

**Validates: Requirements 2.9**

Property 10: Preservation — Safe Blog HTML Rendering (B5)

_For any_ `postForm.content` containing only safe tags (`<p>`, `<h2>`, `<ul>`, etc.),
the preview pane SHALL continue to render them visually unchanged after sanitization.

**Validates: Requirements 3.9, 3.10**

Property 11: Bug Condition — DOMPurify style Tag Removal (B6)

_For any_ HTML string passed to `DOMPurify.sanitize` in `VendorsTab.jsx`, the sanitized
output SHALL NOT contain any `<style>` tag or CSS injection vector.

**Validates: Requirements 2.10, 2.11**

Property 12: Preservation — Vendor Statement Table Structure (B6)

_For any_ vendor statement HTML, the sanitized output SHALL still contain the structural
table tags (`<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`) needed to render
the statement correctly.

**Validates: Requirements 3.11**

Property 13: Bug Condition — OTP Dev Logging (B7)

_For any_ OTP generation request where SMTP is not configured (`mailSent = false`) and
`NODE_ENV !== 'production'`, the system SHALL write the OTP to `logger.debug` on the
server and SHALL NOT include the OTP value in the HTTP response body.

**Validates: Requirements 2.12, 2.13**

Property 14: Preservation — OTP Response Shape (B7)

_For any_ OTP generation request, the HTTP response SHALL continue to return
`{ message: 'OTP sent' }` (with optional `warning` key when SMTP fails) and no `otp` field.

**Validates: Requirements 3.12, 3.13**

Property 15: Bug Condition — Customer PII Protection (B8)

_For any_ unauthenticated POST to `/customer/login`, the HTTP response SHALL NOT contain
`email` or `address` fields of the matched customer record.

**Validates: Requirements 2.14, 2.15**

Property 16: Preservation — Authenticated Customer Lookup (B8)

_For any_ authenticated GET to `/customer/lookup` where the token matches the queried
customer, the system SHALL continue to return `name`, `email`, `address`, and `mobile`.

**Validates: Requirements 3.14**

Property 17: Bug Condition — Password Redaction in Audit Log (B9)

_For any_ staff password reset operation, the `sarga_audit_logs.details` column SHALL
NOT contain the plaintext password formula `<mobile>@Sarga`.

**Validates: Requirements 2.16**

Property 18: Preservation — Audit Log Record Integrity (B9)

_For any_ staff password reset, the audit log SHALL continue to record the actor ID,
action type `STAFF_PASSWORD_RESET`, the staff member's name and ID, with only the
password value portion replaced by `[REDACTED]`.

**Validates: Requirements 3.15, 3.16**

Property 19: Bug Condition — Async Handler Error Propagation (B10)

_For any_ async route handler wrapped in `asyncHandler` where the async function rejects
(throws or returns a rejected promise), the Express error handler SHALL receive the error
via `next(err)` and return an HTTP 500 response without crashing the process.

**Validates: Requirements 2.17, 2.18**

Property 20: Preservation — Successful Handler Responses (B10)

_For any_ async route handler wrapped in `asyncHandler` where the async function resolves
successfully, the system SHALL return the same HTTP response (status code, body, headers)
as the unwrapped handler would have returned.

**Validates: Requirements 3.17, 3.18**

Property 21: Bug Condition — Scoped ML Axios Interceptor (B11)

_For any_ outbound HTTP request made via the global `axios` instance (not `mlAxios`) to
a non-ML URL, the request SHALL NOT be intercepted or blocked by the ML service guard.

**Validates: Requirements 2.19, 2.20**

Property 22: Preservation — ML Service Gating (B11)

_For any_ call to `mlAxios` where `ENABLE_ML !== 'true'` or the URL points to localhost
in production, the system SHALL continue to short-circuit the request with the existing
error message.

**Validates: Requirements 3.19, 3.20, 3.21**

---

## Fix Implementation

### B1 — Command Injection in Backup Routes

**File:** `server/routes/backup.js`

**Specific Changes:**

Add a validation helper at the top of the file (after imports) that validates env-var
characters before they are passed to `spawn`:

```js
// Validate that a string contains only safe characters for use as a DB identifier / username
function assertSafeDbArg(value, name) {
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new Error(`Unsafe or empty environment variable ${name}: "${value}"`);
    }
}
```

1. **Create backup route** (`POST /backups`): call `assertSafeDbArg(DB_USER, 'DB_USER')` and
   `assertSafeDbArg(DB_NAME, 'DB_NAME')` before the `spawn` call. If validation throws, catch
   it in the `asyncHandler` and it will be forwarded to the Express error handler (HTTP 500).

2. **Restore route** (`POST /backups/restore`): same — add `assertSafeDbArg` calls before
   the `spawn` call.

3. No changes to the `spawn` call signature; `MYSQL_PWD` env-var approach for the password
   is already correct and must be preserved.

4. **Startup assertion** (in `server/index.js` near line 50): add a startup check:
   ```js
   const _dbUser = process.env.DB_USER;
   const _dbName = process.env.DB_NAME;
   if (_dbUser && !/^[A-Za-z0-9_-]+$/.test(_dbUser)) {
       logger.error('FATAL: DB_USER contains unsafe characters'); process.exit(1);
   }
   if (_dbName && !/^[A-Za-z0-9_-]+$/.test(_dbName)) {
       logger.error('FATAL: DB_NAME contains unsafe characters'); process.exit(1);
   }
   ```

### B2 — Razorpay HMAC Key Fallback

**File:** `server/index.js`

**Specific Changes:**

Add a startup assertion block near the existing JWT_SECRET check (around line 80):

```js
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    logger.warn('[startup] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set — payment routes will be disabled');
    // Do not exit; allow the server to start for non-payment use cases,
    // but getRazorpay() will throw on first use, returning HTTP 500.
}
```

**File:** `server/routes/checkout.js` — `POST /checkout/verify-payment`

No code change needed; the existing `if (!keySecret) { return res.status(500)... }` guard
at line 356 is correct. The startup warning is the only addition.

### B3 — Google Sign-In Missing Audience Verification

**File:** `server/routes/website.js` — `POST /customer/google-signin`

The `aud` check is already present. The only change is a **startup-time log warning** added
to `server/index.js` when `GOOGLE_CLIENT_ID` is not set:

```js
if (!process.env.GOOGLE_CLIENT_ID) {
    logger.warn('[startup] GOOGLE_CLIENT_ID not set — Google sign-in audience check is disabled');
}
```

No functional change to the route handler.

### B4 — No Session Revocation Check for Customer JWTs

**File:** `server/middleware/auth.js`

**New exports to add:**

1. **`isCustomerSessionRevoked(token)`** — mirrors `isSessionRevoked` but queries
   `sarga_customer_sessions` instead of `sarga_user_sessions`. Uses the same in-memory
   `revokedTokens` Set (shared blacklist is acceptable since tokens are cryptographically
   unique). Implementation:

   ```js
   async function isCustomerSessionRevoked(token) {
       const hash = crypto.createHash('sha256').update(token).digest('hex');
       if (revokedTokens.has(hash)) return true;
       try {
           const [sessions] = await pool.query(
               'SELECT is_revoked FROM sarga_customer_sessions WHERE session_token = ? LIMIT 1',
               [token]
           );
           if (sessions.length > 0 && sessions[0].is_revoked) {
               revokedTokens.add(hash);
               revokedTimestamps.set(hash, Date.now());
               return true;
           }
           return false;
       } catch (dbErr) {
           logger.error('Customer session DB check error:', dbErr);
           return true; // fail-closed
       }
   }
   ```

2. **`authenticateCustomer` middleware** — a new Express middleware that:
   - Reads the `Authorization: Bearer <token>` header.
   - Calls `verifyWithAnySecret(token)`.
   - Asserts `decoded.role === 'Customer'` (returns 401 if not).
   - Calls `isCustomerSessionRevoked(token)` (returns 401 if revoked).
   - Sets `req.customer = decoded` and calls `next()`.

   ```js
   const authenticateCustomer = async (req, res, next) => {
       res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
       res.setHeader('Pragma', 'no-cache');
       res.setHeader('Expires', '0');
       const authHeader = req.headers['authorization'];
       const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
       if (!token) return res.status(401).json({ message: 'Authentication required' });
       try {
           const decoded = verifyWithAnySecret(token);
           if (decoded.role !== 'Customer') return res.status(403).json({ message: 'Customer access required' });
           if (await isCustomerSessionRevoked(token)) {
               return res.status(401).json({ message: 'Session has been revoked. Please log in again.' });
           }
           req.customer = decoded;
           next();
       } catch (err) {
           logger.warn('[Auth] Customer token invalid', { path: req.path, error: err.message });
           return res.status(401).json({ message: 'Invalid or expired token.' });
       }
   };
   ```

3. **`revokeCustomerSessionInCache(token)`** — identical to `revokeSessionInCache` but
   specifically named for clarity; can reuse the same underlying function body. Exported
   for use by a future `POST /customer/logout` endpoint.

4. Update `module.exports` to add: `authenticateCustomer`, `isCustomerSessionRevoked`,
   `revokeCustomerSessionInCache`.

   **No separate `sarga_customer_sessions` table is needed** — it already exists (used by
   `recordCustomerSession` in `website.js`). The existing `is_revoked` column is queried
   as-is.

**File:** `server/routes/website.js`

Replace the local `isCustomerSessionRevoked` function and the local `authenticateCustomer`
helper with imports from `server/middleware/auth.js`:

```js
const { authenticateCustomer: authCustomerMiddleware, JWT_SECRET } = require('../middleware/auth');
```

Routes that use the inline `jwt.verify` pattern without revocation check
(`GET /customer/dashboard`, `GET /job/:id`, `POST /jobs/:id/proofs/:proofId/review-customer`,
`GET /invoices/:invoiceId/download`) should be refactored to use `authenticateCustomer`
as middleware:

```js
// Before:
router.get('/customer/dashboard', asyncHandler(async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
    if (!token) return res.status(401).json({ message: 'Missing token' });
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); }
    catch (_err) { return res.status(401).json({ message: 'Invalid token' }); }
    const customerId = decoded.id;
    // ... route logic

// After:
router.get('/customer/dashboard', authCustomerMiddleware, asyncHandler(async (req, res) => {
    const customerId = req.customer.id;
    // ... route logic (unchanged)
```

Apply the same pattern to: `GET /job/:id`, `POST /jobs/:id/proofs/:proofId/review-customer`,
`GET /invoices/:invoiceId/download`.

Routes using the existing `authenticateCustomer` helper (which calls `isCustomerSessionRevoked`
locally) are already functionally correct but should be updated to use the middleware for
consistency: `GET /customer/lookup`.

### B5 — XSS via Unsanitized `dangerouslySetInnerHTML`

**File:** `client/src/pages/BlogCMS.jsx`

**Current code (line ~527, already correct):**
```jsx
dangerouslySetInnerHTML={{
    __html: DOMPurify.sanitize(postForm.content || '<em>Write some HTML to preview...</em>')
}}
```

No functional change required. The task implementation should verify `DOMPurify` is
imported (`import DOMPurify from 'dompurify'`) and add an explicit `ALLOWED_TAGS` config
to lock down the permitted tag set to known-safe blog tags:

```jsx
const BLOG_PURIFY_CONFIG = {
    ALLOWED_TAGS: ['p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','a',
                   'blockquote','code','pre','br','hr','img','table','thead','tbody',
                   'tr','th','td','span','div'],
    ALLOWED_ATTR: ['href','src','alt','class','id','target','rel','colspan','rowspan'],
    FORCE_BODY: true,
};

// In JSX:
dangerouslySetInnerHTML={{
    __html: DOMPurify.sanitize(postForm.content || '<em>Write some HTML to preview...</em>', BLOG_PURIFY_CONFIG)
}}
```

### B6 — DOMPurify Configured to Allow `style` Tags

**File:** `client/src/pages/expense-manager/VendorsTab.jsx` — line 739

**Current code (already correct, `'style'` not present):**
```js
container.innerHTML = DOMPurify.sanitize(summaryHtml, {
    ALLOWED_TAGS: ['div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h2'],
    ALLOWED_ATTR: ['id', 'colspan']
});
```

Add `FORCE_BODY: true` as an additional hardening measure:
```js
container.innerHTML = DOMPurify.sanitize(summaryHtml, {
    ALLOWED_TAGS: ['div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h2'],
    ALLOWED_ATTR: ['id', 'colspan'],
    FORCE_BODY: true,
});
```

### B7 — OTP Returned in API Response Body

**File:** `server/routes/website.js` — `POST /customer/send-otp`

After `mailSent = false` and the `warning` key is set, add:

```js
if (!mailSent && process.env.NODE_ENV !== 'production') {
    logger.debug('[OTP Dev] customer_id=%d otp=%s', customer.id, otp);
}
```

This ensures the OTP is visible in development server logs without appearing in any HTTP
response body. The `logger.debug` line is guarded by `NODE_ENV !== 'production'` to
ensure it is never logged in production even if log level is set to debug.

### B8 — Unauthenticated Customer PII Lookup

**File:** `server/routes/website.js` — `POST /customer/login`

Remove `customer` from the response object:

```js
// Before:
res.json({ message: 'Login successful', token, customerId: customer.id,
           customerName: customer.name, customer });

// After:
res.json({ message: 'Login successful', token, customerId: customer.id,
           customerName: customer.name });
```

The `customer` object (which includes `email`) is removed. The client only needs the token
and ID to proceed; it can call `GET /customer/lookup` (auth-gated) to retrieve full details.

Also add a new `POST /api/website/customer/logout` endpoint:

```js
router.post('/customer/logout', asyncHandler(async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.split(' ')[1] : null;
    if (token) {
        await pool.query(
            'UPDATE sarga_customer_sessions SET is_revoked = 1 WHERE session_token = ?',
            [token]
        );
        await revokeCustomerSessionInCache(token); // imported from auth.js
    }
    res.json({ message: 'Logged out' });
}));
```

### B9 — Plaintext Password in Audit Log

**File:** `server/routes/staff.js` — `PUT /:id/reset-password` (line 335)

```js
// Before:
auditLog(req.user.id, 'STAFF_PASSWORD_RESET',
    `Reset password for staff member ${users[0].name} (${id}) to ${normalizedMobile}@Sarga`);

// After:
auditLog(req.user.id, 'STAFF_PASSWORD_RESET',
    `Reset password for staff member ${users[0].name} (${id}) to [REDACTED]`);
```

Single-line change. The `normalizedMobile` variable is not removed — it is still used to
hash the password. Only the audit log message string changes.

### B10 — ~440 Async Route Handlers Without Try-Catch

**Canonical definition:** `server/helpers/index.js` already exports `asyncHandler`.
`server/index.js` already defines its own copy. The fix is to ensure all route files use
the one from `server/helpers/index.js`.

**Pattern change for each affected file:**

```js
// Step 1: Remove any local asyncHandler definition:
// REMOVE: const asyncHandler = (fn) => (req, res, next) => ...

// Step 2: Add import at top of file:
const { asyncHandler } = require('../helpers');

// Step 3: Wrap every async route handler:
// Before:
router.get('/some-route', authenticateToken, async (req, res) => {
    const [rows] = await pool.query(...);
    res.json(rows);
});

// After:
router.get('/some-route', authenticateToken, asyncHandler(async (req, res) => {
    const [rows] = await pool.query(...);
    res.json(rows);
}));
```

**Files requiring asyncHandler import + wrapping (no existing asyncHandler):**

| File | Import needed | Handlers to wrap |
|------|--------------|-----------------|
| `server/routes/branches.js` | yes | all async handlers |
| `server/routes/accounts.js` | yes | all async handlers |
| `server/routes/anomalies.js` | yes | all async handlers |
| `server/routes/artworkUploads.js` | yes | all async handlers |
| `server/routes/auditInvoice.js` | yes | all async handlers |
| `server/routes/businessHub.js` | yes | all async handlers |
| `server/routes/chatbot.js` | yes | all async handlers |
| `server/routes/coupons.js` | yes | all async handlers |
| `server/routes/customerDesigns.js` | yes | all async handlers |
| `server/routes/dashboardInit.js` | yes | all async handlers |
| `server/routes/designCheck.js` | yes | all async handlers |
| `server/routes/devRoutes.js` | yes | all async handlers |
| `server/routes/forecast.js` | yes | all async handlers |
| `server/routes/frontOffice.js` | yes | all async handlers |
| `server/routes/insights.js` | yes | all async handlers |
| `server/routes/internalBooks.js` | yes | all async handlers |
| `server/routes/internalTransactions.js` | yes | all async handlers |
| `server/routes/internalTransfers.js` | yes | all async handlers |
| `server/routes/jobPriority.js` | yes | all async handlers |
| `server/routes/machines.js` | yes | all async handlers |
| `server/routes/ocr.js` | yes | all async handlers |
| `server/routes/orderForecast.js` | yes | all async handlers |
| `server/routes/orderPredictions.js` | yes | all async handlers |
| `server/routes/paperLayout.js` | yes | all async handlers |
| `server/routes/pickupSlots.js` | yes | all async handlers |
| `server/routes/portfolio.js` | yes | all async handlers |
| `server/routes/preflight.js` | yes | all async handlers |
| `server/routes/premiumFeatures.js` | yes | all async handlers |
| `server/routes/productionTracker.js` | yes | all async handlers |
| `server/routes/promotions.js` | yes | all async handlers |
| `server/routes/proofs.js` | yes | all async handlers |
| `server/routes/quotes.js` | yes | all async handlers |
| `server/routes/requests.js` | yes | all async handlers |
| `server/routes/search.js` | yes | all async handlers |
| `server/routes/seasonal.js` | yes | all async handlers |
| `server/routes/seo.js` | yes | all async handlers |
| `server/routes/settingsDailyBook.js` | yes | all async handlers |
| `server/routes/shortcuts.js` | yes | all async handlers |
| `server/routes/staffDashboard.js` | yes | all async handlers |
| `server/routes/staffPortal.js` | yes | all async handlers |
| `server/routes/stockPlanning.js` | yes | all async handlers |
| `server/routes/stockRequests.js` | yes | all async handlers |
| `server/routes/stockVerification.js` | yes | all async handlers |
| `server/routes/translations.js` | yes | all async handlers |
| `server/routes/upsell.js` | yes | all async handlers |
| `server/routes/utilityEmail.js` | yes | all async handlers |
| `server/routes/variableData.js` | yes | all async handlers |
| `server/routes/websiteReviews.js` | already has local def — replace with import |
| `server/routes/whatsappAnalytics.js` | already has local def — replace with import |
| `server/routes/websiteInquiries.js` | yes | all async handlers |
| `server/routes/websiteDesigns.js` | yes | all async handlers |
| `server/routes/whatsapp.js` | yes | all async handlers |

**Files that already import from helpers (no change needed to import, only verify all handlers are wrapped):**
`server/routes/backup.js`, `server/routes/checkout.js`, `server/routes/website.js` (partial).

**Files that define local asyncHandler and wrap all handlers (refactor import only):**
Merge the local definition into the helpers import in any file that defines its own copy.

**`server/index.js`:** The `asyncHandler` defined there (line ~230) is used for inline
route registrations in that file only. Keep it or replace with the helpers import — either
is correct. No routes in other files import from `server/index.js` for this utility.

### B11 — Global Axios Interceptor Affects All Modules

**File:** `server/index.js` — lines 8–24

**Step 1:** Create the scoped instance _before_ any `require('axios')` is used by routes.
Replace the current global interceptor registration with:

```js
// Create a dedicated axios instance for ML service calls only
const axios = require('axios');
const mlAxios = axios.create();

// Register the ML interceptor ONLY on mlAxios — never on the global instance
mlAxios.interceptors.request.use((config) => {
    const mlUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
    if (config.url && config.url.startsWith(mlUrl)) {
        if (process.env.ENABLE_ML !== 'true') {
            console.log('[AI_DISABLED] ML skipped');
            throw new Error('ML Service is disabled (ENABLE_ML is not true)');
        }
        const isLocal = mlUrl.includes('127.0.0.1') || mlUrl.includes('localhost');
        const isNotConfigured = !process.env.ML_SERVICE_URL || process.env.ML_SERVICE_URL === 'none';
        if (process.env.NODE_ENV === 'production' && (isLocal || isNotConfigured)) {
            throw new Error('ML Service not configured in production (skipping call)');
        }
    }
    return config;
}, (error) => Promise.reject(error));

// Export mlAxios so ML route files can import it
module.exports.mlAxios = mlAxios;
```

**Step 2:** Export `mlAxios` from `server/index.js` (or create a dedicated module
`server/helpers/mlAxios.js`):

```js
// server/helpers/mlAxios.js  ← new file
const axios = require('axios');
const mlAxios = axios.create();
const logger = require('./logger');

mlAxios.interceptors.request.use((config) => {
    const mlUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
    if (config.url && config.url.startsWith(mlUrl)) {
        if (process.env.ENABLE_ML !== 'true') {
            logger.debug('[AI_DISABLED] ML skipped');
            throw new Error('ML Service is disabled (ENABLE_ML is not true)');
        }
        const isLocal = mlUrl.includes('127.0.0.1') || mlUrl.includes('localhost');
        const isNotConfigured = !process.env.ML_SERVICE_URL || process.env.ML_SERVICE_URL === 'none';
        if (process.env.NODE_ENV === 'production' && (isLocal || isNotConfigured)) {
            throw new Error('ML Service not configured in production (skipping call)');
        }
    }
    return config;
}, (err) => Promise.reject(err));

module.exports = mlAxios;
```

**Preferred approach:** Create `server/helpers/mlAxios.js` as a standalone module.
Remove the global interceptor from `server/index.js`. Each ML route file switches its
import from `require('axios')` to `require('../helpers/mlAxios')`.

**Step 3:** Update all ML route files to use `mlAxios`:

| File | Change |
|------|--------|
| `server/routes/anomalies.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/chatbot.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/expenseCategorizer.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/forecast.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/insights.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/orderForecast.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/seasonal.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/stockPlanning.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/aiUpsell.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/aiTurnaround.js` | `const axios = require('../helpers/mlAxios');` |
| `server/routes/website.js` google-signin | keep `const axios = require('axios')` inside handler — this is a non-ML call and must NOT use `mlAxios` |

**Step 4:** In `server/index.js`, remove lines 8–24 (the global interceptor block). The
file no longer touches the global axios instance at all.

**Note on `server/routes/website.js` google-signin:** This handler uses `axios.get` to
call `https://oauth2.googleapis.com/tokeninfo`. It is a non-ML call and must remain on
the global axios instance. The fix (removing the global interceptor) automatically makes
this safe — no additional change is needed in `website.js` for B11.

---

## Testing Strategy

### Validation Approach

The testing strategy follows the bug-condition methodology:

1. **Exploratory** — run tests against unfixed code to confirm the bug manifests as described.
2. **Fix checking** — after applying the fix, verify C(X) inputs now produce P(result).
3. **Preservation** — verify ¬C(X) inputs produce the same results before and after the fix.

Property-based testing (PBT) is most valuable for B10 and B11 where the input space is
large (many route files, many DB error types). Unit tests are sufficient for B1–B9.

### Exploratory Bug Condition Checking

**B1 — Backup:**
Write a test that spawns a child process simulating mysqldump with a `DB_NAME` value
containing a space (e.g. `sarga_db --all-databases`). On unfixed code: passes without
error. On fixed code: throws validation error before spawn.

**B2 — Razorpay:**
Write a test that starts the server module without `RAZORPAY_KEY_SECRET` set. On unfixed
code: server starts cleanly. On fixed code: startup warning is emitted (or process exits).

**B4 — Customer session revocation:**
Write a test that:
1. Creates a customer JWT and records it in `sarga_customer_sessions` with `is_revoked = 1`.
2. Sends the token to `GET /customer/dashboard`.
On unfixed code: returns customer data (200). On fixed code: returns 401.

**B9 — Audit log:**
Write a test that triggers the reset-password endpoint and reads `sarga_audit_logs`.
On unfixed code: the `details` column contains `@Sarga`. On fixed code: contains `[REDACTED]`.

**B10 — Async handler crash:**
Write a test that:
1. Forces a DB error in a route that has no `asyncHandler` wrapper.
2. Asserts the process does NOT crash (Jest `process.on('uncaughtRejection')` check).
On unfixed code: unhandled rejection. On fixed code: 500 response, process alive.

**B11 — Axios interceptor isolation:**
Write a test that registers a spy on `axios.interceptors.request` and calls a non-ML
route that uses global `axios`. On unfixed code: spy is triggered. On fixed code: spy
is not triggered (global instance unmodified).

### Fix Checking

```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**PBT approach for B10:** Generate random sets of (route, error-type) pairs across the
50+ affected files. For each:
- If error occurs: assert HTTP 500 response with `{ message: ... }` body, no process crash.
- If success: assert the original response body is unchanged.

### Unit Tests

- **B1:** Unit test `assertSafeDbArg` with valid and invalid env-var strings.
- **B2:** Test that `getRazorpay()` throws when `RAZORPAY_KEY_SECRET` is absent.
- **B3:** Test `POST /customer/google-signin` with a mismatched `aud` returns 401.
- **B4:** Test `authenticateCustomer` middleware rejects revoked tokens (DB `is_revoked = 1`).
- **B5:** Test that `DOMPurify.sanitize` strips `<script>` tags in blog preview content.
- **B6:** Test that `DOMPurify.sanitize` with the updated config does not output `<style>`.
- **B7:** Test that `POST /customer/send-otp` response body does not contain `otp` field.
- **B8:** Test that `POST /customer/login` response does not contain `email` or `address`.
- **B9:** Test that the audit log `details` string for `STAFF_PASSWORD_RESET` does not
  contain `@Sarga` or any mobile number pattern.
- **B11:** Test that `mlAxios` interceptor blocks requests when `ENABLE_ML !== 'true'`;
  test that the global `axios` instance passes requests unintercepted.

### Property-Based Tests

- **B10 (Property 19):** For any of the 50+ route files, generate mock DB errors
  (`ECONNREFUSED`, `ER_LOCK_WAIT_TIMEOUT`, `ER_NO_SUCH_TABLE`, random `Error` throws) and
  assert the Express process survives and returns HTTP 500.
- **B10 (Property 20):** For any route that returns a list or object, assert the response
  body is identical with and without `asyncHandler` when no error occurs.
- **B4 (Property 7):** Generate random valid customer JWTs; for a random subset mark them
  revoked in the in-memory blacklist. Assert revoked tokens return 401 and non-revoked
  tokens return the expected data.

### Integration Tests

- **B4:** Full flow — customer registers → receives token → logs out → token revoked in DB
  → re-uses token → gets 401 on all authenticated routes.
- **B10:** Boot the full Express server with a mock DB that fails on demand; send requests
  to each affected route; assert no process crash and correct HTTP 500 responses.
- **B11:** Boot the full Express server; make a call to the Google tokeninfo endpoint via
  `POST /customer/google-signin`; assert the request completes and is not intercepted by
  the ML guard; assert an ML route correctly short-circuits when `ENABLE_ML=false`.
- **B9:** Trigger `PUT /staff/:id/reset-password`; query `sarga_audit_logs`; assert no
  plaintext password pattern appears in any `details` row for that action.
