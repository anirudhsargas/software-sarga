# SARGA — Comprehensive QA Audit Report

**Date:** March 9, 2026  
**Scope:** Full-stack — Backend (Express.js/MySQL), Frontend (React/Vite), Database, Security, Performance  
**Total Issues Found:** 78  

---

## Executive Summary

| Severity | Count | Examples |
|----------|-------|---------|
| 🔴 **Critical** | 8 | Job deletion without payment check, missing payment validation, weak JWT secret |
| 🟠 **Major** | 22 | Error message leakage, missing indexes, no request timeout, RBAC gaps |
| 🟡 **Minor** | 30 | Missing `updated_at` columns, no CSRF, inconsistent empty states |
| 🔵 **Info** | 18 | Code quality improvements, magic strings, missing accessibility |

**Overall Assessment:** The application has **solid architectural foundations** — parameterized SQL queries, audit logging, rate limiting on auth, branch isolation, proper error boundaries, PWA/offline support, and comprehensive form validation on the billing page. However, there are **critical data integrity gaps** in payment validation, job deletion, and several medium-severity security concerns that should be addressed before production scaling.

---

## 1. FUNCTIONAL TESTING

### 1.1 CRUD Operations

| Entity | Create | Read | Update | Delete | Issues |
|--------|--------|------|--------|--------|--------|
| Jobs | ✅ | ✅ | ✅ | ⚠️ | **[C-01]** Delete doesn't check linked payments |
| Customers | ✅ | ✅ | ✅ | ✅ | Delete correctly checks linked jobs |
| Staff | ✅ | ✅ | ✅ | ⚠️ | **[C-02]** Delete doesn't check salary/attendance records |
| Payments | ✅ | ✅ | N/A | N/A | **[C-03]** Advance can exceed total amount |
| Vendors | ✅ | ✅ | ✅ | ✅ | Checks linked bills before delete |
| Inventory | ✅ | ✅ | ✅ | ✅ | Working correctly |
| Branches | ✅ | ✅ | ✅ | ✅ | Working correctly |
| Expenses | ✅ | ✅ | ✅ | ✅ | Working correctly |
| Machines | ✅ | ✅ | ✅ | ✅ | Working correctly |

### 1.2 Critical Bugs

#### **[C-01] Job Deletion Without Payment Validation** 🔴 Critical
- **File:** `server/routes/jobs.js` ~line 1039
- **Description:** The `DELETE /jobs/:id` endpoint deletes a job directly without checking if any customer payments or refunds are linked to it.
- **Impact:** Orphaned payment records, broken financial reports, audit trail corruption.
- **Reproduction:** Create job → Accept payment → Delete job → Payment references non-existent job.
- **Fix:**
```javascript
// Before deletion, check for linked payments
const [[{ paymentCount }]] = await pool.query(
  "SELECT COUNT(*) as paymentCount FROM sarga_customer_payments WHERE JSON_CONTAINS(order_lines, JSON_OBJECT('job_id', ?))",
  [req.params.id]
);
if (paymentCount > 0) {
  return res.status(409).json({ message: `Cannot delete: ${paymentCount} payment(s) linked to this job.` });
}
```

#### **[C-02] Staff Deletion Without Referential Integrity Check** 🔴 Critical
- **File:** `server/routes/staff.js` ~line 180
- **Description:** Deletes staff without checking `sarga_staff_salary`, `sarga_job_staff_assignments`, or `sarga_staff_attendance`.
- **Impact:** Orphaned salary records, broken assignment history.
- **Fix:**
```javascript
const [[{ salaryCount }]] = await pool.query(
  "SELECT COUNT(*) as salaryCount FROM sarga_staff_salary WHERE staff_id = ?", [id]
);
const [[{ assignCount }]] = await pool.query(
  "SELECT COUNT(*) as assignCount FROM sarga_job_staff_assignments WHERE staff_id = ?", [id]
);
if (salaryCount > 0 || assignCount > 0) {
  return res.status(409).json({ 
    message: `Cannot delete: staff has ${salaryCount} salary record(s) and ${assignCount} assignment(s).` 
  });
}
```

#### **[C-03] Advance Payment Can Exceed Total Amount** 🔴 Critical
- **File:** `server/routes/customerPayments.js` ~line 60
- **Description:** No server-side validation that `advance_paid <= total_amount`, creating negative balance amounts.
- **Impact:** Negative balance in reports, incorrect customer ledger.
- **Fix:**
```javascript
if (advance > total) {
  return res.status(400).json({ message: 'Advance payment cannot exceed total amount.' });
}
if (Math.abs((cash + upi) - advance) > 0.01) {
  return res.status(400).json({ message: 'Cash + UPI must equal advance paid amount.' });
}
```

