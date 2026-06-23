# SARGA PRINTS MIS — UI CONSISTENCY AUDIT REPORT

> **Generated:** 2026-06-22  
> **Scope:** `client/src/`, `website/src/`, `server/` (UI-related files)  
> **Method:** Direct file inspection + `grep` analysis across 200+ files  

---

## EXECUTIVE SUMMARY

| Category | P0 | P1 | P2 | P3 | Total |
|----------|----|----|----|----|-------|
| CSS Architecture | 0 | 4 | 3 | 2 | 9 |
| Design Tokens | 0 | 2 | 4 | 3 | 9 |
| Inline Styles | 0 | 3 | 2 | 1 | 6 |
| Z-Index | 0 | 2 | 2 | 0 | 4 |
| Responsive | 0 | 1 | 2 | 2 | 5 |
| Component Consistency | 0 | 1 | 2 | 2 | 5 |
| Theming | 0 | 2 | 1 | 1 | 4 |
| **TOTAL** | **0** | **15** | **16** | **13** | **44** |

> **P0** = Blocks users / Crashes  
> **P1** = Major visual/UX inconsistency  
> **P2** = Moderate inconsistency  
> **P3** = Minor / Cosmetic  

---

## 1. CSS ARCHITECTURE ISSUES (9 findings)

### 1.1 Global Class Collisions — `.modal` (P1)

**Problem:** The `.modal` class has **7 conflicting definitions** across the client codebase, causing unpredictable rendering depending on CSS load order.

| File | `.modal` max-width | `display` | Notes |
|------|-------------------|-----------|-------|
| `client/src/index.css:1567` | `500px` | none | Also defines `.modal--large` as 640px |
| `client/src/styles/components/modals.css:22` | `420px` | `flex; column` | Also defines `.modal--large` as 800px |
| `client/src/pages/Billing.css:1007` | `480px` | — | |
| `client/src/pages/JobDetail.css` | `400px` | — | |
| `client/src/pages/BlogCMS.css:139` | `1100px` | `flex; column` | Height 90vh |
| `client/src/pages/Customers.css` | `520px` | — | |
| `client/src/pages/ExpenseManager.css` | — | — | Different `backdrop-filter` |

**`.modal--large`** has 3 different definitions:
- `index.css` → 640px
- `modals.css` → 800px
- `BlogCMS.css` → 1100px + height 90vh + flex column

**Impact:** Modals render inconsistently across pages. On the BlogCMS page, a "large" modal is 1100px wide; on the Dashboard, it's 640px.

**Fix:** Consolidate all modal styles into `styles/components/modals.css`. Remove page-level `.modal` overrides. Use scoped modifier classes like `.modal--blog` instead of redefining `.modal` globally.

---

### 1.2 Global Class Collisions — `.badge` (P1)

**Problem:** `.badge` has **4 conflicting definitions** across the codebase.

| File | border-radius | uppercase | display |
|------|---------------|-----------|---------|
| `client/src/index.css` | `var(--radius-xs)` (6px) | No | `inline-flex` |
| `client/src/pages/StockTransfer.css` | `var(--radius-full)` (9999px) | Yes | `inline-block` |
| `client/src/pages/Vendors.css` | `badge-premium-*` duplicates | Yes | varies |
| `website/src/index.css` | `var(--radius-full)` (999px) | Yes | — |

**Impact:** Badge appearance varies wildly between pages and between client/website.

**Fix:** Create `client/src/styles/components/badges.css` as the single source of truth. Use `.badge--pill` for pill-shaped badges instead of overriding `.badge` globally.

---

### 1.3 Global Class Collisions — `.btn` / `.btn-primary` (P1)

**Problem:** Button styles are defined in two places with different base values:

- `client/src/styles/buttons.css`: Base `.btn` has `padding: 8px 16px`, `height: 40px`, `border-radius: var(--radius-button)` (10px)
- `website/src/index.css`: Base `.btn` has different padding, height, and shadow values

**Impact:** Buttons look different between the staff portal and the customer website.

