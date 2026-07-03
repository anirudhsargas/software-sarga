# Vendor Overdue Bug Fix - Test Cases

## Problem Identified

**Inconsistency:** A vendor showed:
- Outstanding: ₹0 (correctly calculated as SUM of unpaid invoice amounts)
- Overdue Badge: "1 Overdue" (incorrectly counted invoices marked as 'overdue' without checking if amount_due > 0)

**Root Cause:** Invoices marked as 'overdue' were counted even after being fully paid. The `overdue_invoices` count was based only on `status = 'overdue'` without verifying that `(amount - paid_amount) > 0`.

## Test Scenario

To reproduce and validate the fix, use the following SQL test case:

```sql
-- SETUP: Create test data
INSERT INTO vendors (name, contact_person, phone, is_active) 
VALUES ('Test Vendor - Overdue Bug', 'John Doe', '9876543210', 1);

-- Get the vendor ID
SET @vendor_id = LAST_INSERT_ID();

-- Create an invoice that is overdue by date but fully paid
INSERT INTO vendor_invoices 
(vendor_id, invoice_number, invoice_date, due_date, amount, paid_amount, status) 
VALUES 
(@vendor_id, 'INV-001', '2026-05-01', '2026-05-15', 10000, 10000, 'overdue');

-- Verify the issue BEFORE fix
SELECT 
  v.id,
  v.name,
  vi.invoice_number,
  vi.due_date,
  vi.amount,
  vi.paid_amount,
  (vi.amount - vi.paid_amount) as amount_due,
  vi.status
FROM vendors v
LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id
WHERE v.name = 'Test Vendor - Overdue Bug';

-- BEFORE FIX: This would return 1 overdue invoice (wrong!)
SELECT 
  COUNT(CASE WHEN vi.status = 'overdue' THEN 1 END) as overdue_invoices_BUGGY,
  COUNT(CASE WHEN vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0 THEN 1 END) as overdue_invoices_FIXED
FROM vendor_invoices vi
WHERE vi.vendor_id = @vendor_id;

-- GET /api/vendors BEFORE fix query:
-- ===================================
SELECT
  v.*,
  COALESCE(SUM(CASE WHEN vi.invoice_date BETWEEN '2026-07-01' AND '2026-07-31' THEN vi.amount ELSE 0 END), 0) as this_month_spend,
  COALESCE(SUM(vi.amount - vi.paid_amount), 0) as pending_amount,
  COUNT(vi.id) as total_invoices,
  COUNT(CASE WHEN vi.status = 'overdue' THEN 1 END) as overdue_invoices  -- BUG: counts paid invoices
FROM vendors v
LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id
WHERE v.name = 'Test Vendor - Overdue Bug'
GROUP BY v.id;
-- BEFORE: pending_amount = 0, overdue_invoices = 1 ❌ CONTRADICTION


-- GET /api/vendors AFTER fix query:
-- ==================================
SELECT
  v.*,
  COALESCE(SUM(CASE WHEN vi.invoice_date BETWEEN '2026-07-01' AND '2026-07-31' THEN vi.amount ELSE 0 END), 0) as this_month_spend,
  COALESCE(SUM(vi.amount - vi.paid_amount), 0) as pending_amount,
  COUNT(vi.id) as total_invoices,
  COUNT(CASE WHEN vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0 THEN 1 END) as overdue_invoices  -- FIXED: only counts if unpaid
FROM vendors v
LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id
WHERE v.name = 'Test Vendor - Overdue Bug'
GROUP BY v.id;
-- AFTER: pending_amount = 0, overdue_invoices = 0 ✅ CONSISTENT


-- GET /api/vendors/summary BEFORE fix:
-- ====================================
SELECT COALESCE(SUM(amount - paid_amount), 0) as total_overdue
FROM vendor_invoices
WHERE status = 'overdue';  -- BUG: includes paid invoices


-- GET /api/vendors/summary AFTER fix:
-- ===================================
SELECT COALESCE(SUM(amount - paid_amount), 0) as total_overdue
FROM vendor_invoices
WHERE status = 'overdue' AND (amount - paid_amount) > 0;  -- FIXED: only unpaid


-- CLEANUP
DELETE FROM vendor_invoices WHERE vendor_id = @vendor_id;
DELETE FROM vendors WHERE id = @vendor_id;
```