#### **[C-04] Refunds Don't Create Reverse Payment Entries** 🔴 Critical
- **File:** `server/routes/customerPayments.js` ~line 408
- **Description:** Refund endpoint updates job balance but doesn't create a reverse entry in the payments ledger.
- **Impact:** Daily reports omit refunds; expense tracking incomplete.
- **Fix:** Insert a negative payment record when processing refund.

---

## 2. INPUT VALIDATION

### 2.1 Backend Validation (Zod Schemas)

| Schema | Required Fields | Type Check | Range Check | Format Check | Issues |
|--------|----------------|------------|-------------|--------------|--------|
| `loginSchema` | ✅ | ✅ | ❌ No min password length | ✅ | **[M-01]** |
| `changePasswordSchema` | ✅ | ✅ | ✅ min 8 | ❌ No complexity | **[M-02]** |
| `addStaffSchema` | ✅ | ✅ | ✅ | ✅ mobile format | OK |
| `addCustomerSchema` | ✅ | ✅ | ✅ | ✅ email/GST regex | OK |
| `addPaymentSchema` | ✅ | ✅ | ⚠️ | ❌ No date format | **[M-03]** |
| `addJobSchema` | ✅ | ⚠️ | ⚠️ | ❌ No date format | **[C-05]** |
| `addVendorSchema` | ✅ | ✅ | ✅ | ❌ No phone/GSTIN | **[M-04]** |
| `addInventorySchema` | ⚠️ Most optional | ✅ | ✅ | ❌ | **[Mi-01]** |
| `attendanceSchema` | ✅ | ✅ | ❌ | ❌ Future dates allowed | **[M-05]** |

#### **[C-05] Job Schema: `applied_extras` is `z.any()`** 🔴 Critical
- **Description:** `applied_extras` accepts literally ANY value — arrays, objects, strings, numbers, scripts.
- **Impact:** Malformed data stored in DB; could break calculations.
- **Fix:**
```javascript
applied_extras: z.array(z.object({
  purpose: z.string(),
  amount: z.number().min(0)
})).optional().default([])
```

#### **[M-01] No Password Min Length on Login** 🟠 Major
- Login schema doesn't enforce minimum password length.

#### **[M-02] No Password Complexity Requirements** 🟠 Major
- Change password only checks min 8 chars. No uppercase/digit/symbol required.

#### **[M-03] Date Fields Not Format-Validated** 🟠 Major
- `period_start`, `period_end`, `delivery_date` are optional strings with no format check (`YYYY-MM-DD`).

#### **[M-04] Vendor Phone/GSTIN Not Validated** 🟠 Major
- Unlike customer schema, vendor phone and GSTIN have no format validation.

#### **[M-05] Attendance Date Can Be in the Future** 🟠 Major
- No check prevents marking attendance for dates that haven't arrived.

#### **[Mi-01] Inventory Schema Too Loose** 🟡 Minor
- Most fields optional/nullable; `unit` accepts any string (should be enum).

### 2.2 Frontend Validation

| Page | Validates Before Submit | Validates Types | Shows Errors | Issues |
|------|------------------------|-----------------|--------------|--------|
| Billing | ✅ Comprehensive | ✅ | ✅ toast | Best validation in codebase |
| Login | ✅ Mobile 10-digit | ✅ | ✅ inline | OK |
| CustomerPayments | ✅ canSave check | ⚠️ Partial | ✅ toast | Missing amount cross-check |
| Jobs | ⚠️ Partial | ⚠️ | ✅ toast | Relies on backend |
| Staff | ✅ | ✅ | ✅ toast | OK |
| Expenses | ⚠️ Partial | ⚠️ | ✅ toast | **[M-06]** |

#### **[M-06] Inconsistent Frontend Validation** 🟠 Major
- Some forms rely entirely on backend validation (Jobs, Expenses) while others (Billing) have comprehensive client-side checks. This creates inconsistent user experience.

---

## 3. UI/UX TESTING

### 3.1 Layout & Consistency

| Aspect | Status | Notes |
|--------|--------|-------|
| Typography | ✅ Good | Plus Jakarta Sans body + Space Grotesk headings |
| Color system | ✅ Good | CSS variables with dark mode |
| Spacing | ✅ Good | Consistent utility classes |
| Responsive design | ⚠️ Partial | Mobile breakpoints exist but not all components tested |
| Dark mode | ✅ Good | Full dark theme support via CSS variables |

### 3.2 State Handling

| State | Coverage | Issues |
|-------|----------|--------|
| Loading | ✅ 24/24 forms | `Loader2` spinner, disabled buttons |
| Error | ✅ Good | Toast notifications + inline errors |
| Empty | ✅ 40+ empty states | Consistent empty-state messaging |
| 404 | ✅ | NotFound.jsx with dashboard redirect |
| Offline | ✅ | PWA + IndexedDB caching |
| Error Boundary | ✅ | Catches chunk errors, prevents infinite reloads |

### 3.3 Accessibility Issues

