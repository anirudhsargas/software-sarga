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
### 5.X Full DDL Reference (verbatim from `server/schemas/*.sql`)

Ground-truth DDL that builds the database, one file per domain group, applied in numeric order by the migration runner (recorded in `schema_migrations`). Column names/attributes below override the shorthand inventory above where they differ: e.g. `consumables_inventory_adjustments` (not `consumables_adjustments`), `sarga_staff_attendance` (not `sarga_attendance`), `sarga_customers.mobile UNIQUE NOT NULL` and `gst` (not `gst_number`), `sarga_job_seq` keyed on `(branch_id, seq_date)` with `last_seq` (not `job_date/seq_number`), `sarga_inventory` uses `cost_price/sell_price` + `reorder_level` (not `min_quantity`).

> The `sarga_machine_credit_movements`, `sarga_credit_customers` and `sarga_credit_ledger` tables are **schema-only** â€” see Â§16: no runtime route reads or writes them.

#### 001_core.sql  (1077 bytes)

```sql
-- Core tables: branches, staff, job sequence
CREATE TABLE IF NOT EXISTS sarga_branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  smtp_user VARCHAR(100),
  smtp_pass VARCHAR(100),
  upi_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  branch_id INT,
  image_url LONGTEXT,
  salary_type ENUM('Monthly', 'Daily') DEFAULT 'Monthly',
  base_salary DECIMAL(12, 2) DEFAULT 0,
  daily_rate DECIMAL(12, 2) DEFAULT 0,
  is_first_login TINYINT(1) DEFAULT 1,
  settings JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_job_seq (
  branch_id INT,
  seq_date DATE,
  last_seq INT DEFAULT 0,
  PRIMARY KEY (branch_id, seq_date)
);
```

#### 002_inventory.sql  (4856 bytes)

```sql
-- Inventory and stock tables
CREATE TABLE IF NOT EXISTS sarga_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  sku VARCHAR(80) UNIQUE,
  category VARCHAR(80),
  unit VARCHAR(30) DEFAULT 'pcs',
  quantity INT DEFAULT 0,
  reorder_level INT DEFAULT 0,
  cost_price DECIMAL(10, 2) DEFAULT 0,
  sell_price DECIMAL(10, 2) DEFAULT 0,
  hsn VARCHAR(20),
  discount DECIMAL(5, 2) DEFAULT 0,
  gst_rate DECIMAL(5, 2) DEFAULT 0,
  source_code VARCHAR(10),
  model_name VARCHAR(100),
  size_code VARCHAR(100),
  item_type ENUM('Retail', 'Consumable') DEFAULT 'Retail',
  vendor_name VARCHAR(255),
  vendor_contact VARCHAR(255),
  purchase_link TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_stock_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  from_branch_id INT NOT NULL,
  to_branch_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'Pending',
  created_by INT NOT NULL,
  resolved_by INT DEFAULT NULL,
  resolved_at TIMESTAMP NULL,
  sent_by INT DEFAULT NULL,
  sent_at TIMESTAMP NULL,
  received_by INT DEFAULT NULL,
  received_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (from_branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (to_branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_branch_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  branch_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_item_branch (inventory_item_id, branch_id),
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_inventory_consumption (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  quantity_consumed DECIMAL(10, 2) NOT NULL,
  consumed_by_user_id INT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (consumed_by_user_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_inventory_reorders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  quantity_received DECIMAL(10, 2) NOT NULL,
  cost_price DECIMAL(10, 2) NOT NULL,
  days_since_last_reorder INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_stock_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month VARCHAR(7) NOT NULL,
  status ENUM('Draft', 'Completed') DEFAULT 'Draft',
  verified_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_month (month),
  FOREIGN KEY (verified_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_stock_verification_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  verification_id INT NOT NULL,
  inventory_item_id INT NOT NULL,
  system_quantity INT NOT NULL DEFAULT 0,
  physical_quantity INT DEFAULT NULL,
  notes VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY idx_ver_item (verification_id, inventory_item_id),
  FOREIGN KEY (verification_id) REFERENCES sarga_stock_verifications(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  status ENUM('pending', 'approved', 'ordered', 'received', 'cancelled') DEFAULT 'pending',
  total_estimated_cost DECIMAL(12, 2) DEFAULT 0,
  created_by INT DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_purchase_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT NOT NULL,
  inventory_item_id INT NOT NULL,
  suggested_qty DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(30) DEFAULT 'pcs',
  estimated_cost DECIMAL(10, 2) DEFAULT 0,
  vendor_name VARCHAR(255),
  urgency ENUM('immediate', 'this_week') DEFAULT 'this_week',
  FOREIGN KEY (purchase_order_id) REFERENCES sarga_purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);
```

#### 003_paper.sql  (4048 bytes)

```sql
-- Paper inventory and consumables
CREATE TABLE IF NOT EXISTS sarga_paper_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paper_name VARCHAR(255) NOT NULL,
  size VARCHAR(50),
  gsm INT,
  ream_count INT DEFAULT 0,
  sheets_per_ream INT DEFAULT 500,
  total_sheets INT DEFAULT 0,
  reorder_level_reams INT DEFAULT 0,
  supplier_name VARCHAR(255),
  purchase_price_per_ream DECIMAL(10, 2) DEFAULT 0,
  branch ENUM('Perambra', 'Meppayur') NOT NULL,
  notes TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_paper_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paper_id INT NOT NULL,
  change_reams INT NOT NULL,
  reason VARCHAR(255),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_id) REFERENCES sarga_paper_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS paper_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category ENUM('LASER', 'OFFSET') NOT NULL,
  size_name VARCHAR(50) NOT NULL,
  width_mm DECIMAL(8,2),
  height_mm DECIMAL(8,2),
  gsm INT,
  brand VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_stock_movements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  paper_type_id INT NOT NULL,
  branch_id INT NOT NULL,
  movement_type ENUM('INWARD','OUTWARD','ADJUSTMENT','TRANSFER') NOT NULL,
  quantity INT NOT NULL,
  unit ENUM('SHEETS','REAMS','PACKETS') DEFAULT 'SHEETS',
  unit_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  reference_type ENUM('PURCHASE','JOB','WASTE','TRANSFER','OPENING'),
  reference_id INT,
  notes TEXT,
  moved_by INT,
  moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_type_id) REFERENCES paper_types(id),
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id)
);

CREATE TABLE IF NOT EXISTS paper_stock_summary (
  id INT PRIMARY KEY AUTO_INCREMENT,
  paper_type_id INT NOT NULL,
  branch_id INT NOT NULL,
  current_sheets INT DEFAULT 0,
  reorder_level INT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_paper_branch (paper_type_id, branch_id),
  FOREIGN KEY (paper_type_id) REFERENCES paper_types(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consumables_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category ENUM('ink', 'chemical', 'plate', 'spare_part', 'other') NOT NULL DEFAULT 'other',
  unit ENUM('litre', 'kg', 'piece', 'box', 'set') NOT NULL DEFAULT 'piece',
  quantity_in_stock DECIMAL(12, 3) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(12, 3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12, 2) DEFAULT 0,
  supplier_name VARCHAR(255),
  branch ENUM('Perambra', 'Meppayur') NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consumables_inventory_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consumable_id INT NOT NULL,
  quantity_delta DECIMAL(12, 3) NOT NULL,
  reason VARCHAR(255),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_paper_cut_map (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_inventory_item_id INT NOT NULL,
  child_size_code VARCHAR(100) NOT NULL,
  pieces_per_parent INT NOT NULL DEFAULT 1,
  loss_pct DECIMAL(5,2) DEFAULT 0,
  min_waste INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parent_child (parent_inventory_item_id, child_size_code),
  FOREIGN KEY (parent_inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);
```

#### 004_customers.sql  (4267 bytes)

```sql
-- Customer and payments tables
CREATE TABLE IF NOT EXISTS sarga_customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mobile VARCHAR(15) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('Walk-in', 'Retail', 'Offset') NOT NULL DEFAULT 'Walk-in',
  email VARCHAR(100),
  gst VARCHAR(20),
  address TEXT,
  branch_id INT,
  client_type VARCHAR(50) DEFAULT 'customer',
  internal_branch VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_customer_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  customer_name VARCHAR(150) NOT NULL,
  customer_mobile VARCHAR(20),
  bill_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  net_amount DECIMAL(12, 2) DEFAULT 0,
  sgst_amount DECIMAL(12, 2) DEFAULT 0,
  cgst_amount DECIMAL(12, 2) DEFAULT 0,
  advance_paid DECIMAL(12, 2) DEFAULT 0,
  balance_amount DECIMAL(12, 2) DEFAULT 0,
  payment_method ENUM('Cash', 'UPI', 'Both', 'Cheque', 'Account Transfer') DEFAULT 'Cash',
  cash_amount DECIMAL(12, 2) DEFAULT 0,
  upi_amount DECIMAL(12, 2) DEFAULT 0,
  branch_id INT,
  reference_number VARCHAR(100),
  description TEXT,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  payment_date DATE NOT NULL,
  order_lines JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_customer_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_id INT NOT NULL,
  customer_id INT NOT NULL,
  action ENUM('EDIT', 'DELETE') NOT NULL,
  payload JSON,
  note TEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (requester_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type ENUM('percent', 'amount') DEFAULT 'percent',
  discount_value DECIMAL(10,2) NOT NULL,
  usage_type ENUM('one_time', 'limited', 'unlimited') DEFAULT 'unlimited',
  max_uses INT DEFAULT NULL,
  used_count INT DEFAULT 0,
  min_order_amount DECIMAL(12,2) DEFAULT 0,
  expiry_date DATE DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_refunds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  customer_id INT,
  idempotency_key VARCHAR(100),
  refund_amount DECIMAL(12,2) NOT NULL,
  refund_method ENUM('Cash','UPI','Cheque','Account Transfer') DEFAULT 'Cash',
  reason TEXT,
  processed_by INT,
  branch_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_customer_designs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  job_id INT DEFAULT NULL,
  title VARCHAR(200) NOT NULL,
  file_url LONGTEXT NOT NULL,
  file_type VARCHAR(30) DEFAULT 'image',
  original_name VARCHAR(300),
  file_size INT DEFAULT 0,
  notes TEXT,
  tags VARCHAR(500),
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_discount_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_id INT NOT NULL,
  discount_percent DECIMAL(5,2) NOT NULL,
  total_amount DECIMAL(12,2),
  customer_name VARCHAR(255),
  reason TEXT,
  approval_level ENUM('accountant_or_admin', 'admin_only') DEFAULT 'admin_only',
  status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
  reviewed_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (requester_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);
```

#### 005_products.sql  (2834 bytes)

```sql
-- Product hierarchy and products
CREATE TABLE IF NOT EXISTS sarga_product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  position INT NOT NULL DEFAULT 0,
  image_url LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_product_subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  image_url LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES sarga_product_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subcategory_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  product_code VARCHAR(80),
  company_name VARCHAR(100) DEFAULT NULL,
  company_code VARCHAR(50) DEFAULT NULL,
  size VARCHAR(30) DEFAULT NULL,
  calculation_type ENUM('Normal', 'Slab', 'Range') DEFAULT 'Normal',
  description TEXT,
  image_url LONGTEXT,
  has_paper_rate TINYINT(1) DEFAULT 0,
  paper_rate DECIMAL(10, 2) DEFAULT 0,
  has_double_side_rate TINYINT(1) DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  inventory_item_id INT DEFAULT NULL,
  is_physical_product TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (subcategory_id) REFERENCES sarga_product_subcategories(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_product_slabs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  min_qty DECIMAL(10,2) NOT NULL,
  max_qty DECIMAL(10,2),
  base_value DECIMAL(10,2) DEFAULT 0,
  unit_rate DECIMAL(10,2) DEFAULT 0,
  offset_unit_rate DECIMAL(10,2) DEFAULT 0,
  double_side_unit_rate DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_product_extras_template (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  purpose VARCHAR(150) NOT NULL,
  amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_product_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id_internal INT NOT NULL,
  entity_type ENUM('category', 'subcategory', 'product') NOT NULL,
  entity_id INT NOT NULL,
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_usage (user_id_internal, entity_type, entity_id),
  FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE
);
```

#### 006_jobs.sql  (3652 bytes)

```sql
-- Jobs and related tables
CREATE TABLE IF NOT EXISTS sarga_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  product_id INT,
  branch_id INT,
  job_number VARCHAR(20) UNIQUE,
  job_name VARCHAR(150) NOT NULL,
  description TEXT,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  advance_paid DECIMAL(10,2) DEFAULT 0,
  balance_amount DECIMAL(10,2) DEFAULT 0,
  applied_extras JSON,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  book_type ENUM('Offset', 'Laser', 'Other') DEFAULT 'Offset',
  machine_id INT DEFAULT NULL,
  status ENUM('Pending', 'Processing', 'Designing', 'Printing', 'Cutting', 'Lamination', 'Binding', 'Production', 'Approval Pending', 'Completed', 'Delivered', 'Cancelled') DEFAULT 'Pending',
  payment_status ENUM('Unpaid', 'Partial', 'Paid') DEFAULT 'Unpaid',
  delivery_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_job_matter (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  file_url LONGTEXT NOT NULL,
  original_name VARCHAR(300),
  file_size INT DEFAULT 0,
  notes TEXT,
  uploaded_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_job_staff_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  staff_id INT NOT NULL,
  role VARCHAR(50),
  assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_date DATETIME,
  status ENUM('Pending', 'In Progress', 'Completed') DEFAULT 'Pending',
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_job_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  staff_id INT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_paper_usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  stage VARCHAR(80) NOT NULL,
  paper_size VARCHAR(30) DEFAULT NULL,
  sheets_used INT NOT NULL DEFAULT 0,
  sheets_wasted INT NOT NULL DEFAULT 0,
  notes TEXT,
  logged_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (logged_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_job_proofs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  file_url LONGTEXT NOT NULL,
  original_name VARCHAR(300),
  file_size INT DEFAULT 0,
  file_type VARCHAR(30) DEFAULT 'image',
  status ENUM('Pending', 'Approved', 'Rejected', 'Revision Requested') DEFAULT 'Pending',
  designer_notes TEXT,
  customer_feedback TEXT,
  uploaded_by INT,
  reviewed_by INT,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);
```