## Expected Behavior After Fix

### Test Case 1: Fully Paid Invoice Marked as Overdue
| Metric | Value | Expected |
|--------|-------|----------|
| Invoice Amount | ₹10,000 | - |
| Paid Amount | ₹10,000 | - |
| Amount Due | ₹0 | - |
| Status | Overdue | - |
| Outstanding (pending_amount) | ₹0 | ✅ Correct |
| Overdue Count (overdue_invoices) | 0 | ✅ Fixed! (was 1 before) |

### Test Case 2: Partially Paid Invoice Marked as Overdue
| Metric | Value | Expected |
|--------|-------|----------|
| Invoice Amount | ₹10,000 | - |
| Paid Amount | ₹6,000 | - |
| Amount Due | ₹4,000 | - |
| Status | Overdue | - |
| Outstanding (pending_amount) | ₹4,000 | ✅ Correct |
| Overdue Count (overdue_invoices) | 1 | ✅ Consistent |

### Test Case 3: Unpaid Invoice Marked as Overdue
| Metric | Value | Expected |
|--------|-------|----------|
| Invoice Amount | ₹10,000 | - |
| Paid Amount | ₹0 | - |
| Amount Due | ₹10,000 | - |
| Status | Overdue | - |
| Outstanding (pending_amount) | ₹10,000 | ✅ Correct |
| Overdue Count (overdue_invoices) | 1 | ✅ Consistent |

## Changes Made

### File: `server/routes/vendors.js`

**Change 1:** Line 171 in `GET /api/vendors` endpoint
```diff
- COUNT(CASE WHEN vi.status = 'overdue' THEN 1 END) as overdue_invoices
+ COUNT(CASE WHEN vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0 THEN 1 END) as overdue_invoices
```

**Change 2:** Line 189 in `GET /api/vendors/summary` endpoint
```diff
- WHERE status = 'overdue'
+ WHERE status = 'overdue' AND (amount - paid_amount) > 0
```

## Verification Queries

Run these queries to verify the fix is working:

```sql
-- 1. Find all vendors with mismatched Outstanding vs Overdue
SELECT
  v.id,
  v.name,
  COALESCE(SUM(vi.amount - vi.paid_amount), 0) as pending_amount,
  COUNT(CASE WHEN vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0 THEN 1 END) as overdue_count_fixed
FROM vendors v
LEFT JOIN vendor_invoices vi ON v.id = vi.vendor_id
GROUP BY v.id, v.name
HAVING (pending_amount = 0 AND overdue_count_fixed > 0) 
   OR (pending_amount > 0 AND overdue_count_fixed = 0)
ORDER BY v.name;
-- Should return 0 rows if fix is working correctly


-- 2. Verify total_overdue consistency
SELECT
  COALESCE(SUM(vi.amount - vi.paid_amount), 0) as total_unpaid,
  COALESCE(SUM(CASE WHEN vi.status = 'overdue' THEN vi.amount - vi.paid_amount ELSE 0 END), 0) as total_overdue_fixed
FROM vendor_invoices vi
WHERE vi.status = 'overdue' AND (vi.amount - vi.paid_amount) > 0;
-- Both values should match (or overdue should be <= unpaid)


-- 3. Count of invoices: make sure overdue_invoices matches overdue status
SELECT
  COUNT(CASE WHEN status = 'overdue' AND (amount - paid_amount) > 0 THEN 1 END) as overdue_with_balance,
  COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
  COUNT(CASE WHEN status = 'overdue' AND (amount - paid_amount) = 0 THEN 1 END) as overdue_but_paid
FROM vendor_invoices;
-- The "overdue_but_paid" count shows how many paid invoices were incorrectly counted before
```

## Impact

- ✅ Outstanding and Overdue stats are now derived from the same source of truth
- ✅ Contradictory vendor card displays (₹0 Outstanding + "1 Overdue") are eliminated
- ✅ Both endpoints (`/api/vendors` and `/api/vendors/summary`) now filter consistently