#### **[M-07] No Accessibility Labels** 🟠 Major
- Only 7 `role=` attributes found across the entire codebase.
- Zero `aria-label` attributes on icon-only buttons.
- No keyboard navigation support for custom components.
- Screen readers cannot interpret icon-only buttons.
- **Fix:** Add `aria-label` to all `<button>` elements that contain only icons.

#### **[Mi-02] Missing Focus Management** 🟡 Minor
- Modal dialogs don't trap focus.
- No skip-to-content link for keyboard users.

---

## 4. WORKFLOW TESTING

### 4.1 Job Lifecycle

```
Create → Assign Staff → Designing → Approval → Printing → Cutting → 
Lamination → Binding → Production → Completed → Delivered
```

| Step | Validated | Issues |
|------|-----------|--------|
| Job creation | ✅ | Schema validation works |
| Staff assignment | ✅ | Assigns to stage correctly |
| Status changes | ✅ | Valid enum check exists |
| Status transition logic | ❌ | **[C-06]** No logical transition check |
| Payment at delivery | ⚠️ | No enforcement |
| Post-delivery refund | ⚠️ | **[C-04]** No reverse ledger entry |

#### **[C-06] No Logical Status Transition Validation** 🔴 Critical
- **Description:** While status enum is validated, there's no transition matrix. A job can go from `Completed` back to `Pending`, or from `Delivered` to `Designing`.
- **Impact:** Workflow integrity broken; completed work can be un-done without audit trail.
- **Fix:**
```javascript
const VALID_TRANSITIONS = {
  'Pending': ['Processing', 'Designing', 'Cancelled'],
  'Designing': ['Approval Pending', 'Printing', 'Cancelled'],
  'Approval Pending': ['Designing', 'Printing', 'Cancelled'],
  'Printing': ['Cutting', 'Lamination', 'Binding', 'Completed', 'Cancelled'],
  'Cutting': ['Lamination', 'Binding', 'Printing', 'Completed', 'Cancelled'],
  'Lamination': ['Binding', 'Cutting', 'Completed', 'Cancelled'],
  'Binding': ['Production', 'Completed', 'Cancelled'],
  'Production': ['Completed', 'Cancelled'],
  'Processing': ['Completed', 'Cancelled'],
  'Completed': ['Delivered'],
  'Delivered': [],  // Terminal state
  'Cancelled': []   // Terminal state
};

// In status update handler:
if (updates.status) {
  const [currentJob] = await pool.query("SELECT status FROM sarga_jobs WHERE id = ?", [id]);
  const allowed = VALID_TRANSITIONS[currentJob[0].status] || [];
  if (!allowed.includes(updates.status)) {
    return res.status(400).json({ 
      message: `Cannot transition from '${currentJob[0].status}' to '${updates.status}'.` 
    });
  }
}
```

### 4.2 Payment Workflow

| Step | Validated | Issues |
|------|-----------|--------|
| Customer payment creation | ✅ Schema | **[C-03]** Advance > Total not checked |
| Cash + UPI sum | ❌ | **[C-07]** Not validated server-side |
| Balance calculation | ⚠️ | Rounding inconsistencies across modules |
| Payment verification | ✅ | Admin/Accountant verification flow works |
| Refund processing | ⚠️ | **[C-04]** No ledger entry |

#### **[C-07] Payment Method Split Not Validated** 🔴 Critical
- `cash_amount + upi_amount` is never verified to equal `advance_paid`.
- Can submit ₹1000 total with ₹600 cash + ₹600 UPI = ₹1200 recorded.

---

## 5. EDGE CASE TESTING

### 5.1 Extreme Values

| Test Case | Backend Check | Frontend Check | Status |
|-----------|--------------|----------------|--------|
| Quantity = 0 | ❌ | ✅ Billing checks | ⚠️ **[M-08]** |
| Quantity = 100,001 | ❌ | ✅ Billing caps 100K | ⚠️ Backend unprotected |
| Amount = ₹10,00,00,001 | ❌ | ✅ Billing caps ₹1Cr | ⚠️ Backend unprotected |
| Negative amounts | ❌ | ✅ Billing checks | ⚠️ **[M-09]** |
| Empty string names | ✅ Zod min(1) | ✅ | OK |
| SQL in input fields | ✅ Parameterized | N/A | OK |
| XSS in input fields | ✅ No innerHTML | React escapes | OK |

#### **[M-08] Zero Quantity Jobs** 🟠 Major
- Backend doesn't prevent `quantity: 0` on job creation. Frontend billing page does check but direct API calls can bypass.

#### **[M-09] Negative Amounts Not Blocked Server-Side** 🟠 Major
- No CHECK constraints in DB, no validation in most route handlers for negative `amount`, `cost_price`, `sell_price`, etc. Frontend catches some cases but direct API access bypasses.

### 5.2 Concurrent Access