**Fix:** If the website truly needs different styling, create `website/src/styles/buttons.css` with scoped class names (e.g., `.btn-web`) instead of redefining `.btn`.

---

### 1.4 `!important` Overuse (P2)

**Problem:** `!important` is used 230+ times across `client/src/` CSS files. Key hotspots:

- `client/src/styles/global-fixes.css`: 20+ rules with `!important` for badge color overrides
- `client/src/index.css:418`: `transition: ... !important` (reduced motion override)
- `client/src/index.css:2222-2237`: Mobile utility classes with `!important`
- `client/src/pages/ScanItem.css:760`: `color: #fff !important`

**Impact:** `!important` makes overrides impossible and debugging difficult. It indicates a deeper specificity problem.

**Fix:** Remove `!important` from `global-fixes.css` by increasing selector specificity instead. The reduced-motion override in `index.css` is acceptable (accessibility). Replace `ScanItem.css` `!important` with a more specific selector.

---

### 1.5 Unused CSS Selectors (P2)

**Problem:** `client/src/index.css` is **2,470 lines** and likely contains hundreds of unused selectors. No automated purge tool (like PurgeCSS) is configured in `vite.config.js`.

**Impact:** Large CSS bundle increases download time and parse time. On slow networks, this delays first paint.

**Fix:** Add `vite-plugin-purgecss` or `purgecss` to the Vite build pipeline to strip unused selectors at build time.

---

### 1.6 Overly Specific Selectors (P3)

**Problem:** Some selectors are unnecessarily specific, e.g.:
```css
/* EmployeeDetail.css */
.role-badge.role-printer { background: #EAF3DE; color: #3B6D11; }
```

**Impact:** Harder to override, larger CSS output.

**Fix:** Use BEM-style naming (`.role-badge--printer`) instead of chained classes.

---

### 1.7 CSS-in-JS vs External CSS Inconsistency (P2)

**Problem:** Some components use external CSS, some use inline styles, some use a mix. There's no enforced pattern.
- `Button.jsx` → external CSS (`buttons.css`) ✅
- `Skeleton.jsx` → inline `style` props ✅ (for dynamic values)
- `AnomalyPanel.jsx` → heavy inline styles ❌
- `ConfirmModal.jsx` → uses `.modal-backdrop` class but also `style={{ zIndex: 9999 }}` ❌

**Impact:** Inconsistent code style, harder to maintain, theming breaks on inline styles.

**Fix:** Establish a rule: static styles go in CSS files; dynamic values (widths, colors from props) go in inline styles. Never use inline styles for layout properties that should be in CSS.

---

### 1.8 Missing CSS Import for Modals (P3)

**Problem:** `modals.css` exists in `styles/components/` but it's unclear if `index.css` imports it. The `@import` at the top of `index.css` only imports `buttons.css`.

```css
/* client/src/index.css — line 1 */
@import './styles/buttons.css';
/* No @import './styles/components/modals.css' */
```

**Impact:** If `modals.css` is not imported, modal styles may be missing or inconsistent.

**Fix:** Add `@import './styles/components/modals.css';` to `index.css` and ensure all component CSS files are imported.

---

### 1.9 Duplicate `@keyframes` (P3)

**Problem:** `fadeIn` and `slideUp` keyframes are defined in both:
- `client/src/index.css` (lines ~1592, ~1597)
- `client/src/styles/components/modals.css` (lines 114, 119)

**Impact:** Duplicate CSS increases bundle size.

**Fix:** Remove duplicate keyframes from `index.css` since `modals.css` is the canonical modal source.

---

## 2. DESIGN TOKEN ISSUES (9 findings)

### 2.1 Client vs Website — Different `--accent` Colors (P1)

**Problem:** The same CSS variable `--accent` has completely different values in client vs website:

```css
/* client/src/index.css (light mode) */
--accent: #09090b;  /* near-black */

/* website/src/index.css */
--accent: #1a1a2e;  /* dark blue */
```

**Impact:** The staff portal and customer website look like different brands. The website has a dark blue accent while the client uses black.

