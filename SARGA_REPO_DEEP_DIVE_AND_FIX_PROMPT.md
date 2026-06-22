# Sarga Repo — Deep Dive & Fix Prompt

> **Generated:** 2026-06-22
> **Repo:** `D:\software sarga` (Sarga Prints MIS)
> **Scope:** Build safety, code quality, CSS hygiene, schema drift, dead code

---

## 1. Executive Summary

After reading the actual source code, build artifacts, and documentation, I have identified **7 verified current issues** and **3 stale/resolved issues** that are still documented in `ARCHITECTURE.md`, `COMPONENTS.md`, and `PAGES.md`.

| Priority | Issue | Status | Files Affected |
|----------|-------|--------|----------------|
| P0 | **ML localhost fallback in production** | Verified | 12 server files |
| P1 | **CSS class conflicts** (`.modal`, `.badge`, `.btn`) | Verified | 7+ CSS files |
| P1 | **Orphaned components** (dead code) | Verified | 20 `.jsx` files |
| P1 | **Dynamic table initialization** (schema drift) | Verified | 12+ route/script files |
| P2 | **Orphaned page files** (unrouted) | Documented | 23+ page files |
| P2 | **Hardcoded JWT secrets in tests** | Verified | 6 test files |
| P2 | **Stale AI-generated documentation** | Verified | 3 `.md` files |
| — | ~~Branch lock broken~~ | **Already fixed** | `BranchSelect.jsx` |
| — | ~~Product3DPreview build risk~~ | **Already fixed** | `website/package.json` has deps |
| — | ~~Hardcoded secrets in render.yaml~~ | **Already fixed** | Uses `fromSecret` |

---

## 2. Issue-by-Issue Deep Dive

### 2.1 ML Service Localhost Fallback (P0)

**Evidence:** 12 files in `server/` use `process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001'` (or `localhost:5001`):

```
server/config/ml.js:11
server/helpers/billExtraction.js:9
server/routes/aiUpsell.js:14
server/routes/aiTurnaround.js:14
server/routes/anomalies.js:15
server/routes/chatbot.js:7
server/routes/expenseCategorizer.js:12
server/routes/forecast.js:14
server/routes/insights.js:16
server/routes/orderForecast.js:14
server/routes/seasonal.js:14
server/routes/stockPlanning.js:13
```

**Impact:** If `ML_SERVICE_URL` is missing or unset in the production Render container, the backend silently falls back to `localhost:5001`. Inside a Render Docker container, `localhost` is the container itself, so the ML service call will fail with `ECONNREFUSED` or timeout. This is a **silent production failure** that is harder to debug than an explicit error at startup.

**Fix:** In every file, remove the `|| 'http://127.0.0.1:5001'` fallback and instead throw a clear error at module load time if the variable is missing. This guarantees the app fails fast and loudly during deployment, not at runtime.

---

### 2.2 CSS Class Conflicts (P1)

**Evidence:** The `.modal` class has **7 conflicting definitions** across the client codebase:

| File | `.modal` max-width | `display` | Notes |
|------|-------------------|-----------|-------|
| `client/src/index.css` | 500px | none | Also defines `.modal--large` as 640px |
| `client/src/styles/components/modals.css` | 420px | flex, column | Also defines `.modal--large` as 800px |
| `client/src/pages/Billing.css` | 480px | — | |
| `client/src/pages/JobDetail.css` | 400px | — | |
| `client/src/pages/BlogCMS.css` | 1100px | flex, column | Height 90vh |
| `client/src/pages/Customers.css` | 520px | — | |
| `client/src/pages/ExpenseManager.css` | — | — | Different `backdrop-filter` |

**`.modal--large`** has 3 different definitions: 640px, 800px, 1100px.

**`.badge`** has 4 conflicting definitions across `index.css`, `StockTransfer.css`, `Vendors.css`, and `website/src/index.css`.

**`.btn` / `.btn-primary`** are defined in both `client/src/styles/buttons.css` and `website/src/index.css` with different base values (padding, height, shadow, border).

**Impact:** Unpredictable UI rendering depending on CSS load order. Modals may appear too wide, too narrow, or with broken flex layouts. Badges may have inconsistent border-radius. Buttons may look different between pages.

