# Customer & Payment Role-Based Access Control (RBAC) Audit Report
**Sarga Prints MIS Codebase**
*Date: 2026-07-06*

---

## 1. Executive Summary
An audit was conducted across the backend customer, customer payment, and front office routes (`server/routes/customers.js`, `server/routes/customerPayments.js`, and `server/routes/frontOffice.js`) and the frontend React application (`client/src/`) to analyze access controls and verify if production roles (*Designer*, *Printer*, or *Other Staff*) require access.

### Key Conclusions:
1. **Legitimate Designer Read Access**: In the designer's `/designer/blocks` view (handled by `BlockJournal.jsx`), the frontend makes a `GET` request to `/api/customers` to populate customer dropdown selections. Therefore, the *Designer* role has a legitimate reason to read the customer catalog, but *not* to write/mutate it.
2. **Printer/Other Staff Isolation**: The *Printer* and *Other Staff* roles have no legitimate reason to read or write customer data or financial/payment records.
3. **No Production Access to Payments**: No production roles (*Designer*, *Printer*, or *Other Staff*) require access to payment details, refund triggers, verification stats, or billing dashboards. These are strictly financial operations.
4. **Attendance Route Nuance**: The attendance tracking endpoints in `frontOffice.js` are called during the check-in/sync processes. Although they are under the `/front-office` namespace, the backend enforces role checks inline, allowing `Front Office`, `Accountant`, and `Admin` users to record attendance.

---

## 2. Detailed Route Audit Table

| Endpoint | Current Backend Middleware | asyncHandler Applied? | Calling Frontend Component(s) | Roles Frontend Currently Allows | Notes |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **`customers.js`** | | | | | |
| `GET /customers` | `authenticateToken`, `customerCache()` | No | `Customers.jsx`, `Quotes.jsx`, `RecurringInvoices.jsx`, `ScanItem.jsx`, `BlockJournal.jsx` | `Admin`, `Front Office`, `Accountant`, `Designer` (via BlockJournal) | Gathers all active customer listings. Designer needs it for block task lookup. |
| `GET /customers/:id` | `authenticateToken` | No | `CustomerDetails.jsx` | `Admin`, `Front Office`, `Accountant` | Fetch customer info. |
| `POST /customers` | `authenticateToken`, `validate(...)`, `attachNormalizedMobile(...)` | No | `Customers.jsx`, `FrontOffice.jsx` | `Admin`, `Front Office`, `Accountant` | Inserts a new customer record. |
| `PUT /customers/:id` | `authenticateToken`, `attachNormalizedMobile(...)` | No | `Customers.jsx` | `Admin`, `Front Office`, `Accountant` | Updates customer details. |
| `DELETE /customers/:id` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | No | `Customers.jsx` | `Admin`, `Front Office`, `Accountant` | Soft-deletes customer. Already restricted. |
| `GET /customers/:id/dashboard` | `authenticateToken` | No | `CustomerDetails.jsx` | `Admin`, `Front Office`, `Accountant` | Retrieves total billing/payment dashboard metrics. |
| **`customerPayments.js`** | | | | | |
| `GET /customer-payments` | `authenticateToken`, `customerCache()` | No | `CustomerPayments.jsx`, `Billing.jsx`, `Invoices.jsx` | `Admin`, `Front Office`, `Accountant` | List transactions. |
| `POST /customer-payments` | `authenticateToken`, `validate(...)`, `attachNormalizedMobile(...)` | Yes | `localDb.js` (background billing sync) | `Admin`, `Front Office`, `Accountant` | Records client payment. |
| `POST /customer-payments/refund` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant', 'Front Office')` | Yes | `JobDetail.jsx` | `Admin`, `Front Office`, `Accountant` | Records and applies refund. Already restricted. |
| `GET /stats/dashboard` | `authenticateToken` | No | `Summary.jsx`, `AccountantDashboard.jsx` | `Admin`, `Accountant` | Returns analytics. Non-privileged roles filtered by branch. |
| `GET /customer-payments/pending-verification` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | No | `PaymentVerification.jsx` | `Admin`, `Accountant` | Returns unverified UPI/Cheque receipts. Already restricted. |
| `PATCH /customer-payments/:id/verify` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | Yes | `PaymentVerification.jsx`, `CustomerPayments.jsx` | `Admin`, `Accountant` | Verifies cashbook payment. Already restricted. |
| `GET /customer-payments/verification-stats` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | No | `PaymentVerification.jsx` | `Admin`, `Accountant` | Returns stats on unverified payments. Already restricted. |
| **`frontOffice.js`** | | | | | |
| `GET /front-office/attendance-reminder` | `authenticateToken` | No | `FrontOffice.jsx` | `Front Office` | Reminder details. Includes inline role checks gating to `Front Office`. |
| `POST /front-office/attendance` | `authenticateToken` | No | `localDb.js` (offline sync) | `Admin`, `Front Office`, `Accountant` | Records attendance entries. Enforces inline roles checks. |
| `GET /front-office/dashboard` | `authenticateToken` | No | `FrontOffice.jsx` | `Front Office` | Fetch overview dashboard parameters. |
| `GET /front-office/active-jobs` | `authenticateToken` | No | None | None | Helper endpoint. |
| `GET /front-office/due-customers` | `authenticateToken` | No | None | None | Helper endpoint. |
| `GET /front-office/overdue-jobs` | `authenticateToken` | No | None | None | Helper endpoint. |
| `GET /front-office/recent-payments` | `authenticateToken` | No | None | None | Helper endpoint. |
| `GET /front-office/search` | `authenticateToken` | No | None | None | Helper search tool. |
| `GET /front-office/delivered` | `authenticateToken` | No | None | None | Helper endpoint. |
| `GET /front-office/completed` | `authenticateToken` | No | None | None | Helper endpoint. |
| `PATCH /front-office/jobs/:id/work-name` | `authenticateToken` | No | `FrontOffice.jsx` | `Front Office` | Updates work/job description detail. |

---

## 3. Production Workflow Analysis & Role Requirements
* **Customer Creation & Editing**: Designers, Printers, and other staff members have no operational reason to register customers or change contact metadata. This should be restricted to the front office and finance staff.
* **Customer Listing (`GET /customers`)**: Designers require read-only access to this endpoint to select client linkages inside `BlockJournal.jsx`. This route should permit `Designer` in addition to `Admin`, `Accountant`, and `Front Office`.
* **Payment Processing & Verification**: Only `Admin`, `Accountant`, and `Front Office` handle physical/digital transactions, verify receipts, check verification metrics, or record refunds. Production staff (Designers, Printers) are completely isolated from payment management.
* **Front Office Specifics**: Endpoints in `frontOffice.js` compile active jobs, completed orders, and collections for the front-counter screen, which is accessed only by the `Front Office` role (and administrators).