#### 007_vendors.sql  (7420 bytes)

```sql
-- Vendors, bills, and payments tables
CREATE TABLE IF NOT EXISTS sarga_vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  type ENUM('Vendor', 'Utility', 'Salary', 'Rent', 'Other') NOT NULL DEFAULT 'Vendor',
  contact_person VARCHAR(150),
  phone VARCHAR(20),
  address TEXT,
  branch_id INT DEFAULT NULL,
  order_link TEXT,
  gstin VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_vendor_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  branch_id INT NOT NULL,
  bill_number VARCHAR(100),
  bill_date DATE NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES sarga_vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_vendor_bill_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  inventory_item_id INT NOT NULL,
  quantity DECIMAL(12, 2) NOT NULL,
  unit_cost DECIMAL(12, 2) NOT NULL,
  total_cost DECIMAL(12, 2) NOT NULL,
  FOREIGN KEY (bill_id) REFERENCES sarga_vendor_bills(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_vendor_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_name VARCHAR(150) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  branch_id INT,
  payment_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_utility_connections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  utility_type VARCHAR(150) NOT NULL,
  provider VARCHAR(200) DEFAULT NULL,
  billing_cycle VARCHAR(50) DEFAULT 'monthly',
  connection_id VARCHAR(100) NOT NULL,
  label VARCHAR(200),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_utility_connection (branch_id, utility_type, connection_id)
);

CREATE TABLE IF NOT EXISTS sarga_utility_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utility_type VARCHAR(150) NOT NULL,
  branch_id INT NOT NULL,
  bill_number VARCHAR(100),
  bill_date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  connection_id VARCHAR(100),
  connection_record_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_record_id) REFERENCES sarga_utility_connections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_vendor_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_type ENUM('Vendor', 'Utility') NOT NULL,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(150),
  phone VARCHAR(20),
  address TEXT,
  gstin VARCHAR(50),
  branch_id INT DEFAULT NULL,
  requested_by INT NOT NULL,
  request_reason TEXT,
  status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
  reviewed_by INT DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_by) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  gstin VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  vendor_code VARCHAR(10),
  category ENUM('offset_supplies','chemicals','paper','ink','equipment','frame','memento','id_card','other') DEFAULT 'other',
  credit_days INT DEFAULT 0,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_vendor_name (name)
);

CREATE TABLE IF NOT EXISTS vendor_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  invoice_number VARCHAR(100),
  invoice_date DATE NOT NULL,
  due_date DATE,
  amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  status ENUM('pending','partial','paid','overdue') DEFAULT 'pending',
  branch ENUM('perambra','meppayur','common') DEFAULT 'common',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  INDEX idx_vendor_invoice_status (vendor_id, status),
  INDEX idx_invoice_due_date (due_date),
  INDEX idx_invoice_branch (branch)
);

CREATE TABLE IF NOT EXISTS vendor_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_invoice_id INT NOT NULL,
  vendor_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_mode ENUM('cash','upi','bank_transfer','cheque') DEFAULT 'cash',
  reference_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_invoice_id) REFERENCES vendor_invoices(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  INDEX idx_payment_vendor (vendor_id),
  INDEX idx_payment_date (payment_date)
);

CREATE TABLE IF NOT EXISTS sarga_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  type ENUM('Vendor', 'Utility', 'Salary', 'Rent', 'Other') NOT NULL,
  payee_name VARCHAR(150) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  idempotency_key VARCHAR(100),
  payment_method VARCHAR(100) DEFAULT 'Cash',
  reference_number VARCHAR(100),
  description TEXT,
  payment_date DATETIME NOT NULL,
  vendor_id INT DEFAULT NULL,
  staff_id INT DEFAULT NULL,
  period_start DATE DEFAULT NULL,
  period_end DATE DEFAULT NULL,
  cash_amount DECIMAL(12, 2) DEFAULT 0,
  upi_amount DECIMAL(12, 2) DEFAULT 0,
  bill_total_amount DECIMAL(12, 2) DEFAULT 0,
  is_partial_payment TINYINT(1) DEFAULT 0,
  bill_reference_id INT DEFAULT NULL,
  payment_status ENUM('Pending', 'Partially Paid', 'Fully Paid') DEFAULT 'Fully Paid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES sarga_vendors(id) ON DELETE SET NULL,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_payment_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_payment_suggestions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payee_name VARCHAR(150) NOT NULL,
  payment_category VARCHAR(100),
  occurrence_count INT DEFAULT 1,
  total_amount_paid DECIMAL(14, 2) DEFAULT 0,
  last_payment_date DATETIME,
  suggested_as_vendor TINYINT(1) DEFAULT 0,
  suggestion_dismissed TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_payee (payee_name, payment_category)
);
```

#### 008_finance.sql  (7665 bytes)

```sql
-- Finance, EMI, Kuri, expenses, and daily report tables
CREATE TABLE IF NOT EXISTS sarga_rent_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_name VARCHAR(150) NOT NULL,
  location VARCHAR(200),
  owner_name VARCHAR(150),
  owner_mobile VARCHAR(20),
  monthly_rent DECIMAL(12, 2) DEFAULT 0,
  due_day INT DEFAULT 1,
  advance_deposit DECIMAL(12, 2) DEFAULT 0,
  branch_id INT DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_emi_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emi_type ENUM('Loan', 'Vehicle', 'Machine', 'Personal', 'Business') NOT NULL,
  institution_name VARCHAR(150) NOT NULL,
  loan_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
  monthly_emi DECIMAL(12, 2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE,
  due_day INT DEFAULT 5,
  account_number VARCHAR(100),
  branch_id INT DEFAULT NULL,
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_emi_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emi_id INT NOT NULL,
  payment_date DATETIME NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(100),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (emi_id) REFERENCES sarga_emi_master(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_kuri_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kuri_name VARCHAR(150) NOT NULL,
  organizer_name VARCHAR(150),
  organizer_phone VARCHAR(20),
  total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
  monthly_installment DECIMAL(12, 2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE,
  due_day INT DEFAULT 5,
  prize_taken TINYINT(1) DEFAULT 0,
  prize_amount DECIMAL(14, 2) DEFAULT 0,
  prize_date DATE,
  branch_id INT DEFAULT NULL,
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_kuri_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kuri_id INT NOT NULL,
  payment_date DATETIME NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(100),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kuri_id) REFERENCES sarga_kuri_master(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_office_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  expense_type ENUM('Stationery', 'Office Supplies', 'Furniture', 'Equipment', 'Software', 'Internet', 'Phone', 'Maintenance', 'Other') NOT NULL,
  vendor_name VARCHAR(150),
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(100) DEFAULT 'Cash',
  reference_number VARCHAR(100),
  description TEXT,
  expense_date DATE NOT NULL,
  bill_number VARCHAR(100),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_transport_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  transport_type ENUM('Delivery', 'Fuel', 'Vehicle Maintenance', 'Vehicle Rent', 'Driver Charges', 'Toll', 'Parking', 'Other') NOT NULL,
  vehicle_number VARCHAR(50),
  driver_name VARCHAR(100),
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(100) DEFAULT 'Cash',
  reference_number VARCHAR(100),
  description TEXT,
  expense_date DATE NOT NULL,
  bill_number VARCHAR(100),
  from_location VARCHAR(200),
  to_location VARCHAR(200),
  distance_km DECIMAL(8, 2),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_misc_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  expense_category VARCHAR(150) NOT NULL,
  vendor_name VARCHAR(150),
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(100) DEFAULT 'Cash',
  reference_number VARCHAR(100),
  description TEXT,
  expense_date DATE NOT NULL,
  bill_number VARCHAR(100),
  is_recurring TINYINT(1) DEFAULT 0,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_petty_cash (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_type ENUM('Opening', 'Cash In', 'Cash Out') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  reference_number VARCHAR(100),
  balance_after DECIMAL(12, 2) NOT NULL DEFAULT 0,
  received_from VARCHAR(150),
  paid_to VARCHAR(150),
  category VARCHAR(100),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_bills_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  document_type ENUM('Vendor Bill', 'Utility Bill', 'Rent Receipt', 'EMI Receipt', 'Kuri Receipt', 'Transport Bill', 'Office Bill', 'Petty Cash Receipt', 'Other') NOT NULL,
  related_tab VARCHAR(50),
  related_id INT,
  vendor_name VARCHAR(150),
  bill_number VARCHAR(100),
  bill_date DATE NOT NULL,
  amount DECIMAL(12, 2),
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  file_type VARCHAR(50),
  file_size_kb INT,
  description TEXT,
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  INDEX idx_document_type (document_type),
  INDEX idx_vendor_name (vendor_name),
  INDEX idx_bill_date (bill_date),
  INDEX idx_related (related_tab, related_id)
);

CREATE TABLE IF NOT EXISTS sarga_invoice_sequence (
  id INT AUTO_INCREMENT PRIMARY KEY,
  financial_year VARCHAR(10) NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fy_prefix (financial_year, prefix)
);

CREATE TABLE IF NOT EXISTS sarga_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(30) NOT NULL UNIQUE,
  financial_year VARCHAR(10) NOT NULL,
  payment_id INT DEFAULT NULL,
  customer_id INT DEFAULT NULL,
  total_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(12,2) DEFAULT 0,
  status ENUM('Active', 'Cancelled', 'Credit Note') DEFAULT 'Active',
  generated_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES sarga_customer_payments(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (generated_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);
```

#### 009_staff_attendance.sql  (5014 bytes)

```sql
-- Staff salary, attendance, and scheduling tables
CREATE TABLE IF NOT EXISTS sarga_staff_salary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  base_salary DECIMAL(12, 2) NOT NULL DEFAULT 0,
  net_salary DECIMAL(12, 2),
  payment_month DATE NOT NULL,
  bonus DECIMAL(12, 2) DEFAULT 0,
  deduction DECIMAL(12, 2) DEFAULT 0,
  paid_date DATETIME,
  payment_method VARCHAR(100),
  reference_number VARCHAR(100),
  notes TEXT,
  status ENUM('Pending', 'Paid', 'Partial') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_staff_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_name VARCHAR(150) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  branch_id INT,
  payment_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_staff_salary_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  payment_date DATETIME NOT NULL,
  payment_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(100),
  idempotency_key VARCHAR(100),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_staff_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('Present', 'Absent', 'Leave', 'Holiday') DEFAULT 'Present',
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_attendance (staff_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS sarga_staff_leave_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  `year_month` VARCHAR(7) NOT NULL,
  paid_leaves_used INT DEFAULT 0,
  unpaid_leaves_used INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  UNIQUE KEY unique_leave_balance (staff_id, `year_month`)
);

CREATE TABLE IF NOT EXISTS sarga_attendance_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  requested_status ENUM('Present', 'Absent', 'Half Day', 'Leave', 'Holiday') NOT NULL,
  requested_time TIME,
  requested_notes TEXT,
  requested_by VARCHAR(50) NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_staff_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  schedule_name VARCHAR(100) NOT NULL DEFAULT 'General Shift',
  shift_start TIME NOT NULL DEFAULT '09:00:00',
  shift_end TIME NOT NULL DEFAULT '18:00:00',
  break_minutes INT NOT NULL DEFAULT 60,
  working_days VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6',
  effective_from DATE NOT NULL,
  effective_to DATE DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_staff_latetime (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  scheduled_start TIME NOT NULL,
  actual_start TIME NOT NULL,
  late_minutes INT NOT NULL DEFAULT 0,
  reason TEXT,
  excused TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  UNIQUE KEY unique_late (staff_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS sarga_staff_overtime (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  overtime_date DATE NOT NULL,
  scheduled_end TIME NOT NULL,
  actual_end TIME NOT NULL,
  overtime_minutes INT NOT NULL DEFAULT 0,
  overtime_type ENUM('Weekday', 'Weekend', 'Holiday') NOT NULL DEFAULT 'Weekday',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  approved_by INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_overtime (staff_id, overtime_date)
);
```

#### 010_machines.sql  (10949 bytes)