**Fix:** Establish a single source of truth for each utility class. Move `.modal`, `.modal--large`, `.badge`, `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-sm` into `client/src/styles/components/` and `website/src/styles/components/` respectively. Remove all duplicate definitions from page-level CSS files. Use more specific BEM-style class names where page-level customization is truly needed (e.g., `.blog-cms__modal` instead of overriding `.modal` globally).

---

### 2.3 Orphaned Components (P1)

**Evidence:** COMPONENTS.md documents 20 orphaned components (zero importers). Verified by reading the files and checking `App.jsx`:

**Client (`client/src/components/`):**
- `FormError.jsx` (ui/) — orphaned
- `OTPVerification.jsx` — orphaned
- `ValidatedInput.jsx` (ui/) — orphaned
- `ValidatedSelect.jsx` (ui/) — orphaned
- `ValidatedTextarea.jsx` (ui/) — orphaned
- `OfflineStatusBar.jsx` — obsolete 8-line stub, directs to `SyncStatusBar`
- `OptimizedImage.jsx` (ui/) — orphaned
- `SmartSearchBar.jsx` — orphaned
- `AutomationWidget.jsx` — orphaned
- `BoneyardExample.jsx` — demo-only
- `DailyBookAutomationSettings.jsx` (Settings/) — orphaned
- `SEO.jsx` (client) — superseded by `useSEO` hook
- `ThemeToggle.jsx` (client) — orphaned
- `UpsellSuggestions.jsx` — orphaned
- `PaperOptimizer.jsx` — orphaned

**Website (`website/src/components/`):**
- `LanguageSwitcher.jsx` — orphaned
- `StickyQuoteWidget.jsx` — orphaned
- `FinishSimulator.jsx` — orphaned
- `PreflightChecker.jsx` — orphaned
- `Product3DPreview.jsx` — orphaned (deps now present in package.json, so no build risk)
- `PromoBanner.jsx` — orphaned
- `ReviewsWidget.jsx` — orphaned

**Impact:** Dead code increases bundle size, lint noise, and maintenance burden. Developers may accidentally modify components that are never used.

**Fix:** Delete confirmed dead components. For components that might be needed later (e.g., `Product3DPreview`), move them to a `/_archive/` folder or delete them and rely on Git history.

---

### 2.4 Dynamic Table Initialization (P1)

**Evidence:** 26+ tables are created lazily inside route files and scripts via `CREATE TABLE IF NOT EXISTS` rather than in the static `/server/schemas/` migration files. This is documented in `ARCHITECTURE.md` and verified by grep:

| Table | Created In |
|-------|-----------|
| `sarga_quotes`, `sarga_quote_items` | `server/routes/quotes.js` |
| `sarga_product_image_requests`, `sarga_product_links`, `sarga_product_update_requests` | `server/routes/products.js` |
| `sarga_password_reset_tokens` | `server/routes/passwordReset.js` |
| `sarga_invoice_tracking`, `sarga_recurring_invoices`, `sarga_payment_modes`, `sarga_tax_settings`, `sarga_company_settings`, `sarga_i18n_overrides` | `server/routes/invoiceFeatures.js` |
| `sarga_customer_otps` | `server/routes/website.js` |
| `sarga_website_chat_messages` | `server/services/chatStore.js` |
| `sarga_staff_behavior_profile` | `server/helpers/anomalyDetection.js` |
| `sarga_inventory_to_paper_inventory` | `server/migrations/migrate_paper_inventory.js` |
| `sarga_machines`, `sarga_machine_readings`, `sarga_daily_report_offset`, `sarga_daily_work_entries`, `sarga_daily_expenses`, `sarga_daily_credit_transactions`, `sarga_daily_report_machine`, `sarga_machine_work_entries`, `sarga_machine_credit_movements`, `sarga_credit_customers`, `sarga_credit_ledger` | `server/scripts/migrate-three-books.js` |

**Impact:** Database initialization is non-deterministic. A fresh database instance will fail when certain routes are called because the tables don't exist yet. This blocks automated testing, CI/CD, and clean environment setup.