**Fix:** Standardize the accent color. Use `--accent-client` and `--accent-website` if they truly need to differ, or unify to a single brand color.

---

### 2.2 Client vs Website — Different Spacing Scales (P1)

**Problem:** Two completely different spacing token systems:

```css
/* Client: pixel-based */
--space-1: 1px; --space-2: 2px; ... --space-96: 96px;

/* Website: rem-based */
--space-xs: 0.25rem; --space-sm: 0.5rem; --space-md: 1rem; ... --space-4xl: 6rem;
```

**Impact:** Components cannot be shared between client and website. Porting a component requires re-mapping all spacing values.

**Fix:** Unify to one spacing scale. Prefer the client's pixel-based scale (more granular) or adopt a shared scale in a common package.

---

### 2.3 Raw Hex Colors in Page CSS (P2)

**Problem:** Multiple page-level CSS files use raw hex colors instead of CSS variables:

| File | Raw Hex | Context |
|------|---------|---------|
| `AccountantDashboard.css:148` | `#f97316` | KPI icon orange |
| `AccountantDashboard.css:149` | `#a855f7` | KPI icon purple |
| `EmployeeDetail.css:783` | `#EAF3DE`, `#3B6D11` | Role badge printer |
| `FrontOffice.css:770` | `#0d9488` | Stat card teal |
| `FrontOffice.css:771` | `#9333ea` | Stat card purple |
| `ScanItem.css:177` | `#000` | Scan background |
| `ScanItem.css:210` | `#ffffff` | Scan border |
| `SettingsPage.css:246` | `#1a1a2e` | Dark preview |
| `Shortcuts.css:58` | `#fff` | Button text |
| `design-studio/*.css` | `#fff`, `#000` | Multiple |

**Impact:** These colors don't adapt to dark mode. The `#EAF3DE` printer badge will look jarring in dark mode.

**Fix:** Replace all raw hex colors with semantic CSS variables (e.g., `--color-printer`, `--color-teal`) or use `color-mix()` with token variables.

---

### 2.4 Raw Hex Colors in Inline Styles (P2)

**Problem:** Inline styles in JSX use hardcoded hex colors with CSS variable fallbacks:

```jsx
// CustomerDetails.jsx:732
style={{ background: 'var(--bg, #f3f4f6)', borderRadius: 4, fontWeight: 500 }}

// CustomerDetails.jsx:855
style={{ background: 'var(--surface, #222)', borderRadius: 16, ... }}
```

The fallback `#222` and `#f3f4f6` will show in the wrong mode if the CSS variable is missing.

**Impact:** Dark mode fallbacks leak into light mode and vice versa.

**Fix:** Remove hex fallbacks from inline styles. If the CSS variable is missing, that's a token bug that should be fixed at the source, not papered over with a fallback.

---

### 2.5 Inconsistent Typography Font Stack (P2)

**Problem:** Font families are referenced inconsistently:

```css
/* website/index.css */
--font-body: 'Plus Jakarta Sans', system-ui, ...;
--font-display: 'Space Grotesk', ...;
```

```jsx
// CouponManagement.jsx:176
fontFamily: "'Space Grotesk', sans-serif"

// AttendanceSalary.jsx:539
fontFamily: "'Space Grotesk', sans-serif"
```

**Impact:** Some components use the display font for body text, while others use the body font. No centralized typography scale is enforced.

**Fix:** Use CSS variables (`font-family: var(--font-display)`) instead of hardcoded strings. Add a `typography.css` system with `.font-heading`, `.font-body`, `.font-mono` utility classes.

---

### 2.6 Inconsistent Shadow Tokens (P3)

**Problem:** Shadow values differ between client and website:

```css
/* Client */
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), ...;

/* Website */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06);
--shadow-md: 0 4px 6px rgba(0,0,0,0.04), 0 6px 15px rgba(0,0,0,0.06);
```

**Impact:** Shadows look slightly different between client and website.

**Fix:** Unify shadow tokens into a shared design token file.

---

### 2.7 Missing `--font-mono` Token (P3)

