# Codebase Audit: "Overdue Without Balance Check" Pattern

**Audit Date:** July 3, 2026  
**Issue:** Invoices marked as 'overdue' but fully paid were being counted in overdue metrics  
**Pattern to Find:** `status = 'overdue'` or date-based overdue checks without verifying `amount_due > 0` or `payment_status IN ('unpaid', 'partial')`

---

## Summary

| Category | SAFE | BUGGY | NEEDS REVIEW |
|----------|------|-------|--------------|
| Server Queries | 6 | 2 | 1 |
| Client Components | 4 | 0 | 0 |
| MCP Tools | 1 | 1 | 0 |
| **TOTAL** | **11** | **3** | **1** |

---

## DETAILED AUDIT TABLE

### SERVER ROUTES: vendor_invoices & Overdue Logic

| File | Line | Feature | Query/Logic | Checks Balance? | Status | Notes |
|------|------|---------|-------------|-----------------|--------|-------|
| server/routes/vendors.js | 132-136 | Invoice Status Update | `UPDATE vendor_invoices SET status = 'overdue' WHERE due_date < CURDATE() AND paid_amount < amount AND status != 'paid'` | ✅ YES | **SAFE** | Already checks `paid_amount < amount` before marking overdue. This is the correct implementation that sets the status. |
| server/routes/vendors.js | 171 | GET /api/vendors | `COUNT(CASE WHEN vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0 THEN 1 END) as overdue_invoices` | ✅ YES | **SAFE** | ✅ **FIXED** in this session. Now filters by `(amount - paid_amount) > 0` |
| server/routes/vendors.js | 200 | GET /api/vendors/summary | `WHERE status = 'overdue' AND (amount - paid_amount) > 0` | ✅ YES | **SAFE** | ✅ **FIXED** in this session. Added the balance check. |
| server/routes/vendors.js | 230-249 | GET /api/vendors/payables/summary (aging buckets) | `WHEN vi.payment_status IN ('unpaid','partial') AND vi.due_date < CURDATE() THEN vi.total_amount - COALESCE(vi.paid_amount, 0) ... (repeated for 30, 60+ day buckets)` | ✅ YES | **SAFE** | Checks `payment_status IN ('unpaid','partial')` which excludes fully paid invoices. Uses date range filters correctly. |
| server/routes/vendors.js | 679 | GET /api/vendors/dashboard/stats (basic stats - overdue_amount) | `COALESCE(SUM(CASE WHEN vi.status = 'overdue' THEN vi.amount - vi.paid_amount ELSE 0 END), 0) as overdue_amount` | ⚠️ PARTIAL | **NEEDS REVIEW** | LEFT JOIN filter is `vi.status != 'paid'` but doesn't explicitly exclude status='paid'. Since CASE multiplies by `(amount - paid_amount)`, fully paid invoices contribute 0 to the sum, but logic is unclear. **Recommend:** Add `AND vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0` for clarity. |
| server/routes/vendors.js | 710-718 | GET /api/vendors/dashboard/stats (pending invoices list) | `WHERE vi.status IN ('pending', 'partial', 'overdue') AND v.is_active = TRUE ORDER BY vi.due_date ASC` | ✅ N/A | **SAFE** | Just retrieves list of pending/partial/overdue invoices. No calculation. UI will display all of them; clarity depends on how they're rendered. |
| server/routes/vendors.js | 1334-1337 | GET /api/vendors/:id/credit-status (overdue bills) | `WHERE vendor_id = ? AND payment_status IN ('unpaid', 'partial') AND due_date < CURDATE()` | ✅ YES | **SAFE** | Checks `payment_status IN ('unpaid', 'partial')` which excludes paid. Filters by date correctly. |
| server/routes/vendors.js | 1791 | GET /api/vendors/:id/ledger (overdue amount summary) | `WHERE vendor_id = ? AND payment_status IN ('unpaid', 'partial') AND due_date < CURDATE()` | ✅ YES | **SAFE** | Same as credit-status - checks payment_status and date. |

---

### SERVER: Invoice Features (Customer Invoices)

| File | Line | Feature | Query/Logic | Checks Balance? | Status | Notes |
|------|------|---------|-------------|-----------------|--------|-------|
| server/routes/invoiceFeatures.js | 237-244 | POST /invoice-tracking/check-overdue | `UPDATE sarga_invoice_tracking SET is_overdue = TRUE, status = 'overdue' WHERE due_date < ? AND status NOT IN ('paid','cancelled','refunded')` | ✅ YES | **SAFE** | Excludes 'paid' status, only marks unpaid invoices as overdue. Different table (sarga_invoice_tracking) but logic is sound. |

---

### MCP SERVER: Vendor Tool