**Fix:** Extract all `CREATE TABLE IF NOT EXISTS` blocks from routes and scripts into proper numbered `.sql` migration files in `/server/schemas/`. Add an `initDb()` runner that executes all schema files in order. Remove the inline `CREATE TABLE` statements from route files and replace them with simple `SELECT` / `INSERT` / `UPDATE` assuming the tables exist.

---

### 2.5 Orphaned Page Files (P2)

**Evidence:** `PAGES.md` documents that **23 out of 24** checked page files in subfolders are defined but never imported or routed inside `App.jsx`. Examples include `PaperManagement.jsx`, `Checkout.jsx`, `DesignStudioHome.jsx`, `DesignEditor.jsx`, `AlbumDesigner.jsx`, `InvitationScanner.jsx`, `AIMatterBuilder.jsx`, `AIDesignGenerator.jsx`.

While `App.jsx` routes `/dashboard/*` to a `<Dashboard />` component that likely has its own sub-router, the PAGES.md audit explicitly flagged these as unreachable.

**Impact:** Dead code, confusion for new developers, inflated build times.

**Fix:** Run an import audit across all `.jsx` files in `client/src/pages/` and `website/src/pages/`. For any file with zero importers, delete it (or move to `/_archive/`). Update `PAGES.md` accordingly.

---

### 2.6 Hardcoded JWT Secrets in Tests (P2)

**Evidence:**
```
server/__tests__/setup.js:20: 'test_jwt_secret_key_that_is_at_least_32_chars_long_!X'
server/__tests__/helpers/testUtils.js:4: 'test_secret_key_that_is_at_least_32_characters_long_for_test'
server/__tests__/helpers/envSetup.js:2: 'test_jwt_secret_key_for_testing_purposes_only_32chars'
server/__tests__/api.test.js:40: 'test-jwt-secret-key-that-is-at-least-32-chars-long!!'
server/__tests__/middleware.test.js:14: 'test-jwt-secret-key-that-is-at-least-32-chars-long-for-testing'
server/__tests__/routes/health.test.js:19: 'test-secret-key-that-is-at-least-32-chars-long!!'
```

**Impact:** Low (test-only), but violates security hygiene. If test files are ever accidentally imported into production code, the secret is exposed.

**Fix:** Create a single `TEST_JWT_SECRET` constant in `server/__tests__/helpers/testUtils.js` and import it everywhere. Or use `process.env.JWT_SECRET` with a fallback, and centralize the fallback string.

---

### 2.7 Stale Architecture Documentation (P2)

**Evidence:** `ARCHITECTURE.md`, `COMPONENTS.md`, and `PAGES.md` were generated by an AI and contain claims that are no longer true:

1. **Branch lock broken** — `PAGES.md` claims `BranchSelect.jsx` destructures `isFrontOffice` from `BranchContext` and fails. In reality, `BranchSelect.jsx` currently checks `isAdmin` based on `user.role` and renders a read-only div for all non-admin users. The lock works.
2. **Product3DPreview build risk** — `COMPONENTS.md` and `PAGES.md` claim the component imports `@react-three/fiber`, `@react-three/drei`, and `three` which are not in `website/package.json`. In reality, all three **are** present in `website/package.json`.
3. **Hardcoded secrets in render.yaml** — `ARCHITECTURE.md` claims Firebase credentials are hardcoded in `render.yaml` and `vercel_env_setup.ps1`. In reality, `render.yaml` uses `fromSecret` for all values, and `vercel_env_setup.ps1` loads from `.env` files or system environment.

**Impact:** Stale docs waste developer time, create false alarms, and erode trust in the documentation.

**Fix:** Add a `## Stale Claims` section to each doc, or regenerate the docs from the current codebase. Better yet: delete the auto-generated audit docs and replace them with a single, manually maintained `docs/ARCHITECTURE.md` that is updated incrementally.

---

### 2.8 Stale/Resolved Issues (Awareness Only)

| Issue | Previous Claim | Current Reality |
|-------|---------------|-----------------|
| Branch lock broken | `isFrontOffice` undefined in `BranchContext` | `BranchSelect.jsx` checks `isAdmin` and locks all non-admins |
| Product3DPreview build risk | Missing `@react-three/*` deps | All deps present in `website/package.json` |
| Hardcoded secrets in `render.yaml` | Firebase keys hardcoded | All keys use `fromSecret` |

