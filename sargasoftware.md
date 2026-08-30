# SARGA SOFTWARE — Complete Build Guide & Repository Documentation

> **Purpose:** This document is the complete, authoritative reference for the **Sarga Prints MIS** (Management Information System). It documents every feature, every architectural decision, every table, every route, and every integration so that a developer reading this file can recreate the entire software from scratch.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [Backend API Server](#6-backend-api-server)
7. [Frontend Application](#7-frontend-application)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Feature: Job Management](#9-feature-job-management)
10. [Feature: Customer Management](#10-feature-customer-management)
11. [Feature: Billing & Payments](#11-feature-billing--payments)
12. [Feature: Inventory Management](#12-feature-inventory-management)
13. [Feature: Paper & Consumables](#13-feature-paper--consumables)
14. [Feature: Vendor & Expense Management](#14-feature-vendor--expense-management)
15. [Feature: Finance & Accounts](#15-feature-finance--accounts)
16. [Feature: Three-Books Offset Production](#16-feature-three-books-offset-production)
17. [Feature: Staff & HR](#17-feature-staff--hr)
18. [Feature: Design Workspace](#18-feature-design-workspace)
19. [Feature: AI & ML Features](#19-feature-ai--ml-features)
20. [Feature: Customer Website & E-commerce](#20-feature-customer-website--e-commerce)
21. [Feature: PWA & Offline Support](#21-feature-pwa--offline-support)
22. [Feature: Multi-Branch Operations](#22-feature-multi-branch-operations)
23. [Feature: Security & Audit](#23-feature-security--audit)
24. [Feature: CCTV Face Recognition Attendance](#24-feature-cctv-face-recognition-attendance)
25. [Feature: MCP Server (AI Agent Integration)](#25-feature-mcp-server-ai-agent-integration)
26. [External Integrations](#26-external-integrations)
27. [Deployment Guide](#27-deployment-guide)
28. [Environment Variables](#28-environment-variables)
29. [Testing Strategy](#29-testing-strategy)
30. [Complete API Endpoint List](#30-complete-api-endpoint-list)
31. [Pages & Routes Reference](#31-pages--routes-reference)
32. [Component Reference](#32-component-reference)
33. [Design System](#33-design-system)
34. [Build & Run Commands](#34-build--run-commands)
35. [Security Considerations](#35-security-considerations)
36. [Side Modules](#36-side-modules)
37. [Glossary of Terms](#37-glossary-of-terms)

---

## 1. System Overview

**Sarga Prints MIS** is a comprehensive Management Information System for a commercial print shop operating **two branches** (Perambra and Meppayur) in Kerala, India. It manages the complete business lifecycle — from customer inquiry through design, printing, production, billing, delivery, and accounting.

### What the Software Does

| Domain | Capabilities |
|---|---|
| **Print Jobs** | Full lifecycle tracking (12 statuses), per-branch daily numbering, staff assignment, proofs & customer approval, paper usage logging, book types (Offset/Laser/Other) |
| **Customers** | Walk-in / Retail / Offset tiers, mobile-indexed lookup, order history, advances & balances, discount approval workflow, design asset library, coupons, refunds, business profiles & brand assets |
| **Billing** | GST invoices (CGST/SGST), financial-year invoice numbering, receipts by email (PDF), recurring invoices, draft/final tracking, Razorpay web checkout, idempotent payments |
| **Inventory** | Auto-SKU products, branch-level stock, stock requests & transfers, verifications, purchase orders, reorders, consumption logging |
| **Paper & Consumables** | Sheet-accurate paper inventory (GSM/sizes), live stock summary, cut-map ratios, cutting optimizer, rate calculator, ink/chemical/plate tracking |
| **Vendors & Expenses** | Vendor ledger & statements, bills + items, payments, utility connections with per-branch email parsing, GST bill extraction (Tesseract OCR + Gemini AI), petty cash, office/transport/misc expenses |
| **Finance** | Rent locations, EMI master/payments (loan/vehicle/machine), Kuri (chit-fund) ledger, daily-report books, cash vs bank reports, chart of accounts |
| **Three-Books Production** | Machine registry, SNMP/HTTP meter polling (Kyocera/Konica/Canon), daily work entries, machine credit system, automated 9 AM / 7 PM reports |
| **Staff & HR** | Six roles, monthly/daily salary models, leaves, tasks, attendance (manual / face-recognition / QR), attendance correction requests |
| **Design Workspace** | Designer portal, bookings, asset library, block journal, preflight design checks, AI paper-layout optimization |
| **AI Features** | Sales forecasting (ML service), anomaly/fraud detection, Gemini bill extraction, natural-language search, upsell suggestions, imposition calculator |
| **Customer Website** | Product catalog, cart, Razorpay checkout, proof review, pickup slots, delivery estimates, artwork uploads, promotions, blog, portfolio, i18n, chatbot, Google reviews, WhatsApp click analytics |
| **PWA / Offline** | Service worker caching, IndexedDB offline database, background sync queue, offline banners, stale-chunk protection |
| **Multi-Branch** | Branch scoping middleware, admin branch switching, inter-branch stock transfers & accounting |
| **Security** | Full audit trail, activity logs, fraud alerts, session revocation, JWT with dual secrets, RBAC, Helmet CSP, rate limiting, CORS allowlist |

### Business Context

- **Industry:** Print shop — offset printing, laser printing, binding, lamination
- **Branches:** Perambra (main), Meppayur (satellite)
- **Roles:** Admin, Accountant, Front Office, Designer, Printer, Other Staff
- **Customers:** Walk-in (casual one-off), Retail (repeat), Offset (bulk/business)
- **Products:** Visiting cards, letterheads, brochures, banners, booklets, stickers, business cards, wedding cards, flex prints and more

### Production URLs

- **Frontend (PWA):** `https://software-sarga.vercel.app`
- **Backend API:** `https://software-sarga-2.onrender.com/api`
- **Customer Website:** `https://sargaoffset.vercel.app` (separate repo)
- **ML Service:** Render Python/Flask service (separate repo, not in this checkout)

---

## 2. Architecture

### High-Level Topology

```
┌──────────────────────────────────────────────────────────────┐
│                CLIENT — React 19 PWA (Vercel)                 │
│   Staff Portal │ Accountant Portal │ Designer Portal │ Front │
│   Office Portal │ Admin Console (role-gated routes)          │
│   ── react-query │ socket.io-client │ IndexedDB │ workbox    │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS + WebSocket (wss)
┌────────────────────────────┴─────────────────────────────────┐
│              SERVER — Express 5 API (Render)                  │
│   routes (77+ modules) │ middleware (auth/RBAC/branch/audit) │
│   services (socket/cron/ocr/snmp/sheets/chat)                 │
│   scheduler (9AM/7PM reports, keep-alive, cache cleanup)      │
└────────────────────────────┬─────────────────────────────────┘
                             │ mysql2 (SSL REQUIRED)
┌────────────────────────────┴─────────────────────────────────┐
│             MySQL 8 (Aiven Cloud) — `defaultdb`               │
│   100+ tables │ 47 SQL schema migrations │ 36 JS migrations   │
└───────────────────────────────────────────────────────────────┘

Companion services:
  • MCP Server  (TypeScript, stdio + HTTP :3100) — AI agent tools
  • Chatbot     (embedded Express app + JSON knowledge base)
  • ML Service  (Python/Flask :5001) — sales forecasting
  • Blog / Portfolio / i18n (Next.js 13 modules)

External integrations:
  • Razorpay (payments)  • Cloudinary (files)  • Firebase (auth/PWA)
  • Gemini AI (bill OCR) • Google Sheets (backup) • Gmail SMTP/IMAP
  • Google OAuth + Places (reviews) • Sentry (monitoring)
  • net-snmp / HTTP printer meter polling
```

### Data Flow (Request Lifecycle)

1. Staff logs in → `POST /api/auth/login` → server verifies bcrypt hash → issues signed JWT.
2. Client stores token in `localStorage`; Axios interceptor attaches `Authorization: Bearer <token>`.
3. Server `middleware/auth.js` verifies JWT (dual secrets for rotation), then RBAC middleware checks `req.user.role`, then branch filter scopes data to `branch_id`.
4. Route handler queries MySQL via the lazy pool in `server/database.js`; write operations are recorded into `sarga_audit_logs` automatically.
5. Response JSON is sent; Socket.IO broadcasts real-time events to connected clients (job updates, payments, inventory low, notifications).
6. Cron scheduler (`server/services/scheduler.js`) handles 9 AM / 7 PM daily reports, plus a keep-alive self-ping every 10 minutes.

### Key Architectural Decisions

| Decision | Rationale |
|---|---|
| **MySQL over PostgreSQL** | Aiven free-tier compatibility; single dependency; SSL REQUIRED |
| **Express 5** | First-class async error handling, cleaned middleware pipeline |
| **React 19 + Vite 6** | Fast builds, code splitting, first-class PWA plugin |
| **@tanstack/react-query** | Server-cache, background refetch, optimistic updates, offline retry |
| **Socket.IO** | Real-time job/status push across two branches |
| **Cloudinary** | Offloads file storage (proofs, bills, receipts) from the server |
| **Offline-first** | IndexedDB + Workbox so the front desk still works with poor connectivity |
| **Lazy DB pool** | Pool created on first use; safe auto-migration at boot |
| **JWT dual secrets** | Zero-downtime secret rotation |
| **Idempotency keys on payments** | Prevents duplicate billing writes from double-taps/retries |

---

## 3. Technology Stack

### Frontend — `client/`

| Package | Version | Purpose |
|---|---|---|
| react | 19.2.0 | UI framework |
| vite | 6.0.11 | Build tool / dev server |
| react-router-dom | 7.13.0 | Client routing |
| @tanstack/react-query | 5.101 | Server state & caching |
| @tanstack/react-virtual | latest | Virtualized lists |
| recharts | 3.8 | Charts & analytics |
| lucide-react | latest | Icon set |
| @dnd-kit/** | latest | Drag & drop |
| axios | latest | HTTP client |
| socket.io-client | latest | WebSocket client |
| react-hook-form + @hookform/resolvers | latest | Forms |
| zod | latest | Schema validation |
| html5-qrcode, jsqr | latest | QR scanning |
| qr-creator, qrcode | latest | QR generation |
| jspdf, jspdf-autotable | latest | PDF generation |
| react-easy-crop | latest | Image cropping |
| dompurify | latest | XSS sanitization |
| react-helmet-async | latest | SEO meta tags |
| vite-plugin-pwa, workbox | latest | PWA offline |
| @sentry/react | latest | Error monitoring |
| react-hot-toast | latest | Notifications |
| vitest, @testing-library/react, jsdom | 2.x | Unit tests |
| playwright | latest | E2E tests |

### Backend — `server/`

| Package | Version | Purpose |
|---|---|---|
| node | ≥18 (Docker: 22-alpine) | Runtime |
| express | 5.2.1 | Web framework |
| mysql2 | 3.16.3 | MySQL driver (promise API) |
| pg | 8.11 | Optional Postgres driver |
| jsonwebtoken | 9.x | JWT signing/verification |
| bcryptjs | latest | Password hashing |
| socket.io | 4.8 | WebSocket server |
| multer | latest | Multipart uploads → Cloudinary |
| cloudinary | 2.10 | Cloud file storage |
| sharp | latest | Image processing (resize/compress) |
| pdfkit | latest | Server-side PDF generation |
| pdf-parse | latest | PDF text extraction |
| pdf2pic | latest | PDF → image conversion |
| tesseract.js | 7.x | OCR engine (eng.traineddata) |
| @google/generative-ai | 0.24 | Gemini structured bill extraction |
| googleapis | 173 | Google Sheets backup service |
| nodemailer | 8.x | Outbound email (OTP, receipts, reports) |
| imap | latest | Inbound email parsing (utility bills) |
| net-snmp | 3.26.1 | Printer SNMP counter polling |
| node-cron | latest | Scheduled jobs |
| node-cache | latest | In-memory cache |
| winston | latest | Structured logging |
| xlsx | latest | Excel read/write |
| csv-parse | latest | CSV parsing |
| qrcode | latest | QR generation in emails |
| uuid | 14.x | ID generation |
| zod | 3.23 | Runtime validation |
| helmet | 8.x | Security headers |
| cors | latest | CORS |
| compression | latest | Gzip |
| express-rate-limit | 8.x | Rate limiting |
| jest, supertest | 29.x | Tests |
| nodemon | latest | Dev restart |
| eslint / prettier | 9.x | Lint / format |

### MCP Server — `mcp-server/`

| Package | Purpose |
|---|---|
| typescript 5.7 | Language |
| @modelcontextprotocol/sdk 1.12.1 | MCP protocol (stdio + HTTP) |
| mysql2 | Database access |
| zod | Tool parameter validation |
| express 5 | HTTP transport (:3100) |
| winston | Logging |
| jsonwebtoken | JWT/RBAC for agent access |

### Side Modules

| Module | Tech | Purpose |
|---|---|---|
| blog-module | Next.js 13.4.10 + React 18 + pg | Customer-facing blog CMS |
| portfolio-module | Next.js 13.4.10 + formidable + cloudinary | Design portfolio CMS |
| i18n-module | Next.js 13.4.10 + cookie | Translations (en/ml) |

---

## 4. Project Structure

```
software sarga/
├── client/                         # React 19 PWA (Vercel)
│   ├── src/
│   │   ├── pages/                  # 137 routed page components
│   │   ├── components/             # 83 shared components
│   │   │   ├── ui/                 #   Button, Modal, Pagination, Skeleton…
│   │   │   ├── accounting/         #   Accounting widgets
│   │   │   ├── chatbot/            #   Chat widget
│   │   │   └── quickbilling/       #   Quick-billing workflow
│   │   ├── layouts/                # StaffLayout, AccountantLayout, DesignerLayout
│   │   ├── services/               # api.js, auth.js, firebase.js, offlineDb.js, syncWorkerManager.js
│   │   ├── hooks/                  # 16 hooks (useOffline, usePagination, useAuth…)
│   │   ├── contexts/               # BranchContext, ConfirmContext
│   │   ├── theme/                  # ThemeProvider (CSS design tokens)
│   │   ├── seo/                    # routeMeta, SEOProvider, useSEO
│   │   ├── utils/                  # formatters, invoicePdf, paperOptimizer, pricing, validators
│   │   ├── test/ , tests/          # Vitest setup + tests
│   │   ├── bones/                  # registry.js
│   │   ├── App.jsx                 # Routing + providers
│   │   └── main.jsx                # Entry + PWA + Sentry
│   ├── e2e/                        # Playwright specs
│   ├── public/                     # manifest.json, syncWorker.js, icons, robots.txt
│   ├── vite.config.js              # PWA, chunks, sitemap
│   └── package.json
│
├── server/                         # Express 5 API (Render)
│   ├── routes/                     # 77 route modules
│   ├── middleware/                 # auth, branchFilter, auditTrail, cache, validate
│   ├── services/                   # socketManager, scheduler, cacheService, dailyBook*,
│   │                               #   billExtraction, ocrService, mprIntegration,
│   │                               #   googleSheetsService, chatService
│   ├── helpers/                    # logger, cloudinaryUpload, anomalyDetection,
│   │                               #   jobCost, smartSearch, pagination
│   ├── schemas/                    # 47 numbered .sql files (001_core … 045_…)
│   ├── migrations/                 # 36 JS + dated SQL migrations
│   ├── chatbot/                    # Standalone express chatbot + knowledge base
│   ├── utils/                      # AppError, base64, crypto, mailer, ocrParser, requestQueue
│   ├── __tests__/                  # ~40 Jest test files
│   ├── index.js                    # Entry point
│   ├── database.js                 # MySQL pool + schema migration engine
│   ├── aiven-ca.pem                # SSL CA cert (Aiven)
│   ├── Dockerfile                  # Node 22 alpine
│   └── package.json
│
├── mcp-server/                     # MCP (AI agents) — TypeScript
│   └── src/{config,services,tools,types,utils} + index.ts + http-server.ts
│
├── migrations/                     # Root-level SQL (WhatsApp, vendor mgmt, enums)
├── docs/                           # deployment, design-system, nginx, redis, archive/ (38 docs)
├── tools/                          # face_recognition_attendance.py, SQL utilities, test scripts
├── deployment/nginx.conf           # NGINX reverse proxy template
├── blog-module/ portfolio-module/ i18n-module/   # Next.js 13 modules
├── .github/workflows/test.yml      # CI (Jest + Playwright)
├── scripts/setupGoogleSheets.js
├── start.js, start.ps1, deploy.ps1, wake-render.ps1, vercel_env_setup.ps1
├── render.yaml, vercel.json
├── sarga_db_backup.sql             # DB dump
├── *.md                            # ARCHITECTURE, PAGES, COMPONENTS, DESIGN, RBAC_AUDIT…
└── package.json
```

> **Note:** `/website` (customer front-end) and `/ml-service` (Flask) are referenced by docs & CI but their sources live in separate repositories.

---

## 5. Database Schema

### Engine & Connection

- **Engine:** MySQL 8 on Aiven (`defaultdb`)
- **SSL:** `DB_SSL=true`, `DB_SSL_MODE=REQUIRED`, CA at `server/aiven-ca.pem`
- **Pool:** `server/database.js` lazy proxy (pool created on first query, auto-migrations on init)

### Migration System

- SQL migrations applied from `server/schemas/*.sql` in numeric order; each applied file recorded in `schema_migrations`.
- JS migrations run sequentially after SQL (`migrations/*.js`), tracked by the same table.
- Current schema version target: `045_enterprise_audit.sql`.
- Root `migrations/*.sql` are additional (WhatsApp clicks, office-expense enums, vendor mgmt) — applied manually or idempotently.

### Full Table Inventory (100+ tables)

**Core Domain**
`sarga_branches`, `sarga_staff`, `sarga_job_seq`, `sarga_company_settings`, `schema_version`, `schema_migrations`

**Customer Domain**
`sarga_customers`, `sarga_customer_payments`, `sarga_customer_requests`, `sarga_discount_requests`, `sarga_customer_designs`, `sarga_coupons`, `sarga_refunds`, `sarga_business_profiles`, `sarga_brand_assets`, `sarga_customer_otps`, `sarga_customer_sessions`

**Jobs / Production**
`sarga_jobs`, `sarga_job_matter`, `sarga_job_staff_assignments`, `sarga_job_status_history`, `sarga_job_proofs`, `sarga_paper_usage_logs`

**Products / Pricing**
`sarga_products`, `product_hierarchy`, `product_hierarchy_view`, `product_finishes`, `product_finish_mapping`, `pricing_tiers`, `pricing_rules`

**Inventory**
`sarga_inventory`, `sarga_inventory_consumption`, `sarga_inventory_reorders`, `sarga_stock_requests`, `sarga_branch_stock`, `sarga_stock_verifications`, `sarga_stock_verification_items`, `sarga_purchase_orders`, `sarga_purchase_order_items`, `sarga_products`, `stock_transfers`

**Paper / Consumables**
`sarga_paper_inventory`, `paper_types`, `paper_stock_movements`, `paper_stock_summary`, `paper_stock_summary`, `consumables_inventory`, `consumables_adjustments`, `sarga_paper_cut_map`, `sarga_paper_rate_history`, `cutting_jobs`, `cutting_job_outputs`

**Vendor / Finance**
`sarga_vendors`, `sarga_vendor_bills`, `sarga_vendor_bill_items`, `sarga_vendor_payments`, `sarga_vendor_requests`, `sarga_vendor_statements`, `sarga_vendor_statement_lines`, `sarga_utility_connections`, `sarga_utility_bills`, `sarga_payments`, `sarga_payment_methods`, `sarga_payment_suggestions`, `sarga_rent_locations`, `sarga_emi_master`, `sarga_emi_payments`, `sarga_kuri_master`, `sarga_kuri_payments`, `sarga_office_expenses`, `sarga_transport_expenses`, `sarga_misc_expenses`, `sarga_petty_cash`, `sarga_bills_documents`, `sarga_invoice_sequence`, `sarga_invoices`, `sarga_invoice_tracking`, `sarga_recurring_invoices`, `sarga_payment_modes`, `sarga_tax_settings`, `sarga_payment_transactions`, `sarga_payment_items`

**Three-Books**
`sarga_machines`, `sarga_machine_readings`, `sarga_daily_report_offset`, `sarga_daily_work_entries`, `sarga_daily_expenses`, `sarga_daily_credit_transactions`, `sarga_daily_report_machine`, `sarga_machine_work_entries`, `sarga_machine_credit_movements`, `sarga_credit_customers`, `sarga_credit_ledger`

**Audit / Security / AI**
`sarga_audit_logs`, `sarga_alerts`, `sarga_id_requests`, `sarga_staff_activity_log`, `sarga_fraud_alerts`, `sarga_design_checks`, `sarga_ai_cache`, `sarga_expense_training`, `sarga_user_sessions`, `sarga_security_audit`, `sarga_staff_behavior_profile`, `sarga_staff_leaves`, `sarga_tasks`

**Commerce / Web**
`sarga_orders`, `sarga_carts`, `sarga_cart_items`, `sarga_reviews`, `express_production_rules`, `sarga_delivery_tracking`, `sarga_website_chat_messages`, `sarga_quotes`, `sarga_quote_items`, `sarga_product_links`, `sarga_product_image_requests`, `sarga_product_update_requests`, `sarga_password_reset_tokens`, `whatsapp_clicks`

**Other**
`sarga_cctv_cameras`, `sarga_attendance`, blog posts/portfolio tables (`014_blog.sql`, `015_premium_features.sql`)

---

## 6. Backend API Server

### Entry Point — `server/index.js`

Boot sequence:
1. Load env (`dotenv`).
2. Build Express 5 app.
3. CORS allowlist (production Vercel domains + `*.vercel.app` preview pattern).
4. Helmet security headers.
5. Rate limiting.
6. JSON/urlencoded body parsers (`limit: 10mb`).
7. Cloudinary → multer upload pipeline.
8. Socket.IO server with CORS.
9. `await database.initDb()` — run migrations.
10. Register ~77 route modules via a `registerRoute(path, router)` helper.
11. Start scheduler + keep-alive self-ping.
12. Listen on `PORT` (default 3000).

### Lazy Database Pool — `server/database.js`

- Exports a proxy that creates the MySQL pool on first access.
- `initDb()`: reads `schemas/*.sql`, applies un-applied files, then runs JS migrations in order.
- Uses `promise()` pool with `ssl: { ca: fs.readFileSync('aiven-ca.pem') }`.

### Middleware Layer (order matters)

| Middleware | Purpose |
|---|---|
| `cors` | Env-configured origin allowlist + Vercel preview wildcard |
| `helmet` | Security headers incl. CSP |
| `express-rate-limit` | 100 req / 15 min general; tightened for auth/upload/AI |
| `body-parser` | JSON + URL-encoded |
| `middleware/auth.js` | JWT verify (dual secret), RBAC (`authorizeRoles`), session revocation check, customer auth, branch lock for Front Office |
| `middleware/branchFilter.js` | Injects `branch_id` into queries from token or `?branch_id=` (Admin only) |
| `middleware/auditTrail.js` | Logs all INSERT/UPDATE/DELETE into `sarga_audit_logs` |
| `middleware/cache.js` | Redis/node-cache GET caching (15 min default TTL, by-pass on writes) |
| `middleware/validate.js` | Zod schema validation for request bodies/params/query |

### Socket.IO Events

| Event | Direction | Payload theme |
|---|---|---|
| `job:created` / `job:updated` | server→client | job id, status, branch |
| `job:assigned` | server→client | job id, staff, role |
| `payment:received` | server→client | payment id, amount, branch |
| `inventory:low` | server→client | product id, qty, branch |
| `stock:received` | server→client | transfer id, branch |
| `staff:clocked-in` | server→client | staff id, name, branch |
| `notification:new` | server→client | type, message, branch |
| `sync:complete` | server→client | batch id, counts |
| `customer:proof-uploaded` | server→client | job id, proof version |

Clients join branch-scoped rooms (`room:branch1`) so events only reach the relevant branch.

### Cron / Scheduler (`server/services/scheduler.js`)

| Schedule (IST) | Job |
|---|---|
| 9:00 AM daily | Morning daily-report generation + email (production summary, machine util, expenses) |
| 7:00 PM daily | Evening report (production so far, pending jobs, revenue) |
| Every 10 min | Cache cleanup (node-cache/Redis expiry) |
| Every 14 min | Keep-alive self-ping (`/api/ping`) to prevent Render spin-down |
| Hourly | `wake-render.ps1`-style external ping fallback |
| 1:00 AM daily | Expired session & OTP cleanup |
| 6:00 AM daily | Google Sheets backup sync |

### Error Handling

- Custom `AppError` class (`utils/AppError.js`): carries `statusCode` + `isOperational`.
- Global error middleware → JSON `{ error, details? }`.
- Sentry captures 5xx in production; 404 handler for unknown `/api/*`.

---

## 7. Frontend Application

### Entry Point — `client/src/main.jsx`

1. Registers PWA service worker (Workbox).
2. Lazy-loads Sentry in production with `Sentry.init`.
3. Installs stale-chunk auto-reload guard (clears caches, resets service worker registration on chunk fetch failure).
4. Mounts `<App />`.

### Root — `client/src/App.jsx`

Provider tree:
```
<QueryClientProvider>        @tanstack/react-query
  <ThemeProvider>             CSS design tokens + dark mode
    <BranchProvider>          current branch selection
      <ConfirmProvider>       promise-based confirm dialogs
        <RouterProvider />    react-router routes
```

Routing uses route-objects + `<ProtectedRoute>` wrappers that check JWT presence AND role membership before rendering; unauthorized → redirect to `/denied`.

### Role-Gated Routes

- `Admin` → everything incl. `/admin/*`, `/settings`, audit, staff mgmt.
- `Accountant` → `/accounting/*`, `/finance`, `/expenses*`, `/billing`, vendors, daily reports.
- `Front Office` → jobs, customers, billing, quick-billing, QR scanning.
- `Designer` → `/design/*`, design workspace, bookings, proof upload.
- `Printer` → production tracker, machine work entries, paper/logging.
- `Other Staff` → personal dashboard + tasks + attendance.

### State Management Summary

- **Server state:** `@tanstack/react-query` with `QueryClient` default staleTime, background refetch, and mutation invalidation by key prefix (`invalidateKeys(['jobs'])` etc.).
- **Client state:** React Context (branch, confirm, theme); `localStorage` for token + prefs.
- **Offline state:** IndexedDB via `services/offlineDb.js` + queue in `services/syncWorkerManager.js`.
- **Forms:** `react-hook-form` + `zod` resolvers.
- **Toast:** `react-hot-toast`.
- **SEO:** `react-helmet-async` driven by `seo/routeMeta.js`.

### API Client — `client/src/services/api.js`

```js
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL, timeout: 30000 });
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) { /* clear token; route to /session-expired */ }
  return Promise.reject(err);
});
```

### PWA / Vite Config Highlights (`client/vite.config.js`)

- `VitePWA` with `registerType: 'autoUpdate'`, Workbox runtime caching:
  - `NetworkFirst` for API calls (1 h expiry, 100 entries).
  - `CacheFirst` for static assets / fonts / images.
- Manual chunk splitting (vendor, recharts, pdfs, qr, ui).
- `vite-plugin-sitemap` for SEO routes.
- Dev proxy `/api` → `localhost:3000`.

---

## 8. Authentication & Authorization

### Staff Login Flow

1. `POST /api/auth/login` with `{ user_id, password }`.
2. Server `bcrypt.compare` against `sarga_staff.password`.
3. On success: create session row in `sarga_user_sessions`, sign JWT:
   ```
   { userId, user_id, role, branch_id, name }
   ```
4. Frontend stores token; subsequent requests carry `Bearer`.
5. Logout → JWt added to in-memory blacklist + session row marked `revoked`.

### JWT Verification (`middleware/auth.js`)

- Parse `Authorization: Bearer <token>`.
- Check in-memory blacklist (revoked on logout/rotation).
- Verify with `JWT_SECRET`; on failure retry `JWT_SECRET_PREVIOUS` (rotation window).
- Attach `req.user`.

### RBAC Helpers

- `authorizeRoles('Admin','Accountant')` → 403 if not in list.
- `requireRole` → stricter single-role checks.
- Used per route; e.g., finance routes are Admin+Accountant only.

### Branch Enforcement

- Token carries `branch_id`.
- Admin may override via `?branch_id=` or branch-switch endpoint.
- Front Office is hard-locked to their token branch (403 on cross-branch data).
- All queries are scoped by `branchFilter`.

### Customer Auth (Website)

- OTP login: `POST /api/customer-otp/send` (mobile) → `POST /api/customer-otp/verify` → creates session in `sarga_customer_sessions`.
- Google OAuth via `GOOGLE_CLIENT_ID` for staff portal and customer portal sign-in.
- `sarga_password_reset_tokens` used for staff password reset emails.

### Session Management

- Sessions stored in DB for admin "revoke device".
- Password change → revoke all sessions + blacklist JWT.
- Cron cleans expired rows.

---

## 9. Feature: Job Management

### Job Lifecycle (12 Statuses)

```
Pending → Designing → Approval Pending → Processing → Printing
   → Cutting → Lamination → Binding → Production → Completed → Delivered
   (any state → Cancelled by Admin)
```

### Job Number Format

```
{BranchCode}-{YYYY}-{MM}-{DD}-{Sequence}
Example: PBR-2025-08-30-001  (Perambra, Aug 30, first job of the day)
```

Counter lives in `sarga_job_seq(branch_id, job_date, seq_number)` — per branch per day.

### Job Fields (`sarga_jobs`)

- `job_number`, `customer_id`, `branch_id`, `status`
- `book_type` — `Offset` / `Laser` / `Other`
- `machine_id`, `product_name`, `quantity`
- `paper_type`, `paper_size`, `special_instructions`
- `estimated_delivery`, `actual_delivery`, `priority`
- `created_by`, timestamps

### APIs

```
GET    /api/jobs                       list (filters: status, branch, date, customer, search)
POST   /api/jobs                       create (auto job number, default status Pending)
GET    /api/jobs/:id                   detail incl. matter, assignments, history, proofs
PUT    /api/jobs/:id                   update fields
POST   /api/jobs/:id/status            transition (validated against allowed transitions)
POST   /api/jobs/:id/assign            assign staff role (Designer/Printer/Binder…)
POST   /api/jobs/:id/proofs            upload proof (Cloudinary) + version bump
POST   /api/jobs/:id/paper-usage       log paper sheets used + deduct stock + movement
GET    /api/jobs/:id/history           full status history
DELETE /api/jobs/:id                   (Admin, soft-delete guard)
```

### Status Transition Rules (server-enforced)

| From | To | Roles |
|---|---|---|
| Pending | Designing | Admin, Front Office |
| Designing | Approval Pending | Designer |
| Approval Pending | Processing | Admin, Front Office (after customer approval) |
| Processing | Printing | Printer |
| Printing | Cutting | Printer, Admin |
| Cutting | Lamination | Printer, Admin |
| Lamination | Binding | Printer, Admin |
| Binding | Production | Printer, Admin |
| Production | Completed | Admin, Accountant |
| Completed | Delivered | Front Office, Admin |
| any | Cancelled | Admin |

Every transition writes to `sarga_job_status_history` and broadcasts `job:updated`.

### Proof Workflow

1. Designer uploads proof file (`proof_url`, Cloudinary).
2. `version` auto-increments per job.
3. Customer notified (website/portal).
4. `sarga_job_proofs.customer_approved` + `customer_notes` captured via `POST /api/proofs/:id/review`.
5. Rejected → status returns to `Designing`; new version expected.

---

## 10. Feature: Customer Management

### Customer Tiers

| Type | Behavior |
|---|---|
| Walk-in | Casual; no credit periods; normal pricing |
| Retail | Repeat visits; purchase history tracked; small discount eligibility |
| Offset | Bulk business; special pricing; credit account possible |

### Customer Lookup

```
GET /api/customers/lookup?mobile=98XXXXXXXX    → exact mobile (fastest)
GET /api/customers/search?q=term               → fuzzy name/business search
GET /api/customers?type=Offset&branch_id=1     → filtered list + pagination
```

### Customer APIs

```
GET    /api/customers                    list (filters: search, type, branch, pagination)
POST   /api/customers                    create (unique mobile enforced)
GET    /api/customers/:id                detail + balances + order history
PUT    /api/customers/:id                update
POST   /api/customers/:id/payments       record payment/bill (idempotent)
GET    /api/customers/:id/payments       payment history
GET    /api/customers/:id/designs        asset library files
POST   /api/customers/:id/designs        upload design asset
POST   /api/customers/:id/discount-request
POST   /api/customers/:id/requests       edit/delete request (approval workflow)
POST   /api/customers/:id/refunds        refund request
```

### Customer Features Detail

- **Balance tracking:** advance vs bill vs balance across payments; shown on detail page.
- **Discount approval:** `sarga_discount_requests` with `status: Pending→Approved/Rejected`; only Admin/Accountant approve.
- **Business profiles (B2B hub):** company name, GSTIN, PAN, logo; brand assets (logos, palettes, fonts, templates) attached.
- **Coupons:** percentage or fixed, min-order, max-uses, validity window; applied at checkout.
- **Refunds:** amount, reason, approval workflow, links to original payment.
- **Customer requests:** edit/delete requests routed to admin; keeps data integrity.

---

## 11. Feature: Billing & Payments

### GST Invoice

Invoice number per financial year + branch via `sarga_invoice_sequence`:
```
{Branch}-{FY}-{Seq}   e.g. PBR-202425-00001
```
Tax split CGST/SGST (each 6% default; configurable via `sarga_tax_settings`).

Invoice layout (recipient copy / customer copy): company header w/ GSTIN, invoice no/date, customer block, itemized table (product, qty, rate, amount), subtotal, CGST, SGST, discount, grand total, paid amount, balance due, terms.

### Idempotent Payment Writes

```json
POST /api/customer-payments
{
  "customerId": 42,
  "billAmount": 2240, "sgst": 120, "cgst": 120, "discount": 0,
  "advance": 1000, "paymentMode": "UPI",
  "idempotencyKey": "uuid-or-client-key",   // unique → prevents duplicates
  "orderLines": [ { "product": "Visiting Card", "qty": 500, "rate": 2, "amount": 1000 } ]
}
```
Duplicate `idempotencyKey` → returns existing record (HTTP 200) instead of re-processing.

### Razorpay Integration

1. `POST /api/checkout/create-order` → creates Razorpay order (amount in paise, currency INR).
2. Frontend opens Razorpay checkout modal with `key`, `order_id`.
3. `POST /api/checkout/verify-payment` — server verifies HMAC-SHA256 signature (`razorpay_signature`) before marking paid.
4. On verify: transactional create → order row → per-item `sarga_jobs` → inventory deduction → coupon consumption → invoice PDF generated → confirmation email.

### Receipts & PDFs

- `PDFKit` generates invoice & receipt PDFs server-side; uploaded to Cloudinary; URL stored.
- `POST /api/payments/:id/receipt` emails the receipt to the customer (nodemailer + SMTP).
- `sarga_invoice_tracking` records Created / Sent / Viewed / Paid.

### Recurring Invoices

- Config: customer, frequency (Weekly/Monthly/Quarterly), amount, next_date.
- Cron generates the invoice on `next_date`, advances it, emails if configured.

### Related APIs

```
GET  /api/invoices                  list (filters: status, FY, branch, customer)
POST /api/invoices                  create invoice
PUT  /api/invoices/:id              finalize / update
GET  /api/invoices/:id/pdf          download/email PDF
GET  /api/invoice-tracking/:id      audit actions on invoice
POST /api/audit-invoice             deep audit of invoice vs payments
```

---

## 12. Feature: Inventory Management

### Auto-SKU

```
Pattern: {CAT}-{NNNN}   e.g. INK-0001, PAP-0002, CHR-0001, PLT-0003, BND-0001, OTH-0004
```

### Branch-Level Stock

Single product → separate quantities per branch via `sarga_branch_stock(product_id, branch_id, quantity)`. Deductions/adjustments update the branch row + write `sarga_inventory_consumption` + `sarga_payment_items` when tied to billing.

### Operations

```
POST   /api/inventory                        create product (auto SKU)
GET    /api/inventory                        list (filters, pagination, low-stock)
GET    /api/inventory/:id                    detail + branch stock + movements
PUT    /api/inventory/:id                    update
POST   /api/inventory/inward                 purchase receipt → +stock
POST   /api/inventory/outward                consumption → -stock (link job)
POST   /api/inventory/transfer               branch transfer
POST   /api/inventory/adjust                 manual correction + reason
POST   /api/inventory/reorder                create reorder alert at min level
```

### Purchase Orders

```
POST /api/purchase-orders            items from product list, vendor, branch
PUT  /api/purchase-orders/:id/receive     → +stock, stock movements, vendor bill link
GET  /api/purchase-orders             list by vendor/branch/status
```

### Low-Stock Alerts

- Threshold = `min_quantity` per product.
- Alert rows in `sarga_alerts` + Socket.IO `inventory:low` broadcast + dashboard banner.
- Stock planning helper (`helpers/smartSearch` + `server/__tests__`) supports reorder suggestions.

---

## 13. Feature: Paper & Consumables

### Paper Attributes

```json
{ "paperType": "Bond Paper", "gsm": 80, "size": "A4",
  "quantitySheets": 5000, "ratePerSheet": 0.25, "branchId": 1 }
```
Sizes commonly handled: A4, A3, Folio, Crown, Demy, Royal, Super Royal, Elephant.

### Stock Movements & Summary

- `paper_stock_movements`: Inward / Outward / Transfer / Adjustment (each with reference id).
- `paper_stock_summary`: `current_stock`, `reserved_stock`, `available_stock` per paper/branch — live maintained on every movement.

```
POST /api/paper-inventory/inward
POST /api/paper-inventory/outward        (link jobId, requires reservation check)
POST /api/paper-inventory/transfer
POST /api/paper-inventory/adjust
GET  /api/paper-inventory                dashboard w/ alerts (below reorder point)
```

### Paper Cut Map (`sarga_paper_cut_map`)

Parent size → child sizes with `ratio` (e.g. Super Royal → 8× A4) and `wastage_percent`. Used by the optimizer to compute parent sheets, cutting pattern, and waste.

### Paper Optimizer (`client/src/utils/paperOptimizer.js` + `/api/ai/paper-layout`)

Input: `{ targetSize, parentSize, quantity, jobType }`. Output: required parent sheets, cutting diagram, wastage %, cost estimate, per-unit cost.

### Rate Calculator

`POST /api/paper-inventory/calculate-rate` — ream → sheet price, with historical rate log (`sarga_paper_rate_history`) on changes.

### Cutting Jobs

- `cutting_jobs` record parent sheets consumed + target size + outputs (`cutting_job_outputs`).
- Cutting job consumes parent stock and produces child stock; `stock_transfers` handles inter-branch cutting.

### Consumables & Plates

- `consumables_inventory` categories: Ink, Plate Chemical, Cleaning, Other; `min_quantity` alerts.
- `POST /api/consumables-inventory/consume` links consumption to job + writes `consumables_adjustments`.
- Plate management tracks CTP/PS plates by type/size, links plates to jobs.

---

## 14. Feature: Vendor & Expense Management

### Vendors

```
GET  /api/vendors             list + statements link
POST /api/vendors             create (GSTIN, terms, contacts)
GET  /api/vendors/:id         detail
PUT  /api/vendors/:id         update
GET  /api/vendors/:id/ledger  running balance
GET  /api/vendors/:id/payables
POST /api/vendors/:id/statements   generate statement (opening/closing, debit/credit lines)
```

### Vendor Bills & Items

- Bill header (vendor, number, date, amounts, GST split) + item lines.
- `sarga_vendor_bills.status`: Pending → Approved → Paid / Rejected.
- Bill upload supports **direct scan** (image/PDF) via `POST /api/vendor-bills/upload`.

### Vendor Payments

```
POST /api/vendor-payments    { vendorId, billIds[], amount, mode, reference }
```
Marks bills paid, updates statement lines.

### Utility Bills via Email Parsing

- `sarga_utility_connections`: Electric/Water/Internet/Phone, provider, connection number, per-branch monthly email.
- IMAP poller (`utils/mailer.js` + imap) reads the branch mailbox, extracts bill PDFs, OCRs amounts, creates `sarga_utility_bills`.
- `POST /api/utility-email/connect` binds an inbox + branch.

### Smart Bill Upload & GST Extraction

Two engines:

1. **Tesseract OCR** (`services/ocrService.js` + `utils/ocrParser.js`) — local `eng.traineddata`; extracts raw text.
2. **Gemini AI** (`services/billExtraction.js`) — structured extraction (vendor, bill no, date, gross, CGST, SGST, net, line items) with confidence.

Flow: upload (multer→Cloudinary) → pdf/image → OCR → Gemini → parsed rows → user verifies → writes `sarga_bills_documents` (status Pending/Verified/Rejected) and optionally creates vendor bill + stock on approve.

### Expense Tracking

| Endpoint | Table | Examples |
|---|---|---|
| `POST /api/expenses/office` | `sarga_office_expenses` | Rent, salaries, repairs |
| `POST /api/expenses/transport` | `sarga_transport_expenses` | Delivery fuel, vehicle |
| `POST /api/expenses/misc` | `sarga_misc_expenses` | Maintenance, misc |
| `POST /api/petty-cash` | `sarga_petty_cash` | Daily cash box reconciliation |
| `POST /api/expenses-extended/categorize` | `sarga_expense_training` | ML category suggestion |

ML categorization trains on `sarga_expense_training` history and predicts category/confidence for new descriptions.

---

## 15. Feature: Finance & Accounts

### Rent Locations

`POST /api/finance/rent-payments` — monthly rent per location recorded; arrears tracked.

### EMI Master & Payments

- `sarga_emi_master`: loan_name, type (Loan/Vehicle/Machine), principal, emi_amount, tenure, dates.
- `sarga_emi_payments`: installment number, due/paid dates, status. Cron marks overdue.
- `POST /api/finance/emi-payments`, `GET /api/finance/emi-schedule`.

### Kuri (Chit Fund) Ledger

- `sarga_kuri_master` + `sarga_kuri_payments` per month (month string `YYYY-MM`).
- Members' running totals; late flags.

### Daily Report Books (The "Three Books")

Offset production captured daily (see §16). `sarga_daily_report_offset` aggregates:
- total jobs, sheets fed, impressions, expenses, revenue
- per-machine rows in `sarga_daily_report_machine`

### Cash vs Bank Report

`GET /api/finance/cash-bank-report?branch_id&from&to` returns opening/inflow/outflow/closing for both cash and bank across payment modes.

### Chart of Accounts & Ledger

- `GET /api/accounts` — account list.
- `GET /api/accounts/ledger?account_id&from&to` — general ledger lines.
- `GET /api/accounts/trial-balance?date` — trial balance roll-up.

### Invoice / Payment Level Reports

- `GET /api/reports/*` — revenue, collections, receivables, aging.
- `GET /api/audit-invoice` — cross-check payment records vs invoice totals (fraud guard).

---

## 16. Feature: Three-Books Offset Production

A specialized module replicating the shop's physical "three books": **work book**, **expense book**, **credit book**.

### Machine Registry

```
sarga_machines: name, machine_category (Digital/Offset/Laser), model, serial_number, branch, active
```

### Automatic Meter Readings (`services/mprIntegration.js`)

- **SNMP** (net-snmp): poll counter OIDs for Kyocera / Konica Minolta.
- **HTTP scraping**: Canon/Konica web-UX counter endpoints.
- **Manual fallback**: `POST /api/machines/:id/readings { readingType, value, source:'Manual' }`.
- Readings stored in `sarga_machine_readings`; used to compute daily impressions.

### Daily Work Entries

`POST /api/daily-work-entries` — per machine per day: job name, sheets fed, impressions, operator, notes.
Bulk entry screen optimizes the front-desk shift workflow.

### Machine Credit Movements (Credit Book)

- `sarga_credit_customers` — "buy now, pay later" accounts with running `total_credit`.
- `POST /api/machines/credit-movements` — Credit (work done) / Debit (payment).
- Ledger per customer in `sarga_credit_ledger`.

### Automated Daily Reports

- **9:00 AM IST** morning update email — yesterday production + machine utilization + expenses.
- **7:00 PM IST** evening report — today's production, pending jobs, revenue so far.
- Triggered internally by node-cron AND externally via `GET /api/public/daily-report-trigger?secret=BACKUP_RUN_SECRET` (for cron-job.org reliability).

---

## 17. Feature: Staff & HR

### Roles

`Admin` • `Accountant` • `Front Office` • `Designer` • `Printer` • `Other Staff`

### Staff APIs

```
GET    /api/staff                list (filters: role, branch, active)
POST   /api/staff                create (user_id, bcrypt password, role, branch)
GET    /api/staff/:id            detail (salary, attendance, tasks, activity)
PUT    /api/staff/:id            update profile/role/salary
POST   /api/staff/login/switch-branch   (Admin only)
GET    /api/staff/me             current user profile
GET    /api/staff/:id/salary-slip       monthly payroll preview
POST   /api/staff/:id/salary-slip       generate + email slip
```

### Salary Models

- **Monthly:** fixed amount regardless of days.
- **Daily:** rate × present days (attendable days from attendance table).
- Payroll roll-up: working days, present days, leaves, overtime, deductions → net.

### Leave Management

```
POST /api/staff/leaves
PUT  /api/staff/leaves/:id      approve/reject
GET  /api/staff/leaves          by staff/period
```

### Task Management

```
POST /api/tasks                 { title, assignedTo, jobId, priority, dueDate }
PUT  /api/tasks/:id             status/notes
GET  /api/tasks?assigned_to     personal queue
```
Tasks appear on staff dashboards; overdue highlighted.

### Attendance (multiple methods)

1. **Manual** — staff check in/out on portal (`POST /api/staff/attendance`).
2. **Face Recognition** — CCTV Python client marks entry (see §24).
3. **QR Code** — front-office QR scanner check-in.

Corrections: `POST /api/staff/attendance-requests` (Time Correction / Missing Entry) → admin approval.

### ID-Change Requests

`POST /api/id-requests` — staff request user_id changes; admin approval workflow. Prevents staff self-escalation.

---

## 18. Feature: Design Workspace

### Designer Portal (role-gated)

Layout with: active job queue, bookings calendar, asset library, block journal, preflight panel.

### Design Bookings

```
POST /api/design-workspace/bookings   { customerId, jobName, scheduledDate, duration, designerId }
```
Calendar + reminders used for print-on-demand design slots.

### Asset Library

Customers upload logos/templates via website (`POST /api/customer-designs`); designers access them inside the workspace tools.

### Design Checker / Preflight (`/api/preflight/check` + `helpers`)

Automated preflight on uploaded artwork:
- Resolution (warn < 300 DPI)
- Color mode (fail on RGB for CMYK print)
- Bleed (warn < 3 mm)
- Font embedding
- Compression / trim marks
Returns `status: Pass|Warning|Fail` + issue list writable to `sarga_design_checks`.

### AI Paper-Layout Optimization

`POST /api/ai/paper-layout` → optimal imposition across sheet stock; used by the Paper Layout Generator page for quantity-driven layouts and cut guides.

---

## 19. Feature: AI & ML Features

### Sales Forecasting

- `GET /api/ai/forecast?branch_id&period`
- Proxies to external Flask ML service (`ML_SERVICE_URL`, default `http://127.0.0.1:5001`).
- Historical sales → daily forecast (30 days) with confidence.
- Cached 15 min in `sarga_ai_cache` / Redis.

### Anomaly / Fraud Detection

- `GET /api/ai/monitoring/anomalies` — analyzes payment velocity, job completion times, inventory usage, staff behavior baselines (`sarga_staff_behavior_profile`).
- Produces `sarga_fraud_alerts` (severity Low/Medium/High/Critical, status New/Investigating/Resolved/Dismissed).

### Natural-Language Search

- `POST /api/ai/search` — parses plain-English queries (e.g. "jobs pending > 3 days") into safe parameterized SQL / filters over allowed tables.
- Falls back to normal search (`/api/search` with fuzzy `smartSearch` helper).

### Upsell Suggestions

- `GET /api/upsell?customer_id` — from order history, combos, seasonality (e.g. "card → lamination").

### Imposition Calculator

- `POST /api/imposition` — sheet × target size × margins → `n-up` layout, waste %, per-unit cost.

### AI Bill Extraction

Already covered in §14 (Gemini + Tesseract pipeline).

---

## 20. Feature: Customer Website & E-commerce

> The website front-end (`/website`) is a separate repo; these are the server-side contracts it uses.

### Catalog (Product Hierarchy)

```
product_hierarchy: category → subcategory → products
product_finishes / product_finish_mapping: finish options + price
pricing_tiers / pricing_rules: quantity discounts
```
`GET /api/products`, `GET /api/products/:id` (engineered options), `GET /api/products/hierarchy`.

### Cart & Checkout

```
POST   /api/checkout/cart         add item { sessionId, productId, qty, customization }
GET    /api/checkout/cart         current cart
PUT    /api/checkout/cart/:id     update qty
DELETE /api/checkout/cart/:id     remove
POST   /api/checkout/apply-coupon
POST   /api/checkout/create-order       → Razorpay order
POST   /api/checkout/verify-payment     → HMAC verify → create order + jobs + invoice
```

### Proof Review & Artwork

```
GET    /api/proofs                          customer proof list
POST   /api/proofs/:id/review               approve/reject + notes
POST   /api/artwork-uploads                 upload customer file for a job
GET    /api/pickup-slots?branch&date        available slots
GET    /api/delivery-estimates?product&qty  ETA based on queue/load
```

### Promotions & Reviews

```
GET  /api/promotions         active offers
POST /api/reviews            submit (approval-gated)
```

### Content Modules

```
GET  /api/blog/posts, /api/blog/posts/:slug
GET  /api/portfolio/works, /api/portfolio/works/:slug
GET  /api/translations?lang=en|ml
```

### Chatbot

- Embedded Express app (`server/chatbot/index.js`) with JSON knowledge base (FAQ rules).
- `POST /api/chatbot/message { sessionId, message }` → reply + intent/confidence.
- Session history in `sarga_website_chat_messages`.

### Google Reviews & WhatsApp Analytics

```
GET  /api/seo/google-reviews      (Places API + cache)
POST /api/whatsapp-analytics/click    { phone, productId }
GET  /api/whatsapp-analytics      count/conversion stats
```

---

## 21. Feature: PWA & Offline Support

### Service Worker (Workbox)

- Precache app shell; runtime caching:
  - API → `NetworkFirst` (1 h, 100 entries)
  - Images/fonts → `CacheFirst`
- `registerType: 'autoUpdate'`.

### IndexedDB Offline DB (`services/offlineDb.js`)

Object stores with indexes:
```
jobs      (keyPath id, idx status/customer_id)
payments  (keyPath id, idx customer_id)
inventory (keyPath id, idx branch_id)
customers (keyPath id, idx mobile)
products  (keyPath id, idx category)
```

### Background Sync (`services/syncWorkerManager.js` + `public/syncWorker.js`)

- Offline actions → queued locally → banner "Offline · X pending".
- On reconnect → batch POST to `/api/sync/batch` → server processes sequentially, returns per-item results → conflicts resolved server-wins → status bar "Synced".
- Supports offline: job creation, status updates, payments, stock consumption.

### Offline UI

`OfflineBanner`, `SyncStatusBar`, `NoInternetState` components; `useOffline` hook drives them.

### Stale-Chunk Protection

On `Failed to fetch` for a JS chunk → clear caches, unregister SW, force reload → always fetches fresh bundle after deploy.

---

## 22. Feature: Multi-Branch Operations

### Branch Scoping

- `BranchContext` holds active branch; every query passes `branch_id`.
- Server `branchFilter` middleware injects/validates branch from JWT (Front Office locked).
- Admin switch: `POST /api/auth/switch-branch { branchId }` issues a refreshed token.

### Cross-Branch Workflows

- **Stock requests:** `POST /api/stock-requests` → Pending → Approve/Reject → delivery → receive (`sarga_stock_requests` full lifecycle).
- **Stock transfers:** `POST /api/stock-transfers` (Initiated → In Transit → Received).
- **Internal transfers:** `POST /api/internal-transfers` (items + reason).
- **Internal transactions (accounting):** `POST /api/internal-transactions` (money movement between branches).

### Branch Dashboards

Each dashboard head shows branch toggle (Admin) and branch-scoped metrics:
jobs, revenue, collections, inventory alerts, staff on duty.

---

## 23. Feature: Security & Audit

### Audit Trail

Automatic on every write via `middleware/auditTrail.js`:
```
sarga_audit_logs: { table_name, record_id, action(INSERT/UPDATE/DELETE),
                    old_values JSON, new_values JSON, performed_by, ip, user_agent }
```
`GET /api/audit-trail?table&record_id` — full change history for any record.

### Staff Activity Log

`sarga_staff_activity_log` — logins, page visits, key features, timestamps.

### Security Audits

`sarga_security_audit` — failed logins, password changes, role changes, suspicious events; exposed to Admin console.

### Fraud Alerting & Behavior Profiles

- `sarga_fraud_alerts` (from §19).
- `sarga_staff_behavior_profile` — baselines (login times, avg payments, jobs/day) to detect outliers.

### Session Security

- DB sessions + revocation; logout blacklists JWT.
- Password change → revoke all.
- Admin can revoke any session.

### Transport & Header Security

- Helmet CSP: restrict script/style/img/connect sources (Cloudinary, fonts, WSS).
- CORS allowlist: exact origins + `*.vercel.app` preview pattern.
- Rate limiting at 3 tiers (general 100/15min, auth 5/15min, upload 10/15min, AI 20/15min).
- JWT dual secrets for rotation with zero downtime.

---

## 24. Feature: CCTV Face Recognition Attendance

### Files

- `tools/face_recognition_attendance.py` — Python client.
- `tools/config.example.json` — station config.

### Dependencies

`dlib`, `opencv-python`, `face_recognition`, `mysql-connector-python`, `numpy`.

### Config

```json
{
  "camera_ip": "192.168.1.100",
  "camera_port": 554,
  "rtsp_url": "rtsp://…/stream1",
  "branch_id": 1,
  "known_faces_dir": "./known_faces",
  "tolerance": 0.6,
  "confidence_threshold": 0.8
}
```

### Pipeline

1. RTSP frames captured (OpenCV).
2. dlib HOG face detection.
3. 128-dim face encoding via `face_recognition`.
4. Match against `known_faces` encodings within tolerance.
5. Confident match → `POST /api/cctv/attendance { staffId, method:'Face Recognition', confidence, cameraId }`.
6. Server writes attendance row; dedupes consecutive matches within set window (avoid multiple check-ins).

### Manual Override

`POST /api/cctv/attendance/manual` for missed detections; ties to correction requests.

---

## 25. Feature: MCP Server (AI Agent Integration)

### Purpose

Exposes the MIS database as safe, RBAC-gated **MCP tools** so AI agents (e.g. Claude Desktop) can query/operate on data without raw SQL access.

### Transports

- **stdio** — `src/index.ts`
- **HTTP** — `src/http-server.ts` (port 3100), JWT-authenticated.

### Tool Groups (41 tools in 8 groups)

| Group | Sample Tools |
|---|---|
| Vendors | list/create vendor, bills, payments, statements |
| Inventory | products, stock, low-stock, movements, transfers |
| Jobs | create/update/status, assignments, history |
| Customers | lookup (mobile), detail, balance, payments |
| Payments | record payment, verify, report |
| Analytics | dashboard KPIs, revenue trend, branch comparison |
| Website | products API data, orders |
| System | ping, schema info, audit trail query |

### Auth & Logging

- JWT + role checks before every tool invocation.
- Every call logged (winston + `sarga_audit_logs`).
- All queries parameterized; read-only group for analytics; writes gated to Admin/Accountant tools.

### Config (`mcp-server/.env`)

```
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL, JWT_SECRET
```

---

## 26. External Integrations

| Service | Usage | Config Keys |
|---|---|---|
| Aiven MySQL | Primary database | `DB_*`, `aiven-ca.pem` |
| Razorpay | Web payments | `RAZORPAY_KEY_ID/SECRET` |
| Cloudinary | File storage (proofs, bills, receipts, avatars) | `CLOUDINARY_*` |
| Firebase | Web push notifications, PWA config | `VITE_FIREBASE_*` |
| Google OAuth | Staff + customer single sign-on | `GOOGLE_CLIENT_ID` |
| Google Places | Customer reviews on website | `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` |
| Google Sheets | Daily/weekly data backup | `GOOGLE_SA_*`, `GOOGLE_SHEET_ID` |
| Gemini AI | Structured bill extraction | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Gmail SMTP | OTP, receipts, reports, salary slips | `SMTP_*`, `GMAIL_*` |
| Gmail IMAP | Parse incoming utility bills | `BRANCH_EMAIL_*` |
| Sentry | Client error monitoring | `SENTRY_*` |
| Rectifier? No | — | — |
| ML Service | Sales forecasting | `ML_SERVICE_URL`, `ENABLE_ML` |
| net-snmp / HTTP | Printer meters | machine records |

---

## 27. Deployment Guide

### Standard (current) topology

| Piece | Platform | Details |
|---|---|---|
| Client | Vercel | `vercel.json`, output `client/dist`, SPA rewrite, exclude `/api`, `/assets`, `robots.txt` |
| Server | Render | `render.yaml`, port 3000, Node 22 (Dockerfile optional), JS `npm start` |
| ML Service | Render | Python/gunicorn (separate repo) |
| MCP Server | Local/self-hosted | `tsc` build or `tsx`; HTTP :3100 |
| MySQL | Aiven | SSL REQUIRED |

### Steps

1. Provision Aiven MySQL; save CA cert → `server/aiven-ca.pem`.
2. Copy `server/env.example` → `server/.env`; fill every key (§28).
3. Boot server once → migrations auto-apply (47 SQL + 36 JS).
4. Import `sarga_db_backup.sql` if restoring data.
5. Deploy client: set Vite env vars (Vercel), run `npm run build`, deploy `client/dist`.
6. Configure cron-job.org to hit `https://…/api/public/daily-report-trigger?secret=…` at 9:00 & 19:00 IST.
7. Optionally: nginx reverse proxy ([`deployment/nginx.conf`]) with PM2, Certbot, Redis if on a VPS.

### Vercel Config Highlights (`vercel.json`)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "client/dist",
  "rewrites": [{ "source": "/((?!api|assets|robots).*)", "destination": "/" }]
}
```

### CI (` .github/workflows/test.yml`)

On push/PR to `main`: backend Jest (mocked pool) + client Playwright e2e against built app; optional `website`/`ml-service` jobs gated by repo variable `RUN_ML_TESTS`.

---

## 28. Environment Variables

### Backend (`server/.env` — see `server/env.example`)

```
PORT=3000
NODE_ENV=production
APP_VERSION=…, APP_VERSION_CRITICAL=

DB_HOST=…; DB_PORT=14194; DB_USER=…; DB_PASSWORD=…; DB_NAME=defaultdb
DB_SSL=true; DB_SSL_MODE=REQUIRED; PGSSLMODE=require

JWT_SECRET=<>=32 chars>
JWT_SECRET_PREVIOUS=

CLOUDINARY_CLOUD_NAME=…; CLOUDINARY_API_KEY=…; CLOUDINARY_API_SECRET=…

CORS_ORIGIN=https://software-sarga.vercel.app,https://sargaoffset.vercel.app
CLIENT_URL=…
VERCEL_URL=…

RAZORPAY_KEY_ID=…; RAZORPAY_KEY_SECRET=…

GOOGLE_CLIENT_ID=…
GOOGLE_PLACE_ID=…; GOOGLE_PLACES_API_KEY=…
GOOGLE_SA_KEY=…; GOOGLE_SERVICE_ACCOUNT=…; GOOGLE_SERVICE_ACCOUNT_BASE64=…
GOOGLE_SHEET_ID=…

GEMINI_API_KEY=…; GEMINI_MODEL=…

SMTP_HOST=…; SMTP_PORT=587; SMTP_USER=…; SMTP_PASS=…; SMTP_FROM=…
EMAIL_FROM=…; EMAIL_TO=…; EMAIL_PASS=…
GMAIL_USER=…; GMAIL_APP_PASSWORD=…
BRANCH_EMAIL_PERAMBRA=…; BRANCH_EMAIL_MEPPAYUR=…

ML_SERVICE_URL=http://127.0.0.1:5001; ENABLE_ML=true
REDIS_URL=… / REDIS_HOST/REDIS_PORT/REDIS_PASSWORD; CACHE_ENABLED=true; SESSION_CACHE_TTL=…

BACKUP_RUN_SECRET=…; SERVER_URL=…; RENDER_EXTERNAL_URL=…

VITE_API_URL=…
UPLOAD_RATE_LIMIT=…; RATE_LIMIT_WINDOW_MS=…
```

### Frontend (`client/.env.*`)

```
VITE_API_URL / VITE_API_BASE_URL=…
VITE_GOOGLE_CLIENT_ID=…
VITE_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID / STORAGE_BUCKET /
VITE_FIREBASE_MESSAGING_SENDER_ID / APP_ID / MEASUREMENT_ID
```

### MCP (`mcp-server/.env`)

`DB_HOST/PORT/USER/PASSWORD/NAME`, `DB_SSL`, `JWT_SECRET`

> ⚠️ **Security note:** live secrets are committed in this repo (`server/.env`, root `.env*`). Rotate all credentials immediately before making the repo public, and add them to a secrets manager / Vercel–Render secret stores.

---

## 29. Testing Strategy

### Backend — Jest (`server/__tests__`)

- Mock DB pool (`__tests__/helpers/mock-pool.js`), `jest.setup.js`, `setup.js`, `setupAfter.js`.
- Run: `cd server && npm test` (`--runInBand`).
- Coverage areas: auth, branches, customers, expenses, payments, products, jobs, inventory, stock planning, analytics, validation, error handlers, cache, imposition calculator.

### Frontend — Vitest

- `client/src/test/`, `client/src/tests/`, components `__tests__/`.
- jsdom environment; RTL; mocking `api.js`.

### Frontend — Playwright (e2e)

- `client/e2e/*.spec.js` — login, dashboard, main flows, pagination, dark mode.
- Config in `client/playwright.config.js`.

### CI Gate

`.github/workflows/test.yml` runs backend + client e2e on every push/PR to `main`.

### Manual QA Aids

`tools/run_pagination_tests.ps1`, `tools/pagination_test.js`, `tools/test-payments.js`, `root/test_*.js`, `TEST_PLAN.md`.

---

## 30. Complete API Endpoint List

Mounting prefix `/api`:

| Module | Routes |
|---|---|
| auth | `/auth/login`, `/auth/logout`, `/auth/change-password`, `/auth/me`, `/auth/switch-branch`, `/auth/refresh` |
| branches | `/branches` CRUD |
| staff | `/staff` CRUD, `/staff/:id/salary*`, `/staff/leaves*`, `/staff/attendance*`, `/staff/attendance-requests*`, `/id-requests*` |
| staffDashboard | `/staff-dashboard/*` (personal & role KPIs) |
| staffPortal | `/staff-portal/*` (portal-specific) |
| customers | `/customers` + lookup/search, `/:id/**` |
| customerPayments | `/customer-payments` (idempotent) |
| customerDesigns | `/customer-designs*` |
| requests | `/requests*` |
| coupons | `/coupons*` |
| refunds | `/refunds*` |
| jobs | `/jobs*` (full lifecycle) |
| schedules | `/schedules*` |
| products | `/products`, `/products/hierarchy`, `/:id` |
| pricing | `/pricing*` |
| inventory | `/inventory*` |
| paperInventory | `/paper-inventory*` |
| consumablesInventory | `/consumables-inventory*` |
| cuttingTransfers | `/cutting-transfers*` |
| stockRequests | `/stock-requests*` |
| stock-verification | `/stock-verification*` |
| purchaseOrders | `/purchase-orders*` |
| vendors | `/vendors*` |
| vendorPayments | `/vendor-payments*` |
| vendorBills | `/vendor-bills*` (incl. upload/approve) |
| expenses | `/expenses*` |
| expenses-extended | `/expenses-extended*` (ML categorize) |
| pettyCash | `/petty-cash*` |
| finance | `/finance*` (rent/emi/kuri/cash-bank/ledgers) |
| utilityEmail | `/utility-email*` |
| machines | `/machines*` (incl. readings) |
| dailyReports / daily-report | `/daily-reports*`, `/daily-report*` |
| internal-transfers | `/internal-transfers*` |
| internal-transactions | `/internal-transactions*` |
| admin/internal-books | `/admin/internal-books*` |
| ocr | `/ocr/*` (extract bill) |
| billExtraction | `/bill-extraction/*` (smart upload) |
| backup | `/backup*` |
| backup/sheetsBackup | `/backup/sheets*` |
| ai | `/ai/search`, `/ai/forecast`, `/ai/paper-layout` |
| ai/monitoring | `/ai/monitoring/*` (anomalies) |
| search | `/search` (fuzzy) |
| upsell | `/upsell*` |
| imposition | `/imposition*` |
| auditTrail | `/audit-trail*` |
| auditInvoice | `/audit-invoice*` |
| accounts | `/accounts*` |
| job-priority | `/job-priority*` |
| production-tracker | `/production-tracker*` |
| quotes | `/quotes*` |
| invoiceFeatures | `/invoice-features*` (tracking, recurring) |
| passwordReset | `/password-reset*` |
| premiumFeatures | `/premium-features*` |
| blog | `/blog/*` |
| portfolio | `/portfolio/*` |
| promotions | `/promotions*` |
| translations | `/translations*` |
| proofs | `/proofs*` |
| artworkUploads | `/artwork-uploads*` |
| pickupSlots | `/pickup-slots*` |
| deliveryEstimates | `/delivery-estimates*` |
| whatsappAnalytics | `/whatsapp-analytics*` |
| checkout | `/checkout/*` (cart, razorpay, orders) |
| businessHub | `/business-hub/*` |
| preflight | `/preflight/*` |
| cctv | `/cctv/*` (attendance + cameras) |
| chatbot | `/chatbot/*` |
| frontOffice | `/front-office/*` |
| shortcuts | `/shortcuts*` |
| designWorkspace | `/design-workspace/*` |
| devRoutes | dev-only (non-prod) |

Public/system:
```
GET  /api/health
GET  /api/ping
GET  /api/version
GET  /api/server-time
GET  /api/dashboard-init
GET  /api/public/daily-report-trigger?secret=…
GET  /uploads/*        (protected static files)

---

## 31. Pages & Routes Reference

Client is a role-gated SPA. Representative routes (with the page component rendering them):

**Auth / System**
- `/login` → Login
- `/denied` → AccessDenied
- `/session-expired` → SessionExpired
- `*` → NotFound

**Core**
| Route | Page |
|---|---|
| `/dashboard` | Dashboard (route-level role variants) |
| `/dashboard/front-office` | FrontOfficeDashboard |
| `/dashboard/accountant` | AccountantDashboard |
| `/dashboard/printer` | PrinterDashboard |
| `/dashboard/designer` | DesignerDashboard |
| `/dashboard/other-staff` | OtherStaffDashboard |
| `/jobs`, `/jobs/:id` | OrderQueue, JobDetail |
| `/production-tracker` | ProductionTracker |
| `/customers`, `/customers/:id` | Customers, CustomerDetails |
| `/billing`, `/invoices/*` | Billing, CreateInvoice, RecurringInvoices |
| `/quickbilling/*` | QuickBilling sub-app |
| `/quotes` | Quotes |
| `/inventory/*` | Inventory, InventoryOverview |
| `/paper/*` | PaperStockDashboard, PaperInward, PaperOutward, PaperTransfer, PaperMovement, PaperAlerts |
| `/consumables` | ConsumablesManagement |
| `/plates` | PlateManagement |
| `/machines` | MachineManagement, MachineLiveStatus, MachineCounter cards |
| `/vendors/*` | Vendors, VendorLedger, VendorPayables, VendorDashboard/Modal |
| `/expenses/*` | ExpenseManager |
| `/connections` | ConnectionLedger (utility bills) |
| `/daily-report*` | DailyReport, OffsetReport, PDF export |
| `/staff*` | StaffManagement, EmployeeDetail, AttendanceSalary |
| `/attendance` | CCTV dashboard integration |
| `/cctv/*` | CCTVManagement, CCTVAttendance |
| `/accounts/*` | Accounts, ledger |
| `/reports/*` | Reports |
| `/settings` | SettingsPage |
| `/design/*` | DesignStudio / Designer sub-apps |
| `/design-checker` | DesignChecker |
| `/paper-layout` | PaperLayoutGenerator |
| `/bookings-cms` | DesignBookingsCMS |
| `/blog-cms` | BlogCMS |
| `/schedules` | ScheduleManagement |
| `/shortcuts` | GlobalKeyboardShortcuts + ShortcutsPage |
| `/transfers/*` | StockTransfer, CutTransfer, PendingTransfers |
| `/internal/*` | InternalTransfers, InternalTransactions |
| `/stock-verification` | StockVerification |
| `/qr-diagnostic` | QRDiagnostic |
| `/offline-test` | OfflineTestPage |
| `/subscriptions` | (premium features) |

**Sub-apps (nested layouts)**
- `accounting/*` (AccountantLayout)
- `admin/*` (Admin only)
- `design-studio/*`, `designer/*` (DesignerLayout)
- `expense-manager/*`
- `quickbilling/*`

Routing data, SEO meta, and per-route data requirements are cataloged in `PAGES.md` (365-line route/data catalog).

---

## 32. Component Reference

83 shared components under `client/src/components/`:

**UI primitives (`ui/`)**
`Button`, `LoadingButton`, `Pagination`, `Skeleton`/`Loader`, `Modal` (base), `Select`, `Input`, `TextArea`, `Badge`, `EmptyState`, `Tabs`, `Tooltip`, `Dropdown`.

**Layout & Page shells**
`BranchSelect`, `ThemeToggle`, `OfflineBanner`, `SyncStatusBar`, `NoInternetState`, `ErrorBoundary`, `PageHeader`, `StatCard`, `QuickActions` (dashboard), `AutomationWidget`, `AttendanceReminderBanner`.

**Data & forms**
`SmartSearchBar`, `ImageCrop` (react-easy-crop), `CameraCapture`, `QRScannerModal`, `OTPVerification`, `SearchSelect`, `DateRangePicker`, `VendorDashboard`, `VendorDetailModal`, `VendorModal`, `UpsellSuggestions`, `MachineLiveStatus`, `CounterCard`, `MeterVerification`, `GlobalKeyboardShortcuts`.

**Modal system**
`ConfirmDialog` (via ConfirmContext), `PaymentModal`, `InvoiceModal`, `ReceiptModal`, `ScannerModal`, `CatalogueModal`, `DrillDownModal`, `CropModal`.

**Área-specific**
- `accounting/` — ledger tables, cash-bank widgets.
- `chatbot/` — ChatWidget (floating).
- `quickbilling/` — step wizard for fast front-office billing.
- `billing/` — InvoiceForm, PaymentForm.
- `paper/` — PaperStockTable, CutMapEditor, RateCalculator.
- `jobs/` — JobStatusTimeline, StaffAssignmentDropdown, ProofList.

**Offline**
`OfflineBanner`, `SyncStatusBar`, `NoInternetState`, `SyncQueueList`.

Orphan/unused-component analysis and reuse guidance: `COMPONENTS.md` (734-line component inventory).

---

## 33. Design System

Defined in `DESIGN.md` + `client/src/index.css` as CSS custom properties, consumed by `ThemeProvider` (light/dark).

### Tokens

```css
:root {
  /* Color */
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-primary: #fc6a03;        /* Sarga brand orange */
  --color-primary-dark: #d95802;
  --color-text: #0f172a;
  --color-muted: #64748b;
  --color-border: #e2e8f0;
  --color-success: #16a34a;
  --color-warning: #f59e0b;
  --color-danger: #dc2626;
  /* Dark variant overrides via [data-theme="dark"] … */

  /* Typography (fluid) */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-display: 'Space Grotesk', sans-serif;
  /* fluid clamp() scale for h1..h6, body, small */

  /* Spacing */
  --space-1..--space-12 (4px–48px)

  /* Shape */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px; --radius-full: 999px;

  /* Elevations */
  --shadow-card, --shadow-popover, --shadow-modal;
}
```

### Components

Buttons (primary/secondary/ghost/danger + loading/icon states), cards, tables, modals, forms, badges, skeletons, empty states, pagination, toasts — all reference the tokens above; dark mode toggled live with no reload.

### Rules

- No hard-coded hex values in components (lint-enforced convention).
- Prefer tokens for radius/spacing; use fluid type via `clamp()`.
- All screens responsive ≥ 360 px; focus-visible rings for a11y.

---

## 34. Build & Run Commands

### Install

```bash
npm install                 # root (orchestrator deps)
cd server && npm install
cd client && npm install
cd mcp-server && npm install
```

### Dev

```bash
npm run dev        # runs start.js → concurrently boots server (:3000) + client (:5173)
# or
npm start          # product-facing start (root)
```

### Backend only

```bash
cd server && npm run dev     # nodemon, NODE_ENV=development
cd server && npm test        # jest --runInBand
cd server && npm run lint
```

### Frontend only

```bash
cd client && npm run dev          # Vite dev server
cd client && npm run build        # vite build → client/dist (includes PWA + sitemap)
cd client && npx playwright test  # e2e
cd client && npx vitest           # unit
```

### MCP

```bash
cd mcp-server && npm run build && npm start          # stdio
cd mcp-server && npm run start:http                  # HTTP :3100
```

### Deploy

```bash
npm run build                  # build client locally
./deploy.ps1                   # Vercel: prebuilt output + API patch resetting rootDirectory
./wake-render.ps1              # keep-alive ping probe
./vercel_env_setup.ps1         # push env vars to Vercel
```

### Backups

```bash
# MySQL dump (Aiven)
mysqldump --defaults-extra-file=… --ssl-ca=server/aiven-ca.pem defaultdb > sarga_db_backup.sql
# Google Sheets backup is automatic via services/googleSheetsService.js
```

---

## 35. Security Considerations

**Currently implemented**
- bcrypt password hashing; JWT (RS: HS256) with dual secrets + blacklist revocation.
- Full audit trail on all writes; staff activity + security logs.
- RBAC on every route (6 roles); Front Office branch-locked.
- Helmet CSP + HSTS; CORS allowlist incl. Vercel preview pattern.
- Rate limiting (general/auth/upload/AI tiers).
- Parameterized SQL everywhere (mysql2 `?` placeholders); zod input validation.
- XSS mitigation (DOMPurify on client); file uploads → Cloudinary with type/size validation.
- Idempotency keys to prevent duplicate payment writes.

**Operational requirements / gaps to fix**
- ⚠️ **Rotate all committed secrets** (`server/.env`, root `.env*`) — currently in git history.
- Move secrets to platform stores (Vercel env, Render secrets, GitHub secrets) and remove files.
- Add CI secret scanning (e.g. gitleaks) to `.github/workflows`.
- Reinstate Redis caching for session store when scaling (currently optional).
- Keep `SENTRY_DSN` active; confirm upload CSP allows Cloudinary URL.
- Regular DB backups + restore drills; audit-log retention policy.
- MCP server must only run on trusted networks / with JWT in production.

---

## 36. Side Modules

### blog-module (Next.js 13)

Pages: posts list, post detail (MDX/`mdx-remote`), categories, tags. Postgres via `pg`; seed scripts; admin CMS at `/admin`.

### portfolio-module (Next.js 13)

Works grid + detail; uploads via `formidable` → Cloudinary; categories; lightbox gallery.

### i18n-module (Next.js 13)

`cookie`-based locale switching (en/ml); string catalog loading; used to drive translated labels on the customer website.

> These modules communicate with the main API for data (blog/portfolio/translations endpoints in §30).

---

## 37. Glossary of Terms

| Term | Meaning |
|---|---|
| **MIS** | Management Information System |
| **Job** | A print work order (offset/laser/other) |
| **Book type** | Offset (bulk litho), Laser (digital), Other |
| **Proof** | Pre-production design sample for customer approval |
| **Walk-in / Retail / Offset** | Customer tiers by frequency/size |
| **CGST / SGST** | Central/State GST components (India) |
| **GSM** | Grams per square meter (paper weight) |
| **Cut map** | Parent sheet → child sizes + ratio + wastage |
| **Imposition** | Arrangement of printed pages on a sheet |
| **Three Books** | Work book, expense book, credit book (offset production) |
| **EMI** | Equated monthly installment (loans/machines) |
| **Kuri** | Kerala chit-fund savings scheme |
| **Plate** | Offset printing plate (CTP/PS) |
| **Consumables** | Ink, chemicals, cleaning supplies |
| **Branch stock** | Per-branch inventory quantities |
| **Offline queue** | IndexedDB-backed pending actions synced later |
| **MCP** | Model Context Protocol (AI agent tool server) |
| **RBAC** | Role-based access control |

---

## Final Notes

If you are reading this to **rebuild the software**: start at §5 (schema) → §28 (env) → §6 (server boot) → §7 (frontend) → then implement features §9–§25 in any order, each backing to the API list in §30. The `server/schemas/` SQL files and `server/routes/` modules are the single source of truth for table shapes and endpoints; the client pages mirror them one-to-one.

If you are reading this to **maintain/extend** the software, use:
- `ARCHITECTURE.md` — component/flow diagrams
- `PAGES.md` — page/route/data catalog
- `COMPONENTS.md` — component inventory
- `DESIGN.md` — design tokens
- `RBAC_AUDIT.md`, `FULL_SOFTWARE_AUDIT_REPORT.md` — security/audit status
- `docs/` — deployment, backups, checklist
- `AGENT_RULES.md` — conventions for AI agents working in this repo

Production URLs: app `https://software-sarga.vercel.app`, API `https://software-sarga-2.onrender.com/api`, website `https://sargaoffset.vercel.app`.
```