**Problem:** Monospace font is used in several places (`fontFamily: 'monospace'`) but there's no `--font-mono` CSS variable.

```jsx
// Billing.jsx:1015
<span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
```

**Impact:** Inconsistent monospace rendering across OS/browsers.

**Fix:** Add `--font-mono: 'JetBrains Mono', 'Fira Code', monospace;` to the token system.

---

### 2.8 Duplicate Color Variables (P3)

**Problem:** Multiple aliases for the same semantic concept:
```css
--danger: #ef4444;
--error: var(--danger);
--clr-danger: var(--danger);
--text-danger: var(--danger);
```

**Impact:** Confusing for developers — which one to use?

**Fix:** Standardize on one naming convention. Prefer `--color-danger` for the color value and `--text-danger` for text usage, or consolidate to a single variable.

---

### 2.9 `--muted` vs `--text-muted` (P3)

**Problem:** Two different variable names for the same concept:
```css
--text-muted: #71717a;
--muted: var(--text-muted);  /* alias */
```

Some files use `--muted`, others use `--text-muted`.

**Impact:** Inconsistent code, harder to grep.

**Fix:** Deprecate `--muted` and migrate all usages to `--text-muted`.

---

## 3. INLINE STYLES OVERUSE (6 findings)

### 3.1 `CustomerDetails.jsx` — 70+ Inline Styles (P1)

**Problem:** `CustomerDetails.jsx` (52KB) contains **70+ inline `style={{...}}` blocks**. Examples:

```jsx
// Line 732
<div style={{ background: 'var(--bg, #f3f4f6)', borderRadius: 4, fontWeight: 500 }}>

// Line 855
<div style={{ background: 'var(--surface, #222)', borderRadius: 16, width: '100%', maxWidth: 500, padding: 32, ... }}>

// Line 909
<label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
```

**Impact:**
- Breaks theming: dark fallbacks (`#222`, `#333`, `#555`) leak into light mode
- Cannot be overridden by CSS
- Increases HTML payload size
- Makes the component file bloated (52KB of JSX)

**Fix:** Extract common patterns into CSS classes. For truly dynamic values (position, width), keep inline. For static layout (padding, border-radius, font-weight), move to CSS.

---

### 3.2 `Billing.jsx` — 60+ Inline Styles (P1)

**Problem:** `Billing.jsx` (89KB) contains **60+ inline styles**. Key examples:

```jsx
// Line 946
<div className="billing-field" style={{ marginBottom: '16px', position: 'relative' }}>

// Line 998
<div className="billing-dropdown" ref={customerDropdownRef} style={{ ... }}>

// Line 1286
<th scope="col" style={{ width: '30%' }}>Product</th>
```

**Impact:** Same as above — theming breaks, HTML bloat, unmaintainable.

**Fix:** Create a `Billing.css` with proper BEM classes for all layout patterns. Only keep dynamic widths/positions as inline styles.

---

### 3.3 `AttendanceSalary.jsx` — 40+ Inline Styles (P1)

**Problem:** `AttendanceSalary.jsx` (19KB) contains **40+ inline styles**. Critically, it uses dark-mode fallbacks in light mode:

```jsx
// Line 173
<div style={{ padding: 14, borderRadius: 12, background: 'linear-gradient(135deg, var(--accent) 0%, rgba(var(--accent-rgb), 0.4) 100%)', color: 'var(--card)' }}>

// Line 207
<div style={{ background: 'var(--surface, #1e1e2e)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 10px' }}>
```

If `--surface` is missing, the fallback `#1e1e2e` is a dark color that will look terrible in light mode.

**Impact:** Broken appearance if CSS variables fail to load. Dark fallback colors in light mode.

**Fix:** Remove all hex fallbacks from inline styles. Ensure CSS variables are always defined.

---

### 3.4 `AccountantDashboard.jsx` — 50+ Inline Styles (P2)

**Problem:** The accountant dashboard uses many inline styles for layout grids, colors, and progress bars.