| Scenario | Protected | Mechanism |
|----------|-----------|-----------|
| Duplicate invoice numbers | ✅ | `SELECT FOR UPDATE` locking |
| Simultaneous status updates | ⚠️ | Last writer wins (no optimistic concurrency) |
| Double payment submission | ⚠️ | Frontend disables button but no server idempotency |
| Duplicate attendance entries | ✅ | UNIQUE KEY constraint |

### 5.3 Empty Datasets

| Page | Handles Zero Records | Displays Message |
|------|---------------------|-----------------|
| Jobs list | ✅ | "No jobs found" |
| Customers | ✅ | "No customers found" |
| Payments | ✅ | "No payments found" |
| Dashboard Summary | ✅ | Shows zeros |
| Production Tracker | ✅ | "No active jobs in any production stage" |
| Order Predictions | ✅ | "No predictions available" |

---

## 6. DATABASE INTEGRITY

### 6.1 Foreign Key Constraints

| Parent Table | Child Tables | FK Constraint | ON DELETE | Issues |
|-------------|-------------|---------------|-----------|--------|
| sarga_branches | staff, customers, jobs, expenses | ✅ | SET NULL | OK |
| sarga_staff | assignments, salary, attendance | ✅ | CASCADE | ⚠️ **[C-02]** No app-level check |
| sarga_customers | jobs, payments, designs | ✅ | RESTRICT | OK — app checks |
| sarga_jobs | assignments, proofs, history | ✅ | CASCADE | ⚠️ **[C-01]** No payment check |
| sarga_vendors | bills, bill_items | ✅ | RESTRICT | OK — app checks |

### 6.2 Missing Indexes (Performance Impact)

#### **[M-10] Critical Missing Indexes** 🟠 Major

```sql
-- These indexes would significantly improve query performance:

ALTER TABLE sarga_jobs ADD INDEX idx_jobs_status (status);
ALTER TABLE sarga_jobs ADD INDEX idx_jobs_customer_id (customer_id);
ALTER TABLE sarga_jobs ADD INDEX idx_jobs_branch_id (branch_id);
ALTER TABLE sarga_jobs ADD INDEX idx_jobs_delivery_date (delivery_date);
ALTER TABLE sarga_customer_payments ADD INDEX idx_cp_payment_date (payment_date);
ALTER TABLE sarga_customer_payments ADD INDEX idx_cp_branch_id (branch_id);
ALTER TABLE sarga_customer_payments ADD INDEX idx_cp_customer_id (customer_id);
ALTER TABLE sarga_payments ADD INDEX idx_payments_payment_date (payment_date);
ALTER TABLE sarga_staff_attendance ADD INDEX idx_attendance_date (attendance_date);
ALTER TABLE sarga_customer_requests ADD INDEX idx_cr_status (status);
ALTER TABLE sarga_products ADD INDEX idx_products_subcategory (subcategory_id);
ALTER TABLE sarga_vendor_bills ADD INDEX idx_vb_vendor_date (vendor_id, bill_date);
```

### 6.3 Missing CHECK Constraints

#### **[M-11] Negative Values Allowed in Financial Tables** 🟠 Major
Almost all financial columns (amount, cost_price, sell_price, quantity) across 20+ tables lack CHECK constraints. MySQL 8.0+ supports CHECK constraints.

```sql
-- Example constraints to add:
ALTER TABLE sarga_inventory ADD CHECK (quantity >= 0);
ALTER TABLE sarga_inventory ADD CHECK (cost_price >= 0);
ALTER TABLE sarga_inventory ADD CHECK (sell_price >= 0);
ALTER TABLE sarga_payments ADD CHECK (amount >= 0);
ALTER TABLE sarga_customer_payments ADD CHECK (total_amount >= 0);
ALTER TABLE sarga_customer_payments ADD CHECK (advance_paid >= 0);
ALTER TABLE sarga_staff_salary ADD CHECK (base_salary >= 0);
ALTER TABLE sarga_office_expenses ADD CHECK (amount >= 0);
```

### 6.4 Missing `updated_at` Timestamps

