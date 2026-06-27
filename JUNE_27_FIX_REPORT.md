# June 27 Fix Report

## CSS Fixes
- Files fixed: `WebInquiries.css`, `CustomerPayments.css`, `InventoryModern.css`, `PaymentVerification.css`, `ExpenseManager.css`
- Total occurrences fixed: **21** (11 WebInquiries + 2 CustomerPayments + 3 InventoryModern + 1 PaymentVerification + 2 ExpenseManager + 2 additional found)
- Pattern replaced: `var(--shadow-sm), 0.XX)` → `rgba(0, 0, 0, XX)` (or `color-mix()` for var-based tokens in ExpenseManager)
- Remaining issues: none (false-positive match at `ScanItem.css:599` — valid `rgba(var(--info), 0.2)`)

## Migration Fixes
- **032 duplication**: `032_schema_fixes.sql` renamed to `032_schema_fixes.sql.bak`; comment added to `032_schema_fixes.js` (line 2)
- **033 gst_number safety**: Replaced bare UPDATE with `COALESCE(NULLIF(gstin, ''), gst_number)` (line 41); added TODO comment to drop `gstin` in migration 034 (line 44)
- **payment_mode enum**: Verified `['cash', 'bank', 'upi', 'cheque', 'neft', 'rtgs']` — matches backend validation in `vendors.js:1368`

## Security Fixes
- **Command injection** (`backup.js`): **Already fixed** — uses `spawn()` with argument arrays, no shell string interpolation, `path.basename()` for path safety
- **Admin token auth** (`devRoutes.js`): **Already secured** — double env-var gate (`NODE_ENV=development` AND `ENABLE_DEV_TOKEN=1`)
- **Session revocation** (`auth.js`): **Implemented** — in-memory SHA256 token blacklist with 30-min cleanup, plus DB fallback via `sarga_user_sessions`

## Notable Issues Fixed
- **Sync payload field mismatch**: `localDb.js:saveVendor` now sends `vendor_type` (not `type`) and `gst_number` (not `gstin`); fixed `syncWorker.v2.js` same fields; fixed `VendorsTab.jsx` form state and display to use `vendor_type` throughout; fixed localDb filter to check both `vendor_type`/`type` for backward compat; fixed `VendorModal.jsx` and `VendorDetail.jsx`; updated `VendorDetail.jsx` merged duplicate GSTIN/GST Number rows
- **Token blacklist**: Replaced no-op `revokeSessionInCache()` with in-memory `Set`-based blacklist with periodic `setInterval` cleanup every 30 minutes

## Migration 034 — Drop Legacy Columns (Executed)
- **`vendors.gstin`**: Dropped after verifying data copy to `gst_number` (0 orphans found)
- **`vendors.type`**: Column already absent in prod DB (no-op)
- Code updated to use `gst_number` and `vendor_type` exclusively in:
  - `server/routes/vendors.js` — INSERT/UPDATE removed `gstin`, uses only `gst_number`
  - `server/helpers/vendorRepository.js` — `V_COLS`, `normalizeRow`, `createVendor`, `updateVendor` all use `gst_number`/`vendor_type`; backward compat fallbacks retained in request parsing (`vendorData.gstin`, `vendorData.type` via `||` chains)
  - `server/middleware/validate.js` — removed legacy `type` and `gstin` from `addVendorSchema`
  - `mcp-server/src/types/index.ts` — `Vendor.gstin` → `gst_number`
  - `mcp-server/src/tools/vendor.ts` — column and input schema updated
  - `server/routes/expenses-extended.js` — INSERT uses `vendor_type` instead of `type`
  - `client/public/syncWorker.v2.js` — sync payload uses `vendor_type` and `gst_number`
  - `client/src/components/VendorDetail.jsx` — merged duplicate GST fields
  - `client/src/components/VendorModal.jsx` — form state uses `vendor_type`
- Wired into `server/database.js` initDb startup sequence
