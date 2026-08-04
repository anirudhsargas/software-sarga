# Sarga Prints MIS — CI/CD

This document describes the automated test pipeline and the release workflow for the Sarga MIS monorepo. It is for developers and maintainers who push to `main` or review pull requests.

**Last updated:** 2026-08-04

> [!NOTE]
> Only **testing** runs in CI. Production deploys are triggered by Vercel/Render git integrations on push to `main`; see [DEPLOYMENT_AND_ENV.md](DEPLOYMENT_AND_ENV.md#6-deployment-steps).

---

## Table of Contents

1. [Workflow Overview](#1-workflow-overview)
2. [Backend API Tests](#2-backend-api-tests)
3. [Frontend E2E Tests](#3-frontend-e2e-tests)
4. [ML Contract Tests](#4-ml-contract-tests)
5. [Test Commands](#5-test-commands)

---

## 1. Workflow Overview

The pipeline is defined in `.github/workflows/test.yml`. It triggers on:

- **push** to `main`
- **pull_request** targeting `main`

Global workflow env:

| Variable | Value |
|---|---|
| `NODE_VERSION` | `20` |
| `SKIP_ML_TESTS` | `true` unless repo var `RUN_ML_TESTS=true` |
| `JWT_SECRET` | `ci-test-secret-at-least-32-chars-long-for-github-actions` |
| `NODE_ENV` | `test` |

Jobs run on `ubuntu-latest`. The ML job is conditional: it only runs when the repository variable `RUN_ML_TESTS` is `true` (`if: ${{ vars.RUN_ML_TESTS == 'true' }}`).

| Job | Workspace | What it runs |
|---|---|---|
| `backend-tests` | `server/` | `npm test` (Jest) |
| `frontend-e2e` | `client/` | build + Playwright E2E |
| `website-e2e` | `website/` | build + Playwright E2E |
| `ml-tests` | `ml-service/` | pytest contract tests (opt-in) |

---

## 2. Backend API Tests

Job `backend-tests`, working directory `server/`.

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with Node 20 and npm cache keyed on `server/package-lock.json`
3. `npm ci --prefer-offline --no-audit --no-fund`
4. `npm test` with `CI: true`

Runs Jest (`jest --runInBand`) with Supertest against **mocked** `database.js` — no real DB connection. Coverage modules: health, auth, vendors, stock planning, jobs, customers, payments, analytics. See [TEST_PLAN.md](TEST_PLAN.md#phase-1-backend-api-integration-tests).

---

## 3. Frontend E2E Tests

Two jobs share the same shape, one per frontend app.

- `frontend-e2e` — working directory `client/`
- `website-e2e` — working directory `website/`

Each:

1. Checkout + setup Node 20 (npm cache keyed on the app's `package-lock.json`)
2. `npm ci --prefer-offline --no-audit --no-fund`
3. `npx playwright install --with-deps chromium`
4. `npm run build` (production build feeds the dev/test server)
5. `npx playwright test --config=e2e/playwright.config.js` with `CI: true`

> [!NOTE]
> The `website-e2e` job targets a `website/` app. During research the active repo contained no `website/` directory (only a worktree copy). Confirm the job's target exists in the branch before relying on it — see [AGENT_RULES.md](AGENT_RULES.md) before restructuring.

---

## 4. ML Contract Tests

Job `ml-tests`, working directory `ml-service/`, gated on `vars.RUN_ML_TESTS == 'true'`.

1. `actions/setup-python@v5` — Python 3.11 with pip cache keyed on `ml-service/requirements.txt`
2. `pip install -r requirements.txt`
3. `pip install pytest requests`
4. Start the service: `python app.py &` then wait and `curl -f http://127.0.0.1:5001/health`
5. `python -m pytest tests/ -v -x` with `SKIP_ML_TESTS=false` and `ML_SERVICE_URL=http://127.0.0.1:5001`

---

## 5. Test Commands

Run locally (mirrors CI):

```bash
# Backend (server/)
cd server && npm test

# Client E2E (client/)
cd client && npx playwright test --config=e2e/playwright.config.js

# Website E2E (website/)
cd website && npx playwright test --config=e2e/playwright.config.js

# ML (ml-service/)
python -m pytest tests/ -v -x
```

### Enabling ML tests in CI

Set the repository variable `RUN_ML_TESTS=true` in the GitHub repo settings. Without it, the `ml-tests` job is skipped and `SKIP_ML_TESTS` stays `true`.

---

## Last Updated

**Timestamp:** 2026-08-04 — Initial CI/CD reference generated from `.github/workflows/test.yml`.