#### **[Mi-03] 40+ Tables Missing `updated_at`** 🟡 Minor
Only ~5 tables have `updated_at`. For audit trailing and data change tracking, all actively-updated tables should have:
```sql
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

---

## 7. SECURITY TESTING

### 7.1 Authentication

| Check | Status | Details |
|-------|--------|---------|
| Password hashing | ✅ | bcrypt with 10 rounds |
| Login rate limiting | ✅ | 15 attempts / 15 min |
| Token expiration | ✅ | 8 hours |
| Token on logout | ⚠️ | Client-side only — no server blacklist |
| JWT secret strength | ❌ | **[C-08]** Weak hardcoded secret |
| Old password on change | ❌ | **[M-12]** Not required |

#### **[C-08] Weak JWT Secret** 🔴 Critical
- **Current:** `JWT_SECRET=printing_shop_secret_key_2025`
- **Risk:** Easily guessable, enabling token forgery.
- **Fix:** Generate a 256-bit random secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

#### **[M-12] Password Change Doesn't Require Old Password** 🟠 Major
- **File:** `server/routes/auth.js` ~line 99
- Anyone with a valid (possibly stolen) token can change the password without knowing the current one.
- **Fix:** Add `currentPassword` field to `changePasswordSchema` and verify with `bcrypt.compare()`.

### 7.2 Authorization (RBAC)

| Route File | Auth Check | Role Check | Branch Check | Issues |
|-----------|-----------|-----------|-------------|--------|
| auth.js | ✅ | N/A | N/A | OK |
| jobs.js | ✅ | ✅ | ✅ | OK |
| customers.js | ✅ | ✅ Branch | ✅ | OK |
| payments.js | ✅ | ⚠️ Inline | ✅ | OK |
| customerPayments.js | ✅ | ⚠️ Inline | ✅ | OK |
| vendors.js | ✅ | ✅ | ✅ | OK |
| staff.js | ✅ | ✅ | ✅ | OK |
| finance.js | ✅ | ✅ Inline | ⚠️ | OK — inline checks |
| expenses.js | ✅ | ⚠️ | ✅ | OK |
| inventory.js | ✅ | ⚠️ | ⚠️ | **[M-13]** |
| staffDashboard.js | ✅ | ⚠️ | ⚠️ | **[M-14]** |
| accounts.js | ✅ | ✅ | ✅ | OK |

#### **[M-13] Inventory SKU Lookup Missing Auth** 🟠 Major
- Route `GET /inventory/by-sku/:sku` may be accessible without authentication.
- Could allow enumeration of all inventory and pricing data.

#### **[M-14] Salary Information Cross-Access** 🟠 Major
- Routes like `GET /:id/salary-info` authenticate but don't verify the requesting user has permission to view _that specific_ staff member's salary (except Admin/Accountant).
- A Designer could potentially view another Designer's salary details.

### 7.3 SQL Injection

| Check | Status | Details |
|-------|--------|---------|
| Parameterized queries | ✅ | All queries use `?` placeholders |
| Zod input validation | ✅ | Prevents malformed input |
| Dynamic column names | ⚠️ | Some queries build WHERE dynamically but using params |
| `IN (?)` patterns | ⚠️ | mysql2 handles arrays correctly |

**Verdict: No SQL injection vulnerabilities detected.** All queries use prepared statements.

### 7.4 XSS Prevention

| Check | Status | Details |
|-------|--------|---------|
| `dangerouslySetInnerHTML` | ✅ | Not used |
| `eval()` / `Function()` | ✅ | Not used |
| `innerHTML` | ✅ | Not used |
| React auto-escaping | ✅ | All JSX expressions safely escaped |
| CSP headers | ❌ | **[M-15]** Disabled in Helmet config |

#### **[M-15] Content Security Policy Disabled** 🟠 Major
- `contentSecurityPolicy: false` in Helmet config.
- While React auto-escapes, CSP adds defense-in-depth against injected scripts.
- **Fix:** Enable a basic CSP that allows your app's origins.

### 7.5 Other Security

| Check | Status | Issues |
|-------|--------|--------|
| HTTPS enforcement | ❌ | **[M-16]** HTTP fallback in api.js |
| CSRF protection | ❌ | **[Mi-04]** No CSRF tokens |
| File upload validation | ✅ | Multer whitelist (JPG/PNG/WEBP), 5MB limit |
| Static file access control | ⚠️ | `/uploads` served without auth |
| Rate limiting (general) | ✅ | 300 req / 5 min on `/api` |
| Error message leakage | ❌ | **[M-17]** |

#### **[M-16] HTTP Fallback URL** 🟠 Major
- `api.js` falls back to `http://` if `VITE_API_BASE_URL` is not set. Should always enforce HTTPS in production.

#### **[M-17] Error Stack Traces Leaked to Client** 🟠 Major
- Multiple routes return `error: err.message` in 500 responses, exposing table names, column names, and SQL syntax.
- **Fix:** Replace all `{ message: 'Database error', error: err.message }` with `{ message: 'An internal error occurred.' }`. Log `err.message` server-side only.

#### **[Mi-04] No CSRF Protection** 🟡 Minor
- POST/PUT/DELETE endpoints don't validate CSRF tokens. Mitigated by JWT Bearer token requirement and SameSite cookies, but still a defense-in-depth gap.

---

## 8. PERFORMANCE TESTING

### 8.1 Query Performance

| Issue | Severity | Impact | Count |
|-------|----------|--------|-------|
| `SELECT *` queries | 🟠 Major | Loads unnecessary columns | 40+ instances |
| Missing indexes | 🟠 Major | Full table scans | 12 missing (see §6.2) |
| N+1 query patterns | 🟡 Minor | Multiple DB round-trips | ~3 instances |
| No query LIMIT on dashboards | 🟡 Minor | Large result sets | ~5 instances |