```jsx
// Line 319
<div style={{ display: 'grid', gap: 10 }}>
// Line 371
<div style={{ display: 'grid', gap: 12 }}>
// Line 403
<div style={{ display: 'grid', gap: 14 }}>
```

**Impact:** No consistent grid gap. Sometimes 10px, sometimes 12px, sometimes 14px.

**Fix:** Create utility classes like `.grid-gap-sm`, `.grid-gap-md`, `.grid-gap-lg`.

---

### 3.5 HTML String with Inline Styles in JSX (P2)

**Problem:** `VendorsTab.jsx` and `StockPlanning.jsx` inject raw HTML strings with inline styles into the DOM:

```jsx
// VendorsTab.jsx:667
<div style="font-family:Arial, Helvetica, sans-serif; color:#000; padding:16px;">

// StockPlanning.jsx:113
body { font-family: Arial, sans-serif; padding: 24px; color: #333; }
```

**Impact:** Hardcoded Arial font, black text (`#000`), and `#333` text won't respect the user's theme.

**Fix:** For PDF/email generation, use CSS variables or inline the current theme values at runtime.

---

### 3.6 Inline `style` on `<option>` Elements (P3)

**Problem:** `Billing.jsx` styles `<option>` elements inline:
```jsx
<option value="" disabled style={{ background: 'var(--card)', color: 'var(--text-muted)' }}>
<option value="Retail" style={{ background: 'var(--card)' }}>
```

**Impact:** `<option>` styling is not consistently supported across browsers (especially Safari).

**Fix:** Remove inline styles from `<option>` elements. Style the `<select>` wrapper instead.

---

## 4. Z-INDEX CHAOS (4 findings)

### 4.1 No Centralized Z-Index System (P1)

**Problem:** Arbitrary z-index values are scattered across the codebase with no system:

| File | z-index | Context |
|------|---------|---------|
| `index.css:461` | 9999 | Toast/toaster container |
| `index.css:2077` | 9999 | Tooltip/menu |
| `SmartSearch.css:7` | 9998 | Search overlay |
| `SmartSearch.css:22` | 9999 | Search overlay |
| `CustomerDetails.css:70` | 9999 | WhatsApp menu |
| `JobDetail.css:234` | 9999 | Image preview |
| `Reports.css:125` | 9999 | Report overlay |
| `ConfirmModal.jsx:16` | 9999 | Confirm modal backdrop |
| `UploadBills.css:157` | 1100 | Upload modal |
| `ReceiptModal.css:11` | 2000 | Receipt modal |
| `modals.css:13` | 1000 | Modal backdrop |
| `modals.css:18-20` | 1001-1003 | Modal backdrop tiers |
| `Billing.css:1014` | 1000 | Billing modal |
| `ExpenseManager.css:1217` | 1000 | Expense modal |
| `JobDetail.css:1163` | 1000 | Job detail modal |
| `MachineManagement.css:224` | 1000 | Machine modal |
| `ProductLibrary.css:219` | 1000 | Product modal |
| `Shortcuts.css:186` | 1000 | Shortcuts modal |
| `Accounts.css:780` | 1000 | Accounts modal |
| `admin/PortfolioManager.css:13` | 1000 | Portfolio form overlay |
| `QuickBilling.css:110` | 1000 | Quick billing overlay |
| `expense-manager/SmartBillUpload.css:7` | 1000 | Bill upload overlay |

**Impact:** Elements can overlap unpredictably. A new modal might appear behind an existing menu because both use 9999. There's no way to know which layer an element should be on.

**Fix:** Create a z-index scale in `index.css`:
```css
:root {
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal: 300;
  --z-modal-high: 400;
  --z-tooltip: 500;
  --z-toast: 600;
  --z-overlay: 700;
}
```
Replace all hardcoded z-index values with these variables.

---

### 4.2 Multiple Elements at `z-index: 9999` (P1)

**Problem:** At least 7 different elements claim `z-index: 9999`:
1. Toast container
2. Tooltip/menu
3. SmartSearch overlay
4. WhatsApp menu (CustomerDetails)
5. Image preview (JobDetail)
6. Report overlay (Reports)
7. Confirm modal backdrop

