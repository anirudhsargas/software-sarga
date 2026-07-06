# Role-Based Access Control (RBAC) Audit Report
**Sarga Prints MIS Codebase**
*Date: 2026-07-04*

---

## 1. Executive Summary
An exhaustive role-based access control (RBAC) audit was performed across the Sarga Prints MIS repository, covering the frontend React client (`client/`) and the Express backend server (`server/`). 

The audit revealed multiple critical logic vulnerabilities, including **unauthenticated admin endpoints**, **Insecure Direct Object References (IDOR/BOLA)** allowing cross-branch data manipulation, **non-reactive frontend contexts** creating authorization bypass opportunities, **frontend-backend role mismatches**, and **hardcoded role comparisons** instead of standardized role checking utilities.

---

## 2. Core Architectural Vulnerabilities

### 2.1. Critical Security Vulnerability: Unauthenticated Sheets Backup & Restore
The backend router `server/routes/sheetsBackup.js` contains administrative endpoints (such as `/run`, `/full`, `/restore/apply`, `/restore/rollback`) that are mounted globally under `/api/backup/` in `server/index.js`. 
* **The Flaw**: These endpoints do not apply `authenticateToken` or any role-checking middleware.
* **The Impact**: Any unauthenticated client on the internet can trigger database-wide Google Sheets backup exports, query sync logs, or execute mock restoration rollbacks.

### 2.2. Insecure Direct Object References (IDOR/BOLA) & Branch Isolation Bypass
Branch-scoped roles (e.g., *Front Office* assigned to *Perambra* vs. *Meppayur*) must be strictly isolated to their own branch's data. However, the backend lacks validation checks at the resource level:
* **Resource Bypass (`GET /jobs/:id` & `PUT /jobs/:id`)**: The handlers in `server/routes/jobs.js` query `sarga_jobs` using only `req.params.id`. They do not check if the retrieved job's `branch_id` matches `req.user.branch_id`. A Front Office user from Perambra can view and modify jobs belonging to Meppayur.
* **Parameter Hijacking on Updates (`PUT /jobs/:id`)**: When a Front Office user performs a write operation, the `authenticate` middleware automatically overwrites `req.body.branch_id = req.user.branch_id`. If they send a `PUT` request to a job belonging to another branch, the job's branch ID will be overwritten with the user's branch ID, effectively moving/stealing the job across branches.
* **Query Parameter Bypass (`GET /jobs`)**: The list endpoint checks `qBranch = req.query.branch_id`. If `qBranch` is provided, it is appended to the query without validating the user's privilege tier. A Front Office user can bypass the default branch restriction by simply adding `?branch_id=2` to the query parameters.

### 2.3. Buggy Context State (`BranchContext.jsx`)
In `client/src/contexts/BranchContext.jsx`, the context values `isFrontOffice` and `assignedBranchName` are calculated statically:
```javascript
const user = auth.getUser();
const isFrontOffice = user?.role === 'Front Office';
const assignedBranchName = getBranchName(user?.branch_id);
```
* **The Flaw**: Because `user` is fetched once on mount from local storage (not from React state), the context does not re-render when a user signs in, logs out, or changes accounts. This leaves the frontend UI in a stale authentication state.
* **Casing Flaw**: It uses a raw string comparison (`user?.role === 'Front Office'`) instead of `auth.normalizeRole()`. If the token contains `'front office'` (lowercase), the check fails.

### 2.4. Missing Backend Role Enforcement (JWT Only)
Over 200 endpoints (e.g., in `dailyReportUnified.js`, `paperInventory.js`, `inventory.js`, `consumablesInventory.js`) are only gated by JWT validation (`authenticateToken` or `auth.authenticate`) and completely lack role checks. Any authenticated staff member (e.g., a *Printer* or *Designer*) can query daily cashbooks, add inventory records, or list customers.

---

## 3. Audited Route & Page Table

