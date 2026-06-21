# Sarga Prints MIS — Test Plan

## Overview

This test suite covers all 4 tiers of the Sarga Prints MIS system. Tests are
organized by phase. Each phase has its own directory and can be run independently.

---

## Phase 1: Backend API Integration Tests

**Location:** `server/__tests__/`
**Framework:** Jest + Supertest
**Command:** `npm run test:backend` (alias: `cd server && jest --runInBand`)

### Coverage

| Module               | File                              | What's tested                                                                 |
|----------------------|-----------------------------------|-------------------------------------------------------------------------------|
| Health Check         | `health.test.js`                  | `GET /api/health` returns 200/503; `GET /api/ping` echoes DB state            |
| Auth                 | `auth.test.js`                    | Login (valid/invalid), token validation, protected route rejection, logout     |
| Vendor Management    | `vendors.test.js`                 | Create vendor (3-letter auto-code), list, bill upload, statement reconciliation |
| Stock Planning       | `stock-planning.test.js`          | Stock status, purchase list, approve purchase order, mock-fallback on ML down  |
| Jobs                 | `jobs.test.js`                    | Create job, internal ₹0 billing, list jobs, customer creation, dashboard       |
| Customers/Orders     | `jobs.test.js` (integrated)       | Create customer, customer dashboard shape                                      |
| Payments             | `payments.test.js`                | List payments, create with Idempotency-Key, duplicate detection, customer payment |
| Analytics            | `analytics.test.js`               | Dashboard stats, GST summary, vendor dashboard, customer payments schema       |

### Design Notes

- All tests run against mocked `database.js` — no real DB connection needed.
- Auth middleware is mocked with a test JWT generator.
- Zod validation middleware is preserved and exercised.
- Tests assert response shape (schema), not exact values.

---

## Phase 2: Frontend E2E Tests (Client MIS)

**Location:** `client/e2e/`
**Framework:** Playwright
**Command:** `npm run test:frontend-e2e`

### Coverage

| Flow                         | What's verified                                                      |
|------------------------------|----------------------------------------------------------------------|
| Login → Dashboard            | App renders without error boundary, URL transitions to /dashboard    |
| Create job end-to-end        | Jobs page loads, "Create" button clickable, no crash                 |
| Add stock entry              | Inventory page loads, "Add Stock" button clickable, no crash          |
| Dark mode toggle             | Toggle button changes `data-theme` attribute, no style regression     |
| Pagination                   | List pages (jobs) show pagination, next page click doesn't crash      |

### Design Notes

- All API calls are intercepted via `page.route()` — no live backend needed.
- Tests verify UI does not crash (Error Boundary check) and critical interactions work.
- Dark mode toggle regression test specifically guards against the circular CSS variable bug.

---

## Phase 3: Website E2E Tests (Public Site)

**Location:** `website/e2e/`
**Framework:** Playwright
**Command:** `npm run test:website-e2e`

### Coverage

| Flow                            | What's verified                                                              |
|---------------------------------|------------------------------------------------------------------------------|
| Chatbot message + response      | Sends a message, verifies bot bubble renders                                 |
| Chatbot XSS prevention          | `<script>` tags in bot reply are HTML-escaped, not executed                  |
| Quote cart persistence          | Add item, navigate pages, cart survives localStorage                         |
| Firebase Phone OTP (mocked)     | Enter phone, click OTP, token saved to localStorage                          |
| PrivateRoute guard              | Unauthenticated access to /portal/* redirects or shows access denied          |
| Chatbot auto-scroll             | Last message is visible in viewport, scroll container scrollTop > 0           |

### Design Notes

- All API calls intercepted — no live backend or Firebase needed.
- Tests validate security (no XSS), UX (auto-scroll), and auth guards.
- Cart persistence tests exercise localStorage round-trip.

---

## Phase 4: ML Microservice + Payment Integration (Gated)

**Location:** `ml-service/tests/`
**Framework:** Pytest
**Command:** `npm run test:ml` (skippable; `SKIP_ML_TESTS=true` by default)

### Coverage

| Endpoint                  | Contract tested                                               |
|---------------------------|---------------------------------------------------------------|
| `/health`                 | Returns `{"status": "ok", "service": "sarga-ml"}`             |
| `/predict-sales`          | Accepts branch/horizon features, returns predictions/forecast |
| `/stock-planning`         | Accepts inventory + consumption, returns recommendations       |
| `/predict-turnaround`     | Returns estimated hours/days for a job                        |
| `/categorize-expense`     | Returns category/label from description text                   |
| `/detect-anomaly`         | Returns anomaly score or alert flag                           |
| `/upsell-suggestions`     | Returns recommended upsell items                              |
| `/chat`                   | Returns reply/response to user message                        |
| Input validation          | Empty body returns 400/422                                    |

### Design Notes

- **Gated by default:** `SKIP_ML_TESTS=true`. Set to `false` to run.
- Tests connect to a *local* ML service at `http://127.0.0.1:5001`.
- Contract tests only — no training data or model validation.
- Will pass in CI only after the ML service deployment is configured.

### BaseUPI / Payment Webhook

The payment webhook flow is tested in Phase 1 (`payments.test.js`):
- Simulates a payment with Idempotency-Key matching the BaseUPI Notification Bridge
  APK webhook pattern.
- Verifies the payment is recorded and matched to the correct order.
- Tests the duplicate webhook replay guard (idempotent key dedup).

---

## Running Tests

```bash
# All backend integration tests
npm run test:backend

# Frontend E2E (requires dev server)
npm run test:frontend-e2e

# Website E2E (requires dev server)
npm run test:website-e2e

# ML service tests (gated — skipped unless SKIP_ML_TESTS=false)
npm run test:ml

# All tests (CI pipeline)
npm run test:all
```

## CI Pipeline

GitHub Actions workflow at `.github/workflows/test.yml`:

| Trigger         | Runs                        | Skips      |
|-----------------|-----------------------------|------------|
| Push to `main`  | Backend + Frontend E2E + Website E2E | ML (until repo var `RUN_ML_TESTS=true`) |
| Pull request    | Backend + Frontend E2E + Website E2E | ML (until repo var `RUN_ML_TESTS=true`) |

## What's NOT Tested (and Why)

| Area               | Reason                                                                 |
|--------------------|------------------------------------------------------------------------|
| Production DB      | Tests use mocks/separate test DB; prod credentials never hardcoded      |
| ML model accuracy  | Contract tests only; model eval is an offline data-science concern      |
| CCTV live streams  | Requires physical hardware                                              |
| MCP server         | 41-tool server focuses on internal integration; tested separately       |
| Design workspace   | Canvas-heavy; visual regression tested via manual QA                    |