```sql
-- Machines and daily production reporting
CREATE TABLE IF NOT EXISTS sarga_machines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  machine_name VARCHAR(150) NOT NULL,
  machine_type ENUM('Offset', 'Digital', 'Binding', 'Lamination', 'Cutting', 'Other') NOT NULL,
  machine_category VARCHAR(30) DEFAULT NULL,
  counter_type ENUM('Manual', 'Automatic') DEFAULT 'Manual',
  branch_id INT NOT NULL,
  location VARCHAR(200),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_machine_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  machine_id INT NOT NULL,
  reading_date DATE NOT NULL,
  opening_count INT NOT NULL DEFAULT 0,
  closing_count INT DEFAULT NULL,
  total_copies INT DEFAULT 0,
  notes TEXT,
  created_by INT,
  updated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_machine_date (machine_id, reading_date)
);

CREATE TABLE IF NOT EXISTS sarga_machine_count_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  machine_id INT NOT NULL,
  reading_date DATE NOT NULL,
  expected_count INT DEFAULT NULL,
  entered_count INT NOT NULL,
  submitted_by INT,
  status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
  admin_note TEXT,
  reviewed_by INT,
  reviewed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_machine_staff_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  machine_id INT NOT NULL,
  staff_id INT NOT NULL,
  assigned_by INT,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assignment_opening_count BIGINT NOT NULL DEFAULT 0,
  FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_machine_staff (machine_id, staff_id)
);

CREATE TABLE IF NOT EXISTS sarga_daily_report_offset (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE NOT NULL,
  branch_id INT NOT NULL,
  opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(12, 2) DEFAULT 0,
  total_collected DECIMAL(12, 2) DEFAULT 0,
  total_expenses DECIMAL(12, 2) DEFAULT 0,
  total_credit_out DECIMAL(12, 2) DEFAULT 0,
  total_credit_in DECIMAL(12, 2) DEFAULT 0,
  status ENUM('Draft', 'Finalized') DEFAULT 'Draft',
  created_by INT,
  finalized_by INT,
  finalized_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  FOREIGN KEY (finalized_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_branch_date (branch_id, report_date)
);

CREATE TABLE IF NOT EXISTS sarga_daily_work_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  work_name VARCHAR(200) NOT NULL,
  work_details TEXT,
  payment_type ENUM('Cash', 'UPI', 'Both', 'Credit') NOT NULL,
  cash_amount DECIMAL(12, 2) DEFAULT 0,
  upi_amount DECIMAL(12, 2) DEFAULT 0,
  amount_collected DECIMAL(12, 2) NOT NULL,
  remarks TEXT,
  entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_daily_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  expense_description VARCHAR(200) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_method ENUM('Cash', 'UPI', 'Both') DEFAULT 'Cash',
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_daily_credit_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT DEFAULT NULL,
  book_type ENUM('Offset', 'Laser', 'Other') DEFAULT 'Offset',
  branch_id INT DEFAULT NULL,
  report_date DATE DEFAULT NULL,
  transaction_type ENUM('Credit Out', 'Credit In') NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(20),
  amount DECIMAL(12, 2) NOT NULL,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_daily_report_machine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE NOT NULL,
  machine_id INT NOT NULL,
  branch_id INT NOT NULL,
  book_type ENUM('Offset','Laser','Other') DEFAULT NULL,
  opening_count INT NOT NULL DEFAULT 0,
  closing_count INT DEFAULT NULL,
  total_copies INT DEFAULT 0,
  total_amount DECIMAL(12, 2) DEFAULT 0,
  total_cash DECIMAL(12, 2) DEFAULT 0,
  total_credit DECIMAL(12, 2) DEFAULT 0,
  credit_cash_in DECIMAL(12, 2) DEFAULT 0,
  credit_cash_out DECIMAL(12, 2) DEFAULT 0,
  status ENUM('Draft', 'Finalized') DEFAULT 'Draft',
  created_by INT,
  finalized_by INT,
  finalized_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (machine_id) REFERENCES sarga_machines(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  FOREIGN KEY (finalized_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_machine_date (machine_id, report_date)
);

CREATE TABLE IF NOT EXISTS sarga_machine_work_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  work_details TEXT NOT NULL,
  copies INT NOT NULL,
  payment_type ENUM('Cash', 'UPI', 'Credit') NOT NULL,
  cash_amount DECIMAL(12, 2) DEFAULT 0,
  upi_amount DECIMAL(12, 2) DEFAULT 0,
  credit_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL,
  remarks TEXT,
  entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES sarga_daily_report_machine(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_machine_credit_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  movement_type ENUM('Cash In', 'Cash Out') NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES sarga_daily_report_machine(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_internal_transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  from_book_type ENUM('Offset','Laser','Other') NOT NULL,
  to_book_type ENUM('Offset','Laser','Other') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  note TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_credit_customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(20),
  credit_limit DECIMAL(12, 2) DEFAULT 0,
  current_balance DECIMAL(12, 2) DEFAULT 0,
  branch_id INT NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_credit_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  credit_customer_id INT NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_type ENUM('Credit Given', 'Payment Received', 'Adjustment') NOT NULL,
  debit_amount DECIMAL(12, 2) DEFAULT 0,
  credit_amount DECIMAL(12, 2) DEFAULT 0,
  balance_after DECIMAL(12, 2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id INT,
  description TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (credit_customer_id) REFERENCES sarga_credit_customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  INDEX idx_customer_date (credit_customer_id, transaction_date)
);

CREATE TABLE IF NOT EXISTS sarga_daily_opening_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE NOT NULL,
  branch_id INT NOT NULL,
  book_type ENUM('Offset', 'Laser', 'Other') NOT NULL,
  cash_opening DECIMAL(12, 2) DEFAULT 0,
  entered_by INT,
  is_locked TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (entered_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_branch_date_book (branch_id, report_date, book_type)
);

CREATE TABLE IF NOT EXISTS sarga_opening_change_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_id INT NOT NULL,
  branch_id INT NOT NULL,
  report_date DATE NOT NULL,
  request_type ENUM('balance', 'machine_count') NOT NULL,
  book_type ENUM('Offset', 'Laser', 'Other') NULL,
  machine_id INT NULL,
  current_value DECIMAL(12, 2) DEFAULT 0,
  requested_value DECIMAL(12, 2) DEFAULT 0,
  note TEXT,
  status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
  reviewed_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (requester_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_book_staff_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book_type ENUM('Offset', 'Laser', 'Other') NOT NULL,
  staff_id INT NOT NULL,
  branch_id INT NOT NULL,
  assigned_by INT,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  UNIQUE KEY unique_book_staff_branch (book_type, staff_id, branch_id)
);
```

#### 011_audit_ai.sql  (3226 bytes)

```sql
-- Audit, AI, alerts, and security tables
CREATE TABLE IF NOT EXISTS sarga_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id_internal INT,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  reference_id INT,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_id_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id_internal INT NOT NULL,
  old_user_id VARCHAR(50) NOT NULL,
  new_user_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_staff_activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  details TEXT,
  ip_address VARCHAR(45),
  device_info VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  INDEX idx_activity_staff (staff_id),
  INDEX idx_activity_type (action_type),
  INDEX idx_activity_time (created_at)
);

CREATE TABLE IF NOT EXISTS sarga_fraud_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  alert_type VARCHAR(100) NOT NULL,
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
  message TEXT,
  details JSON,
  status ENUM('ACTIVE', 'RESOLVED', 'DISMISSED') DEFAULT 'ACTIVE',
  resolved_by INT,
  resolved_at DATETIME,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  INDEX idx_fraud_status (status),
  INDEX idx_fraud_severity (severity),
  INDEX idx_fraud_staff (staff_id),
  INDEX idx_fraud_time (created_at)
);

CREATE TABLE IF NOT EXISTS sarga_design_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500),
  file_type VARCHAR(50),
  file_size_kb INT,
  result_json JSON,
  passed TINYINT(1) DEFAULT 0,
  total_issues INT DEFAULT 0,
  critical_issues INT DEFAULT 0,
  warnings INT DEFAULT 0,
  checked_by INT,
  job_id INT DEFAULT NULL,
  proof_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (checked_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  INDEX idx_design_time (created_at),
  INDEX idx_design_job (job_id)
);

CREATE TABLE IF NOT EXISTS sarga_ai_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cache_key VARCHAR(255) NOT NULL UNIQUE,
  cache_value JSON NOT NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_expense_training (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ocr_text TEXT NOT NULL,
  category VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_exp_train_category (category)
);
```

#### 012_cctv.sql  (1484 bytes)

```sql
-- CCTV and face recognition tables
CREATE TABLE IF NOT EXISTS sarga_cctv_cameras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  branch VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  port INT NOT NULL DEFAULT 554,
  username VARCHAR(100) NOT NULL DEFAULT 'admin',
  password VARCHAR(255) NOT NULL,
  rtsp_path VARCHAR(255) NOT NULL DEFAULT '/Streaming/Channels/101',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_cctv_face_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  label VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_cctv_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  branch VARCHAR(50) NOT NULL,
  event_type ENUM('entry', 'exit', 'manual') NOT NULL,
  source ENUM('face_recognition', 'manual') NOT NULL DEFAULT 'manual',
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  noted_by INT NULL,
  date DATE GENERATED ALWAYS AS (DATE(timestamp)) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (noted_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);
```

#### 013_designs.sql  (1243 bytes)

```sql
CREATE TABLE IF NOT EXISTS sarga_designs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  product_id VARCHAR(50) NOT NULL,
  design_data LONGTEXT,
  thumbnail TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id),
  INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sarga_design_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  product_id VARCHAR(50) NOT NULL,
  design_data LONGTEXT NOT NULL,
  thumbnail TEXT,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_active (product_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sarga_design_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  original_name VARCHAR(255),
  cloudinary_url TEXT,
  public_id VARCHAR(255),
  file_size INT DEFAULT 0,
  mime_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 014_blog.sql  (1995 bytes)

```sql
-- Schema for Sarga Blog System

CREATE TABLE IF NOT EXISTS sarga_blog_authors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'Writer',
  bio TEXT DEFAULT NULL,
  avatar_url LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_blog_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  excerpt TEXT NOT NULL,
  content LONGTEXT NOT NULL,
  featured_image LONGTEXT DEFAULT NULL,
  category VARCHAR(100) NOT NULL,
  tags VARCHAR(255) DEFAULT NULL, -- Comma-separated list of tags
  author_id INT DEFAULT NULL,
  status ENUM('Draft', 'Published', 'Scheduled') NOT NULL DEFAULT 'Draft',
  scheduled_at TIMESTAMP NULL DEFAULT NULL,
  views INT DEFAULT 0,
  read_time INT NOT NULL DEFAULT 3, -- Estimated minutes
  seo_title VARCHAR(255) DEFAULT NULL,
  seo_description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES sarga_blog_authors(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_blog_analytics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'view', 'share_facebook', 'share_whatsapp', etc.
  user_agent VARCHAR(255) DEFAULT NULL,
  ip_hash VARCHAR(64) NOT NULL, -- SHA256 anonymized ip
  referrer VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES sarga_blog_posts(id) ON DELETE CASCADE
);

-- Pre-seed default author if empty
INSERT INTO sarga_blog_authors (id, name, role, bio)
SELECT 1, 'Sarga Editorial Team', 'Printing & Design Experts', 'Educating Kozhikode and all of Kerala on wedding finishes, document standards, and corporate brand styling for over 30 years.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_blog_authors WHERE id = 1);
```

#### 015_premium_features.sql  (5461 bytes)

```sql
-- Schema for Sarga Premium Phase 2 Modules: Sample Requests & Design Consultation Booking

