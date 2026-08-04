# Sarga Prints MIS — Data Model

This document describes the MySQL schema backing the Sarga MIS. It is for developers and DBAs working with migrations, queries, or reporting. It supplements — and links to — the logical table groupings in [ARCHITECTURE.md](ARCHITECTURE.md#4-database).

**Last updated:** 2026-08-04

> [!IMPORTANT]
> Schema is **versioned and applied automatically at boot** by `server/database.js` (`initDb`). It reads `server/schemas/*.sql` plus JS migrations in `server/migrations/` and records every applied file in the `schema_migrations` table. See [DEPLOYMENT_AND_ENV.md](DEPLOYMENT_AND_ENV.md#database) for connection config.

---

## Table of Contents

1. [Schema Management](#1-schema-management)
2. [Naming & Conventions](#2-naming--conventions)
3. [Core Business Entities](#3-core-business-entities)
4. [Job & Production](#4-job--production)
5. [Inventory, Stock & Paper](#5-inventory-stock--paper)
6. [Customers & Web](#6-customers--web)
7. [Finance & Expenses](#7-finance--expenses)
8. [Vendor & Procurement](#8-vendor--procurement)
9. [Staff, Attendance & Machines](#9-staff-attendance--machines)
10. [Audit, AI & Security](#10-audit-ai--security)
11. [ERP / Legacy Dynamic Tables](#11-erp--legacy-dynamic-tables)
12. [Migrations Index](#12-migrations-index)

---

## 1. Schema Management

Migrations are applied in this order by `server/database.js`:

1. All `server/schemas/*.sql` files sorted alphabetically (backtick-aware statement splitter; idempotent — known `ER_*` errors are ignored).
2. Numbered JS migrations: `023_create_product_hierarchy.js` → `032_schema_fixes.js` → `033_fix_vendor_tables.js` → `034_drop_legacy_vendor_columns.js` → `035_add_is_deleted.js` → `036_create_vendor_statements.js` → `037_add_utility_connection_fields.js` → `038_add_draft_status.js` → `039_increase_source_code_length.js`.
3. Named `.sql` migrations (`2026_*`, `2026-*`, `add_missing_indexes.sql`).

Applied files are recorded in `schema_migrations`; a fast path skips the full scan when `schema_version` already records `server_bootstrap:045_enterprise_audit.sql`. `CURRENT_SCHEMA_VERSION` in `server/database.js` is the migration marker.

---

## 2. Naming & Conventions

- Tables use the `sarga_` prefix (e.g. `sarga_jobs`). Exceptions: `paper_types`, `consumables_inventory_x`, `schema_migrations`, `schema_version`, and three-books `sarga_daily_*`/`sarga_machine_*`.
- IDs are `INT AUTO_INCREMENT` primary keys. Timestamps default to `CURRENT_TIMESTAMP`; mutable rows add `updated_at ... ON UPDATE CURRENT_TIMESTAMP`.
- Foreign keys follow `<parent>_id` (e.g. `job_id`, `branch_id`); most are `ON DELETE CASCADE` (children) or `ON DELETE SET NULL` (referencing staff/branch).
- Money is `DECIMAL`; measurements are `DECIMAL`. Booleans are `TINYINT(1)`; structured data is `JSON`.

| Convention | Example |
|---|---|
| Business table prefix | `sarga_jobs`, `sarga_invoices` |
| Link/join tables | `sarga_job_staff_assignments` |
| Transaction/log tables | `sarga_audit_logs`, `sarga_paper_usage_logs` |
| ENUM for closed vocabularies | `sarga_jobs.status`, `sarga_staff.role` |

---

## 3. Core Business Entities

`server/schemas/001_core.sql`

| Table | Purpose | Key columns |
|---|---|---|
| `sarga_branches` | Perambra / Meppayur offices | `id`, `name`, `address`, `phone`, `upi_id`, `smtp_user`, `smtp_pass` |
| `sarga_staff` | Employees, creds, roles, salary | `user_id`, `password`, `role`, `branch_id`, `salary_type` (`Monthly`/`Daily`), `base_salary`, `daily_rate`, `settings` (JSON) |
| `sarga_job_seq` | Per-branch daily job numbering | `(branch_id, seq_date)` composite PK, `last_seq` |

### `sarga_staff_role` allowed values

`Admin`, `Front Office`, `Designer`, `Printer`, `Accountant`, `Other Staff` (canonical casing from `server/middleware/auth.js` → `normalizeRole`).

---

## 4. Job & Production

`server/schemas/006_jobs.sql`

| Table | Purpose |
|---|---|
| `sarga_jobs` | Master job record (see columns below) |
| `sarga_job_matter` | Original artwork/asset uploads per job |
| `sarga_job_staff_assignments` | Task delegation to designers/printers |
| `sarga_job_status_history` | Timestamped lifecycle tracker |
| `sarga_job_proofs` | Customer-facing proofs, review status, feedback |
| `sarga_paper_usage_logs` | Sheets used/wasted per stage |
| `sarga_paper_cut_map` | Parent→child cut-size ratios |

### `sarga_jobs` key columns

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | |
| `customer_id`, `product_id`, `branch_id`, `machine_id` | INT | FKs |
| `job_number` | VARCHAR(20) UNIQUE | Business identifier |
| `status` | ENUM | `Pending, Processing, Designing, Printing, Cutting, Lamination, Binding, Production, Approval Pending, Completed, Delivered, Cancelled` |
| `payment_status` | ENUM | `Unpaid, Partial, Paid` |
| `quantity` / `unit_price` / `total_amount` | DECIMAL | |
| `advance_paid` / `balance_amount` | DECIMAL | |
| `applied_extras` | JSON | Optional line extras |
| `category` / `subcategory` | VARCHAR | |
| `delivery_date` | DATE | |

Job lifecycle states: see the state diagram in [ARCHITECTURE.md](ARCHITECTURE.md#32-job-lifecycle-order-creation--production--completion--billing).

---

## 5. Inventory, Stock & Paper

`server/schemas/002_inventory.sql`, `003_paper.sql`, `005_products.sql`

| Table | Group | Purpose |
|---|---|---|
| `sarga_inventory` | Retail | Products with cost/sell price + stock count |
| `sarga_branch_stock` | Retail | Qty of each item per branch |
| `sarga_stock_requests` | Retail | Branch-to-branch transfer requests |
| `sarga_inventory_consumption` | Retail | Consumables used |
| `sarga_inventory_reorders` | Retail | Restock history |
| `sarga_stock_verifications` + `_items` | Retail | Periodic audit headers/differences |
| `sarga_purchase_orders` + `_items` | Retail | Vendor procurement |
| `sarga_paper_inventory` | Paper | Reams/sheets + sizes per branch |
| `paper_types` | Paper | Active sizes & GSM |
| `paper_stock_movements` / `paper_stock_summary` | Paper | Live sheet tracking per branch |
| `sarga_paper_adjustments` | Paper | Manual sheet modifications |
| `sarga_paper_rate_history` | Paper | Historical rates (migration `2026_07_15`) |
| `consumables_inventory` + `_adjustments` | Paper | Inks/plate chemicals |
| `product_hierarchy` | Products | Category → subcategory tree |
| `sarga_products` | Products | Service/product catalog |
| `sarga_product_images` | Products | Preview images (migration `038_...`) |

---

## 6. Customers & Web

`server/schemas/004_customers.sql`, `016_phase1_commerce.sql`; also `20260527_website_tables.sql`

| Table | Purpose |
|---|---|
| `sarga_customers` | Customer list, type (`Walk-in`, `Retail`, `Offset`), mobile index, `client_type` |
| `sarga_customer_payments` | Customer advances + final payments ledger |
| `sarga_customer_designs` | Customer asset library |
| `sarga_customer_requests` | Edit/delete approval requests |
| `sarga_customer_otps` | Email verification hashes |
| `sarga_coupons` | Discount coupon rules |
| `sarga_discount_requests` | Staff-requested discount approvals |
| `sarga_orders` / `sarga_carts` / `sarga_cart_items` | Web checkout & cart persistence |
| `sarga_payment_transactions` | Razorpay payment statuses |
| `sarga_invoices` | Generated tax invoices |
| `sarga_invoice_sequence` | Per-FY invoice counter |
| `sarga_business_profiles` / `sarga_brand_assets` | B2B portal data |
| `sarga_reviews` | Public Google Reviews cache |
| `express_production_rules` | Product lead times |
| `sarga_delivery_tracking` | Courier dispatch status |
| `sarga_website_chat_messages` | Website bot chat log (via `chatStore.js`) |

---

## 7. Finance & Expenses

`server/schemas/008_finance.sql`

| Table | Purpose |
|---|---|
| `sarga_payments` | Central outbound payout ledger (rent, salary, utility, vendors) |
| `sarga_payment_methods` | Active methods (Cash, UPI, Cheque, Bank Transfer) |
| `sarga_rent_locations` | Monthly shop rent trackers |
| `sarga_emi_master` / `sarga_emi_payments` | Equipment/vehicle EMIs |
| `sarga_kuri_master` / `sarga_kuri_payments` | Chit (Kuri) systems |
| `sarga_office_expenses` / `sarga_transport_expenses` / `sarga_misc_expenses` | Operational expenditures |
| `sarga_petty_cash` | Cash-box movements |
| `sarga_bills_documents` | Inbound bill PDFs + GST extraction fields |
| `sarga_utility_connections` / `sarga_utility_bills` | Meter-based utility bills |
| `sarga_invoice_tracking` | Invoice state (draft/finalized) |
| `sarga_recurring_invoices` | B2B recurring invoice templates |
| `sarga_payment_modes` / `sarga_tax_settings` / `sarga_company_settings` | Invoice configuration config |
| `sarga_i18n_overrides` | Customer receipt translations |

> [!NOTE]
> `sarga_invoice_tracking`, `sarga_recurring_invoices`, `sarga_payment_modes`, `sarga_tax_settings`, `sarga_company_settings`, and `sarga_i18n_overrides` are created dynamically at runtime by `server/routes/invoiceFeatures.js` (see §11).

---

## 8. Vendor & Procurement

`server/schemas/007_vendors.sql` + `033_fix_vendor_tables.js`, `036_create_vendor_statements.js`

| Table | Purpose |
|---|---|
| `sarga_vendors` | Suppliers (utility, supply, rental); auto 3-letter code |
| `sarga_vendor_bills` / `sarga_vendor_bill_items` | Supply bill details |
| `sarga_vendor_payments` | Payout transactions |
| `sarga_vendor_statements` / `sarga_vendor_statement_lines` | Reconciliation statements |
| `sarga_payment_suggestions` | Recurring vendor names → profiles |

See [VENDOR_FEATURES_REPORT.md](VENDOR_FEATURES_REPORT.md) for the statement reconciliation flow over these tables.

---

## 9. Staff, Attendance & Machines

`server/schemas/009_staff_attendance.sql`, `010_machines.sql`, `012_cctv.sql`, `staff_portal.sql`, `sessions.sql`

| Table | Purpose |
|---|---|
| `sarga_attendance` | Daily punch in/out per staff |
| `sarga_schedules` + late/overtime | Shift scheduling |
| `sarga_staff_leaves` | Leave requests |
| `sarga_tasks` | Task checklist entries |
| `sarga_machines` | Digital/offset printers |
| `sarga_machine_readings` | Meter clicks per machine |
| `sarga_machines_staff_assignments` | Operator assignments |
| `sarga_cctv_cameras` / `sarga_face_data` | CCTV + biometric matching |
| `sarga_user_sessions` | Login session tokens + `is_revoked` |
| `sarga_security_audit` | Security violations |

> [!NOTE]
> `sarga_machines` and most `sarga_machine_*` tables are created dynamically by `server/scripts/migrate-three-books.js` (see §11).

---

## 10. Audit, AI & Security

`server/schemas/011_audit_ai.sql`

| Table | Purpose |
|---|---|
| `sarga_audit_logs` | Employee action trail |
| `sarga_alerts` | System alert flags |
| `sarga_id_requests` | Staff user-ID change requests |
| `sarga_staff_activity_log` | Detailed request footprints |
| `sarga_fraud_alerts` | Anomaly-engine detections |
| `sarga_design_checks` | Preflight design-size analysis |
| `sarga_ai_cache` | LLM response cache |
| `sarga_expense_training` | ML expense classifier feedback |
| `sarga_extraction_logs` | OCR/bill extraction logs |
| `sarga_staff_behavior_profile` | Login/action baselines (via `anomalyDetection.js`) |

---

## 11. ERP / Legacy Dynamic Tables

A set of tables is created lazily at runtime with `CREATE TABLE IF NOT EXISTS` in route/helper/migration files rather than being declared in `server/schemas/`. [ARCHITECTURE.md](ARCHITECTURE.md#42-tables-initialized-dynamically-missing-from-serverschemas) lists the full set (quotes, product image/update requests, password-reset tokens, OTPs, chat logs, behavior profiles, machines + three-books books, cutting/transfers, etc.). Notable runtime-created tables:

| Table | Creating file (server/) |
|---|---|
| `sarga_quotes` / `sarga_quote_items` | `routes/quotes.js` |
| `sarga_product_image_requests` / `sarga_product_links` / `sarga_product_update_requests` | `routes/products.js` |
| `sarga_password_reset_tokens` | `routes/passwordReset.js` |
| `sarga_invoice_tracking` / `sarga_recurring_invoices` / `sarga_payment_modes` / `sarga_tax_settings` / `sarga_company_settings` / `sarga_i18n_overrides` | `routes/invoiceFeatures.js` |
| `sarga_customer_otps` | `routes/website.js` |
| `sarga_website_chat_messages` | `services/chatStore.js` |
| `sarga_staff_behavior_profile` | `helpers/anomalyDetection.js` |
| `sarga_machines`, `sarga_machine_readings`, `sarga_daily_report_offset`, `sarga_daily_work_entries`, `sarga_daily_expenses`, `sarga_daily_credit_transactions`, `sarga_machine_work_entries`, `sarga_machine_credit_movements`, `sarga_credit_customers`, `sarga_credit_ledger` | `scripts/migrate-three-books.js` |
| `sarga_cutting_jobs` / `sarga_cutting_job_outputs` / `sarga_stock_transfers` | `migrations/2026_07_29_cutting_transfers.sql` |

---

## 12. Migrations Index

`server/schemas/` (core `.sql`):

| Range | Focus |
|---|---|
| `001`–`008` | Core, inventory, paper, customers, products, jobs, vendors, finance |
| `009`–`013` | Staff attendance, machines, audit/AI, CCTV, designs |
| `014`–`016` | Blog, premium features, phase-1 commerce |
| `017`–`026` | Quick billing, daily-book automation, indexes, dynamic tables, machine health, extraction logs |
| `027`–`041` | Sheets backup, product hierarchy, invoice/query/dashboard indexes, ERP enhancements, product images |
| `042`–`046` | Performance indexes phase 2, enterprise audit, product request priority |
| `sessions.sql`, `staff_portal.sql`, `designer_workspace.sql` | Sessions, portal, designer workspace |
| `038_create_product_images_table.sql` | Product images |

`server/migrations/` additionally holds dated `.sql`/`.js` files (e.g. `2026-06-15-gst-bill-processing.sql`, `2026_07_29_imposition_planning.sql`, `add_missing_indexes.sql`, `migrate_paper_inventory.js`). The full filename list is authoritative in `server/database.js` + directory listing.

---

## Last Updated

**Timestamp:** 2026-08-04 — Initial data-model reference assembled from `server/schemas/*.sql`, `server/migrations/`, and `server/database.js`.