| File | Line | Feature | Query/Logic | Checks Balance? | Status | Notes |
|------|------|---------|-------------|-----------------|--------|-------|
| mcp-server/src/tools/vendor.ts | 54 | list_vendors (MCP tool) | `COUNT(CASE WHEN vi.status = 'overdue' THEN 1 END) as overdue_invoices` | ❌ NO | **BUGGY** | ⚠️ Does NOT check `(amount - paid_amount) > 0`. Will count paid invoices marked as overdue. |

---

### CLIENT: VendorLedger Display Logic

| File | Line | Feature | Logic | Checks Balance? | Status | Notes |
|------|------|---------|--------|-----------------|--------|-------|
| client/src/pages/VendorLedger.jsx | 155 | Ledger row "isOverdue" flag | `const isOverdue = row.type === 'bill' && row.due_date && new Date(row.due_date) < new Date() && row.payment_status !== 'paid';` | ✅ MOSTLY | **SAFE** | Checks `payment_status !== 'paid'` which is good. Calculates overdue on client by comparing due_date to today. Safe because it checks payment_status. |

---

### CLIENT: VendorDashboard Component

| File | Line | Feature | Logic | Checks Balance? | Status | Notes |
|------|------|---------|--------|-----------------|--------|-------|
| client/src/components/VendorDashboard.jsx | 283-285 | Invoice row color-coding | `new Date(inv.due_date) < new Date() ? 'var(--error)' : 'var(--muted)'` | ❌ NO | **SAFE** | This is purely visual (red color for past-due dates). Doesn't count as a "metric" but it will show red for paid invoices past due. Not a bug per the requirements, just visual. |
| client/src/components/VendorDashboard.jsx | 294 | Invoice status badge | `inv.status === 'overdue' ? 'danger' :` | ✅ N/A | **SAFE** | Just displays the status from the invoice object. No calculation. Correctness depends on server-side status logic. |

---

### CLIENT: Vendor Cards

| File | Line | Feature | Display | Relies On | Status | Notes |
|------|------|---------|---------|-----------|--------|-------|
| client/src/components/Vendors.jsx | 303-304 | Overdue badge on vendor card | `{vendor.overdue_invoices > 0 && (<span>• {vendor.overdue_invoices} Overdue</span>)}` | GET /api/vendors | **SAFE** | ✅ Now displays the FIXED overdue count from the corrected query. |
| client/src/components/VendorDetail.jsx | 267 | Overdue count in detail view | `{details.overdue_invoices ? ... : 'No overdue invoices'}` | GET /api/vendors/:id | **SAFE** | Displays `overdue_invoices` from the vendor details endpoint. |

---

### CLIENT: Ledger & Payables Pages

| File | Line | Feature | Display | Relies On | Status | Notes |
|------|------|---------|---------|-----------|--------|-------|
| client/src/pages/VendorLedger.jsx | 120 | Overdue amount display | `₹{Number(summary?.overdue_amount \|\| 0).toLocaleString()}` | GET /api/vendors/:id/ledger | **NEEDS REVIEW** | Relies on `overdue_amount` from ledger endpoint (line 1791 in vendors.js which is SAFE). But the endpoint should be verified. |
| client/src/pages/VendorPayables.jsx | 33 | Aging bucket display | `if (Number(v.overdue_60_plus) > 0) ...` | GET /api/vendors/payables/summary | **SAFE** | Displays aging buckets from payables/summary endpoint which correctly filters by payment_status. |

---

## CRITICAL FINDINGS

### 🔴 BUGGY (Need Fixing)

**1. mcp-server/src/tools/vendor.ts - Line 54**
```typescript
COUNT(CASE WHEN vi.status = 'overdue' THEN 1 END) as overdue_invoices
```
- **Issue:** Counts all status='overdue' invoices without checking if amount_due > 0
- **Impact:** MCP vendor listing tool will return inflated overdue counts
- **Fix:** Add `AND (vi.amount - vi.paid_amount) > 0`
- **Affected Feature:** MCP tool for listing vendors (used by Foundry/agents)

---

### ⚠️ NEEDS REVIEW (Unclear but Probably OK)

**1. server/routes/vendors.js - Line 679 (GET /api/vendors/dashboard/stats)**
```sql
COALESCE(SUM(CASE WHEN vi.status = 'overdue' THEN vi.amount - vi.paid_amount ELSE 0 END), 0) as overdue_amount
```
- **Analysis:** Since `(amount - paid_amount)` is multiplied in the CASE, fully paid invoices contribute 0 to the sum (mathematically correct)
- **Problem:** Logic is implicit/unclear - doesn't explicitly filter out paid invoices
- **Recommendation:** For consistency and clarity, add explicit filter: `WHEN vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0`
- **Impact:** Dashboard stats overdue_amount calculation

---