---

## 3. The Fix Prompt

Use this as a self-contained prompt for any AI coding agent. It is designed to be copy-pasted into a new conversation.

```markdown
# PROMPT: Fix Sarga Repo Issues

You are working on the Sarga Prints MIS repository at `D:\software sarga`. 
Fix the following verified issues. Do NOT change working behavior. Make minimal, surgical edits.

## Issue A: ML Service Localhost Fallback (P0)

**Problem:** 12 files in `server/` use `process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001'` (or `localhost:5001`). This is dangerous in production because if the env var is missing, the app tries to connect to localhost inside the Render container.

**Files to fix:**
- `server/config/ml.js`
- `server/helpers/billExtraction.js`
- `server/routes/aiUpsell.js`
- `server/routes/aiTurnaround.js`
- `server/routes/anomalies.js`
- `server/routes/chatbot.js`
- `server/routes/expenseCategorizer.js`
- `server/routes/forecast.js`
- `server/routes/insights.js`
- `server/routes/orderForecast.js`
- `server/routes/seasonal.js`
- `server/routes/stockPlanning.js`

**Fix:** Remove the `|| 'http://127.0.0.1:5001'` fallback. Replace with a pattern that throws at module load if the variable is missing:

```js
const ML_URL = process.env.ML_SERVICE_URL;
if (!ML_URL) {
  throw new Error('ML_SERVICE_URL environment variable is required');
}
```

Exception: `server/helpers/billExtraction.js` uses `localhost:5001` — fix it the same way.

---

## Issue B: CSS Class Conflicts (P1)