CREATE TABLE IF NOT EXISTS sarga_print_samples (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL, -- 'Paper Stock', 'Special Finish', 'Business Card Materials'
  description TEXT DEFAULT NULL,
  stock_quantity INT DEFAULT 50,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_print_sample_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(100) DEFAULT NULL,
  delivery_method ENUM('Pickup', 'Courier') NOT NULL DEFAULT 'Pickup',
  branch_id INT DEFAULT NULL, -- Link to sarga_branches
  address_line1 VARCHAR(255) DEFAULT NULL,
  address_line2 VARCHAR(255) DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  state VARCHAR(100) DEFAULT 'Kerala',
  pincode VARCHAR(10) DEFAULT NULL,
  status ENUM('Pending', 'Approved', 'Dispatched', 'Ready for Pickup', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  tracking_number VARCHAR(100) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_print_sample_request_items (
  request_id INT NOT NULL,
  sample_id INT NOT NULL,
  PRIMARY KEY (request_id, sample_id),
  FOREIGN KEY (request_id) REFERENCES sarga_print_sample_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (sample_id) REFERENCES sarga_print_samples(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_design_consultations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_email VARCHAR(100) DEFAULT NULL,
  consultation_type VARCHAR(100) NOT NULL, -- 'Wedding Card Design', 'Memento Design', 'Business Branding', 'Brochure Design', 'Invitation Design', 'Custom Printing Projects'
  meeting_mode ENUM('WhatsApp Call', 'Phone Call', 'Google Meet', 'In-Person') NOT NULL DEFAULT 'Phone Call',
  preferred_branch_id INT DEFAULT NULL, -- Link to sarga_branches
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration INT NOT NULL DEFAULT 15, -- in minutes (15, 30)
  assigned_staff_id INT DEFAULT NULL, -- Link to sarga_staff
  status ENUM('Pending', 'Confirmed', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  notes TEXT DEFAULT NULL,
  quote_issued TINYINT(1) DEFAULT 0, -- CRM Conversion: was a follow-up quote generated?
  quote_amount DECIMAL(12,2) DEFAULT NULL, -- CRM Conversion: quote amount in rupees
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (preferred_branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_staff_id) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- Pre-seed default samples if empty
INSERT INTO sarga_print_samples (name, category, description)
SELECT '250 GSM Metallic Gold Board', 'Paper Stock', 'Sparkling luxury metallic gold texture, perfect for premium wedding card leaflets.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = '250 GSM Metallic Gold Board');

INSERT INTO sarga_print_samples (name, category, description)
SELECT '300 GSM Textured Ivory Board', 'Paper Stock', 'Elegant soft cream textured surface, standard choice for premium corporate invitations.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = '300 GSM Textured Ivory Board');

INSERT INTO sarga_print_samples (name, category, description)
SELECT '350 GSM Art Card (Matte)', 'Paper Stock', 'Heavy duty, ultra-smooth premium art board, highly popular for premium visiting cards.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = '350 GSM Art Card (Matte)');

INSERT INTO sarga_print_samples (name, category, description)
SELECT '280 GSM Kraft Board (Rustic)', 'Paper Stock', 'Eco-friendly, textured brown vintage board, highly choice for rustic event themes.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = '280 GSM Kraft Board (Rustic)');

INSERT INTO sarga_print_samples (name, category, description)
SELECT 'Hot Foil Stamping (Gold Finish)', 'Special Finish', 'Stunning shiny gold foil finish under heat pressure, adds majestic borders.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = 'Hot Foil Stamping (Gold Finish)');

INSERT INTO sarga_print_samples (name, category, description)
SELECT 'Blind Embossing Detail Sample', 'Special Finish', 'Highly detailed raised textures creating 3D card borders without ink.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = 'Blind Embossing Detail Sample');

INSERT INTO sarga_print_samples (name, category, description)
SELECT 'Spot UV Coating Highlights', 'Special Finish', 'Dramatic glossy contrasts overlaying a soft matte base surface.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_print_samples WHERE name = 'Spot UV Coating Highlights');
```

#### 016_phase1_commerce.sql  (11967 bytes)

```sql
-- Phase 1: Commerce & Dynamic Pricing
-- Auto-loaded on server startup

-- Product Finishes (lamination, UV, foil, embossing, binding)
CREATE TABLE IF NOT EXISTS product_finishes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'finish',
  description TEXT,
  unit_price DECIMAL(10,2) DEFAULT 0,
  price_type ENUM('per_unit','flat','per_sqinch') DEFAULT 'per_unit',
  is_active TINYINT(1) DEFAULT 1,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_category (category),
  KEY idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pricing Tiers (quantity-based pricing rules per product)
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  min_qty INT NOT NULL DEFAULT 1,
  max_qty INT DEFAULT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  gst_rate DECIMAL(5,2) DEFAULT 18.00,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE,
  KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pricing Rules (size, GSM, paper type combinations)
CREATE TABLE IF NOT EXISTS pricing_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  size_name VARCHAR(100),
  size_width_mm DECIMAL(8,2),
  size_height_mm DECIMAL(8,2),
  gsm INT,
  paper_type VARCHAR(100),
  color_count INT DEFAULT 0,
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  min_qty INT DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE,
  KEY idx_product (product_id),
  KEY idx_size (size_name),
  KEY idx_gsm (gsm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Product-Finish mapping (which finishes apply to which products)
CREATE TABLE IF NOT EXISTS product_finish_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  finish_id INT NOT NULL,
  is_default TINYINT(1) DEFAULT 0,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE,
  FOREIGN KEY (finish_id) REFERENCES product_finishes(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_mapping (product_id, finish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Server-side Cart
CREATE TABLE IF NOT EXISTS sarga_carts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT DEFAULT NULL,
  session_id VARCHAR(100),
  branch_id INT DEFAULT NULL,
  coupon_code VARCHAR(50),
  discount_amount DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) DEFAULT 0,
  gst_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  status ENUM('active','abandoned','converted','expired') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  KEY idx_customer (customer_id),
  KEY idx_session (session_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sarga_cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cart_id INT NOT NULL,
  product_id INT,
  product_name VARCHAR(255),
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  size VARCHAR(100),
  gsm INT,
  paper_type VARCHAR(100),
  color_count INT DEFAULT 0,
  finishes JSON,
  design_file_url TEXT,
  design_notes TEXT,
  line_total DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cart_id) REFERENCES sarga_carts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE SET NULL,
  KEY idx_cart (cart_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orders (from website checkout)
CREATE TABLE IF NOT EXISTS sarga_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id INT,
  customer_name VARCHAR(150),
  customer_phone VARCHAR(20),
  customer_email VARCHAR(100),
  branch_id INT,
  cart_id INT,
  items JSON,
  subtotal DECIMAL(10,2) DEFAULT 0,
  gst_amount DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  delivery_charges DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  advance_paid DECIMAL(10,2) DEFAULT 0,
  balance_amount DECIMAL(10,2) DEFAULT 0,
  payment_method ENUM('full','partial') DEFAULT 'full',
  payment_status ENUM('pending','partial','completed','refunded') DEFAULT 'pending',
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  gst_number VARCHAR(50),
  billing_address TEXT,
  delivery_address TEXT,
  delivery_method ENUM('pickup','courier') DEFAULT 'pickup',
  pickup_slot_id INT,
  status ENUM('pending','confirmed','processing','ready','completed','cancelled') DEFAULT 'pending',
  proof_approved TINYINT(1) DEFAULT 0,
  preflight_passed TINYINT(1) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (cart_id) REFERENCES sarga_carts(id) ON DELETE SET NULL,
  KEY idx_customer (customer_id),
  KEY idx_order_number (order_number),
  KEY idx_status (status),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment Transactions
CREATE TABLE IF NOT EXISTS sarga_payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  razorpay_signature VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status ENUM('created','captured','failed','refunded') DEFAULT 'created',
  method VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES sarga_orders(id) ON DELETE SET NULL,
  KEY idx_razorpay_order (razorpay_order_id),
  KEY idx_razorpay_payment (razorpay_payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Express Production eligibility
CREATE TABLE IF NOT EXISTS express_production_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT,
  product_category VARCHAR(100),
  turnaround_3hr TINYINT(1) DEFAULT 0,
  turnaround_today TINYINT(1) DEFAULT 0,
  turnaround_tomorrow TINYINT(1) DEFAULT 0,
  max_qty_3hr INT DEFAULT 10,
  max_qty_today INT DEFAULT 50,
  max_qty_tomorrow INT DEFAULT 200,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE,
  KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B2B Company Profiles
CREATE TABLE IF NOT EXISTS sarga_business_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  company_name VARCHAR(200),
  gst_number VARCHAR(50),
  pan_number VARCHAR(20),
  contact_person VARCHAR(150),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100) DEFAULT 'Kerala',
  pincode VARCHAR(10),
  credit_limit DECIMAL(12,2) DEFAULT 0,
  credit_days INT DEFAULT 30,
  is_verified TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_customer (customer_id),
  KEY idx_gst (gst_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Brand Assets Library
CREATE TABLE IF NOT EXISTS sarga_brand_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_profile_id INT,
  customer_id INT,
  asset_type ENUM('logo','font','color','template') NOT NULL,
  name VARCHAR(200),
  file_url TEXT,
  color_hex VARCHAR(7),
  font_name VARCHAR(100),
  font_file_url TEXT,
  template_data JSON,
  is_locked TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_profile_id) REFERENCES sarga_business_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
  KEY idx_business (business_profile_id),
  KEY idx_type (asset_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Delivery Tracking
CREATE TABLE IF NOT EXISTS sarga_delivery_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  job_id INT,
  courier_name VARCHAR(100),
  tracking_number VARCHAR(100),
  tracking_url TEXT,
  status ENUM('dispatched','in_transit','out_for_delivery','delivered','exception') DEFAULT 'dispatched',
  estimated_delivery DATE,
  delivered_at TIMESTAMP NULL,
  last_checked TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES sarga_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE SET NULL,
  KEY idx_tracking (tracking_number),
  KEY idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed product finishes
INSERT IGNORE INTO product_finishes (name, category, description, unit_price, price_type) VALUES
('Matte Lamination', 'lamination', 'Soft matte finish coating', 0.50, 'per_unit'),
('Glossy Lamination', 'lamination', 'Shiny glossy finish coating', 0.50, 'per_unit'),
('Gold Foil Stamping', 'foil', 'Premium hot gold foil stamping', 2.00, 'per_unit'),
('Silver Foil Stamping', 'foil', 'Elegant silver hot foil stamping', 2.00, 'per_unit'),
('Spot UV Coating', 'uv', 'High-gloss spot UV highlights', 1.50, 'per_unit'),
('Embossing', 'embossing', 'Raised 3D embossed effect', 3.00, 'per_unit'),
('Debossing', 'embossing', 'Indented debossed effect', 3.00, 'per_unit'),
('Spiral Binding', 'binding', 'Metal spiral wire binding', 15.00, 'flat'),
('Perfect Binding', 'binding', 'Professional glued perfect binding', 25.00, 'flat'),
('Saddle Stitching', 'binding', 'Stapled saddle stitch binding', 5.00, 'flat');

-- Seed express production rules
INSERT IGNORE INTO express_production_rules (product_category, turnaround_3hr, turnaround_today, turnaround_tomorrow, max_qty_3hr, max_qty_today, max_qty_tomorrow) VALUES
('Business Cards', 1, 1, 1, 100, 500, 2000),
('ID Cards', 1, 1, 1, 50, 200, 1000),
('Flyers', 0, 1, 1, 0, 200, 1000),
('Rubber Stamps', 1, 1, 1, 10, 50, 200),
('Banners', 0, 1, 1, 0, 10, 50),
('Certificates', 1, 1, 1, 100, 500, 2000);

-- Website/Google Reviews Table
CREATE TABLE IF NOT EXISTS sarga_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reviewer_name VARCHAR(150) NOT NULL,
  profile_image_url VARCHAR(255) DEFAULT '',
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  review_date TIMESTAMP NULL DEFAULT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  google_review_id VARCHAR(255) UNIQUE DEFAULT NULL,
  is_featured TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_active (is_active),
  KEY idx_featured (is_featured),
  KEY idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Website Inquiries Table
CREATE TABLE IF NOT EXISTS sarga_website_inquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100) DEFAULT NULL,
  service VARCHAR(100) DEFAULT NULL,
  message TEXT NOT NULL,
  branch VARCHAR(50) DEFAULT 'Perambra',
  status ENUM('New', 'Contacted', 'Closed') DEFAULT 'New',
  internal_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status (status),
  KEY idx_branch (branch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 017_quick_billing.sql  (2911 bytes)

```sql
-- Quick Shortcuts Table
CREATE TABLE IF NOT EXISTS sarga_quick_shortcuts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  display_name VARCHAR(150),
  category VARCHAR(100),
  subcategory VARCHAR(100),
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(50),
  branch_id INT DEFAULT NULL,
  status ENUM('active', 'inactive', 'archived') DEFAULT 'active',
  default_price DECIMAL(12,2) DEFAULT 0.00,
  pricing_mode ENUM('fixed', 'quantity', 'formula', 'tier', 'manual') DEFAULT 'fixed',
  pricing_formula TEXT,
  unit VARCHAR(20) DEFAULT 'pcs',
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  inventory_item_id INT DEFAULT NULL,
  expense_link VARCHAR(150),
  tags VARCHAR(255),
  auto_receipt BOOLEAN DEFAULT FALSE,
  auto_print BOOLEAN DEFAULT FALSE,
  auto_save BOOLEAN DEFAULT TRUE,
  auto_close BOOLEAN DEFAULT TRUE,
  keyboard_shortcut VARCHAR(20),
  sort_order INT DEFAULT 0,
  confirmation_required BOOLEAN DEFAULT FALSE,
  require_customer BOOLEAN DEFAULT FALSE,
  require_login_permission BOOLEAN DEFAULT FALSE,
  enable_offline BOOLEAN DEFAULT TRUE,
  enable_voice_trigger BOOLEAN DEFAULT TRUE,
  enable_barcode_trigger BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- Tier Pricing Configuration
CREATE TABLE IF NOT EXISTS sarga_quick_shortcut_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shortcut_id INT NOT NULL,
  min_qty DECIMAL(10,2) NOT NULL,
  max_qty DECIMAL(10,2),
  price DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (shortcut_id) REFERENCES sarga_quick_shortcuts(id) ON DELETE CASCADE
);

-- Usage Tracking for Analytics & Smart Suggestions
CREATE TABLE IF NOT EXISTS sarga_quick_shortcut_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shortcut_id INT NOT NULL,
  user_id INT NOT NULL,
  branch_id INT NOT NULL,
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_shortcut_user (shortcut_id, user_id, branch_id),
  FOREIGN KEY (shortcut_id) REFERENCES sarga_quick_shortcuts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

-- Role/Permission Overrides
CREATE TABLE IF NOT EXISTS sarga_quick_shortcut_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shortcut_id INT NOT NULL,
  role VARCHAR(50) NOT NULL,
  can_use BOOLEAN DEFAULT TRUE,
  can_edit_price BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (shortcut_id) REFERENCES sarga_quick_shortcuts(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_shortcut_role (shortcut_id, role)
);
```

#### 018_daily_book_automation.sql  (1610 bytes)

```sql
-- Schema for Daily Book Automation System

CREATE TABLE IF NOT EXISTS sarga_daily_report_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  is_enabled TINYINT(1) DEFAULT 1,
  send_time TIME DEFAULT '20:00:00',
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  days_of_week VARCHAR(20) DEFAULT '1,2,3,4,5,6', -- 1=Mon, 6=Sat
  recipients_admin TEXT DEFAULT NULL,
  recipients_accounts TEXT DEFAULT NULL,
  recipients_cc TEXT DEFAULT NULL,
  recipients_bcc TEXT DEFAULT NULL,
  branch_overrides JSON DEFAULT NULL, -- { "Perambra": "branch1@sarga.com", "Meppayur": "branch2@sarga.com" }
  format_pdf TINYINT(1) DEFAULT 1,
  format_excel TINYINT(1) DEFAULT 1,
  format_html TINYINT(1) DEFAULT 1,
  retry_enabled TINYINT(1) DEFAULT 1,
  max_retries INT DEFAULT 3,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_daily_report_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_date DATE NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  status ENUM('Running', 'Success', 'Failed', 'Retrying') NOT NULL DEFAULT 'Running',
  recipients TEXT DEFAULT NULL,
  file_url_pdf VARCHAR(255) DEFAULT NULL,
  file_url_excel VARCHAR(255) DEFAULT NULL,
  error TEXT DEFAULT NULL,
  retry_count INT DEFAULT 0,
  execution_ms INT DEFAULT NULL
);

-- Pre-seed default settings
INSERT INTO sarga_daily_report_settings (is_enabled, send_time, timezone)
SELECT 1, '20:00:00', 'Asia/Kolkata'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sarga_daily_report_settings);
```

#### 019_performance_indexes.sql  (1428 bytes)

```sql
-- Performance indexes for frequently queried tables
CREATE INDEX idx_staff_user_id ON sarga_staff (user_id);
CREATE INDEX idx_staff_branch_role ON sarga_staff (branch_id, role);
CREATE INDEX idx_staff_is_active ON sarga_staff (is_active);
CREATE INDEX idx_payments_date_branch ON sarga_payments (payment_date, branch_id);
CREATE INDEX idx_payments_type_date ON sarga_payments (type, payment_date);
CREATE INDEX idx_payments_vendor_date ON sarga_payments (vendor_id, payment_date);
CREATE INDEX idx_jobs_created_status ON sarga_jobs (created_at, status);
CREATE INDEX idx_jobs_customer_status ON sarga_jobs (customer_id, status);
CREATE INDEX idx_jobs_branch_status ON sarga_jobs (branch_id, status);
CREATE INDEX idx_jobs_created_branch ON sarga_jobs (created_at, branch_id);
CREATE INDEX idx_customers_mobile ON sarga_customers (mobile);
CREATE INDEX idx_customers_branch_type ON sarga_customers (branch_id, type);
CREATE INDEX idx_products_subcategory ON sarga_products (subcategory_id);
CREATE INDEX idx_products_is_active ON sarga_products (is_active);
CREATE INDEX idx_inventory_category ON sarga_inventory (category);
CREATE INDEX idx_paper_stock_branch ON paper_stock_summary (branch_id);
CREATE INDEX idx_paper_type_active ON paper_types (is_active);
CREATE INDEX idx_stock_requests_status ON sarga_stock_requests (status);
CREATE INDEX idx_stock_requests_branch ON sarga_stock_requests (from_branch_id, to_branch_id);
```

#### 020_shortcuts_v2.sql  (1280 bytes)

```sql
-- Shortcuts Templates Table
CREATE TABLE IF NOT EXISTS sarga_shortcut_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type ENUM('product', 'customer', 'payment', 'full_transaction') NOT NULL,
  payload JSON NOT NULL,
  icon VARCHAR(50) DEFAULT 'Zap',
  shortcut_key VARCHAR(20) DEFAULT NULL,
  usage_count INT DEFAULT 0,
  isPinned BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Shortcuts Usage Tracking Table
CREATE TABLE IF NOT EXISTS sarga_shortcut_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shortcut_id INT NOT NULL,
  user_id INT NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shortcut_id) REFERENCES sarga_shortcut_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

-- Shortcuts Categories Table
CREATE TABLE IF NOT EXISTS sarga_shortcut_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

-- Insert default categories if not exist
INSERT IGNORE INTO sarga_shortcut_categories (name) VALUES 
('Photostat'),
('Customer'),
('Payment'),
('Printout'),
('Lamination'),
('ID Card');
```

#### 021_add_customer_client_type.sql  (231 bytes)

```sql
-- Add client_type and internal_branch columns to sarga_customers
ALTER TABLE sarga_customers ADD COLUMN client_type VARCHAR(50) DEFAULT 'customer';
ALTER TABLE sarga_customers ADD COLUMN internal_branch VARCHAR(100) DEFAULT NULL;
```

#### 022_add_description_to_credit_transactions.sql  (239 bytes)

```sql
-- This migration is handled programmatically in database.js
-- to avoid DELIMITER / multi-statement limitations in Aiven MySQL.
--
-- ALTER TABLE sarga_daily_credit_transactions
--   ADD COLUMN description VARCHAR(500) NULL AFTER amount;
```

#### 022b_bill_shortcuts.sql  (1348 bytes)

```sql
-- Bill Shortcuts feature (also in migrations/022_bill_shortcuts.sql)
CREATE TABLE IF NOT EXISTS bill_shortcuts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  product_id INT NULL,
  price DECIMAL(10,2) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'page',
  customer_type ENUM('walk_in','regular','credit') NOT NULL DEFAULT 'walk_in',
  payment_mode ENUM('cash','upi','card','credit') NOT NULL DEFAULT 'cash',
  icon_name VARCHAR(50) NOT NULL DEFAULT 'bolt',
  color VARCHAR(20) NOT NULL DEFAULT 'purple',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bill_shortcuts_branch (branch_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shortcut_suggestions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_branch_id INT NOT NULL,
  target_branch_id INT NOT NULL,
  shortcut_data JSON NOT NULL,
  suggested_by INT NOT NULL,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shortcut_suggestions_target (target_branch_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 023_fix_credit_transactions_columns.sql  (235 bytes)

```sql
-- This migration is handled programmatically in database.js
-- to avoid DELIMITER / multi-statement limitations in Aiven MySQL.
--
-- ALTER TABLE sarga_daily_credit_transactions
--   ADD COLUMN customer_id INT NULL AFTER description;
```

#### 023b_missing_indexes.sql  (754 bytes)

```sql
-- 023_missing_indexes.sql
-- Missing indexes identified during performance audit to resolve table scans.

-- 1. Index for expenses-extended.js inventory lookup (LOWER name)
-- Since LOWER(name) is used, we add a function-based index (MySQL 8.0.13+)
CREATE INDEX idx_inventory_lower_name ON sarga_inventory (name);

-- 2. Index for staffDashboard.js monthly attendance lookups
CREATE INDEX idx_staff_attendance_month ON sarga_staff_attendance (staff_id, attendance_date);

-- 3. Index for dailyReportUnified.js payment summary
CREATE INDEX idx_customer_payments_date_branch_book ON sarga_customer_payments (payment_date, branch_id, book_type);

-- 4. Index for dailyReportUnified.js jobs join
CREATE INDEX idx_jobs_payment_id ON sarga_jobs (payment_id);
```

#### 024_dynamic_tables.sql  (16934 bytes)

```sql
-- Centralized Dynamic Tables Migration
-- Consolidates all tables previously created dynamically by routes/helpers/scripts.

-- 1. Quotes Tables
CREATE TABLE IF NOT EXISTS sarga_quotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_number VARCHAR(30) NOT NULL UNIQUE,
    customer_id INT,
    customer_name VARCHAR(150),
    customer_mobile VARCHAR(20),
    customer_email VARCHAR(150),
    customer_address TEXT,
    customer_gst VARCHAR(30),
    date DATE NOT NULL,
    valid_until DATE,
    status ENUM('draft','sent','accepted','rejected','expired','converted') DEFAULT 'draft',
    notes TEXT,
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    converted_invoice_id INT,
    branch_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_quote_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (quote_id) REFERENCES sarga_quotes(id) ON DELETE CASCADE
);

-- 2. Products / Links Tables
CREATE TABLE IF NOT EXISTS sarga_product_image_requests (
    id INT NOT NULL AUTO_INCREMENT,
    product_id INT NOT NULL,
    current_image_url VARCHAR(255) DEFAULT NULL,
    proposed_image_url VARCHAR(255) NOT NULL,
    requested_by INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    admin_note TEXT NULL,
    requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_product_status (product_id, status),
    KEY idx_status_requested_at (status, requested_at),
    CONSTRAINT fk_product_image_requests_product
        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sarga_product_links (
    id INT NOT NULL AUTO_INCREMENT,
    product_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_product_links_product (product_id),
    CONSTRAINT fk_product_links_product
        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sarga_product_update_requests (
    id INT NOT NULL AUTO_INCREMENT,
    product_id INT NOT NULL,
    current_data LONGTEXT NULL,
    proposed_data LONGTEXT NOT NULL,
    requested_by INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    admin_note TEXT NULL,
    requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_product_update_status (product_id, status),
    KEY idx_update_status_requested_at (status, requested_at),
    CONSTRAINT fk_product_update_requests_product
        FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Password Reset
CREATE TABLE IF NOT EXISTS sarga_password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

-- 4. Invoice Features & Seeding
CREATE TABLE IF NOT EXISTS sarga_invoice_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL UNIQUE,
    status ENUM('draft','pending','sent','paid','partially_paid','overdue','cancelled','refunded','on_hold') DEFAULT 'draft',
    due_date DATE,
    sent_at DATETIME,
    sent_to_email VARCHAR(150),
    paid_at DATETIME,
    is_overdue BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES sarga_customer_payments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_recurring_invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    customer_name VARCHAR(150),
    customer_mobile VARCHAR(20),
    customer_email VARCHAR(150),
    frequency ENUM('daily','weekly','monthly','quarterly','annually') NOT NULL,
    items JSON,
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    next_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    last_generated_at DATETIME,
    branch_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_payment_modes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_tax_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rate DECIMAL(5,2) NOT NULL,
    type ENUM('percentage','fixed') DEFAULT 'percentage',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    applies_to ENUM('all','product','service') DEFAULT 'all',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_company_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_i18n_overrides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    locale VARCHAR(10) NOT NULL DEFAULT 'en',
    message_key VARCHAR(200) NOT NULL,
    message_value TEXT NOT NULL,
    UNIQUE KEY uq_locale_key (locale, message_key)
);

INSERT IGNORE INTO sarga_payment_modes (name, description, is_default, sort_order) VALUES
    ('Cash', 'Cash payment', TRUE, 1),
    ('UPI', 'UPI payment', FALSE, 2),
    ('Bank Transfer', 'Bank/NEFT/RTGS transfer', FALSE, 3),
    ('Cheque', 'Cheque payment', FALSE, 4),
    ('Credit', 'Credit/Due payment', FALSE, 5);

INSERT IGNORE INTO sarga_tax_settings (name, rate, is_default, applies_to) VALUES
    ('GST 5%', 5, FALSE, 'all'),
    ('GST 12%', 12, FALSE, 'all'),
    ('GST 18%', 18, TRUE, 'all'),
    ('GST 28%', 28, FALSE, 'all'),
    ('No Tax', 0, FALSE, 'all');

INSERT IGNORE INTO sarga_company_settings (setting_key, setting_value) VALUES
    ('company_name', 'Sarga Offset'),
    ('company_address', ''),
    ('company_phone', ''),
    ('company_email', ''),
    ('company_gst', ''),
    ('company_logo_url', ''),
    ('invoice_prefix', 'INV'),
    ('invoice_footer_text', 'Thank you for your business!'),
    ('invoice_terms', 'Payment due within 30 days.'),
    ('default_currency', 'INR'),
    ('default_language', 'en');

ALTER TABLE sarga_customer_payments ADD COLUMN converted_from_quote INT DEFAULT NULL;

-- 5. Customer OTP & Website Chat
CREATE TABLE IF NOT EXISTS sarga_customer_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_website_chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(50),
    user_message TEXT,
    bot_response TEXT,
    rule_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. AI Anomaly Behaviour Profile
CREATE TABLE IF NOT EXISTS sarga_staff_behavior_profile (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT NOT NULL UNIQUE,
    avg_login_hour DECIMAL(5,2) DEFAULT 0,
    std_login_hour DECIMAL(5,2) DEFAULT 0,
    avg_discount_pct DECIMAL(5,2) DEFAULT 0,
    std_discount_pct DECIMAL(5,2) DEFAULT 0,
    avg_order_value DECIMAL(12,2) DEFAULT 0,
    std_order_value DECIMAL(12,2) DEFAULT 0,
    avg_daily_actions INT DEFAULT 0,
    std_daily_actions INT DEFAULT 0,
    known_devices TEXT,
    last_computed TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

-- 7. Inventory to Paper Inventory Mapping
CREATE TABLE IF NOT EXISTS sarga_inventory_to_paper_inventory (
  inventory_item_id INT NOT NULL,
  paper_item_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (inventory_item_id, paper_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Three Books System Tables
CREATE TABLE IF NOT EXISTS sarga_machines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    machine_name VARCHAR(150) NOT NULL,
    machine_type ENUM('Offset', 'Digital', 'Binding', 'Lamination', 'Cutting', 'Other') NOT NULL,
    machine_category VARCHAR(30) DEFAULT NULL,
    counter_type ENUM('Manual', 'Automatic') DEFAULT 'Manual',
    branch_id INT NOT NULL,
    location VARCHAR(200),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

-- sarga_machine_readings is already defined in 010_machines.sql
-- Add generated total_copies column (safe: ignored by ER_DUP_FIELDNAME if already exists)
ALTER TABLE sarga_machine_readings
  ADD COLUMN total_copies INT AS (closing_count - opening_count) STORED;

CREATE TABLE IF NOT EXISTS sarga_daily_report_offset (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_date DATE NOT NULL,
    branch_id INT NOT NULL,
    opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    closing_balance DECIMAL(12, 2) DEFAULT 0,
    total_collected DECIMAL(12, 2) DEFAULT 0,
    total_expenses DECIMAL(12, 2) DEFAULT 0,
    total_credit_out DECIMAL(12, 2) DEFAULT 0,
    total_credit_in DECIMAL(12, 2) DEFAULT 0,
    status ENUM('Draft', 'Finalized') DEFAULT 'Draft',
    created_by INT NOT NULL,
    finalized_by INT,
    finalized_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
    FOREIGN KEY (finalized_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
    UNIQUE KEY unique_branch_date (branch_id, report_date)
);

CREATE TABLE IF NOT EXISTS sarga_daily_work_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    work_name VARCHAR(200) NOT NULL,
    work_details TEXT,
    payment_type ENUM('Cash', 'UPI', 'Both', 'Credit') NOT NULL,
    cash_amount DECIMAL(12, 2) DEFAULT 0,
    upi_amount DECIMAL(12, 2) DEFAULT 0,
    amount_collected DECIMAL(12, 2) NOT NULL,
    remarks TEXT,
    entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_daily_expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    expense_description VARCHAR(200) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    payment_method ENUM('Cash', 'UPI', 'Both') DEFAULT 'Cash',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_daily_credit_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    transaction_type ENUM('Credit Out', 'Credit In') NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20),
    amount DECIMAL(12, 2) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES sarga_daily_report_offset(id) ON DELETE CASCADE
);

-- sarga_daily_report_machine is already defined in 010_machines.sql
-- Add generated total_copies column (safe: ignored by ER_DUP_FIELDNAME if already exists)
ALTER TABLE sarga_daily_report_machine
  ADD COLUMN total_copies INT AS (closing_count - opening_count) STORED;

CREATE TABLE IF NOT EXISTS sarga_machine_work_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    work_details TEXT NOT NULL,
    copies INT NOT NULL,
    payment_type ENUM('Cash', 'UPI', 'Credit') NOT NULL,
    cash_amount DECIMAL(12, 2) DEFAULT 0,
    upi_amount DECIMAL(12, 2) DEFAULT 0,
    credit_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL,
    remarks TEXT,
    entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES sarga_daily_report_machine(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_machine_credit_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    movement_type ENUM('Cash In', 'Cash Out') NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES sarga_daily_report_machine(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_credit_customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20),
    credit_limit DECIMAL(12, 2) DEFAULT 0,
    current_balance DECIMAL(12, 2) DEFAULT 0,
    branch_id INT NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_credit_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    credit_customer_id INT NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type ENUM('Credit Given', 'Payment Received', 'Adjustment') NOT NULL,
    debit_amount DECIMAL(12, 2) DEFAULT 0,
    credit_amount DECIMAL(12, 2) DEFAULT 0,
    balance_after DECIMAL(12, 2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id INT,
    description TEXT,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (credit_customer_id) REFERENCES sarga_credit_customers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
    INDEX idx_customer_date (credit_customer_id, transaction_date)
);

-- 9. Refunds Table
CREATE TABLE IF NOT EXISTS sarga_refunds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    customer_id INT,
    idempotency_key VARCHAR(100) UNIQUE,
    refund_amount DECIMAL(12,2) NOT NULL,
    refund_method ENUM('Cash','UPI','Cheque','Account Transfer') DEFAULT 'Cash',
    reason TEXT,
    processed_by INT,
    branch_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE SET NULL,
    FOREIGN KEY (processed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL
);

-- 10. Safe column additions (individual statements; database.js ignores ER_DUP_FIELDNAME)
ALTER TABLE sarga_staff_attendance ADD COLUMN in_time TIME;
ALTER TABLE sarga_staff_attendance ADD COLUMN out_time TIME;
ALTER TABLE sarga_staff_attendance ADD COLUMN work_hours DECIMAL(4,2);
ALTER TABLE sarga_jobs ADD COLUMN entry_date DATE;
ALTER TABLE sarga_jobs ADD COLUMN due_date_original DATE;
ALTER TABLE sarga_jobs ADD COLUMN workbook_remarks TEXT;
ALTER TABLE sarga_jobs ADD COLUMN priority ENUM('Low','Medium','High','Urgent') DEFAULT 'Medium';
```

#### 025_inventory_movement_log.sql  (967 bytes)

```sql
-- Inventory movement log for branch-level stock tracking
CREATE TABLE IF NOT EXISTS sarga_inventory_movement_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id INT NOT NULL,
  branch_id INT NOT NULL,
  movement_type ENUM('Transfer In', 'Transfer Out', 'Adjustment', 'Purchase', 'Consumption') NOT NULL,
  quantity_change DECIMAL(10, 2) NOT NULL,
  quantity_before DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quantity_after DECIMAL(10, 2) NOT NULL DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id INT,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_item_id) REFERENCES sarga_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL,
  INDEX idx_item_branch (inventory_item_id, branch_id),
  INDEX idx_movement_type (movement_type),
  INDEX idx_created_at (created_at)
);
```

#### 026_machine_health.sql  (446 bytes)

```sql
ALTER TABLE sarga_machines ADD COLUMN last_polled_at TIMESTAMP NULL;
ALTER TABLE sarga_machines ADD COLUMN health_status ENUM('healthy', 'warning', 'critical', 'unknown') DEFAULT 'unknown';
ALTER TABLE sarga_machines ADD COLUMN last_meter_value INT DEFAULT NULL;
ALTER TABLE sarga_machine_readings ADD COLUMN sync_source ENUM('manual', 'mpr', 'auto') DEFAULT 'manual';
ALTER TABLE sarga_machine_readings ADD COLUMN sync_timestamp TIMESTAMP NULL;
```

#### 027_extraction_logs.sql  (1095 bytes)

```sql
CREATE TABLE IF NOT EXISTS sarga_bill_extraction_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_document_id INT,
  extraction_type VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  extracted_value TEXT,
  confidence_score DECIMAL(5, 2) DEFAULT 0,
  is_corrected TINYINT(1) DEFAULT 0,
  corrected_value TEXT,
  corrected_by INT,
  corrected_at TIMESTAMP NULL,
  ocr_engine VARCHAR(50) DEFAULT 'paddleocr',
  processing_time_ms INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_document_id) REFERENCES sarga_bills_documents(id) ON DELETE CASCADE,
  INDEX idx_bill_doc (bill_document_id),
  INDEX idx_field (field_name)
);

ALTER TABLE sarga_bills_documents ADD COLUMN extraction_confidence DECIMAL(5, 2) DEFAULT NULL;
ALTER TABLE sarga_bills_documents ADD COLUMN extraction_status ENUM('pending', 'processing', 'completed', 'failed', 'manual') DEFAULT 'pending';
ALTER TABLE sarga_bills_documents ADD COLUMN extraction_errors TEXT;
ALTER TABLE sarga_bills_documents ADD COLUMN manual_correction_required TINYINT(1) DEFAULT 0;
```

#### 028_product_request_enhancements.sql  (697 bytes)

```sql
-- SQL Schema Migration: Enhancements for product update requests to support ADD and DELETE operations.
-- Drops foreign key constraint, modifies product_id to nullable, re-adds foreign key (ON DELETE SET NULL), and adds request_type column.

ALTER TABLE sarga_product_update_requests DROP FOREIGN KEY fk_product_update_requests_product;
ALTER TABLE sarga_product_update_requests MODIFY product_id INT NULL;
ALTER TABLE sarga_product_update_requests ADD CONSTRAINT fk_product_update_requests_product FOREIGN KEY (product_id) REFERENCES sarga_products(id) ON DELETE SET NULL;

ALTER TABLE sarga_product_update_requests ADD COLUMN request_type ENUM('add', 'edit', 'delete') NOT NULL DEFAULT 'edit';
```

#### 029_sheets_backup.sql  (78 bytes)

```sql
-- Removed to adhere to simplified backup requirements and prevent conflicts.
```

#### 029b_sheets_backup_jobs.sql  (397 bytes)

```sql
CREATE TABLE IF NOT EXISTS sarga_backup_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  triggered_by ENUM('cron', 'manual') NOT NULL DEFAULT 'cron',
  status ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  tables_backed_up INT DEFAULT 0,
  rows_written INT DEFAULT 0,
  error_message TEXT NULL
);
```

#### 030_sheets_backup_hardening.sql  (78 bytes)

```sql
-- Removed to adhere to simplified backup requirements and prevent conflicts.
```

#### 031_product_hierarchy.sql  (657 bytes)

```sql
-- Migration 031: Create product_hierarchy table
-- This table was missing from the database causing startup WARNING and potential 520 errors.
-- The table is checked at startup in server/index.js (SHOW TABLES LIKE 'product_hierarchy').

CREATE TABLE IF NOT EXISTS product_hierarchy (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100) DEFAULT NULL,
  item_type VARCHAR(100) DEFAULT NULL,
  display_order INT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### 032_invoice_performance_indexes.sql  (520 bytes)

```sql
-- 032_invoice_performance_indexes.sql
-- Composite index for customer payments ORDER BY (payment_date DESC, created_at DESC)
CREATE INDEX idx_cp_payment_created ON sarga_customer_payments (payment_date, created_at);

-- Index for is_internal filter (used by Invoices page and other customer payment listings)
CREATE INDEX idx_cp_is_internal ON sarga_customer_payments (is_internal);

-- Index for payment_id on sarga_invoices (LEFT JOIN performance)
CREATE INDEX idx_invoices_payment_id ON sarga_invoices (payment_id);
```

#### 033_query_performance_indexes.sql  (1248 bytes)

```sql
-- 033_query_performance_indexes.sql
-- Indexes to optimize /api/inventory, /api/jobs, /api/staff query performance
-- Target: all three endpoints consistently under 300ms

-- === Inventory (GET /api/inventory) ===
-- ORDER BY i.created_at DESC, i.id ASC — composite covering sort order
CREATE INDEX idx_inventory_created_id ON sarga_inventory (created_at, id);

-- LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
CREATE INDEX idx_products_inventory_item ON sarga_products (inventory_item_id);

-- LEFT JOIN sarga_product_images spi ON i.id = spi.inventory_item_id
CREATE INDEX idx_product_images_inventory_item ON sarga_product_images (inventory_item_id);

-- WHERE bs.inventory_item_id IN (?) secondary query
CREATE INDEX idx_branch_stock_item ON sarga_branch_stock (inventory_item_id);

-- === Jobs (GET /api/jobs) ===
-- EXISTS / correlated subquery for staff assignments
CREATE INDEX idx_job_staff_assignments_job_staff_role ON sarga_job_staff_assignments (job_id, staff_id, role, status);

-- WHERE j.delivery_date < NOW() for overdue tab
CREATE INDEX idx_jobs_delivery_date ON sarga_jobs (delivery_date);

-- === Staff (GET /api/staff) ===
-- ORDER BY s.created_at DESC
CREATE INDEX idx_staff_created ON sarga_staff (created_at);
```

#### 038_create_product_images_table.sql  (343 bytes)

```sql
CREATE TABLE IF NOT EXISTS sarga_product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_item_id INT NOT NULL,
    image_url TEXT,
    source VARCHAR(50),
    confidence INT DEFAULT 0,
    is_locked TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_inventory_item (inventory_item_id)
);
```

#### 039_update_vendor_category_enum.sql  (158 bytes)

```sql
ALTER TABLE vendors MODIFY COLUMN category ENUM('offset_supplies','chemicals','paper','ink','equipment','frame','memento','id_card','other') DEFAULT 'other';
```

#### 040_dashboard_performance_indexes.sql  (690 bytes)

```sql
-- 040_dashboard_performance_indexes.sql
-- Composite indexes for GET /api/stats/dashboard queries
-- Target: each dashboard query under 500ms (was ~5.2s)

-- Jobs dashboard queries filter by branch_id, created_at date ranges, and status != 'Cancelled'
CREATE INDEX idx_jobs_branch_created_status ON sarga_jobs (branch_id, created_at, status);

-- Customer payments dashboard queries filter by branch_id and payment_date
CREATE INDEX idx_cp_branch_payment_date ON sarga_customer_payments (branch_id, payment_date);

-- Expense (sarga_payments) dashboard queries filter by branch_id and payment_date
CREATE INDEX idx_payments_branch_payment_date ON sarga_payments (branch_id, payment_date);
```

#### 041_erp_enhancements.sql  (4747 bytes)

```sql
-- ERP Enhancements: Multi-branch staff, Accountant restrictions, Consumables rate history

-- 1. Staff Branch Assignments (multi-branch)
CREATE TABLE IF NOT EXISTS staff_branch_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  branch_id INT NOT NULL,
  is_primary TINYINT(1) DEFAULT 0,
  permissions JSON DEFAULT NULL,
  assigned_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_branch (staff_id, branch_id),
  FOREIGN KEY (staff_id) REFERENCES sarga_staff(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- 2. Enhance consumables_inventory with paper-like specs
ALTER TABLE consumables_inventory
  ADD COLUMN gsm INT DEFAULT NULL AFTER unit,
  ADD COLUMN size_name VARCHAR(50) DEFAULT NULL AFTER gsm,
  ADD COLUMN brand VARCHAR(100) DEFAULT NULL AFTER size_name,
  ADD COLUMN finish VARCHAR(50) DEFAULT NULL AFTER brand,
  ADD COLUMN color VARCHAR(50) DEFAULT NULL AFTER finish,
  ADD COLUMN supplier_id INT DEFAULT NULL AFTER supplier_name,
  ADD COLUMN sku VARCHAR(100) DEFAULT NULL AFTER notes,
  ADD COLUMN min_stock_level DECIMAL(12,3) DEFAULT NULL AFTER reorder_level,
  ADD COLUMN max_stock_level DECIMAL(12,3) DEFAULT NULL AFTER min_stock_level,
  ADD COLUMN location VARCHAR(100) DEFAULT NULL AFTER max_stock_level;

-- 3. Consumable Rate History / Versioning
CREATE TABLE IF NOT EXISTS consumable_rate_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consumable_id INT NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  effective_date DATE NOT NULL,
  supplier_name VARCHAR(255) DEFAULT NULL,
  supplier_id INT DEFAULT NULL,
  purchase_order_ref VARCHAR(100) DEFAULT NULL,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consumable_rate (consumable_id, effective_date DESC),
  FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- 4. Add current_rate_id to consumables_inventory (points to latest rate)
ALTER TABLE consumables_inventory
  ADD COLUMN current_rate_id INT DEFAULT NULL AFTER unit_cost,
  ADD FOREIGN KEY (current_rate_id) REFERENCES consumable_rate_history(id) ON DELETE SET NULL;

-- 5. Consumable Purchase History
CREATE TABLE IF NOT EXISTS consumable_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consumable_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  supplier_name VARCHAR(255) DEFAULT NULL,
  supplier_id INT DEFAULT NULL,
  purchase_date DATE NOT NULL,
  invoice_ref VARCHAR(100) DEFAULT NULL,
  branch_id INT DEFAULT NULL,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consumable_purchase (consumable_id, purchase_date DESC),
  FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- 6. Consumable Stock Adjustments - add new columns for better tracking
ALTER TABLE consumables_inventory_adjustments
  ADD COLUMN adjustment_type ENUM('INWARD','OUTWARD','WASTE','RETURN','TRANSFER') DEFAULT 'INWARD' AFTER consumable_id,
  ADD COLUMN branch_id INT DEFAULT NULL AFTER adjustment_type,
  ADD COLUMN reference_type VARCHAR(50) DEFAULT NULL AFTER reason,
  ADD COLUMN reference_id INT DEFAULT NULL AFTER reference_type,
  ADD FOREIGN KEY (branch_id) REFERENCES sarga_branches(id) ON DELETE SET NULL;

-- 7. Update paper_stock_movements to support TRANSFER_OUT and TRANSFER_IN
ALTER TABLE paper_stock_movements
  MODIFY COLUMN movement_type ENUM('INWARD','OUTWARD','ADJUSTMENT','TRANSFER','TRANSFER_OUT','TRANSFER_IN') NOT NULL;

-- 8. Add consumable_cost column to sarga_jobs
ALTER TABLE sarga_jobs
  ADD COLUMN consumable_cost DECIMAL(14,2) DEFAULT 0 AFTER paper_cost;

-- 9. Job consumables usage tracking
CREATE TABLE IF NOT EXISTS job_consumable_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  consumable_id INT NOT NULL,
  quantity_used DECIMAL(12,3) NOT NULL,
  rate_at_time DECIMAL(12,2) NOT NULL,
  total_cost DECIMAL(14,2) NOT NULL,
  unit VARCHAR(20) DEFAULT NULL,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_consumable (job_id, consumable_id),
  FOREIGN KEY (job_id) REFERENCES sarga_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (consumable_id) REFERENCES consumables_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);
```

#### 043_performance_indexes_phase2.sql  (985 bytes)

```sql
-- 043_performance_indexes_phase2.sql
-- Additional composite indexes for dashboard and job assignment queries
-- Target: dashboard wall-clock under 800ms

-- Jobs dashboard: DATE(updated_at) = ? for completed_today count
CREATE INDEX idx_jobs_updated_at ON sarga_jobs (updated_at);

-- Jobs dashboard: delivery_date < ? AND status NOT IN ('Delivered', 'Cancelled') for overdue count
-- Also covers urgent_today: priority = 'Urgent' AND DATE(delivery_date) = ?
CREATE INDEX idx_jobs_delivery_status ON sarga_jobs (delivery_date, status);

-- Staff productivity: DATE(ja.created_at) >= ? GROUP BY staff_id
CREATE INDEX idx_job_assignments_created_staff ON sarga_job_assignments (created_at, staff_id);

-- Machine readings: DATE(mr.reading_date) = ? for today's machine stats
CREATE INDEX idx_machine_readings_date ON sarga_machine_readings (reading_date);

-- Fraud alerts: fa.status = 'ACTIVE' for monitoring stats
CREATE INDEX idx_fraud_alerts_status ON sarga_fraud_alerts (status);
```

#### 045_enterprise_audit.sql  (2566 bytes)

```sql
CREATE TABLE IF NOT EXISTS sarga_enterprise_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  audit_id VARCHAR(36) NOT NULL UNIQUE,
  timestamp TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  user_id_internal INT,
  username VARCHAR(100),
  employee_name VARCHAR(255),
  user_role VARCHAR(50),
  branch_id INT,
  branch_name VARCHAR(255),
  department VARCHAR(100),
  module VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  record_type VARCHAR(100),
  record_id VARCHAR(100),
  document_number VARCHAR(200),
  previous_values JSON,
  new_values JSON,
  changed_fields JSON,
  ip_address VARCHAR(45),
  device_name VARCHAR(255),
  browser VARCHAR(255),
  operating_system VARCHAR(255),
  session_id VARCHAR(255),
  api_endpoint VARCHAR(500),
  response_status INT,
  success TINYINT(1) DEFAULT 1,
  error_message TEXT,
  reason_remarks TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  duration_ms INT,
  previous_hash VARCHAR(64),
  current_hash VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_timestamp (timestamp),
  INDEX idx_audit_user (user_id_internal),
  INDEX idx_audit_branch (branch_id),
  INDEX idx_audit_module (module),
  INDEX idx_audit_action (action_type),
  INDEX idx_audit_record (record_id),
  INDEX idx_audit_success (success),
  INDEX idx_audit_document (document_number(100)),
  INDEX idx_audit_date (created_at)
);

CREATE TABLE IF NOT EXISTS sarga_audit_archive (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  original_id BIGINT NOT NULL,
  audit_id VARCHAR(36) NOT NULL UNIQUE,
  timestamp TIMESTAMP(6) NOT NULL,
  user_id_internal INT,
  username VARCHAR(100),
  employee_name VARCHAR(255),
  user_role VARCHAR(50),
  branch_id INT,
  branch_name VARCHAR(255),
  department VARCHAR(100),
  module VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  record_type VARCHAR(100),
  record_id VARCHAR(100),
  document_number VARCHAR(200),
  previous_values JSON,
  new_values JSON,
  changed_fields JSON,
  ip_address VARCHAR(45),
  device_name VARCHAR(255),
  browser VARCHAR(255),
  operating_system VARCHAR(255),
  session_id VARCHAR(255),
  api_endpoint VARCHAR(500),
  response_status INT,
  success TINYINT(1) DEFAULT 1,
  error_message TEXT,
  reason_remarks TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  duration_ms INT,
  previous_hash VARCHAR(64),
  current_hash VARCHAR(64) NOT NULL,
  archived_by INT,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_archive_audit_id (audit_id),
  INDEX idx_archive_date (archived_at)
);
```

#### 046_product_request_priority_notes.sql  (379 bytes)

```sql
-- Add priority, notes columns and Draft status to product update requests table
ALTER TABLE sarga_product_update_requests
ADD COLUMN priority ENUM('Low', 'Medium', 'High', 'Urgent') NOT NULL DEFAULT 'Medium',
ADD COLUMN notes TEXT NULL;

ALTER TABLE sarga_product_update_requests
MODIFY COLUMN status ENUM('draft', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending';
```

#### designer_workspace.sql  (2549 bytes)

```sql
CREATE TABLE IF NOT EXISTS sarga_design_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asset_name VARCHAR(255) NOT NULL,
    version INT DEFAULT 1,
    preview_url LONGTEXT,
    drive_link TEXT,
    internal_path TEXT,
    final_pdf_url TEXT,
    ai_design_url TEXT,
    editable_source_url TEXT,
    tags JSON,
    uploaded_by INT NOT NULL,
    is_archived TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_design_bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    due_date DATE,
    assigned_designer INT DEFAULT NULL,
    priority ENUM('Low', 'Normal', 'High', 'Urgent') DEFAULT 'Normal',
    status ENUM('Requested', 'Assigned', 'Designing', 'Review', 'Approved', 'Printed', 'Delivered') DEFAULT 'Requested',
    reference_files JSON,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_designer) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_block_journal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    block_number VARCHAR(100) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    block_type VARCHAR(50),
    created_by INT NOT NULL,
    assigned_to INT DEFAULT NULL,
    location VARCHAR(255),
    reuse_status ENUM('New', 'Reused', 'Archived') DEFAULT 'New',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES sarga_customers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES sarga_staff(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

-- Basic CMS Tables
CREATE TABLE IF NOT EXISTS sarga_cms_banners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    image_url LONGTEXT NOT NULL,
    link_url TEXT,
    is_active TINYINT(1) DEFAULT 1,
    position INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sarga_cms_announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    expires_at DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### sessions.sql  (911 bytes)

```sql
CREATE TABLE IF NOT EXISTS sarga_user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id_internal INT NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    refresh_token VARCHAR(255) DEFAULT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_revoked TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sarga_security_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id_internal INT,
    event_type VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE SET NULL
);
```

#### staff_portal.sql  (1296 bytes)

```sql
CREATE TABLE IF NOT EXISTS sarga_staff_leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id_internal INT NOT NULL,
    leave_type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    attachment_url VARCHAR(255),
    status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') DEFAULT 'Pending',
    reviewed_by INT DEFAULT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to INT NOT NULL,
    assigned_by INT NOT NULL,
    due_date DATE,
    status ENUM('Assigned', 'In Progress', 'Completed', 'Overdue') DEFAULT 'Assigned',
    priority ENUM('Low', 'Medium', 'High', 'Urgent') DEFAULT 'Medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES sarga_staff(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES sarga_staff(id) ON DELETE CASCADE
);
```


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

### Implementation Detail — exact GST & discount arithmetic

**Order of operations: discount is applied FIRST, GST SECOND** (both billing editors). Ground truth: `client/src/pages/CustomerPayments.jsx:642-661` and `GST_RATE = 0.18` in `client/src/constants/index.js:4`.

```
round2(n)       = Math.round(n * 100) / 100
subtotal        = round2(formData.total_amount)
gross           = round2(subtotal * (1 - effectiveDiscount / 100))   // discount on subtotal first
discountAmount  = round2(subtotal - gross)
net             = round2(gross / (1 + GST_RATE))                     // GST embedded, backed out of discounted gross
sgst = cgst     = round2(net * (GST_RATE / 2))                       // 9% + 9% at 18% rate, each rounded to 2 dp
```

- `effectiveDiscount` is forced to 0 unless discount ≤ 5%, OR discount > 5% backed by an **APPROVED** `sarga_discount_requests` row matching the percentage (CustomerPayments.jsx:648-654). Client sends `sgst_amount`/`cgst_amount`/`net_amount`/`discount_amount`; the server stores them verbatim (`customerPayments.js:307-341`) — it does not recompute tax.
- Walk-in quick billing (`client/src/pages/Billing.jsx:624-643`) stores NO GST (`sgst: 0, cgst: 0`): it does subtotal → discount → optional round-off (`Math.ceil(afterDiscount/10)*10` when `enableRoundOff`, else manual `roundOff`).
- Server quote path (`server/routes/pricing.js:272-295`) has no discount: `totalBeforeGST = subtotal + setupFee + finishesTotal`, then `calculateGST(totalBeforeGST, gstRate)` → `{ gst: amount*rate/100, total: amount+gst }`, and `cgst = sgst = roundTo(gst/2, 2)` with `roundTo(n,2) = Number(n.toFixed(2))` (pricing.js:291-294).
- Note: §11 above says "each 6% default" — that refers to the configurable `sarga_tax_settings` invoice path; the CustomerPayments/quote code paths use a hard constant of **18% (9% + 9%)**.

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

### Implementation Detail — optimizer algorithm (`client/src/utils/paperOptimizer.js`)

- `PAPER_SIZES` (mm, lines 14-48): A0–A7, B3–B5, Letter/Legal/Tabloid, Indian sizes (1/4 Demy 254×381, 1/8 Demy 190×254, Demy 508×762, Double Demy 508×762, Crown 381×508), Business Card 89×51, DL Envelope 110×220, SRA1/2/3 (640×900 / 450×640 / 320×450), 13x19 (330×483), 12x18 (305×457). `SHEET_SIZES` (line 51) = source sheets the `findBestSheetSize` recommendation scans.
- `countFit(sw,sh,iw,ih,bleed)` (lines 61-102): effective item = `(iw+bleed) × (ih+bleed)`; evaluates 4 placements — portrait, landscape, and two mixed strip-fill variants (`fitPortrait + max(fitRightStrip, fitBottomStrip)`, and the reverse) — returns the layout with max count.
- `optimizePaperUsage({sheetSize[,sheetW,sheetH], itemSize[,itemW,itemH], itemCount, bleed=0, doubleSide=false})` (lines 119-211):
  - Resolve sheet/item dims from `PAPER_SIZES` or Custom inputs; error if dims not positive or item larger than sheet.
  - `itemsPerSheet = best.count`; if `doubleSide`, each physical sheet prints 2× (`effectivePerSheet = itemsPerSheet * 2`).
  - `sheetsNeeded = Math.ceil(itemCount / effectivePerSheet)`; `totalPrinted = sheetsNeeded * effectivePerSheet`; `extraPrints = totalPrinted - itemCount`.
  - `sheetArea = sw*sh`; `usedAreaPerSheet = itemsPerSheet * (iw*ih)`; `wastePercent = round((sheetArea - usedAreaPerSheet)/sheetArea * 100, 1)`; `utilizationPercent = 100 - wastePercent`.
- `findBestSheetSize(...)` (lines 217-235) runs the same optimizer across `SHEET_SIZES` and returns options sorted by `wastePercent` ascending.
- Server mirror: `POST /api/ai/paper-layout` (`server/routes/paperLayout.js`) exposes this same optimization for the designer workspace.

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

### Implementation Detail — actual runtime vs schema (correction)

- **The dedicated credit tables are schema-only.** `sarga_machine_credit_movements`, `sarga_credit_customers`, `sarga_credit_ledger` are defined in `010_machines.sql` (also re-created/duplicated in `024_dynamic_tables.sql` and bootstrapped by `server/scripts/migrate-three-books.js:206,248,266`), but **no route/service reads or writes them at runtime**. The `POST /api/machines/credit-movements` endpoint listed above **does not exist** (verified: no `credit-movements` route in `server/routes/*`). There is **no interest computation and no aging model** for these tables anywhere in the code.
- What is actually implemented for credit at runtime:
  - **Job sale credit** — `POST /api/jobs` computes `balance_amount = total_amount - advance_paid` and `payment_status` = `Paid` (paid≥total) / `Partial` (paid>0) / `Unpaid` (jobs.js:929-930). `PUT /api/jobs/:id` recomputes the same (jobs.js:1827-1833).
  - **Payment allocation** — `POST /api/customer-payments` (customerPayments.js:508-565) splits an advance proportionally across unpaid jobs: `jobAdvance = advance * (jobBalance/totalBalance)` capped at the job balance, then `nextBalance = max(0, round((effectiveJobTotal - nextAdvance)*100)/100)`, with dust `<= 0.01` zeroed.
  - **Machine-work credit** — `POST /api/machines/:id/work` (machines.js:950) stores `credit_amount` per entry; the job→machine sync sets `credit_amount = balanceVal` (jobs.js:429) and daily `total_credit = SUM(credit_amount)` over the report (machines.js:1015).
  - **Daily-book credit movements** — `GET/POST/DELETE /api/daily-report/credits` (dailyReportUnified.js:1734-1778) operate on `sarga_daily_credit_transactions` (`Credit In`/`Credit Out`); closing cash = `cashOpening + totalCashIn + creditIn - totalCashOut - creditOut` (dailyReportUnified.js:1040-1058; same in dailyReports.js:295-314).
  - **Vendor credit (the only real aging)** — `GET /api/vendors/payables/summary` buckets unpaid invoices by `due_date`: current / 0-30 / 31-60 / 60+ days overdue (vendors.js:263-279); per-invoice days overdue = `DATEDIFF(CURDATE(), due_date)` (vendors.js:363); credit-limit warning on bill add when `opening+amount > credit_limit` with `dueDate = invoice_date + creditDays` (vendors.js:1581-1593).

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

### Implementation Detail — anomaly scoring (`server/helpers/anomalyDetection.js`)

- **Baselines** — `computeStaffBaselines()` (lines ~50-163) aggregates the last 30 days per staff into `sarga_staff_behavior_profile`: `avg/std_login_hour`, `avg/std_discount_pct` (prefer `sarga_discount_requests`, fall back to job discounts), `avg/std_order_value`, `avg/std_daily_actions`, `known_devices` (pipe-joined `device_info` from `sarga_staff_activity_log`). Upserted with `ON DUPLICATE KEY UPDATE`.
- **`checkLoginAnomaly`** (lines 170-216): `z = |zScore(loginHour, avg, sd)|`; `z > 2` → alert `UNUSUAL_LOGIN_TIME` with severity `HIGH` if `z > 3` else `MEDIUM` (defaults avg=9h, sd=2h). Device not in `known_devices` (and list non-empty) → `UNKNOWN_DEVICE`, severity `HIGH`.
- **`checkDiscountAnomaly`** (lines 221-267): `zDisc = zScore(discountPct, avgDisc, sdDisc)` (defaults avg 5%, sd 2%) — one-sided check `zDisc > 2` → `HIGH_DISCOUNT`, severity `CRITICAL` if `z > 3` else `HIGH`. `zOrd = zScore(orderValue, avg 500, sd 200)`, `zOrd > 2` → `HIGH_ORDER_VALUE`, `HIGH` if `z > 3` else `MEDIUM`.
- **`checkDeletionAnomaly`** (lines 272-287): ≥3 delete-like actions in 24h → `BULK_DELETION`, `CRITICAL` if ≥5 else `HIGH`.
- **`zScore` edge case**: when `sd = 0` it returns `3` if the value differs from the mean, else `0` (top of file); `mean/stdDev/zScore` are exported for tests.
- **`runFullAnalysis()`** (lines 312-371): recomputes baselines, then scans the last 24h of `LOGIN` audit rows, last 24h of `sarga_discount_requests`, and delete-like `sarga_audit_logs` grouped `HAVING cnt >= 3`; `saveAlerts()` bulk-inserts into `sarga_fraud_alerts` (staff_id, alert_type, severity, details JSON, message). This is the engine behind `GET /api/ai/monitoring/anomalies`.

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

### Implementation Detail — verified usage (grep of `process.env` / `import.meta.env`)

Documented above but **never read by code**: `GOOGLE_PLACE_ID`, `GOOGLE_PLACES_API_KEY`, `SMTP_FROM` (mailer reads `SMTP_HOST/PORT/USER/PASS` only), `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `ENABLE_ML`, `UPLOAD_RATE_LIMIT`, `RATE_LIMIT_WINDOW_MS`, `VITE_GOOGLE_CLIENT_ID`, `VITE_FIREBASE_MEASUREMENT_ID` (firebase.js reads the other six `VITE_FIREBASE_*` only).

Actually read but **missing from §28**: `DB_PASS` (mysqldump/auto-backup scripts), the full `PG_*` set (`PG_HOST/PORT/USER/PASSWORD/DATABASE/MAX_CLIENTS/IDLE_TIMEOUT_MS/CONN_TIMEOUT_MS` in `pg.js`), `SMTP_SECURE`, `GMAIL_PASS`, `EMAIL_USER`, `EMAIL_PASSWORD`, `COMPANY_NAME` (mailer sender name), `CHATBOT_MODEL`, `SESSION_CACHE_TTL`, `CACHE_ENABLED`, `ENCRYPTION_KEY` (CCTV/photo crypto), `DATABASE_URL` (whatsapp.js), `DEFAULT_REGION`, `ENABLE_DEV_TOKEN`, `LOG_LEVEL`, dynamic `BRANCH_EMAIL_<BRANCH>`.

Runtime gates that matter: `NODE_ENV` (production hides error stacks and skips devRoutes), and `GET /api/dev/token` only responds when `NODE_ENV=development` **and** `ENABLE_DEV_TOKEN=1` (devRoutes.js:40). Client reads its vars via Vite `import.meta.env` (`VITE_API_URL`, `VITE_API_BASE_URL`, `VITE_FIREBASE_*`, built-in `PROD`), not `process.env`.

Templates that exist: `server/env.example` (there is **no** `server/.env.example`), root `.env.example`/`.env.sample`/`.env.test.example`, `server/__tests__/.env.test.example`, `mcp-server/.env.example`, `portfolio-module/.env.example`. Test/e2e-only vars: `TEST_DB_*`, `SKIP_ML_TESTS`, `E2E_BASE_URL`, `CI`. MCP-server vars include `MCP_TRANSPORT`, `LOG_OUTPUT`, `CACHE_TTL_SECONDS`, `HTTP_PORT` (not listed above).

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
| auth | `/auth/login`, `/auth/logout`, `/auth/change-password`, `/auth/switch-branch` (current user is `GET /api/staff/me`, auth.js:171; there is NO `/auth/me` or `/auth/refresh`) |
| branches | `/branches` CRUD |
| staff | `/staff` CRUD, `/staff/:id/branches`, `/staff/my-branches`, `/staff/:id/reset-password` (salary/leaves/attendance handlers resolve via staffDashboard's shared mount; attendance-request & id-change handlers live in `requests.js` → `/requests/attendance`, `/requests/id-change`) |
| staffDashboard | mounted at `/api/staff` (index.js:462) sharing the mount with `staff` — `/staff/:id/work-history`, `/staff/:id/salary-info`, `/staff/:id/pay-salary`, `/staff/:id/salary-slip/:year_month`, `/staff/:id/attendance/:year_month`, `/staff/leaves` (no `/staff-dashboard/*` path) |
| staffPortal | `/staff-portal/*` (portal-specific) |
| customers | `/customers` + lookup/search, `/:id/**` |
| customerPayments | `/customer-payments` (idempotent), `POST /customer-payments/refund` |
| customerDesigns | `/customers/:id/designs`, `/jobs/:jobId/designs` |
| requests | `/requests*` |
| coupons | `/coupons*` |
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

```
### Implementation Detail — truth-checked corrections (vs `index.js` `registerRoute` + route files)

- **`auth`**: `/auth/me` and `/auth/refresh` DO NOT exist. The "me" endpoint is `GET /api/staff/me` (auth.js:171); there is no refresh endpoint. Real: login, logout, change-password, switch-branch.
- **`staffDashboard`** is mounted at `/api/staff` (index.js:461) and SHARES the mount with `staff` (index.js:460) — there is no `/api/staff-dashboard/*` path. Its handlers are `/staff/:id/work-history`, `/staff/:id/salary-info`, etc.
- **`customerDesigns`** serves `/customers/:id/designs` and `/jobs/:jobId/designs` (index.js:458) — NOT `/customer-designs*`.
- **`refunds` IS NOT a module** — there is no `routes/refunds.js` and no `registerRoute('refunds',…)`. Refunds are implemented as `POST /api/customer-payments/refund` inside customerPayments.js:742.
- **Attribution is loose**: attendance-request and id-change handlers live in `requests.js` (`/requests/attendance`, `/requests/id-change`) and `staffDashboard.js`, not `staff.js`. Most §10 customer sub-APIs live in customerPayments.js / customerDesigns.js / requests.js, not customers.js.
- **Dev routes**: `devRoutes` mounts at `/api/dev` ONLY when `NODE_ENV !== 'production'` (index.js:471-479). Endpoints: `GET /api/dev/inventory/consumables` (Admin-only after 2026-08-30 security fix; LIMIT 200), `GET /api/dev/token` (404 unless `NODE_ENV=development` AND `ENABLE_DEV_TOKEN=1`; mints a 1-hour Admin JWT), `GET /api/dev/metrics` (Admin-only; uptime/memory/cache stats).
- **Stub scan**: the first 10 modules checked (auth, branches, staff, staffDashboard, staffPortal, customers, customerPayments, customerDesigns, requests, coupons) have NO stubbed/dummy handlers — all real SQL/transactions. The only stub marker in all of `server/routes/` is `sheetsBackup.js:238` (restore disabled).

### Additional route-table mismatches (audited 2026-08-30; documented here, NOT yet corrected in the table above)

Known remaining inaccuracies from a full pass over the other ~61 rows (37 rows OK; 24 mismatch):

- **products**: `/products/hierarchy` doesn't exist — real is `/api/product-hierarchy` (jobs.js:1165).
- **paperInventory**: mounted `/api/paperInventory` (camelCase, index.js:468), not `/paper-inventory`.
- **consumablesInventory**: real paths are `/api/inventory/consumables*` (consumablesInventory.js:82), not `/consumables-inventory*`.
- **cuttingTransfers**: real paths `/api/cutting-jobs`, `/api/stock-transfers` (cuttingTransfers.js:26,110), not `/cutting-transfers*`.
- **purchaseOrders**: no module/file/HTTP route at all — only DB table `sarga_purchase_orders`.
- **vendorBills**: only `PUT /api/vendor-bills/:billId` (vendors.js:2435); upload is `/api/vendor-invoices/:id/upload-bill`, lists under `/api/vendors/:id/bills`.
- **expenses**: real prefixes `/expense-*`, `/rent-locations`, `/vendor-requests`, `/payment-suggestions` — no `/expenses*`.
- **expenses-extended**: real prefixes `/office-*`, `/transport-*`, `/misc-*`, `/petty-cash*`, `/bills-documents*`, `/utility-*`, `/reports/*` — no `/expenses-extended*`.
- **finance**: only `/emi-*` and `/kuri-*` (finance.js); no `/finance*`, no rent/cash-bank/ledgers in that file.
- **utilityEmail**: real `/api/utility-bills/fetch-from-email`, `/api/email/verify`, `/api/email/test` — no `/utility-email*`.
- **billExtraction**: single `POST /api/bills/extract-data` — no `/bill-extraction/*`.
- **backup/sheetsBackup**: mounted `/api/backup` (index.js:504) with `/run`, `/status`, `/daily`, `/history` etc. — no `/backup/sheets*`.
- **ai**: `/ai/search` and `/ai/paper-layout` real, but `/ai/forecast` does NOT exist anywhere.
- **auditTrail**: real prefix `/api/audit/*` (logs/stats/filters/export/verify-chain) — no `/audit-trail*`.
- **auditInvoice**: real `/api/audit-logs*` + `/api/invoices*` — no `/audit-invoice*`.
- **invoiceFeatures**: real `/api/recurring-invoices*`, `/api/invoice-tracking*`, `/api/tax-settings`, etc. — no `/invoice-features*`.
- **passwordReset**: real `/api/auth/forgot-password`, `/api/auth/reset-password*` — no `/password-reset*`.
- **premiumFeatures**: real `/api/website/samples*`, `/api/website/consultations*`, `/api/admin/*` — no `/premium-features*`.
- **artworkUploads**: real `/api/artwork/*` + `/api/website/artwork/*` — no `/artwork-uploads*`.
- **pickupSlots**: real `/api/pickup/*` + `/api/website/pickup/*` — no `/pickup-slots*`.
- **deliveryEstimates**: real `/api/delivery/estimate`, `/api/delivery/rules*` — no `/delivery-estimates*`.
- **whatsappAnalytics**: real `/api/whatsapp/log`, `/api/whatsapp/stats` — no `/whatsapp-analytics*`.
- **businessHub**: real `/api/business/*` (profile/assets/orders/invoices) — no `/business-hub*`.

Cross-reference notes: `payments`, `designCheck`, and `seo` are registered in index.js but missing from the doc table; doc-only phantom modules are refunds/purchaseOrders/vendorPayments/vendorBills/pettyCash (endpoints for the latter two live inside vendors.js / expenses-extended.js). Unregistered orphan route files: dashboardInit.js, whatsapp.js, quickBilling.js, variableData.js, settingsDailyBook.js.

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

### Implementation Detail — actual committed-secret status (verified)

- `git ls-files` shows these env files are TRACKED (committed) even though `.gitignore` covers them:
  - **`server/.env.bak`** — REAL secrets in history: DB password `Sarga@12345` and JWT secret `printing_shop_secret_key_2025` (present since the initial commits `00257a0`/`e0020a0`). `.gitignore` rules (`.env.bak`, `*.bak`) do NOT affect already-tracked files.
  - **`client/.env.vercel`** — real `VERCEL_OIDC_TOKEN` (a signed JWT for the Vercel `software-sarga` dev environment). ROTATE THIS; it is a live platform token.
  - `client/.env.development` / `client/.env.production` — real Firebase keys (public-by-design, but treat as secrets).
- Untracked and correctly ignored: `server/.env`, root `.env`, `.env.local`, `client/.env.local`, `mcp-server/.env`. `git status` is clean.
- `.gitignore` effective rules: `.env`, `.env.local`, `.env.*.local`, `.env.bak` (plus a broader `*.bak`).
- **Status: the warning stands — real secrets remain committed, specifically `server/.env.bak` and `client/.env.vercel`.** Fix: purge those blobs from history (`git filter-repo` or BFG), rotate every credential, and move values to Vercel/Render/GitHub secret stores; also kill/rotate the leaked Vercel OIDC token in the Vercel dashboard.

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