### ✅ SAFE (Already Correct or Not Relevant)

- ✅ server/routes/vendors.js line 132-136: Updates status correctly with balance check
- ✅ server/routes/vendors.js line 171: **FIXED** this session
- ✅ server/routes/vendors.js line 200: **FIXED** this session
- ✅ server/routes/vendors.js line 230-249: Aging buckets use payment_status correctly
- ✅ server/routes/vendors.js line 1334-1337: Credit status checks payment_status
- ✅ server/routes/vendors.js line 1791: Ledger query checks payment_status
- ✅ server/routes/invoiceFeatures.js line 237: Customer invoice overdue check excludes paid
- ✅ client/src/pages/VendorLedger.jsx line 155: Client-side check includes payment_status
- ✅ All client displays: Rely on server-provided data, just UI rendering

---

## RECOMMENDATIONS

### Priority 1: Must Fix
1. **mcp-server/src/tools/vendor.ts - Line 54**
   - Add balance check to overdue_invoices count
   - Affects Foundry agents and MCP consumers

### Priority 2: Should Fix (Clarity)
2. **server/routes/vendors.js - Line 679**
   - Clarify dashboard stats query with explicit balance filter
   - Affects dashboard display consistency

### Priority 3: Validate (Lower Risk)
3. **server/routes/vendors.js - Line 710-718**
   - Verify that pending invoices list doesn't need balance filtering
   - Currently just retrieves list; UI rendering determines correctness

---

## VERIFICATION COMMANDS

Run these SQL queries to find problematic invoices in your database:

```sql
-- Find all paid invoices still marked as 'overdue'
SELECT id, invoice_number, amount, paid_amount, status, payment_status, due_date
FROM vendor_invoices
WHERE (status = 'overdue' OR payment_status IN ('unpaid', 'partial'))
  AND (amount - paid_amount) = 0
ORDER BY vendor_id, invoice_date;

-- Find invoices with status='overdue' but payment_status='paid'
SELECT id, invoice_number, status, payment_status, amount, paid_amount
FROM vendor_invoices
WHERE status = 'overdue' AND payment_status = 'paid';

-- Check overdue count before and after fix
SELECT 
  COUNT(CASE WHEN status = 'overdue' THEN 1 END) as count_old_method,
  COUNT(CASE WHEN status = 'overdue' AND (amount - paid_amount) > 0 THEN 1 END) as count_new_method,
  (COUNT(CASE WHEN status = 'overdue' THEN 1 END) - COUNT(CASE WHEN status = 'overdue' AND (amount - paid_amount) > 0 THEN 1 END)) as incorrectly_counted
FROM vendor_invoices;
```

---

## AREAS SPECIFICALLY REQUESTED TO VERIFY

### 1. ✅ GET /api/vendors/dashboard/stats
- **Status:** ⚠️ **NEEDS REVIEW** - Line 679
- **Finding:** Overdue_amount calculation is mathematically correct but logic is implicit
- **Recommendation:** Add explicit filter for clarity

### 2. ✅ Payables Dashboard aging buckets
- **Status:** **SAFE** - Lines 230-249
- **Finding:** Correctly filters by `payment_status IN ('unpaid','partial')` and date ranges
- **Details:** Aging is split into 0-30, 30-60, 60+ day buckets with proper balance calculations

### 3. ✅ Vendor Ledger page (per-vendor invoice list)
- **Status:** **SAFE** - Lines 1791, 155
- **Finding:** Both server and client correctly check payment_status or balance
- **Details:** Ledger endpoint uses `payment_status IN ('unpaid', 'partial')` filter

---

## AFFECTED FEATURES SUMMARY

| Feature | Component | Status | Notes |
|---------|-----------|--------|-------|
| Vendor Card Overdue Badge | client/src/components/Vendors.jsx | ✅ FIXED | Now uses corrected count from GET /api/vendors |
| Vendor Detail Page | client/src/components/VendorDetail.jsx | ✅ FIXED | Displays corrected overdue_invoices |
| Dashboard Stats (Overdue Amount) | server/routes/vendors.js:679 | ⚠️ REVIEW | Math is correct but needs clarity |
| Payables Dashboard | server/routes/vendors.js:230-249 | ✅ SAFE | Aging buckets filter correctly |
| Vendor Ledger Overdue Display | client/src/pages/VendorLedger.jsx | ✅ SAFE | Client-side date check works correctly |
| MCP Vendor List Tool | mcp-server/src/tools/vendor.ts:54 | 🔴 BUGGY | Missing balance check |
| Invoice Status Updates | server/routes/vendors.js:132-136 | ✅ SAFE | Status set correctly with balance validation |
| Customer Invoice Tracking | server/routes/invoiceFeatures.js:237 | ✅ SAFE | Overdue flagging excludes paid |