**Problem:** `.modal`, `.modal--large`, `.badge`, `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, and `.btn-sm` have conflicting definitions across multiple files. This causes unpredictable UI.

**Files involved:**
- `client/src/index.css` (global modal/badge/btn styles)
- `client/src/styles/components/modals.css` (unified modal component styles)
- `client/src/styles/buttons.css` (button system)
- `client/src/pages/Billing.css` (page-level modal override)
- `client/src/pages/JobDetail.css` (page-level modal override)
- `client/src/pages/BlogCMS.css` (page-level modal override)
- `client/src/pages/Customers.css` (page-level modal override)
- `client/src/pages/ExpenseManager.css` (page-level modal override)
- `client/src/pages/StockTransfer.css` (badge override)
- `client/src/pages/Vendors.css` (badge override)
- `website/src/index.css` (website btn/badge styles)

**Fix:**
1. Make `client/src/styles/components/modals.css` the single source of truth for `.modal`, `.modal--large`, `.modal-backdrop`, `.modal-header`, `.modal-body`, `.modal-footer`, `.modal-title`, `.modal-close`.
2. Remove duplicate `.modal` / `.modal--*` rules from `client/src/index.css`, `Billing.css`, `JobDetail.css`, `BlogCMS.css`, `Customers.css`, `ExpenseManager.css`. If a page needs a wider modal, use a modifier class like `.modal--blog` or `.blog-modal` instead of redefining `.modal` globally.
3. Make `client/src/styles/buttons.css` the single source of truth for `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-sm`. Remove duplicate definitions from `website/src/index.css` (or create `website/src/styles/buttons.css` if the website truly needs different styling).
4. For `.badge`, consolidate into `client/src/styles/components/badges.css` (create if missing) and remove overrides from `StockTransfer.css`, `Vendors.css`, and `website/src/index.css`. Use scoped modifiers (e.g., `.badge--premium`) instead of redefining `.badge` globally.

---

## Issue C: Delete Orphaned Components (P1)

**Problem:** 20 components are defined but never imported by any route or parent component. They are dead code.

**Client components to delete:**
- `client/src/components/ui/FormError.jsx`
- `client/src/components/OTPVerification.jsx`
- `client/src/components/ui/ValidatedInput.jsx`
- `client/src/components/ui/ValidatedSelect.jsx`
- `client/src/components/ui/ValidatedTextarea.jsx`
- `client/src/components/OfflineStatusBar.jsx` (obsolete stub)
- `client/src/components/ui/OptimizedImage.jsx`
- `client/src/components/SmartSearchBar.jsx`
- `client/src/components/AutomationWidget.jsx`
- `client/src/components/BoneyardExample.jsx` (demo only)
- `client/src/components/Settings/DailyBookAutomationSettings.jsx`
- `client/src/components/SEO.jsx` (superseded by `useSEO` hook)
- `client/src/components/ThemeToggle.jsx` (client version)
- `client/src/components/UpsellSuggestions.jsx`
- `client/src/components/PaperOptimizer.jsx`

**Website components to delete:**
- `website/src/components/LanguageSwitcher.jsx`
- `website/src/components/StickyQuoteWidget.jsx`
- `website/src/components/FinishSimulator.jsx`
- `website/src/components/PreflightChecker.jsx`
- `website/src/components/Product3DPreview.jsx`
- `website/src/components/PromoBanner.jsx`
- `website/src/components/ReviewsWidget/ReviewsWidget.jsx` (and empty the folder if nothing else remains)

**Fix:** Delete each file. If any file is imported by a test, delete the test too. Run a search for each filename before deleting to confirm zero importers. After deletion, run `npm run lint` in both `client` and `website` to catch any stale references.

---

## Issue D: Move Dynamic Table Initialization to Schema Migrations (P1)

**Problem:** Tables are created inside route files and scripts, making database setup non-deterministic.

**Tables to migrate to `/server/schemas/`:**
From `server/routes/quotes.js`: `sarga_quotes`, `sarga_quote_items`
From `server/routes/products.js`: `sarga_product_image_requests`, `sarga_product_links`, `sarga_product_update_requests`
From `server/routes/passwordReset.js`: `sarga_password_reset_tokens`
From `server/routes/invoiceFeatures.js`: `sarga_invoice_tracking`, `sarga_recurring_invoices`, `sarga_payment_modes`, `sarga_tax_settings`, `sarga_company_settings`, `sarga_i18n_overrides`
From `server/routes/website.js`: `sarga_customer_otps`
From `server/services/chatStore.js`: `sarga_website_chat_messages`
From `server/helpers/anomalyDetection.js`: `sarga_staff_behavior_profile`
From `server/migrations/migrate_paper_inventory.js`: `sarga_inventory_to_paper_inventory`
From `server/scripts/migrate-three-books.js`: `sarga_machines`, `sarga_machine_readings`, `sarga_daily_report_offset`, `sarga_daily_work_entries`, `sarga_daily_expenses`, `sarga_daily_credit_transactions`, `sarga_daily_report_machine`, `sarga_machine_work_entries`, `sarga_machine_credit_movements`, `sarga_credit_customers`, `sarga_credit_ledger`

**Fix:**
1. Create a new numbered schema file `024_dynamic_tables.sql` (or split into `024a_quotes.sql`, `024b_products.sql`, etc.) in `/server/schemas/`.
2. Copy each `CREATE TABLE IF NOT EXISTS` block from the route/script files into the schema file.
3. Remove the `CREATE TABLE IF NOT EXISTS` blocks from the route and script files. Leave the `SELECT` / `INSERT` / `UPDATE` logic intact. The routes should assume tables exist.
4. Update `server/database.js` `initDb()` to run the new schema file(s) during initialization.

---

## Issue E: Audit and Delete Orphaned Page Files (P2)

**Problem:** Many `.jsx` page files exist but are never imported by `App.jsx` or any sub-router.

**Fix:**
1. For every `.jsx` file in `client/src/pages/` and `website/src/pages/`:
   - Search the codebase for `import('.../<filename>')` or `import <name> from '.../<filename>'`.
   - If zero importers are found, delete the file and its associated `.css` file (if any).
2. Pay special attention to subfolders like `client/src/pages/design-studio/` (e.g., `DesignStudioHome.jsx`, `DesignEditor.jsx`, `AlbumDesigner.jsx`, `InvitationScanner.jsx`, `AIMatterBuilder.jsx`, `AIDesignGenerator.jsx`) which are documented as orphaned in `PAGES.md`.
3. After deletion, verify the build still succeeds by running `npm run build` in `client` and `website`.

---

## Issue F: Centralize Test JWT Secrets (P2)

**Problem:** Hardcoded JWT secrets are duplicated across 6 test files.

**Files:**
- `server/__tests__/setup.js`
- `server/__tests__/helpers/testUtils.js`
- `server/__tests__/helpers/envSetup.js`
- `server/__tests__/api.test.js`
- `server/__tests__/middleware.test.js`
- `server/__tests__/routes/health.test.js`
- `server/__tests__/routes/auth.test.js`
- `server/__tests__/middleware/cache.test.js`

**Fix:**
1. In `server/__tests__/helpers/testUtils.js`, export a single constant: `export const TEST_JWT_SECRET = 'test_jwt_secret_key_that_is_at_least_32_chars_long_for_sarga_only';`
2. In every other test file, replace the hardcoded string with `import { TEST_JWT_SECRET } from '../helpers/testUtils.js';` (or adjust the relative path).

---

## Issue G: Update Stale Documentation (P2)

**Problem:** `ARCHITECTURE.md`, `COMPONENTS.md`, and `PAGES.md` contain stale claims.

**Fix:**
1. Open `ARCHITECTURE.md` and update the "Known Architectural Debt" section:
   - Remove the claim about hardcoded secrets in `render.yaml` and `vercel_env_setup.ps1` (already fixed).
   - Keep the dynamic table initialization claim, but update the count.
   - Keep the orphaned UI code claim, but update the count.
2. Open `PAGES.md` and update the "Front Office Role Branch Lock Defect" section. Add a note that this was fixed in `BranchSelect.jsx` and the lock now works for all non-admin roles.
3. Open `COMPONENTS.md` and update the `Product3DPreview` entry. Remove the "build risk" warning and add a note that the dependencies are present but the component is still orphaned.
4. Add a `## Last Updated` header to each file with today's date.

