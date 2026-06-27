# Bugfix Requirements Document

## Introduction

This document covers 11 confirmed bugs discovered during a full codebase audit of the Sarga Prints MIS monorepo. The bugs span two severity tiers — **Critical Security** (9 bugs) and **Critical Stability** (2 bugs) — and affect the Express.js backend (`server/`) and the React/Vite staff portal (`client/`).

Left unaddressed, these bugs collectively expose the system to arbitrary shell command execution, forged payment signatures, cross-site scripting, account takeover via session persistence, plaintext credential leakage, and widespread server crashes on any database error. Each bug is identified by a `B#` prefix in the clauses below.

## Bug Analysis

### Current Behavior (Defect)

**B1 — Command Injection in Backup Routes** (`server/routes/backup.js` lines 43, 78)

1.1 WHEN a database backup or restore is triggered AND `DB_PASS` contains shell metacharacters (`;`, `|`, `` ` ``, `$()`) THEN the system passes the password through shell string interpolation, executing arbitrary shell commands on the server host.

1.2 WHEN `DB_USER` or `DB_NAME` contains shell metacharacters THEN the system constructs the command string via template literal interpolation without sanitization, enabling command injection.

**B2 — Razorpay HMAC Key Fallback** (`server/routes/checkout.js` lines 34, 353)

1.3 WHEN `RAZORPAY_KEY_SECRET` is absent from the environment THEN the system uses the hardcoded fallback string `'placeholder'` as the HMAC signing key, allowing an attacker to compute valid payment signatures.

1.4 WHEN `RAZORPAY_KEY_SECRET` is absent and a payment verification request is received THEN the system computes an HMAC with the known `'placeholder'` key and accepts forged signatures as valid payments.

**B3 — Google Sign-In Missing Audience Verification** (`server/routes/website.js` lines 321–325)

1.5 WHEN a Google ID token issued to a different OAuth 2.0 client application (i.e., `aud` does not match `GOOGLE_CLIENT_ID`) is submitted to the sign-in endpoint THEN the system accepts it and creates or retrieves a customer session, treating any valid Google token as a legitimate Sarga customer credential.

**B4 — No Session Revocation Check for Customer JWTs** (`server/routes/website.js` lines 272, 304, 348, 432, 461, 489, 538, 579)

1.6 WHEN a customer logs out or changes their password AND later presents the old JWT THEN the system verifies the JWT signature only and grants access, because customer routes never call `isSessionRevoked()`.

1.7 WHEN a customer JWT is marked `is_revoked = 1` in `sarga_customer_sessions` THEN the system ignores this flag on all authenticated customer routes, allowing the revoked token to remain valid for its full 7-day lifetime.

**B5 — XSS via Unsanitized `dangerouslySetInnerHTML`** (`client/src/pages/BlogCMS.jsx` line 527)

1.8 WHEN a staff member with blog editing access opens the preview tab in the Blog CMS editor THEN the system renders `postForm.content` via `dangerouslySetInnerHTML` without passing it through `DOMPurify.sanitize()`, allowing any `<script>` tag, event handler, or injected payload in the content to execute in the browser.

**B6 — DOMPurify Configured to Allow `style` Tags** (`client/src/pages/expense-manager/VendorsTab.jsx` line 739)

1.9 WHEN vendor statement HTML is sanitized with `DOMPurify.sanitize(input, { ALLOWED_TAGS: [..., 'style'] })` THEN the system permits `<style>` tags in the sanitized output, allowing CSS-based XSS payloads (e.g., `expression()`, `@import`, `url()` data-URI tricks) to be injected into the rendered document.

**B7 — OTP Returned in API Response Body in Non-Production** (`server/routes/website.js` line ~408)

1.10 WHEN `NODE_ENV` is not `'production'` (e.g., `'development'`, `'staging'`, or unset) AND a customer requests an OTP THEN the system includes the plaintext OTP value in the HTTP JSON response body, allowing any caller to read the OTP and bypass email delivery entirely.

**B8 — Unauthenticated Customer PII Lookup** (`server/routes/website.js` lines 276–284)

1.11 WHEN any caller (authenticated or not) sends a phone number to the customer lookup endpoint THEN the system returns the matching customer's full PII (name, email, address, mobile) without verifying that the caller is the customer who owns that record.

**B9 — Plaintext Password in Audit Log** (`server/routes/staff.js` line 335)

1.12 WHEN an admin resets a staff member's password THEN the system writes the generated plaintext password (e.g., `+919876543210@Sarga`) to `sarga_audit_logs` via `auditLog()`, persisting a human-readable credential in the audit trail indefinitely.

**B10 — ~440 Async Route Handlers Without Try-Catch** (`server/routes/` — 50+ files)

1.13 WHEN an async route handler calls `await pool.query(...)` without a surrounding `try-catch` AND the database throws (timeout, deadlock, connection drop, schema mismatch) THEN the system produces an unhandled promise rejection that either crashes the Node.js process or leaves the HTTP request hanging indefinitely with no response.

1.14 WHEN multiple affected route files encounter simultaneous database errors THEN the system has no centralized mechanism to catch and forward those errors to the Express error handler, resulting in uncontrolled process termination.

Affected files confirmed by audit: `branches.js`, `accounts.js`, `anomalies.js`, `artworkUploads.js`, `auditInvoice.js`, `backup.js`, `businessHub.js`, `chatbot.js`, `checkout.js`, `coupons.js`, `customerDesigns.js`, `dashboardInit.js`, `designCheck.js`, `devRoutes.js`, `forecast.js`, `frontOffice.js`, `insights.js`, `internalBooks.js`, `internalTransactions.js`, `internalTransfers.js`, `jobPriority.js`, `machines.js`, `ocr.js`, `orderForecast.js`, `orderPredictions.js`, `paperLayout.js`, `pickupSlots.js`, `portfolio.js`, `preflight.js`, `premiumFeatures.js`, `productionTracker.js`, `promotions.js`, `proofs.js`, `quotes.js`, `requests.js`, `search.js`, `seasonal.js`, `seo.js`, `settingsDailyBook.js`, `shortcuts.js`, `staffDashboard.js`, `staffPortal.js`, `stockPlanning.js`, `stockRequests.js`, `stockVerification.js`, `translations.js`, `upsell.js`, `utilityEmail.js`, `variableData.js`, `websiteReviews.js`, `whatsappAnalytics.js`, `whatsapp.js`

**B11 — Global Axios Interceptor Affects All Modules** (`server/index.js` lines 8–24)

1.15 WHEN `axios.interceptors.request.use(...)` is registered on the global `axios` instance at server startup THEN any third-party library or route module in the same Node.js process that uses the default `axios` export will have its outbound HTTP requests intercepted, potentially blocked or silently dropped.

1.16 WHEN a route module (other than ML service callers) makes an HTTP request via `axios` THEN the interceptor evaluates ML URL checks and may inadvertently interfere with or block non-ML outbound requests.

---

### Expected Behavior (Correct)

**B1 — Command Injection in Backup Routes**

2.1 WHEN a database backup or restore is triggered THEN the system SHALL invoke `mysqldump` / `mysql` using `child_process.spawn` or `execFile` with a plain argument array, passing credentials as discrete arguments and never via string interpolation.

2.2 WHEN the database password contains shell metacharacters THEN the system SHALL transmit it safely as an isolated argument (or via `MYSQL_PWD` environment variable) without any shell expansion.

**B2 — Razorpay HMAC Key Fallback**

2.3 WHEN `RAZORPAY_KEY_SECRET` is absent at server startup THEN the system SHALL throw a startup error or call `process.exit(1)`, refusing to start rather than operating with a predictable secret.

2.4 WHEN `RAZORPAY_KEY_SECRET` is present THEN the system SHALL use its value directly with no fallback, ensuring no hardcoded string can substitute for it.

**B3 — Google Sign-In Missing Audience Verification**

2.5 WHEN a Google ID token is verified AND its `aud` field does not match `process.env.GOOGLE_CLIENT_ID` THEN the system SHALL return HTTP 401 and reject the authentication attempt.

2.6 WHEN `GOOGLE_CLIENT_ID` is configured and a Google ID token with a matching `aud` is submitted THEN the system SHALL accept the token and proceed with customer lookup or creation.

**B4 — No Session Revocation Check for Customer JWTs**

2.7 WHEN a customer presents a JWT on any authenticated customer route THEN the system SHALL call `isCustomerSessionRevoked(token)` (or an equivalent check against `sarga_customer_sessions`) and return HTTP 401 if the session is revoked.

2.8 WHEN a customer JWT passes both signature verification and revocation check THEN the system SHALL grant access and attach the decoded payload to the request context.

**B5 — XSS via Unsanitized `dangerouslySetInnerHTML`**

2.9 WHEN blog content is rendered in the preview pane THEN the system SHALL wrap the content in `DOMPurify.sanitize(content)` before assigning it to `dangerouslySetInnerHTML.__html`, stripping any executable payloads.

**B6 — DOMPurify Configured to Allow `style` Tags**

2.10 WHEN vendor statement HTML is sanitized THEN the system SHALL remove `'style'` from `ALLOWED_TAGS` and SHALL NOT permit it in the DOMPurify call for this component.

2.11 WHEN vendor statement HTML is sanitized THEN the system SHALL apply `FORCE_BODY: true` and limit `ALLOWED_TAGS` to structurally safe tags only (`div`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `h2`, and equivalents).

**B7 — OTP Returned in API Response Body in Non-Production**

2.12 WHEN an OTP is generated THEN the system SHALL NEVER include the OTP value in the HTTP response body, regardless of `NODE_ENV`.

2.13 WHEN `NODE_ENV` is not `'production'` and an OTP is generated THEN the system SHALL write the OTP to the server console or logger only (e.g., `logger.debug('[OTP Dev]', otp)`), keeping it out of HTTP responses.

**B8 — Unauthenticated Customer PII Lookup**

2.14 WHEN a request is made to the customer lookup endpoint THEN the system SHALL require a valid customer JWT and SHALL only return data for the customer whose `id` matches the JWT payload, returning HTTP 401 if no valid token is provided.

2.15 WHEN the authenticated customer requests lookup for a phone number that does not belong to their own account THEN the system SHALL return HTTP 403 or HTTP 404, not the other customer's PII.

**B9 — Plaintext Password in Audit Log**

2.16 WHEN a staff password reset is audit-logged THEN the system SHALL replace the password value in the log message with the literal string `'[REDACTED]'`, recording the action without exposing the credential.

**B10 — ~440 Async Route Handlers Without Try-Catch**

2.17 WHEN any database or downstream error occurs inside an async route handler THEN the system SHALL catch the error and pass it to `next(err)`, allowing the centralized Express error handler to return a structured HTTP 500 response without crashing the process.

2.18 WHEN async route handlers are registered THEN the system SHALL wrap every `async (req, res) => { ... }` handler with the existing `asyncHandler` utility (defined in `server/index.js` and `server/helpers/index.js`), ensuring consistent error propagation across all 50+ affected files.

**B11 — Global Axios Interceptor Affects All Modules**

2.19 WHEN the ML service interceptor is registered THEN the system SHALL create a dedicated `axios` instance (`const mlAxios = axios.create()`) and register the interceptor on `mlAxios` only, leaving the global `axios` instance unmodified.

2.20 WHEN ML service caller modules make requests to the ML service THEN the system SHALL use `mlAxios` (or an equivalent scoped instance) instead of the global `axios`.

---

### Unchanged Behavior (Regression Prevention)

**B1 — Command Injection in Backup Routes**

3.1 WHEN a valid backup is created THEN the system SHALL CONTINUE TO produce a valid `.sql` file in the backup directory and return the filename and file size in the response.

3.2 WHEN a valid restore is triggered THEN the system SHALL CONTINUE TO restore the database from the specified backup file and audit-log the operation.

**B2 — Razorpay HMAC Key Fallback**

3.3 WHEN `RAZORPAY_KEY_SECRET` is correctly set and a valid Razorpay payment signature is submitted THEN the system SHALL CONTINUE TO verify the signature successfully and mark the order as paid.

3.4 WHEN `RAZORPAY_KEY_SECRET` is correctly set and an invalid signature is submitted THEN the system SHALL CONTINUE TO return a 400 error with `verified: false`.

**B3 — Google Sign-In Missing Audience Verification**

3.5 WHEN a valid Google ID token with the correct `aud` is submitted THEN the system SHALL CONTINUE TO authenticate the customer and return a signed JWT.

3.6 WHEN `GOOGLE_CLIENT_ID` is not configured (empty string) THEN the system SHALL CONTINUE TO skip the audience check, preserving existing permissive behavior for unconfigured environments.

**B4 — No Session Revocation Check for Customer JWTs**

3.7 WHEN a customer presents a valid, non-revoked JWT THEN the system SHALL CONTINUE TO fulfil the request (dashboard, job details, proof review, invoice download) without additional friction.

3.8 WHEN a staff JWT is used on staff routes THEN the system SHALL CONTINUE TO check staff session revocation via the existing `isSessionRevoked` / in-memory blacklist flow in `auth.js`, unchanged.

**B5 — XSS via Unsanitized `dangerouslySetInnerHTML`**

3.9 WHEN safe HTML tags (`<p>`, `<h2>`, `<ul>`, `<li>`, `<strong>`, `<em>`, `<a>`) are present in blog content THEN the system SHALL CONTINUE TO render them correctly in the preview pane after sanitization.

3.10 WHEN the edit tab is active in the Blog CMS THEN the system SHALL CONTINUE TO display the raw HTML source unchanged in the textarea, unaffected by sanitization.

**B6 — DOMPurify Configured to Allow `style` Tags**

3.11 WHEN the vendor statement PDF is generated THEN the system SHALL CONTINUE TO render the table structure (headers, rows, totals) correctly after the updated sanitization is applied.

**B7 — OTP Returned in API Response Body in Non-Production**

3.12 WHEN an OTP is generated and SMTP is configured THEN the system SHALL CONTINUE TO deliver the OTP by email and return `{ message: 'OTP sent' }` without the OTP in the response.

3.13 WHEN SMTP is not configured THEN the system SHALL CONTINUE TO return `{ message: 'OTP sent', warning: '...' }` without the OTP value in the response body.

**B8 — Unauthenticated Customer PII Lookup**

3.14 WHEN a customer is authenticated and requests their own details THEN the system SHALL CONTINUE TO return their name, email, address, and mobile as part of the autofill flow.

**B9 — Plaintext Password in Audit Log**

3.15 WHEN a staff password reset succeeds THEN the system SHALL CONTINUE TO hash the new password, set `is_first_login = 1`, and return a success response to the caller.

3.16 WHEN the audit log is queried THEN the system SHALL CONTINUE TO record the actor, action type (`STAFF_PASSWORD_RESET`), and the staff member's name and ID, with only the password value portion redacted.

**B10 — ~440 Async Route Handlers Without Try-Catch**

3.17 WHEN a route handler processes a request successfully THEN the system SHALL CONTINUE TO return the same response data and HTTP status code as before the `asyncHandler` wrapper was applied.

3.18 WHEN a route handler that is already wrapped (e.g., in `backup.js`) encounters an error THEN the system SHALL CONTINUE TO delegate it to the error handler without double-wrapping or altering behavior.

**B11 — Global Axios Interceptor Affects All Modules**

3.19 WHEN `ENABLE_ML` is `false` or not set THEN the system SHALL CONTINUE TO short-circuit ML requests via the scoped instance without affecting non-ML HTTP calls.

3.20 WHEN `NODE_ENV` is `'production'` and `ML_SERVICE_URL` points to `localhost` THEN the system SHALL CONTINUE TO block those ML requests via the scoped interceptor.

3.21 WHEN any other library in the process (e.g., `nodemailer`, `googleapis`) makes outbound HTTP calls via `axios` THEN the system SHALL CONTINUE TO send those requests unmodified, with no ML interceptor interference.