#### **[M-18] Excessive `SELECT *` Usage** 🟠 Major
- 40+ queries use `SELECT *` instead of specifying needed columns.
- Impact: Transfers unnecessary data (images, JSON blobs), slower on large tables.
- **Fix:** Replace with specific column lists, especially on list endpoints.

#### **[M-19] Missing Pagination Maximum** 🟠 Major
- `parsePagination()` enforces max 100. This is good. However, some endpoints (e.g., `?all=true` on staff) bypass pagination entirely.
- **Fix:** Always enforce a hard limit, even with `all=true`.

### 8.2 Frontend Performance

| Issue | Severity | Details |
|-------|----------|---------|
| Large bundle | 🟡 | `index.js` 862KB (gzip 273KB) — chunk splitting recommended |
| Lazy loading | ✅ | All pages properly lazy-loaded |
| Polling interval | ✅ | 30s with visibility-pause (efficient) |
| Image optimization | ⚠️ | No image compression on upload |
| List virtualization | ❌ | **[Mi-05]** Large lists not virtualized |

#### **[Mi-05] No Virtual Scrolling for Large Lists** 🟡 Minor
- Customer/job lists with 1000+ items render all DOM nodes (pagination helps, but search results can be large).

### 8.3 API Response Optimization

| Endpoint | Avg Data Size | Issues |
|----------|--------------|--------|
| `GET /jobs` | Variable | SELECT * returns too many columns |
| `GET /customers` | Small | OK with pagination |
| `GET /production-tracker` | Medium | Good — groups by stage |
| `GET /front-office/dashboard` | Large | Loads all active jobs |

---

## 9. ERROR HANDLING

### 9.1 Backend Error Handling

| Pattern | Status | Issues |
|---------|--------|--------|
| `asyncHandler` wrapper | ✅ | Properly catches async errors |
| Transaction rollback | ✅ | `finally { connection.release() }` pattern |
| Error logging | ⚠️ | `console.error` only — no log aggregation |
| User-facing errors | ❌ | **[M-17]** Stack traces leaked |
| Graceful shutdown | ✅ | SIGTERM/SIGINT handlers with pool end |

### 9.2 Frontend Error Handling

| Pattern | Status | Issues |
|---------|--------|--------|
| Error boundary | ✅ | Catches render errors, chunk load failures |
| API error toast | ✅ | 30+ toast.error() calls |
| Network failure | ✅ | Offline mode with IndexedDB |
| 401 redirect | ✅ | Auto-redirect to login |
| Form validation | ✅ | Inline + toast errors |

### 9.3 Missing Error Handling

#### **[M-20] Silent Catch Blocks** 🟠 Major
- Several catch blocks in frontend code swallow errors silently (empty catch or `console.error` only).
- Users see no feedback when operations fail silently.

#### **[Mi-06] No Server-Side Error Aggregation** 🟡 Minor
- All errors go to `console.error`. No integration with logging service (e.g., Winston, Sentry).
- Errors in production would be lost if console is not captured.

---

## 10. CODE QUALITY REVIEW

### 10.1 Code Duplication

| Pattern | Instances | Location | Fix |
|---------|-----------|----------|-----|
| Branch ID check logic | 15+ | Every route file | Extract to middleware |
| Error response format | 40+ | Every endpoint | Create `sendError()` helper |
| Pagination setup | 20+ | Every list endpoint | Already extracted (good) |
| Date formatting | 10+ | Frontend pages | Create `formatDate()` util |
| Status enums | 5+ | jobs.js, frontend | Centralize in constants |

#### **[Mi-07] Duplicated Branch Check Pattern** 🟡 Minor
```javascript
// This pattern appears in 15+ routes:
if (!['Admin', 'Accountant'].includes(req.user.role)) {
    const branchId = await getUserBranchId(req.user.id);
    where += " AND branch_id = ?";
    params.push(branchId);
}
```
**Fix:** Create a `branchFilter(req)` middleware that auto-appends the branch condition.

### 10.2 React Hooks Violation

#### **[M-21] useAuth() Conditional Hook Call** 🟠 Major
- **File:** `client/src/hooks/useAuth.jsx` line 41
- `useState()` called inside a conditional block (when no AuthContext exists).
- Violates Rules of Hooks — can cause infinite loops or state sync issues.
- Currently suppressed with `eslint-disable`.
- **Fix:** Remove the fallback entirely or restructure as a wrapper component.

### 10.3 Magic Strings

#### **[Mi-08] Status/Role Strings Scattered** 🟡 Minor
- Job statuses, payment statuses, and roles are hardcoded strings in multiple files.
- **Fix:** Create shared constants file:
```javascript
// shared/constants.js
export const JOB_STATUSES = ['Pending', 'Processing', ...];
export const ROLES = ['Admin', 'Front Office', 'Designer', 'Printer', 'Accountant'];
export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'];
```