---

## Acceptance Criteria

- [ ] `npm run build` passes in `client/` with no new errors.
- [ ] `npm run build` passes in `website/` with no new errors.
- [ ] `npm run lint` passes in `client/` with no new errors.
- [ ] `npm run test` passes in `server/` (or at least does not break existing tests).
- [ ] No `|| 'http://127.0.0.1:5001'` or `|| 'http://localhost:5001'` fallback remains in `server/` (except in `__tests__/` where it is acceptable for mock setup).
- [ ] No `.modal` / `.badge` / `.btn` duplicate definitions remain in page-level CSS files (unless scoped with a page prefix).
- [ ] All deleted components have zero importers in the codebase.
- [ ] New schema file(s) in `server/schemas/` contain all tables that were previously initialized dynamically.
- [ ] Route files no longer contain `CREATE TABLE IF NOT EXISTS` statements.
```

---

## 4. Appendix: Evidence File Paths

All claims in this document are directly traceable to the following files:

| Claim | Source File(s) |
|-------|---------------|
| ML localhost fallback | `server/config/ml.js`, `server/helpers/billExtraction.js`, `server/routes/*.js` |
| CSS `.modal` conflicts | `client/src/index.css:1552-1603`, `client/src/styles/components/modals.css:22-41`, `client/src/pages/Billing.css:1007+`, `client/src/pages/JobDetail.css`, `client/src/pages/BlogCMS.css:139`, `client/src/pages/Customers.css`, `client/src/pages/ExpenseManager.css` |
| Orphaned components | `COMPONENTS.md` (full component inventory), `client/src/App.jsx`, `website/src/App.jsx` |
| Dynamic tables | `ARCHITECTURE.md:4.2`, grep results for `CREATE TABLE IF NOT EXISTS` in `server/` |
| Orphaned pages | `PAGES.md` (page audit), `client/src/App.jsx`, `website/src/App.jsx` |
| Test secrets | `server/__tests__/setup.js`, `server/__tests__/helpers/testUtils.js`, etc. |
| Branch lock fixed | `client/src/components/ui/BranchSelect.jsx`, `client/src/contexts/BranchContext.jsx` |
| Product3DPreview deps present | `website/package.json` (contains `@react-three/drei`, `@react-three/fiber`, `three`) |
| Secrets in render.yaml fixed | `render.yaml` (all values use `fromSecret`) |

---

*End of document.*