| Endpoint/Page | Required Role(s) | Enforcement Location | Status | One-line Fix Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **`BranchContext.jsx`** (isFrontOffice / branch state) | All authenticated users | Frontend (Context) | **Buggy** | Consume `useAuth()` to get reactive `user` state and wrap role checks in `auth.normalizeRole()`. |
| **`/api/backup/*`** (Google Sheets Backup / Restore) | Admin | Backend (Missing) | **Missing** | Apply `authenticateToken` and `authorizeRoles('Admin')` to all routes in `sheetsBackup.js`. |
| **`/api/daily-report/*`** (Unified Cashbook / balance / credits) | Admin, Accountant, Front Office | Frontend only | **Missing** | Apply `auth.requireRole(['Admin', 'Accountant', 'Front Office'])` to all daily cashbook routes. |
| **`/api/opening-balance`** (PUT) | Admin | Code check (Hardcoded) | **Mismatch** | Replace hardcoded `isAdmin` check inside handler with standardized `authorizeRoles('Admin')` middleware. |
| **`/api/jobs/:id`** (GET / Details) | Admin, Accountant, Front Office, Designer, Printer | Frontend only | **Mismatch** | If user is non-privileged, verify `job.branch_id === req.user.branch_id` before returning details. |
| **`/api/jobs/:id`** (PUT / Update) | Admin, Accountant, Front Office, Designer, Printer | Frontend only | **Mismatch** | Verify `currentJob.branch_id === req.user.branch_id` before applying updates. |
| **`/api/jobs`** (GET / List) | Admin, Accountant, Front Office, Designer, Printer | Both | **Mismatch** | Restrict `qBranch` override query param to privileged roles (`Admin`, `Accountant`) in `jobs.js`. |
| **`/api/product-categories`** (POST/PUT/DELETE) | Admin, Accountant | Both (Mismatched) | **Mismatch** | Remove category modification access from `Designer` and `Front Office` on the frontend. |
| **`/api/machines/:id/readings`** (POST) | Admin | Code check (Hardcoded) | **Mismatch** | Replace hardcoded `req.user.role === 'Admin'` inside handler with `authorizeRoles('Admin')`. |
| **`/api/requests/customer-change`** (POST) | Admin, Accountant | Both (Mismatched) | **Mismatch** | Replace hardcoded `req.user.role !== 'Admin'` check in `requests.js` with structured middleware. |
| **`/api/cctv/attendance/:id`** (DELETE) | Admin | Both (Mismatched) | **Mismatch** | Remove delete attendance permissions from `Accountant` in frontend configuration to match backend. |
| **`/api/blog/admin/posts`** (POST/PUT/DELETE) | Admin, Accountant, Designer | Both (Mismatched) | **Mismatch** | Add `Front Office` to backend roles OR remove blog modification rights from `Front Office` on frontend. |
| **`/api/dev/*`** (Dev helper routes) | None (Dev only) | Backend | **OK** | Handled correctly (completely disabled when `NODE_ENV === 'production'`). |
| **`/api/backups`** (Database MySQL dump) | Admin | Both | **OK** | Correctly restricted via `authenticateToken` and `authorizeRoles('Admin')`. |
| **`/api/customers`** (POST/PUT) | Admin, Accountant, Front Office | Both | **Missing** | Apply `authorizeRoles('Admin', 'Accountant', 'Front Office')` to POST/PUT routes in `customers.js`. |
| **`/api/inventory/consumables`** (GET) | Admin, Accountant, Front Office | Frontend only | **Missing** | Apply `authorizeRoles('Admin', 'Accountant', 'Front Office')` to read/list routes in `consumablesInventory.js`. |
| **`/api/stock-verification`** (GET) | Admin, Accountant | Code check (Hardcoded) | **Mismatch** | Replace raw check `['Admin', 'Accountant'].includes(req.user.role)` in `stockVerification.js` with middleware. |
| **`/api/schedules/:id`** (DELETE) | Admin | Code check (Hardcoded) | **Mismatch** | Replace inline check `req.user.role !== 'Admin'` in `scheduleManagement.js` with `authorizeRoles('Admin')`. |
| **`/api/staff/:id/attendance`** (POST) | Admin, Accountant, Front Office | Code check (Hardcoded) | **Mismatch** | Replace inline checks with `authorizeRoles('Admin', 'Accountant', 'Front Office')`. |
| **`/admin/sample-requests`** (GET) | Admin, Accountant, Designer | Code check (Hardcoded) | **Mismatch** | Replace `requireAdminRoles` helper string comparison in `premiumFeatures.js` with standardized middleware. |

---

## 4. Hardcoded Role Comparison Audit
Multiple backend route files implement role enforcement by checking `req.user.role` strings inline rather than using `authorizeRoles` or `requireRole`. This introduces vulnerabilities if the role casing varies (e.g., `'front office'` vs `'Front Office'`).

The following endpoints contain hardcoded checks that must be refactored:
1. **`dailyReportUnified.js` (Line 59)**: `req.user.role === 'Admin'`
2. **`dashboardInit.js` (Lines 9-11)**: `req.user.role === 'Admin'`, `req.user.role === 'Accountant'`, `req.user.role === 'Front Office'`
3. **`machines.js` (Line 761)**: `req.user.role === 'Admin'`
4. **`products.js` (Lines 541, 683, 868)**: `req.user.role !== 'Admin'`
5. **`requests.js` (Lines 114, 312, 358, 380)**: `req.user.role !== 'Admin'` and `req.user.role === 'Admin'`
6. **`scheduleManagement.js` (Line 161)**: `req.user.role !== 'Admin'`
7. **`staffDashboard.js` (Lines 576, 593)**: `req.user.role !== 'Admin'` and checks against a local `allowedRoles` array
8. **`stockVerification.js` (Line 26)**: `['Admin', 'Accountant'].includes(req.user.role)`
9. **`premiumFeatures.js` (Line 278)**: `!['Admin', 'Designer', 'Accountant'].includes(req.user.role)`

---

## 5. Suggested Remediation Strategy

### 5.1. Standardize Role Checks
All inline role checks must be migrated to `authorizeRoles(...roles)` or `requireRole([...roles])` from `server/middleware/auth.js`. This middleware normalizes user roles using `normalizeRole()`, preventing bypasses due to mismatched string casing (e.g., `'front office'` vs `'Front Office'`).

### 5.2. Enforce Branch Isolation in Backend Queries
Modify all resource-specific middleware or endpoint handlers to validate branch ownership:
* For job updates, query the existing job details first, verify `existingJob.branch_id === req.user.branch_id` (unless user is `Admin` or `Accountant`), and reject the request with `403 Forbidden` if it fails.
* Ensure list endpoints do not allow overriding `branch_id` via query parameters unless the user is an `Admin` or `Accountant`.

### 5.3. Correct BranchContext.jsx Reactivity
Refactor `BranchContext.jsx` to consume the reactive `user` state directly from the `useAuth` hook:
```javascript
import useAuth from '../hooks/useAuth';

// Inside BranchProvider:
const { user } = useAuth();
const isFrontOffice = auth.normalizeRole(user?.role) === 'Front Office';
```
This ensures that the frontend UI elements (menu options, action buttons) adapt immediately when auth state changes.
