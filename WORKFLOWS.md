# Sarga Prints MIS — Business Workflows

This document walks through the end-to-end operational processes of the Sarga MIS: order-to-delivery, billing/payments, stock movement, vendor settlement, the daily cash book, and staff operations. It is for staff, managers, and developers who need the step-by-step flow behind the UI pages cataloged in [PAGES.md](PAGES.md).

**Last updated:** 2026-08-04

> [!NOTE]
> Workflows reference the API endpoints documented in [API.md](API.md) and the tables in [DATA_MODEL.md](DATA_MODEL.md). Front Office roles are branch-locked by `server/middleware/auth.js` (`authenticate`), so all steps below happen within the user's own branch.

---

## Table of Contents

1. [Job Lifecycle: Order → Delivery](#1-job-lifecycle-order--delivery)
2. [Walk-in Billing & Payment](#2-walk-in-billing--payment)
3. [Public Web Checkout (Razorpay)](#3-public-web-checkout-razorpay)
4. [Inter-Branch Stock & Paper Movement](#4-inter-branch-stock--paper-movement)
5. [Vendor Settlement & Reconciliation](#5-vendor-settlement--reconciliation)
6. [Daily Cash Book & Three Books](#6-daily-cash-book--three-books)
7. [Staff Attendance, Salary & Leaves](#7-staff-attendance-salary--leaves)
8. [Machine Readings & Production Tracking](#8-machine-readings--production-tracking)
9. [Approval & Change-Request Flows](#9-approval--change-request-flows)

---

## 1. Job Lifecycle: Order → Delivery

A job is the core production unit. Its status is governed by the ENUM in `sarga_jobs.status` and the state diagram in [ARCHITECTURE.md](ARCHITECTURE.md#32-job-lifecycle-order-creation--production--completion--billing). Every transition writes a row to `sarga_job_status_history`.

1. **Create** — Staff create a job from a customer order or walk-in via `POST /api/jobs` (or through billing, §2). Status starts at `Pending`.
2. **Design** — A `Designer` is assigned via `POST /api/jobs/:id/assign`. Status moves to `Designing`. Matter/artwork is uploaded to `POST /api/jobs/:id/matter`.
3. **Proof** — The designer uploads a proof (`POST /api/jobs/:id/proofs`), status becomes `Approval Pending`. The customer approves or requests a revision (`PUT /api/jobs/:id/proofs/:proofId/review`, or customer-side `POST /api/website/jobs/:id/proofs/:proofId/review-customer`).
   - Approved → `Processing`; revision → back to `Designing`.
4. **Print & finish** — Machine queues and post-processing advance the job through `Printing` → `Cutting` → `Lamination` → `Binding` → `Production`. Paper used is logged via `POST /api/jobs/:id/paper-logs` and `consume-paper`.
5. **Complete & deliver** — `Completed` after quality check, then `Delivered` on handover. Invoicing may run in parallel (see §2/§3).

Status is updated by `PUT /api/jobs/:id`. Client-side, `client/src/pages/JobDetail.jsx` also writes assignments, status, and paper logs to a local IndexedDB store (`localDb`) to support offline branches, syncing later. See [PAGES.md](PAGES.md#job-management).

---

## 2. Walk-in Billing & Payment

This is the front-office path that both records payment and creates jobs/order lines in one transaction. See the sequence diagram in [ARCHITECTURE.md](ARCHITECTURE.md#walk-in--manual-payment-flow-adminstaff).

1. **Cart build** — The user assembles the bill (products from `product-hierarchy`, quantities, optional coupon). Front-office quick-billing widgets live in `client/src/components/quickbilling/` (see [COMPONENTS.md](COMPONENTS.md#domain-specific--staff-mis-client)).
2. **Create payment** — `POST /api/customer-payments` is sent with an `Idempotency-Key` header and payload containing `customer_id`/name/mobile, amounts, GST fields, `payment_method`, split-payment fields (`cash_amount`, `upi_amount`, `cheque_amount`, `account_transfer_amount`), `order_lines`, `job_ids`, and `book_type`.
3. **Server transaction** — The backend:
   - Detects a replay (same `Idempotency-Key`) and returns the existing payment with `duplicate: true` instead of re-creating.
   - Creates the `sarga_customer_payments` row, creates `sarga_jobs` rows, reserves inventory, and generates an `invoice_number` (FY prefix via `sarga_invoice_sequence`).
4. **Response** — `201` with `{ id, invoice_number, balance_amount, message }`.
5. **Verification (accountant)** — Payments recorded as pending are verified via `PATCH /api/customer-payments/:id/verify` (see `client/src/pages/PaymentVerification.jsx`).
6. **Balance tracking** — Any remaining `balance_amount` stays on the job/customer; future collections reduce it via the same endpoint.

> [!WARNING]
> The GPay business webhook flow described in older proposals is **not implemented**. All payments are recorded manually by staff or via Razorpay for the website. See the flag in [ARCHITECTURE.md](ARCHITECTURE.md#-flagged-integration-gpay-business-webhook).

---

## 3. Public Web Checkout (Razorpay)

Used when customers order through the public site (`/website`). Full sequence diagram in [ARCHITECTURE.md](ARCHITECTURE.md#public-web-checkout-flow-razorpay).

1. **Cart session** — Public cart APIs (`POST /api/checkout/cart`, cart items) track a guest cart keyed by the `x-sarga-uuid` header.
2. **Create order** — `POST /api/checkout/create-order` with cart, payment method (`full`/`partial`), delivery method, optional pickup slot, GST number, and addresses. The backend creates a Razorpay order and returns `razorpay_order_id` + `razorpay_key_id`.
3. **Customer pays** — The Razorpay checkout UI collects the payment.
4. **Verify** — `POST /api/checkout/verify-payment` with `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`. The backend recomputes the HMAC-SHA256 signature.
   - Valid → order `confirmed`, `sarga_payment_transactions` marked `captured`, invoice generated.
   - Invalid → transaction marked `failed`, `400 { verified: false }`.

> [!NOTE]
> Public customer identity comes from `POST /api/website/customer/login`, `google-signin`, or email OTP (`send-otp`/`verify-otp`). See [ARCHITECTURE.md](ARCHITECTURE.md#62-customer-authentication).

---

## 4. Inter-Branch Stock & Paper Movement

Sarga runs two branches (Perambra, Meppayur). Stock is tracked per branch in `sarga_branch_stock` and paper in `paper_stock_summary`.

1. **Stock request** — A branch requests transfer via `POST /api/stock-requests`. 
2. **Approval** — `PUT /api/stock-requests/:id/approve`.
3. **Dispatch & receive** — `PUT /api/stock-requests/:id/send` then `PUT /api/stock-requests/:id/receive`; quantities update each branch's stock.

Paper-specific paths (see [PAGES.md](PAGES.md#inventory--stock)):

| Action | Endpoint | Effect |
|---|---|---|
| Inward (receive paper) | `POST /api/paperInventory/inward` | Adds sheets to branch |
| Outward (issue to job) | `POST /api/paperInventory/outward` | Deducts sheets, links job |
| Transfer between branches | `POST /api/paperInventory/transfer` | Moves sheets between branches |
| Movements history | `GET /api/paperInventory/movements` | Audit log |
| Alerts | `GET /api/paperInventory/alerts` | Low-stock warnings |

Periodic physical audits use the stock-verification flow (`POST /api/stock-verification`) — see `client/src/pages/StockVerification.jsx`.

---

## 5. Vendor Settlement & Reconciliation

Procurement and vendor payouts are recorded in the vendor ledger (`sarga_vendor_bills`, `sarga_vendor_payments`, `sarga_vendor_statements`). Deep dive: [VENDOR_FEATURES_REPORT.md](VENDOR_FEATURES_REPORT.md).

1. **Receive supply** — Staff record the bill via `POST /api/vendor-invoices` (or `POST /api/vendors/:id/bills`). Optionally scan/upload the physical bill (`POST /api/vendor-invoices/:id/upload-bill`) and extract details via `POST /api/bills-documents/extract-details`.
2. **Record payment** — `POST /api/vendor-payments` (or `POST /api/vendors/:id/payments`) with method + amount; the vendor balance updates.
3. **Statement reconcile** — Upload a vendor statement (`POST /api/vendors/:id/upload-statement`) then run `POST /api/vendor-statements/:id/reconcile`; results at `GET /api/vendor-statements/:id/result`.
4. **Ledger & balance** — Track running balance via `GET /api/vendors/:id/balance`, `ledger`, and `ledger/pdf`.
5. **Audit** — `GET /api/vendors/payment-audit` lists historical activity.

---

## 6. Daily Cash Book & Three Books

The daily report is the branch's cash-reconciliation dashboard (`client/src/pages/DailyReport.jsx`), backed by `server/routes/dailyReportUnified.js` (mounted `/api/daily-report`). See [PAGES.md](PAGES.md#reports--analytics).

1. **Opening balance** — `GET`/`PUT /api/daily-report/opening-balance` (set by the bookkeeper).
2. **Live data** — Loads live counts, laser/offset/other machine live values (`GET /api/daily-report/laser-live`, `offset-live`, `other-live`, `live-counts`).
3. **Credits** — Credit transactions are added/removed via `GET/POST/DELETE /api/daily-report/credits`.
4. **Previous closing** — `GET /api/daily-report/previous-closing` seeds today's starting figure.
5. **Reconciliation** — The bookkeeper cross-checks collections, expenses, machine counts, and credits; discrepancy requests are raised via `POST /api/daily-report/change-request` and reviewed by `POST /api/daily-report/change-requests/:id/review`.
6. **Export** — PDF export handled by the lazy-loaded `client/src/pages/DailyReportPDFExport.jsx`.

Three-books tables (`sarga_daily_report_offset`, `sarga_machine_work_entries`, `sarga_credit_ledger`, etc.) store the offline book ledgers used by offset/digital printers; they are created by `server/scripts/migrate-three-books.js` (see [DATA_MODEL.md](DATA_MODEL.md#11-erp--legacy-dynamic-tables)).

---

## 7. Staff Attendance, Salary & Leaves

Staff operations live in `server/routes/staffPortal.js`, `staff.js`, and `scheduleManagement.js`.

1. **Punch in/out** — `POST /api/front-office/attendance` (front office) or staff-portal attendance endpoints; CCTV face matching via `POST /api/cctv/attendance` supplements manual entry.
2. **Salary calculation** — `GET /api/staff/:id/salary-calculation/:month` computes pay from attendance + `salary_type`/`daily_rate` (`client/src/pages/EmployeeDetail.jsx`).
3. **Pay out** — `POST /api/staff/:id/pay-salary` (single) or `POST /api/staff/bulk-pay-salary` (monthly batch); entries go to `sarga_payments`.
4. **Leaves** — Requests via `POST /api/staff-portal/leaves`; cancellation via `PUT /api/staff-portal/leaves/:id/cancel`.

Attendance-change disputes are raised via `POST /api/staff/:id/attendance-change-request` and reviewed in the approval flow (§9).

---

## 8. Machine Readings & Production Tracking

`server/routes/machines.js` handles digital/offset machine books and MPR integration (`server/services/mprIntegration.js` — SNMP for Kyocera/Konica, HTTP scraping for Canon).

1. **Log reading** — `POST /api/machines/:id/readings` records meter clicks; `PUT /api/machines/count-requests/:reqId` approves count corrections.
2. **Work entries** — `POST /api/machines/:id/work` logs job work against a machine; `DELETE /api/machines/:id/work/:entryId` removes erroneous entries.
3. **MPR verification** — `GET /api/machines/:id/mpr-meter-data` pulls live printer meter data; `POST /api/machines/:id/verify-count` and `GET /api/machines/:id/meter-comparison` audit printed vs. system counts.
4. **Production summary** — `GET /api/machines/:id/production-summary` and `GET /api/production-tracker` feed dashboards (`client/src/pages/ProductionTracker.jsx`, `MachineManagement.jsx`).

---

## 9. Approval & Change-Request Flows

Several mutating actions require a manager/accountant approval instead of immediate effect. All are surfaced in `client/src/pages/Requests.jsx` (see [PAGES.md](PAGES.md#staff--attendance)).

| Request type | Create | Review | Reviewer |
|---|---|---|---|
| Discount request | `POST /api/requests/discount` | `POST /api/requests/discount/:id/review` | Admin/Accountant |
| Staff user-ID change | `POST /api/requests/id-change` | `POST /api/requests/id-change/:id/review` | Admin |
| Customer data change | `POST /api/requests/customer-change` | `POST /api/requests/customer-change/:id/review` | Admin |
| Vendor/expense request | `POST /api/vendor-requests` | `PUT /api/vendor-requests/:id/review` | Admin/Accountant |
| Daily-report change | `POST /api/daily-report/change-request` | `POST /api/daily-report/change-requests/:id/review` | Admin/Accountant |
| Attendance change | `POST /api/staff/:id/attendance-change-request` | `POST /api/requests/attendance/:id/review` | Admin |

---

## Last Updated

**Timestamp:** 2026-08-04 — Initial workflow reference assembled from `server/routes/*`, [ARCHITECTURE.md](ARCHITECTURE.md), [PAGES.md](PAGES.md), and [VENDOR_FEATURES_REPORT.md](VENDOR_FEATURES_REPORT.md).