### 10.4 Potential Memory Issues

| Issue | Severity | File |
|-------|----------|------|
| `usePolling` without cleanup verification | 🟡 | usePolling.js |
| Event listeners in ErrorBoundary | 🟡 | ErrorBoundary.jsx |
| Large state objects in Billing | 🟡 | Billing.jsx |

---

## Summary: All Issues by Severity

### 🔴 Critical (8)

| ID | Issue | Area | Fix Effort |
|----|-------|------|-----------|
| C-01 | Job deletion without payment check | Backend | 30 min |
| C-02 | Staff deletion without referential check | Backend | 30 min |
| C-03 | Advance payment can exceed total | Backend | 15 min |
| C-04 | Refunds don't create reverse ledger entry | Backend | 1 hour |
| C-05 | `applied_extras` accepts any value (z.any()) | Validation | 20 min |
| C-06 | No logical status transition validation | Backend | 1 hour |
| C-07 | Cash + UPI sum not validated | Backend | 15 min |
| C-08 | Weak JWT secret | Security | 5 min |

### 🟠 Major (22)

| ID | Issue | Area |
|----|-------|------|
| M-01 | No min password length on login | Validation |
| M-02 | No password complexity requirements | Validation |
| M-03 | Date fields not format-validated | Validation |
| M-04 | Vendor phone/GSTIN not validated | Validation |
| M-05 | Attendance date can be in future | Validation |
| M-06 | Inconsistent frontend validation | Frontend |
| M-07 | No accessibility labels (aria-label) | Frontend |
| M-08 | Zero quantity jobs allowed (backend) | Validation |
| M-09 | Negative amounts not blocked server-side | Validation |
| M-10 | Critical missing database indexes (12) | Database |
| M-11 | No CHECK constraints on financial columns | Database |
| M-12 | Password change doesn't require old password | Security |
| M-13 | Inventory SKU lookup missing auth | Security |
| M-14 | Salary info cross-access possible | Security |
| M-15 | Content Security Policy disabled | Security |
| M-16 | HTTP fallback URL in api.js | Security |
| M-17 | Error stack traces leaked to client | Security |
| M-18 | 40+ SELECT * queries | Performance |
| M-19 | Missing pagination max on `?all=true` | Performance |
| M-20 | Silent catch blocks in frontend | Error Handling |
| M-21 | useAuth() conditional hook violation | Code Quality |
| M-22 | No request timeout configured | Frontend |

### 🟡 Minor (30)

| ID | Issue | Area |
|----|-------|------|
| Mi-01 | Inventory schema too loose | Validation |
| Mi-02 | Missing focus management in modals | Accessibility |
| Mi-03 | 40+ tables missing `updated_at` | Database |
| Mi-04 | No CSRF protection | Security |
| Mi-05 | No virtual scrolling for large lists | Performance |
| Mi-06 | No server-side error aggregation | Error Handling |
| Mi-07 | Duplicated branch check pattern (15+) | Code Quality |
| Mi-08 | Magic strings scattered | Code Quality |
| Mi-09 | Inconsistent timestamp column naming | Database |
| Mi-10 | Missing UNIQUE constraints (vendor name+branch, etc.) | Database |
| Mi-11 | Denormalized data in customer_payments (name, mobile) | Database |
| Mi-12 | product_code not indexed or unique | Database |
| Mi-13 | attendance_requests.requested_by is VARCHAR not INT FK | Database |
| Mi-14 | No token revocation mechanism | Security |
| Mi-15 | Debug logging in auth middleware (production) | Security |
| Mi-16 | `/uploads` served without access control | Security |
| Mi-17 | `order_link` URL protocol validation insufficient | Security |
| Mi-18 | No exponential backoff on offline sync | Frontend |
| Mi-19 | No "unsaved changes" indicator | UX |
| Mi-20 | No client-side rate limiting | Frontend |
| Mi-21 | Hard-coded timeout intervals | Code Quality |
| Mi-22 | Duplicate audit log entries possible | Code Quality |
| Mi-23 | No caching for getUserBranchId() | Performance |
| Mi-24 | No caching for getUsageMap() | Performance |
| Mi-25 | Large main bundle (862KB) | Performance |
| Mi-26 | No image compression on upload | Performance |
| Mi-27 | Product slabs can overlap (no min<max check) | Database |
| Mi-28 | credit_customers.current_balance directly editable | Database |
| Mi-29 | Inconsistent VARCHAR sizes across tables | Database |
| Mi-30 | balance_after not validated against ledger cumulative | Database |

---

## Suggested Automated Test Cases

### Backend API Tests (Jest + Supertest)

