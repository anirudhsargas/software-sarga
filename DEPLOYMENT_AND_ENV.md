# Sarga Prints MIS — Deployment & Environment

This document describes how to run, configure, and deploy the Sarga MIS across environments. It covers environment variables, the Aiven MySQL connection, hosting topology, and manual + automated deployment. It is for DevOps, backend developers, and anyone setting up a new environment.

**Last updated:** 2026-08-04

> [!WARNING]
> Never commit `.env`, `.env.local`, or `.env.bak` files. This repo's history contains past secret leaks (see [AGENT_RULES.md](AGENT_RULES.md#critical-donts)). Use Render secrets, Vercel env vars, or `fromSecret:` in `render.yaml` instead.

---

## Table of Contents

1. [Topology Overview](#1-topology-overview)
2. [Local Development Setup](#2-local-development-setup)
3. [Environment Variables](#3-environment-variables)
4. [Database (Aiven MySQL)](#4-database-aiven-mysql)
5. [Production Hosting (Render + Vercel)](#5-production-hosting-render--vercel)
6. [Deployment Steps](#6-deployment-steps)
7. [Known Gaps & Gotchas](#7-known-gaps--gotchas)

---

## 1. Topology Overview

| Layer | Provider | Entry | Purpose |
|---|---|---|---|
| Staff MIS client | Vercel | `software-sarga.vercel.app` | React/Vite portal in `client/` |
| Customer website | Vercel | `sargaoffset.vercel.app` | Public site (see note below) |
| Backend API | Render | `software-sarga-2.onrender.com/api` | Express server in `server/` |
| ML service | Render | `sarga-ml-service.onrender.com` | Flask microservice in `ml-service/` |
| Database | Aiven | `DB_HOST` (SSL) | Aiven MySQL |

The full deployment diagram and CORS allowlist are in [ARCHITECTURE.md](ARCHITECTURE.md#8-deployment-topology).

> [!NOTE]
> During research, no active `website/` directory existed in the repo root (only a stale worktree copy under `.kilo/worktrees/`). The customer website may be served by the Vite client or via the separate `blog-module` / `portfolio-module` / `i18n-module` Next.js apps. **This needs confirmation** — see [AGENT_RULES.md](AGENT_RULES.md) and ask before treating the website deployment as settled.

---

## 2. Local Development Setup

Prerequisites: Node.js ≥ 18, npm, and (for tests) a MySQL instance or mocked DB.

1. Copy `server/.env.example` → `server/.env` and fill DB credentials.
2. Copy root `.env.example` → `.env` for Vite defaults.
3. Install dependencies:
   - Server: `cd server && npm ci`
   - Client: `cd client && npm ci`
4. Start the backend: `node server/index.js` (defaults to port `3000`).
5. Start the Vite client: `cd client && npm run dev` (defaults to `5173`/`5174`).

Root convenience scripts in `package.json`:
- `npm run dev` → `node start.js`
- `npm run build` → installs + builds the client

---

## 3. Environment Variables

Variables are split by process. **Not every variable in the example files is actually read by code**, and a few required variables are absent from every example file — see §7.

### 3.1 Server — Database

| Variable | Used in | Notes |
|---|---|---|
| `DB_HOST` | `server/database.js`, `index.js`, scripts | Default `localhost` |
| `DB_PORT` | `server/database.js` | Default `3306`; Render uses `14194` |
| `DB_USER` | `server/database.js`, `routes/backup.js` | Validated against `^[A-Za-z0-9_-]+$` at boot |
| `DB_PASSWORD` | `server/database.js` | Used by the DB driver |
| `DB_PASS` | `routes/backup.js`, `scripts/*` | Alternate alias used by backup tooling |
| `DB_NAME` | `server/database.js`, routes | Validated at boot |
| `DB_SSL` | `server/database.js` | `"true"` forces SSL with `aiven-ca.pem` |
| `DB_SSL_MODE` | `server/database.js` | `"REQUIRED"` also forces SSL |
| `PGSSLMODE` | `server/database.js` | `"require"` also forces SSL (Aiven compat) |
| `DATABASE_URL` | `routes/whatsapp.js`, Next.js modules | Postgres modules only |

### 3.2 Server — Auth & Runtime

| Variable | Used in | Notes |
|---|---|---|
| `JWT_SECRET` | `index.js`, `middleware/auth.js` | **Required** — server refuses to start without it |
| `JWT_SECRET_PREVIOUS` | `middleware/auth.js` | Rolling-secret rotation |
| `PORT` | `index.js` | Default `3000` |
| `NODE_ENV` | everywhere | `development`/`production`/`test` |
| `CORS_ORIGIN` | `index.js` | Comma-separated extra origins |
| `CLIENT_URL` | `index.js`, `routes/passwordReset.js` | Dynamic origin |
| `VERCEL_URL` | `index.js` | Vercel-injected; builds `https://<url>` origin |
| `RENDER_EXTERNAL_URL` | `index.js`, `keep-alive.js` | Render public URL |
| `SERVER_URL` | `index.js`, `keep-alive.js` | `https://software-sarga-2.onrender.com` |
| `SITE_URL` | `routes/seo.js` | Default `https://sarga.in` |
| `APP_VERSION` / `APP_VERSION_CRITICAL` | `index.js` | `/api/version` payload |
| `SESSION_CACHE_TTL` | `middleware/auth.js` | Default `43200` (sec) |
| `ENABLE_DEV_TOKEN` | `routes/devRoutes.js` | `"1"` enables dev routes |
| `CACHE_ENABLED` | `services/cacheService.js` | Any value ≠ `"false"` enables cache |

### 3.3 Server — External Services

| Variable | Used in | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | `routes/checkout.js`, `index.js` | Razorpay (checked at boot; routes disabled if missing) |
| `GOOGLE_CLIENT_ID` | `index.js`, `routes/website.js` | Google sign-in audience check |
| `GOOGLE_PLACES_API_KEY` / `GOOGLE_PLACE_ID` | `routes/websiteReviews.js` | Public reviews fetch |
| `GOOGLE_SA_KEY` / `GOOGLE_SERVICE_ACCOUNT` / `GOOGLE_SERVICE_ACCOUNT_BASE64` | `services/googleSheetsService.js` | Sheets backup (any one of the three) |
| `GOOGLE_SHEET_ID` | `services/googleSheetsService.js`, `routes/sheetsBackup.js` | Backup target sheet |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | `helpers/cloudinaryUpload.js`, `index.js` | Image fallback storage |
| `ML_SERVICE_URL` | `routes/chatbot.js`, tests | Flask ML base URL |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | `services/billExtractionService.js`, `routes/ocr.js` | Bill OCR/LLM (model default `gemini-3.1-flash-lite`) |
| `CHATBOT_MODEL` | `routes/chatbot.js` | Chatbot model |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_SECURE` | `routes/website.js` | Email OTP delivery |
| `EMAIL_FROM` / `EMAIL_PASS` / `EMAIL_TO` | `routes/invoiceFeatures.js`, `passwordReset.js`, `quotes.js`, `services/dailyBookScheduler.js` | Invoices/quotes email |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | `services/billEmailParser.js` | Bill inbox parsing |
| `BACKUP_RUN_SECRET` | `routes/sheetsBackup.js` | Sheets backup auth |
| `WEBSITE_SYNC_SECRET` | `routes/website.js` | Website sync webhook auth |

### 3.4 Client (Vite) — `VITE_*`

| Variable | Used in | Notes |
|---|---|---|
| `VITE_API_URL` | `services/api.js`, `services/auth.js`, `services/socketClient.js`, `services/syncWorkerManager.js` | API base (no trailing `/api`) |
| `VITE_API_BASE_URL` | `services/api.js`, `services/auth.js` | Alternate base |
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_STORAGE_BUCKET` / `VITE_FIREBASE_MESSAGING_SENDER_ID` / `VITE_FIREBASE_APP_ID` | `services/firebase.js` | Phone OTP auth (see [ARCHITECTURE.md](ARCHITECTURE.md#5-external-integrations)) |
| `VITE_FIREBASE_MEASUREMENT_ID` | — | Declared in env files, not read in `client/src` |
| `VITE_GOOGLE_CLIENT_ID` | — | Declared in `.env.example`, **not referenced in client code** |

### 3.5 Test Environment

From `.env.test.example`: `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`, `TEST_DB_SSL`, `JWT_SECRET`, `JWT_SECRET_PREVIOUS`, `SKIP_ML_TESTS`, `NODE_ENV=test`, `ML_SERVICE_URL`, `E2E_BASE_URL`. CI overrides `JWT_SECRET` (see [CI-CD.md](CI-CD.md)).

---

## 4. Database (Aiven MySQL)

Configured in `server/database.js` (`mysql2/promise` pool):

- **Pool**: `connectionLimit: 25`, `queueLimit: 0`, `waitForConnections: true`, `enableKeepAlive`, `connectTimeout: 10000`, `maxIdle: 10`, `idleTimeout: 30000`.
- **SSL**: Enabled when `DB_SSL === 'true'` OR `DB_SSL_MODE === 'REQUIRED'` OR `PGSSLMODE === 'require'`. Requires `server/aiven-ca.pem`; with the file present it connects with `rejectUnauthorized: true`.
- **Migrations**: Applied automatically on boot (`initDb`) from `server/schemas/*.sql` + `server/migrations/`; tracked in `schema_migrations` / `schema_version`. See [DATA_MODEL.md](DATA_MODEL.md#1-schema-management).
- **Warm-up**: `warmDatabasePool()` pings core tables after listen; a product-hierarchy cache pre-warm also runs ~2s after boot.

---

## 5. Production Hosting (Render + Vercel)

### 5.1 Render (backend + ML)

`render.yaml` at the repo root declares two services:

- **`sarga-ml-service`** — Python, `rootDir: ml-service`, `gunicorn -w 2`, DB env via `fromSecret`.
- **`sarga-backend`** — Node, `rootDir: server`, `npm ci` + `npm run start`, with `NODE_ENV=production`, `DB_PORT=14194`, `DB_SSL=true`, Firebase/Cloudinary/ML env, and `JWT_SECRET` via `fromSecret`.

A second config (`server/render.yaml`) adds `RENDER_EXTERNAL_URL`, `SERVER_URL`, and `GEMINI_API_KEY`/`GEMINI_MODEL`.

### 5.2 Vercel (clients)

- `client/vercel.json` — Vite build (`npm run build`, output `dist`), SPA rewrites to `index.html`, cache headers on `/assets/*`, security headers.
- Root `vercel.json` — SPA rewrite fallback + `cleanUrls`.
- Vercel branch/preview origins (`software-sarga-*.vercel.app`, `sargaoffset-*.vercel.app`) are auto-accepted by the backend CORS config.

### 5.3 Keep-alive

Render free/starter instances idle-spin down. `server/keep-alive.js` pings `/api/ping` every 14 minutes via `SERVER_URL`. It cannot restart a fully spun-down container — see [ARCHITECTURE.md](ARCHITECTURE.md#7-known-architectural-debt).

---

## 6. Deployment Steps

### Manual deploy (backend)

1. Merge to `main` and push to the repo's origin (Render auto-deploys from `main`).
2. Verify env on Render dashboard: secrets `JWT_SECRET`, `DB_*`, `RAZORPAY_*`, `CLOUDINARY_*`, `GOOGLE_*`, `ML_SERVICE_URL` exist.
3. Confirm `server/aiven-ca.pem` is present on the server (SSL requirement).
4. Hit `GET /api/health` and `GET /api/ping` to confirm boot and DB connectivity.
5. Confirm migration log shows `schema_version` = `server_bootstrap:045_enterprise_audit.sql`.

### Manual deploy (client)

1. Push to `main`; Vercel builds `client/` (framework `vite`).
2. Verify `VITE_API_URL` points at the Render backend in the Vercel project env.

### Automated

GitHub Actions in `.github/workflows/test.yml` run backend, client E2E, and website E2E on push/PR to `main`; ML contract tests run only when `RUN_ML_TESTS=true`. See [CI-CD.md](CI-CD.md).

---

## 7. Known Gaps & Gotchas

| # | Issue | Recommendation |
|---|---|---|
| 1 | `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` and `GOOGLE_CLIENT_ID` are checked at startup but appear in **no** example env file. | Add them to `server/.env.example` and Render secrets. |
| 2 | `DB_PASS` vs `DB_PASSWORD` both exist; driver uses `DB_PASSWORD`, backup scripts use `DB_PASS`. | Standardize on one; document the mapping. |
| 3 | `REDIS_*` and `NGINX_PORT` are documented but **not read by server code** (caching is in-memory via `services/cacheService.js`). | Either wire Redis or remove the vars from `.env.example`. |
| 4 | `JWT_EXPIRES_IN` does not exist; expiry is hardcoded (`12h`), session TTL via `SESSION_CACHE_TTL`. | Do not set `JWT_EXPIRES_IN`; it has no effect. |
| 5 | `VITE_GOOGLE_CLIENT_ID` and `VITE_FIREBASE_MEASUREMENT_ID` are declared but unused in `client/src`. | Confirm whether client Google auth is intentionally unused. |
| 6 | Root `vercel.json` rewrite excludes `/api` but the backend does not run on Vercel — ensure nothing routes `/api` to a Vercel function. | Confirm API traffic always targets Render. |
| 7 | No `website/` directory in the active repo; the customer-facing deploy target is ambiguous. | Confirm with the owner which app serves `sargaoffset.vercel.app`. |

---

## Last Updated

**Timestamp:** 2026-08-04 — Initial env/deploy reference assembled from `.env.example`, `.env.test.example`, `server/env.example`, `render.yaml`, `server/render.yaml`, `vercel.json`, `client/vercel.json`, and `server/index.js`/`server/database.js`.