**Impact:** If two of these appear simultaneously, their stacking order depends on DOM order, not intent.

**Fix:** Assign each to a tier in the z-index scale. Toasts should be above modals. Confirm modals should be above regular modals.

---

### 4.3 `z-index: 1000` Duplicated in 10+ Page CSS Files (P2)

**Problem:** Every page that has a modal defines its own `z-index: 1000` for the modal backdrop.

**Impact:** If a page navigates while a modal is open, the old page's modal and new page's modal could conflict.

**Fix:** Use the centralized `--z-modal` variable everywhere.

---

### 4.4 Missing `z-index` Context on Sticky Elements (P2)

**Problem:** Some sticky/fixed elements may not have z-index, causing them to be hidden behind other content.

**Impact:** Sticky table headers or floating action buttons might be covered by modals.

**Fix:** Audit all `position: fixed/sticky` elements and assign appropriate z-index values.

---

## 5. RESPONSIVE DESIGN ISSUES (5 findings)

### 5.1 Tables Without Horizontal Scroll (P1)

**Problem:** Many tables use `overflowX: 'auto'` as an inline style on wrapper divs, but not all tables have this wrapper. Examples:

```jsx
// AccountantDashboard.jsx:612
<div style={{ marginTop: 16, overflowX: 'auto' }}>

// AccountantDashboard.jsx:656
<div style={{ overflowX: 'auto' }}>

// AccountantDashboard.jsx:691
<div style={{ overflowX: 'auto' }}>
```

**Impact:** Tables without `overflowX: auto` will break the mobile layout, causing horizontal page scroll.

**Fix:** Create a reusable `.table-wrapper` CSS class:
```css
.table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
```
Wrap every `<table>` in this class. Remove inline `overflowX` styles.

---

### 5.2 Hardcoded Pixel Widths in JSX (P2)

**Problem:** Many components use hardcoded pixel widths that won't adapt to mobile:

```jsx
// DesignBookingsCMS.jsx:229
<div style={{ width: 180 }}>

// DesignBookingsCMS.jsx:243
<div style={{ width: 220 }}>

// CustomerDetails.jsx:855
style={{ maxWidth: 500 }}

// CouponManagement.jsx:228
style={{ maxWidth: '480px', width: '92%' }}
```

**Impact:** On small screens, these fixed widths may cause overflow or require horizontal scrolling.

**Fix:** Use percentage-based widths or CSS `min()` / `max()` functions. Use `clamp()` for responsive sizing.

---

### 5.3 Missing Mobile Breakpoints in Page CSS (P2)

**Problem:** Only a few files have `@media` queries:
- `modals.css` has `@media (max-width: 768px)`
- `index.css` has mobile utility classes at `768px` and `1024px`

Most page-level CSS files have NO mobile breakpoints.

**Impact:** The app is likely unusable on mobile for many pages.

**Fix:** Add mobile breakpoints to all page CSS files. Prioritize the most-used pages: Dashboard, Jobs, Inventory, Billing, Customers.

---

### 5.4 Touch Targets May Be Too Small (P3)

**Problem:** Some small buttons and icons may have touch targets smaller than 44×44px:

```jsx
// Pagination.jsx:59 — icon button with 15px icon
<button className="pagination__btn" ...><ChevronsLeft size={15} /></button>

// ConfirmModal.jsx:32 — close button not explicitly sized
<button className="btn btn-ghost" ...>{cancelText}</button>
```

**Impact:** Hard to tap on mobile devices.

**Fix:** Ensure all interactive elements have a minimum tap target of 44×44px. Add `min-width: 44px; min-height: 44px;` to small icon buttons.

---

### 5.5 `min-width: 0` in Grids (P3)

**Problem:** Some grid layouts use `minWidth: 0` as an inline style to prevent overflow:

```jsx
// AnomalyPanel.jsx:124
<div style={{ flex: 1, minWidth: 0 }}>
```