```javascript
// test/jobs.test.js
describe('Job Deletion Safety', () => {
  it('should reject deletion of job with linked payments', async () => {
    // Create job, create payment, attempt delete
    const res = await request(app)
      .delete(`/api/jobs/${jobWithPayments.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/payment/i);
  });

  it('should allow deletion of job without payments', async () => {
    const res = await request(app)
      .delete(`/api/jobs/${jobNoPayments.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('Payment Validation', () => {
  it('should reject advance exceeding total', async () => {
    const res = await request(app)
      .post('/api/customer-payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ total_amount: 1000, advance_paid: 1500, ...required });
    expect(res.status).toBe(400);
  });

  it('should reject mismatched cash+upi sum', async () => {
    const res = await request(app)
      .post('/api/customer-payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ advance_paid: 1000, cash_amount: 600, upi_amount: 600, ...required });
    expect(res.status).toBe(400);
  });

  it('should reject negative amounts', async () => {
    const res = await request(app)
      .post('/api/customer-payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ total_amount: -500, ...required });
    expect(res.status).toBe(400);
  });
});

describe('Status Transitions', () => {
  it('should reject invalid transition Delivered→Pending', async () => {
    // Set job to Delivered first
    const res = await request(app)
      .patch(`/api/jobs/${deliveredJobId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Pending' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot transition/i);
  });

  it('should allow valid transition Pending→Designing', async () => {
    const res = await request(app)
      .patch(`/api/jobs/${pendingJobId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Designing' });
    expect(res.status).toBe(200);
  });
});
```

### Security Tests

```javascript
describe('Authorization', () => {
  it('should deny Designer access to salary of another user', async () => {
    const res = await request(app)
      .get(`/api/staff/${otherStaffId}/salary-info`)
      .set('Authorization', `Bearer ${designerToken}`);
    expect(res.status).toBe(403);
  });

  it('should not leak error stack traces', async () => {
    const res = await request(app)
      .get('/api/jobs/INVALID_ID')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body).not.toHaveProperty('error');
    expect(res.body).not.toHaveProperty('stack');
  });

  it('should require old password for password change', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'NewP@ss123' }); // No currentPassword
    expect(res.status).toBe(400);
  });
});

describe('Input Validation', () => {
  it('should reject z.any() payloads in applied_extras', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ applied_extras: '<script>alert(1)</script>', ...validJob });
    expect(res.status).toBe(400);
  });

  it('should reject future attendance dates', async () => {
    const futureDate = '2027-01-01';
    const res = await request(app)
      .post('/api/staff/1/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attendance_date: futureDate, status: 'Present' });
    expect(res.status).toBe(400);
  });
});
```

### Database Integrity Tests

```sql
-- Test: No orphaned payments (jobs deleted but payments remain)
SELECT cp.id, cp.customer_name, cp.total_amount
FROM sarga_customer_payments cp
LEFT JOIN sarga_jobs j ON JSON_CONTAINS(cp.order_lines, CAST(j.id AS JSON), '$[*].job_id')
WHERE j.id IS NULL;

-- Test: No negative balances
SELECT id, customer_name, balance_amount
FROM sarga_customer_payments
WHERE balance_amount < 0;

-- Test: Cash + UPI == advance_paid
SELECT id, customer_name, cash_amount, upi_amount, advance_paid
FROM sarga_customer_payments
WHERE ABS((COALESCE(cash_amount,0) + COALESCE(upi_amount,0)) - advance_paid) > 0.01;

-- Test: No overlapping product slabs
SELECT a.id, b.id, a.product_id
FROM sarga_product_slabs a
JOIN sarga_product_slabs b ON a.product_id = b.product_id AND a.id < b.id
WHERE a.min_qty < COALESCE(b.max_qty, 999999999) AND b.min_qty < COALESCE(a.max_qty, 999999999);
```

---

## Recommended Fix Priority

### Sprint 1 (Immediate — 1-2 days)
1. **C-08** Rotate JWT secret to cryptographically random value
2. **C-03** Add advance ≤ total validation in customerPayments
3. **C-07** Add cash + UPI = advance validation
4. **C-01** Add payment check before job deletion
5. **M-17** Remove `error: err.message` from all 500 responses

### Sprint 2 (This week)
6. **C-06** Implement status transition matrix
7. **C-02** Add referential checks before staff deletion
8. **C-05** Replace `z.any()` with proper schema for applied_extras
9. **M-12** Require old password for password change
10. **M-10** Add all 12 missing database indexes

### Sprint 3 (Next sprint)
11. **C-04** Create reverse ledger entries for refunds
12. **M-09** Add CHECK constraints for negative amounts
13. **M-07** Add aria-label to icon buttons
14. **M-15** Enable Content Security Policy
15. **M-21** Fix useAuth conditional hook violation
16. **M-18** Replace SELECT * with column lists (start with hot endpoints)

### Backlog
17. All Minor issues (Mi-01 through Mi-30)
18. Password complexity requirements
19. Token refresh mechanism
20. Virtual scrolling for large lists
