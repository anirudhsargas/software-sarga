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