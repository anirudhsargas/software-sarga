# SARGA REPO — FIX PROMPT (CSS, Dead Code, Schema Drift, Tests, Docs)

> **Repo:** `D:\software sarga` (Sarga Prints MIS)  
> **Scope:** Build safety, code hygiene, CSS consolidation, schema cleanup, test cleanup, doc accuracy  
> **Excludes:** ML service localhost fallback (intentionally out of scope)

---

## RULES

1. **Read before editing.** Every file must be read before any edit.
2. **Verify zero importers before deleting.** Use `grep` / `ripgrep` to confirm a component/page has no importers.
3. **Make minimal surgical edits.** Do not refactor unrelated code.
4. **Preserve working behavior.** If a file is dynamically imported (e.g., via a string-based route resolver), keep it.
5. **Build must pass.** After all changes, `npm run build` must succeed in `client/` and `website/`, and `npm run test` must succeed in `server/`.

---

## ISSUE A — CSS Class Conflicts (P1)

**Problem:** `.modal`, `.modal--large`, `.badge`, `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, and `.btn-sm` have conflicting definitions across multiple files. This causes unpredictable UI rendering depending on CSS load order.

### Evidence
| Class | Conflicting Files | Conflicting Values |
|---|---|---|
| `.modal` | `client/src/index.css` | `max-width: 500px` |
| `.modal` | `client/src/styles/components/modals.css` | `max-width: 420px`, `display: flex` |
| `.modal` | `client/src/pages/Billing.css` | `max-width: 480px` |
| `.modal` | `client/src/pages/JobDetail.css` | `max-width: 400px` |
| `.modal` | `client/src/pages/BlogCMS.css` | `max-width: 1100px`, `display: flex`, `height: 90vh` |
| `.modal` | `client/src/pages/Customers.css` | `max-width: 520px` |
| `.modal` | `client/src/pages/ExpenseManager.css` | different `backdrop-filter` |
| `.modal--large` | `client/src/index.css` | `max-width: 640px` |
| `.modal--large` | `client/src/styles/components/modals.css` | `max-width: 800px` |
| `.modal--large` | `client/src/pages/BlogCMS.css` | `max-width: 1100px` |
| `.badge` | `client/src/index.css`, `client/src/pages/StockTransfer.css`, `client/src/pages/Vendors.css`, `website/src/index.css` | Different border-radius, uppercase, letter-spacing |
| `.btn` / `.btn-primary` | `client/src/styles/buttons.css`, `website/src/index.css` | Different padding, height, shadow, border |

### Fix Steps

1. **Make `client/src/styles/components/modals.css` the single source of truth** for `.modal`, `.modal--large`, `.modal--xlarge`, `.modal-backdrop`, `.modal-overlay`, `.modal-header`, `.modal-body`, `.modal-footer`, `.modal-title`, `.modal-close`.
2. **Remove duplicate `.modal` / `.modal--*` rules** from:
   - `client/src/index.css` (lines ~1552–1603)
   - `client/src/pages/Billing.css` (search `.modal` / `.modal-backdrop`)
   - `client/src/pages/JobDetail.css` (search `.modal`)
   - `client/src/pages/BlogCMS.css` (search `.modal--large`)
   - `client/src/pages/Customers.css` (search `.modal`)
   - `client/src/pages/ExpenseManager.css` (search `.modal` / `.modal-backdrop`)
3. **For page-specific modal sizing**, use scoped class names instead of overriding global `.modal`:
   - BlogCMS wide modal → `.blog-cms-modal` or `.modal--blog` (add to `modals.css`)
   - JobDetail narrow modal → `.modal--narrow` (add to `modals.css` as `max-width: 400px`)
   - Customers modal → `.modal--customer` (add to `modals.css` as `max-width: 520px`)
   - Billing modal → `.modal--billing` (add to `modals.css` as `max-width: 480px`)
4. **Make `client/src/styles/buttons.css` the single source of truth** for `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-sm`, `.btn-lg`, `.btn-icon`.
5. **Remove duplicate `.btn` / `.btn-*` rules** from `website/src/index.css`. If the website needs different button styling, create `website/src/styles/buttons.css` and import it there instead of redefining the same class names.
6. **Create `client/src/styles/components/badges.css`** (if it doesn't exist) as the single source of truth for `.badge` and `.badge--*` variants. Remove `.badge` overrides from:
   - `client/src/pages/StockTransfer.css`
   - `client/src/pages/Vendors.css`
   - `website/src/index.css`
7. **Ensure `client/src/index.css` still imports the component CSS files** at the top if it doesn't already.

---

## ISSUE B — Delete Orphaned Components (P1)

**Problem:** 20 components are defined but never imported by any route or parent. They are dead code that increases bundle size and lint noise.

### Before deleting any file, verify with grep:
```bash
rg "import.*ComponentName" client/src/ website/src/
rg "from.*ComponentName" client/src/ website/src/
rg "lazy\(\(\) => import\(.*ComponentName" client/src/ website/src/
```
If zero results, the component is safe to delete.

### Client components to delete (verified orphaned):
- `client/src/components/ui/FormError.jsx`
- `client/src/components/OTPVerification.jsx`
- `client/src/components/ui/ValidatedInput.jsx`
- `client/src/components/ui/ValidatedSelect.jsx`
- `client/src/components/ui/ValidatedTextarea.jsx`
- `client/src/components/OfflineStatusBar.jsx` (obsolete 8-line stub, redirects to `SyncStatusBar`)
- `client/src/components/ui/OptimizedImage.jsx`
- `client/src/components/SmartSearchBar.jsx` (superseded by `SmartSearch.jsx`)
- `client/src/components/AutomationWidget.jsx`
- `client/src/components/BoneyardExample.jsx` (demo only)
- `client/src/components/Settings/DailyBookAutomationSettings.jsx`
- `client/src/components/SEO.jsx` (superseded by `useSEO` hook in `client/src/hooks/useSEO.js`)
- `client/src/components/ThemeToggle.jsx` (client version)
- `client/src/components/UpsellSuggestions.jsx`
- `client/src/components/PaperOptimizer.jsx`

### Website components to delete (verified orphaned):
- `website/src/components/LanguageSwitcher.jsx`
- `website/src/components/StickyQuoteWidget.jsx`
- `website/src/components/FinishSimulator.jsx`
- `website/src/components/PreflightChecker.jsx`
- `website/src/components/Product3DPreview.jsx` (orphaned; deps are present but unused)
- `website/src/components/PromoBanner.jsx`
- `website/src/components/ReviewsWidget/ReviewsWidget.jsx` (if folder is empty after deletion, delete the folder too)

### Fix Steps
1. For each component, run the grep verification above.
2. Delete the `.jsx` file.
3. If an associated `.css` file exists with the same name (e.g., `PromoBanner.css`), delete it too.
4. If the component is referenced in any test file, delete the test file too.
5. After all deletions, run `npm run lint` in `client/` and `website/` to confirm no stale references remain.

---

## ISSUE C — Move Dynamic Table Initialization to Schema Migrations (P1)

**Problem:** 26+ tables are created lazily inside route files and scripts via `CREATE TABLE IF NOT EXISTS`. This makes database setup non-deterministic and breaks clean environments / CI / testing.

### Tables to migrate from code to schema files

From `server/routes/quotes.js`:
- `sarga_quotes`
- `sarga_quote_items`

From `server/routes/products.js`:
- `sarga_product_image_requests`
- `sarga_product_links`
- `sarga_product_update_requests`

From `server/routes/passwordReset.js`:
- `sarga_password_reset_tokens`

From `server/routes/invoiceFeatures.js`:
- `sarga_invoice_tracking`
- `sarga_recurring_invoices`
- `sarga_payment_modes`
- `sarga_tax_settings`
- `sarga_company_settings`
- `sarga_i18n_overrides`

From `server/routes/website.js`:
- `sarga_customer_otps`

From `server/services/chatStore.js`:
- `sarga_website_chat_messages`

From `server/helpers/anomalyDetection.js`:
- `sarga_staff_behavior_profile`

From `server/migrations/migrate_paper_inventory.js`:
- `sarga_inventory_to_paper_inventory`

From `server/scripts/migrate-three-books.js`:
- `sarga_machines`
- `sarga_machine_readings`
- `sarga_daily_report_offset`
- `sarga_daily_work_entries`
- `sarga_daily_expenses`
- `sarga_daily_credit_transactions`
- `sarga_daily_report_machine`
- `sarga_machine_work_entries`
- `sarga_machine_credit_movements`
- `sarga_credit_customers`
- `sarga_credit_ledger`

### Fix Steps
1. **Create a new schema file:** `server/schemas/024_dynamic_tables.sql` (or split into `024a_quotes.sql`, `024b_products.sql`, etc. if the combined file is too large).
2. **For each source file above:**
   - Open the file.
   - Find the `CREATE TABLE IF NOT EXISTS` block.
   - Copy it verbatim into the new schema file.
   - Delete the `CREATE TABLE IF NOT EXISTS` block from the source file.
   - Leave all `SELECT` / `INSERT` / `UPDATE` / `DELETE` logic intact. Routes should assume tables already exist.
3. **Update `server/database.js`:** Ensure the `initDb()` function runs `024_dynamic_tables.sql` (or all `024*.sql` files) during initialization. The existing pattern is already loading numbered `.sql` files in order.
4. **Verify no `CREATE TABLE IF NOT EXISTS` remains in `server/routes/` or `server/scripts/` or `server/helpers/` or `server/services/`** (except in `database.js` and `schemas/`). Use grep to confirm.

---

## ISSUE D — Audit and Delete Orphaned Page Files (P2)

**Problem:** Many `.jsx` page files exist but are never imported by `App.jsx` or any sub-router.

### Before deleting, verify with grep:
```bash
rg "import\s+.*\bFileName\b" client/src/ website/src/
rg "from\s+['\"].*FileName['\"]" client/src/ website/src/
rg "lazy\(\(\)\s*=>\s*import\(.*FileName" client/src/ website/src/
rg "path:\s*['\"]/.*['\"]" client/src/ website/src/ | rg "FileName"
```
If zero results (and the file is not referenced by a dynamic string-based route), it is safe to delete.

### Known orphaned page files (from `PAGES.md` audit)
In `client/src/pages/`:
- `PaperManagement.jsx` — never routed
- `Checkout.jsx` — never routed (website has its own checkout)
- `DesignStudioHome.jsx` — never routed
- `DesignEditor.jsx` — never routed
- `AlbumDesigner.jsx` — never routed (website has one, but not this client one)
- `InvitationScanner.jsx` — never routed
- `AIMatterBuilder.jsx` — never routed
- `AIDesignGenerator.jsx` — never routed
- `IDChangeRequests.jsx` — empty/placeholder (122 bytes)
- `InternalTransactions.jsx` — placeholder (654 bytes)
- `RateCalculator.jsx` — placeholder (411 bytes)
- `OfflineTestPage.jsx` — test page, likely not needed in production
- `QRDiagnostic.jsx` — diagnostic tool, check if routed
- `SummaryWidgets.jsx` — check if imported by `Summary.jsx`
- `InventoryModern.css` — check if referenced
- `AccountsLayout.jsx` — check if referenced
- `AdminLayout.jsx` — check if referenced
- `InventoryLayout.jsx` — check if referenced
- `SalesLayout.jsx` — check if referenced

In `client/src/pages/` subfolders (`accounting/`, `admin/`, `design-studio/`, `designer/`, `expense-manager/`, `public/`, `staff/`):
- Check every file in `design-studio/` — `DesignStudioHome.jsx`, `DesignEditor.jsx`, `AlbumDesigner.jsx`, `InvitationScanner.jsx`, `AIMatterBuilder.jsx`, `AIDesignGenerator.jsx` are documented as orphaned.
- Check `expense-manager/` files — may have been merged into `ExpenseManager.jsx`.
- Check `admin/` files — may be orphaned.
- Check `public/` files — may be orphaned since `App.jsx` routes public pages directly.

### Fix Steps
1. Run the grep verification for each candidate file.
2. Delete confirmed orphaned `.jsx` files and their associated `.css` files.
3. If a subfolder becomes empty, delete the folder too.
4. After deletion, run `npm run build` in `client/` and `website/` to confirm nothing breaks.

---

## ISSUE E — Centralize Hardcoded Test JWT Secrets (P2)

**Problem:** Hardcoded JWT secret strings are duplicated across 6+ test files. This is a security hygiene issue.

### Files with hardcoded secrets
- `server/__tests__/setup.js:20` → `'test_jwt_secret_key_that_is_at_least_32_chars_long_!X'`
- `server/__tests__/helpers/testUtils.js:4` → `'test_secret_key_that_is_at_least_32_characters_long_for_test'`
- `server/__tests__/helpers/envSetup.js:2` → `'test_jwt_secret_key_for_testing_purposes_only_32chars'`
- `server/__tests__/api.test.js:40` → `'test-jwt-secret-key-that-is-at-least-32-chars-long!!'`
- `server/__tests__/middleware.test.js:14` → `'test-jwt-secret-key-that-is-at-least-32-chars-long-for-testing'`
- `server/__tests__/routes/health.test.js:19` → `'test-secret-key-that-is-at-least-32-chars-long!!'`
- `server/__tests__/routes/auth.test.js:33` → `'test-secret-key-that-is-at-least-32-chars-long!!'`
- `server/__tests__/middleware/cache.test.js:8` → `'test-secret-key-that-is-at-least-32-chars-long!!'`

### Fix Steps
1. **Open `server/__tests__/helpers/testUtils.js`** and add:
   ```js
   export const TEST_JWT_SECRET = 'test_jwt_secret_key_that_is_at_least_32_chars_long_for_sarga_only';
   ```
2. **In every other test file above**, replace the hardcoded string with:
   ```js
   import { TEST_JWT_SECRET } from '../helpers/testUtils.js'; // adjust relative path per file
   // Then use TEST_JWT_SECRET instead of the hardcoded string
   ```
3. **Run `npm run test` in `server/`** to confirm all tests still pass.

---

## ISSUE F — Update Stale Documentation (P2)

**Problem:** `ARCHITECTURE.md`, `COMPONENTS.md`, and `PAGES.md` contain claims that are no longer true. This wastes developer time and erodes trust in the docs.

### Stale claims to fix

1. **`ARCHITECTURE.md` — "Known Architectural Debt" section:**
   - **Claim:** "Hardcoded Secrets: The Firebase test credentials and measurement API tokens are hardcoded inside Git-tracked files (`render.yaml` and `vercel_env_setup.ps1`)."
   - **Reality:** `render.yaml` uses `fromSecret` for all values. `vercel_env_setup.ps1` loads from `.env` files or system environment.
   - **Fix:** Remove this bullet or rewrite it to say: "Historical hardcoded secrets were previously present in `render.yaml` and `vercel_env_setup.ps1`; these have been refactored to use environment variables and `fromSecret` directives."
   - **Update count:** The orphaned UI count and dynamic table count should be updated after Issues B and C are completed.

2. **`PAGES.md` — "Front Office Role Branch Lock Defect":**
   - **Claim:** `BranchSelect.jsx` destructures `isFrontOffice` from `useBranches()` and fails because `BranchContext` doesn't return it, allowing Front Office users to switch branches.
   - **Reality:** `BranchSelect.jsx` currently checks `isAdmin` based on `user.role` and renders a read-only branch badge for all non-admin users. The lock works correctly.
   - **Fix:** Add a note: "**Resolved:** This defect was fixed in `BranchSelect.jsx`. The component now locks all non-admin users to their assigned branch."

3. **`COMPONENTS.md` — `Product3DPreview` entry:**
   - **Claim:** "None of these packages are declared in `website/package.json`" — referring to `@react-three/fiber`, `@react-three/drei`, `three`.
   - **Reality:** All three packages **are** present in `website/package.json`.
   - **Fix:** Remove the build-risk warning. Add a note: "Dependencies are present in `package.json`, but the component remains orphaned (no importer)."

4. **Add a `## Last Updated` header** to each of the three files with the current date.

---

## ACCEPTANCE CRITERIA

- [ ] `npm run build` passes in `client/` with zero new errors.
- [ ] `npm run build` passes in `website/` with zero new errors.
- [ ] `npm run lint` passes in `client/` with zero new errors.
- [ ] `npm run test` passes in `server/` (or does not break any existing tests).
- [ ] No `.modal` / `.modal--*` duplicate definitions remain in page-level CSS files (unless scoped with a page prefix like `.blog-cms__modal`).
- [ ] No `.badge` / `.btn` duplicate definitions remain in page-level CSS files.
- [ ] All deleted components have zero importers in the codebase (verified by grep).
- [ ] New schema file(s) in `server/schemas/` contain all tables that were previously initialized dynamically.
- [ ] No `CREATE TABLE IF NOT EXISTS` statements remain in `server/routes/`, `server/scripts/`, `server/helpers/`, or `server/services/`.
- [ ] Test JWT secrets are centralized in `server/__tests__/helpers/testUtils.js`.
- [ ] `ARCHITECTURE.md`, `COMPONENTS.md`, and `PAGES.md` stale claims are corrected.

---

*End of prompt.*