**Impact:** This is a CSS grid/flex bug workaround that should be in CSS, not inline.

**Fix:** Add `.min-w-0 { min-width: 0; }` to utility classes and remove inline usage.

---

## 6. COMPONENT CONSISTENCY ISSUES (5 findings)

### 6.1 Inconsistent Loading States (P1)

**Problem:** Loading states are implemented differently across pages:
- `Skeleton.jsx` / `SkeletonLoader.jsx` — used in some pages
- `Loader2` spinner from `lucide-react` — used in others
- `div className="skeleton-box"` — used in BlogCMS
- `div className="skeleton-block"` — used in Billing
- Plain text "Loading..." — used in some pages

**Impact:** Users see inconsistent loading UX. Some pages have polished skeletons, others have basic spinners.

**Fix:** Standardize on the `Skeleton` / `SkeletonLoader` component system. Add a `LoadingState` component that accepts a `type` prop (`'skeleton'`, `'spinner'`, `'text'`) and renders consistently.

---

### 6.2 Inconsistent Empty States (P2)

**Problem:** Empty states vary wildly:

```jsx
// CouponManagement.jsx:139
<div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
  <Tag size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>No coupons yet</div>
</div>

// Other pages may have no empty state at all
```

**Impact:** Inconsistent UX when data is empty.

**Fix:** Create a reusable `EmptyState` component with icon, title, description, and optional action button props.

---

### 6.3 Inconsistent Modal Patterns (P2)

**Problem:** Modals are implemented in at least 3 different ways:

1. **CSS class-based** (`modals.css`): `<div className="modal-backdrop"><div className="modal">...</div></div>`
2. **Inline-style custom** (`CustomerDetails.jsx`): `<div style={{ position: 'fixed', inset: 0, ... }}>`
3. **ConfirmModal**: Uses `role="button"` on the backdrop div with `tabIndex={0}`

**Impact:** Accessibility and behavior vary. Some modals trap focus, others don't. Some close on backdrop click, others don't.

**Fix:** Create a single `Modal` component that handles backdrop, focus trapping, Escape key, and aria attributes. All pages should use this component.

---

### 6.4 Inconsistent Error States (P3)

**Problem:** Error states are not standardized:
- Some pages use `<ErrorBoundary>` wrapper
- Some pages use `ServerError` component
- Some pages show inline error text
- Some pages show toast notifications

**Impact:** Users don't know what to expect when something fails.

**Fix:** Create an `ErrorState` component with retry button, error message, and contact support link. Use it consistently.

---

### 6.5 Inconsistent Form Patterns (P3)

**Problem:** Forms vary in styling and validation:
- Some use `ValidatedInput` (now orphaned)
- Some use native `<input>` with inline styles
- Some use `React Hook Form` with Zod
- Some have inline error messages, some don't

**Impact:** Inconsistent form UX and validation behavior.

**Fix:** Standardize on `React Hook Form` + Zod for all forms. Create a `FormField` component that wraps label, input, error message, and helper text.

---

## 7. THEMING ISSUES (4 findings)

### 7.1 Dark Mode Fallback Colors in Light Mode (P1)

**Problem:** Multiple inline styles use dark-mode hex colors as CSS variable fallbacks:

```jsx
// AttendanceSalary.jsx:207
<div style={{ background: 'var(--surface, #1e1e2e)', ... }}>

// CustomerDetails.jsx:855
<div style={{ background: 'var(--surface, #222)', ... }}>

// CustomerDetails.jsx:919
style={{ border: '2px solid var(--border, #555)', background: 'var(--bg, #333)', ... }}
```

If the CSS variable fails to load (e.g., during a slow network or SSR), the UI shows dark colors in light mode.

**Impact:** Broken appearance during load or in error conditions.

**Fix:** Remove all hex fallbacks from inline styles. Use CSS variable-only references. Ensure variables are defined in `:root` before any component renders.

---

### 7.2 FOUC Script Differences Between Client and Website (P1)

**Problem:** The FOUC-prevention scripts are slightly different:

