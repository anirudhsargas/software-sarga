# Fix for Staff Suggestions Endpoint 500 Error

## Problem
The `/api/jobs/assignments/suggestions` endpoint was returning HTTP 500 Internal Server Error when called with a role parameter.

## Root Cause
The SQL query in the suggestions endpoint included an unquoted column name `jsa.role` in the WHERE clause filter. Since `role` is a MySQL **reserved keyword**, it needs to be quoted with backticks when used as a column identifier.

### Before (Line 293 in server/routes/jobs.js):
```javascript
if (role) {
    roleFilter = ' AND s.role = ? AND jsa.role = ?';  // ❌ ERROR: 'role' is reserved
    params.push(role, role);
}
```

### After (Fixed):
```javascript
if (role) {
    roleFilter = ' AND s.role = ? AND jsa.`role` = ?';  // ✓ FIXED: backticks added
    params.push(role, role);
}
```

## Impact
This fix resolves the 500 error and allows the staff assignment modal to successfully load auto-suggestions based on:
- Product IDs from the current job
- Staff role (Designer, Printer, Other Staff) selected by the user
- Past assignment history for that product+role combination

## Testing
The fix enables the complete flow:
1. User creates a bill with multiple products
2. User clicks "Assign Staff" button
3. User selects a role (Designer/Printer/Other Staff)
4. System calls `GET /api/jobs/assignments/suggestions?product_ids=1,2,3&role=Designer`
5. Endpoint now returns 200 OK with auto-suggestions
6. User can select from suggested staff or choose other available staff

## SQL Query Structure (Now Working)
```sql
SELECT j.product_id, jsa.staff_id, s.name, s.role,
       COUNT(*) AS assigned_count, MAX(jsa.assigned_date) AS last_assigned
FROM sarga_job_staff_assignments jsa
INNER JOIN sarga_jobs j ON j.id = jsa.job_id
INNER JOIN sarga_staff s ON s.id = jsa.staff_id
WHERE j.product_id IN (?)
  AND s.role = ?
  AND jsa.`role` = ?              -- ✓ Fixed: backticks added
GROUP BY j.product_id, jsa.staff_id
ORDER BY j.product_id, assigned_count DESC, last_assigned DESC
```

## Verification
File: [server/routes/jobs.js](server/routes/jobs.js#L293)
- Line 293: Backticks added to `jsa.`role``
- Query now properly escapes the reserved keyword
- Endpoint ready for use in client assignment modal