```js
// client/index.html — STORAGE_KEY = 'app-theme'
// website/index.html — STORAGE_KEY = 'sarga_theme'
// website defaults to 'dark' if no saved theme; client defaults to 'system'
```

**Impact:** Different default themes. The website defaults to dark mode while the client defaults to system preference.

**Fix:** Unify the FOUC script and default theme. Use the same `STORAGE_KEY` and default value across both projects.

---

### 7.3 Missing `prefers-reduced-motion` Support (P2)

**Problem:** While `index.css` has a `@media (prefers-reduced-motion: reduce)` block, many animations are not covered:

```css
/* index.css:424-430 */
@media (prefers-reduced-motion: reduce) {
  animation-delay: -1ms !important;
  animation-duration: 1ms !important;
  ...
}
```

However, `modals.css` defines `animation: fadeIn 0.2s ease-out forwards;` and `animation: slideUp 0.3s ...` which are not explicitly reduced.

**Impact:** Users with motion sensitivity may still see animations.

**Fix:** Add `prefers-reduced-motion` overrides for all animated components:
```css
@media (prefers-reduced-motion: reduce) {
  .modal, .modal-backdrop { animation: none; }
}
```

---

### 7.4 Theme Color Meta Tag Mismatch (P3)

**Problem:** The `theme-color` meta tag is set differently in client vs website:

```html
<!-- client/index.html -->
<meta name="theme-color" id="theme-color" content="#fafafa" />

<!-- website/index.html -->
<meta name="theme-color" id="theme-color" content="#f5f3ef" />
```

**Impact:** Mobile browser address bars show different colors for client vs website.

**Fix:** Standardize on a single brand color or use the same dynamic JS script to update it based on the active theme.

---

## 8. ORPHANED / DEAD UI CODE (covered in main audit)

The orphaned components (20 files) and orphaned pages (23+ files) were covered in the previous `SARGA_FIX_PROMPT.md` and are not re-listed here. They are a **P1** UI consistency issue because dead code increases bundle size and confuses developers.

---

## APPENDIX: RAW DATA

### Inline Style Count by File (top 20)

| File | `style={{` Count |
|------|-----------------|
| `CustomerDetails.jsx` | 70+ |
| `Billing.jsx` | 60+ |
| `AccountantDashboard.jsx` | 50+ |
| `AttendanceSalary.jsx` | 40+ |
| `FrontOffice.jsx` | 35+ |
| `CCTVManagement.jsx` | 30+ |
| `CouponManagement.jsx` | 25+ |
| `JobDetail.jsx` | 25+ |
| `Dashboard.jsx` | 20+ |
| `Inventory.jsx` | 20+ |
| `EmployeeDetail.jsx` | 18+ |
| `MachineManagement.jsx` | 15+ |
| `ScanItem.jsx` | 15+ |
| `ProductLibrary.jsx` | 15+ |
| `DesignBookingsCMS.jsx` | 12+ |
| `BlogCMS.jsx` | 10+ |
| `Accounts.jsx` | 10+ |
| `Quotes.jsx` | 8+ |
| `Vendors.jsx` | 8+ |
| `SettingsPage.jsx` | 6+ |

### `!important` Count by File

| File | `!important` Count |
|------|-------------------|
| `styles/global-fixes.css` | 20+ |
| `index.css` | 15+ |
| `pages/ScanItem.css` | 5+ |
| `styles/WebInquiries.css` | 2+ |
| Various page CSS | 3+ |

### Raw Hex Color Count by File

| File | Raw Hex Colors |
|------|---------------|
| `index.css` | 5 (token definitions only) |
| `pages/EmployeeDetail.css` | 8+ |
| `pages/FrontOffice.css` | 6+ |
| `pages/ScanItem.css` | 6+ |
| `pages/SettingsPage.css` | 4+ |
| `pages/Shortcuts.css` | 2+ |
| `pages/design-studio/*.css` | 10+ |
| `pages/accounting/AccountantDashboard.css` | 4+ |
| JSX inline styles | 30+ |

---

*End of UI Consistency Audit Report.*
