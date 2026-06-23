# SARGA PRINTS MIS — ACCESSIBILITY (a11y) AUDIT REPORT

> **Generated:** 2026-06-22  
> **Scope:** `client/src/`, `website/src/`  
> **Standard:** WCAG 2.1 Level AA  
> **Method:** Direct file inspection + `grep` analysis across 200+ files  

---

## EXECUTIVE SUMMARY

| WCAG Category | P0 | P1 | P2 | P3 | Total |
|---------------|----|----|----|----|-------|
| **Keyboard** | 0 | 2 | 3 | 2 | 7 |
| **ARIA & Semantic HTML** | 0 | 5 | 4 | 3 | 12 |
| **Color & Contrast** | 0 | 2 | 2 | 1 | 5 |
| **Forms** | 0 | 4 | 2 | 2 | 8 |
| **Images & Media** | 0 | 1 | 2 | 1 | 4 |
| **Tables** | 0 | 1 | 2 | 1 | 4 |
| **Modals & Dialogs** | 0 | 2 | 3 | 1 | 6 |
| **Navigation** | 0 | 1 | 1 | 1 | 3 |
| **Screen Reader Support** | 0 | 1 | 2 | 1 | 4 |
| **Mobile** | 0 | 0 | 1 | 1 | 2 |
| **TOTAL** | **0** | **19** | **22** | **14** | **55** |

> **P0** = Blocks assistive technology users entirely  
> **P1** = Major barrier — difficult or confusing for AT users  
> **P2** = Moderate barrier — annoying but workaround exists  
> **P3** = Minor — best practice violation  

---

## POSITIVE FINDINGS (What's Working Well)

Before diving into issues, these accessibility practices are already in place and should be preserved:

1. **Skip links exist** on the public layout (`PublicLayout.jsx:7`, `index.css:455-468`)
2. **Many `aria-label` attributes** on icon-only buttons in `Billing.jsx`, `Accounts.jsx`
3. **Decorative icons marked with `aria-hidden="true"`** throughout `Billing.jsx`, `Accounts.jsx`
4. **Some modals have `role="dialog"` + `aria-modal="true"`** (`Billing.jsx:1631`, `Customers.jsx:823`)
5. **Keyboard handlers for Enter/Space** on expandable rows (`DailyReport.jsx:1124`), panels (`AnomalyPanel.jsx:74`)
6. **`aria-live="polite"`** on loading text in `Button.jsx:49`
7. **`role="alert"`** on error messages (`Customers.jsx:950`, `SmartBillUpload.jsx:1001`)
8. **`scope="col"`** on table headers in `Billing.jsx:1286-1290`
9. **`aria-label` on navigation landmarks** (`StaffLayout.jsx:76`, `DesignerLayout.jsx:112`)
10. **FOUC prevention script** ensures theme is set before paint, preventing flash of wrong theme

---

## 1. KEYBOARD NAVIGATION (7 findings)

### 1.1 Icon-Only Buttons Missing `aria-label` (P1)

**Problem:** Many icon-only buttons have no accessible name. Screen readers will announce them as "button" with no context.

**Files & Examples:**

```jsx
// InvoiceModal.jsx:143 — close button with no aria-label
<button onClick={onClose} className="icon-button"><X size={20} /></button>

// PaperOptimizer.jsx:149 — close button with no aria-label
<button style={s.closeBtn} onClick={onClose}><X size={20} /></button>

// ShortcutModal.jsx:59 — close button
<button className="btn btn-icon" onClick={onClose}><X size={20} /></button>

// DesignEditor.jsx — 20+ toolbar buttons with only title attributes:
<button className="dse-tb-btn" onClick={handleSave} title="Save"><Save size={18} /></button>
<button className="dse-tb-btn" title="Undo"><Undo2 size={18} /></button>
<button className="dse-tb-btn" title="Redo"><Redo2 size={18} /></button>
```

> **Note:** `title` attributes are NOT accessible to all screen readers. `aria-label` is required.

**Impact:** Screen reader users cannot identify what these buttons do.

**Fix:** Add `aria-label` to ALL icon-only buttons:
```jsx
<button onClick={onClose} className="icon-button" aria-label="Close modal"><X size={20} aria-hidden="true" /></button>
```

---

### 1.2 Missing Keyboard Handlers on `role="button"` Elements (P1)

**Problem:** Many `div` elements with `role="button"` have `tabIndex={0}` and `onClick`, but NO `onKeyDown` handler for Enter/Space.

**Files & Examples:**

```jsx
// AccountantDashboard.jsx:30 — no onKeyDown
<div role="button" tabIndex={0} className="acc-kpi ..." onClick={onClick}>

// AIMonitoring.jsx:131 — no onKeyDown
<div role="button" tabIndex={0} key={alert.id} ... onClick={() => setSelectedAlert(alert.id)}>

// CustomerDetails.jsx:447 — no onKeyDown
<div role="button" tabIndex={0} className="cd-order-header" onClick={() => setExpandedJob(...)}>

// CustomerDetails.jsx:741 — no onKeyDown
<div role="button" tabIndex={0} onClick={() => isImage ? setPreviewDesign(d) : window.open(fileUrl, '_blank')}>
```

**Impact:** Keyboard-only users can tab to these elements but pressing Enter or Space does nothing.

**Fix:** Add `onKeyDown` handlers to ALL `role="button"` elements:
```jsx
onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
```

---

### 1.3 Focus Not Trapped Inside Modals (P2)

**Problem:** None of the custom modal implementations appear to have focus trapping. When a modal is open, Tab key cycles through the entire page behind the modal.

**Files:** `ConfirmModal.jsx`, `ReceiptModal.jsx`, `PaperOptimizer.jsx`, `PaperSidePanel.jsx`, `CouponManagement.jsx`, `MachineManagement.jsx`, `CustomerDetails.jsx` (image preview modal)

**Impact:** Keyboard users can tab out of a modal and interact with background elements without knowing the modal is still open.

**Fix:** Implement focus trapping using a `FocusTrap` component or the `inert` attribute on the background:
```jsx
// Wrap modal content in a focus trap component
<FocusTrap>
  <div className="modal">...</div>
</FocusTrap>
```

---

### 1.4 Focus Not Returned to Trigger After Modal Close (P2)

**Problem:** When a modal closes, focus is not returned to the element that opened it.

**Impact:** Keyboard users lose their place in the page and must tab from the beginning.

**Fix:** Save `document.activeElement` before opening a modal, restore it on close.

---

### 1.5 Missing Escape Key Handler on Modals (P2)

**Problem:** Some modals don't close on Escape key:
- `ConfirmModal.jsx` — no Escape handler
- `ReceiptModal.jsx` — no Escape handler  
- `PaperOptimizer.jsx` — no Escape handler

**Impact:** Keyboard users must find and click the close button.

**Fix:** Add global `keydown` listener for `Escape` key inside modal components.

---

### 1.6 `tabIndex={0}` on Modal Content Containers (P3)

**Problem:** Modal content containers (not interactive elements) have `tabIndex={0}`:

```jsx
// CouponManagement.jsx:228
<div role="button" tabIndex={0} className="modal" ... onClick={e => e.stopPropagation()}>

// AIMonitoring.jsx:199
<div role="button" tabIndex={0} className="modal" ... onClick={e => e.stopPropagation()}>
```

The modal itself shouldn't be focusable — only interactive elements inside it should.

**Impact:** Keyboard users tab to an empty modal container that does nothing.

**Fix:** Remove `role="button"` and `tabIndex={0}` from modal content containers. Keep them on the backdrop if it should close on click, but use `onClick` on the backdrop, not on the modal content.

---

### 1.7 Missing `tabIndex` on Some Clickable Elements (P3)

**Problem:** Some clickable elements have `onClick` but no `tabIndex` or `role`:

```jsx
// CustomerDetails.jsx:732 — clickable card
<div key={d.id} style={{...}} onClick={() => isImage ? ... : ...}>
```

**Impact:** Keyboard users cannot reach or activate these elements.

**Fix:** Add `tabIndex={0}` and `role="button"` (or use a `<button>` element instead of `<div>`).

---

## 2. ARIA & SEMANTIC HTML (12 findings)

### 2.1 Missing `aria-expanded` on Collapsible Sections (P1)

**Problem:** Expandable/collapsible sections don't communicate their state to screen readers.

```jsx
// CustomerDetails.jsx:447
<div role="button" tabIndex={0} className="cd-order-header" onClick={() => setExpandedJob(...)}>
  {/* No aria-expanded */}
</div>

// DailyReport.jsx:1124
<tr ... role={hasLines ? "button" : "row"} tabIndex={hasLines ? 0 : undefined} onClick={...}>
  {/* No aria-expanded */}
</tr>
```

**Impact:** Screen reader users don't know whether a section is expanded or collapsed.

**Fix:** Add `aria-expanded` to all togglable elements:
```jsx
<div role="button" tabIndex={0} aria-expanded={expandedJob === job.id} ...>
```

---

### 2.2 Missing `aria-haspopup` + `aria-expanded` on Dropdowns (P1)

**Problem:** Dropdown toggles (customer autocomplete, product search) don't indicate they open a popup.

**Impact:** Screen reader users don't know a dropdown will open.

**Fix:** Add `aria-haspopup="listbox"` and `aria-expanded` to dropdown triggers.

---

### 2.3 Missing `aria-pressed` on Toggle Buttons (P1)

**Problem:** Toggle buttons (active/inactive states, sidebar open/close) don't indicate pressed state.

**Impact:** Screen reader users don't know whether a toggle is on or off.

**Fix:** Add `aria-pressed={isActive}` to all toggle buttons.

---

### 2.4 Missing `aria-describedby` on Form Inputs (P1)

**Problem:** Only the orphaned `ValidatedInput/ValidatedSelect/ValidatedTextarea` components have `aria-describedby`. Most form inputs in the app do NOT.

```jsx
// Billing.jsx:1143 — has aria-label but no aria-describedby for error
<input className="billing-field__input" aria-label="Search products by name or barcode" autoComplete="off" />

// Billing.jsx:1063 — customer name input
<input ref={customerNameRef} ... placeholder="Customer name" />
  {/* No aria-label, no aria-describedby, no associated <label> */}
```

**Impact:** Screen reader users don't hear error messages or helper text associated with inputs.

**Fix:** Add `aria-describedby` pointing to error message IDs:
```jsx
<input aria-describedby={error ? 'customer-name-error' : undefined} aria-invalid={error ? 'true' : 'false'} />
{error && <p id="customer-name-error" role="alert">{error}</p>}
```

---

### 2.5 Missing `aria-invalid` on Form Inputs (P1)

**Problem:** Errored form inputs don't have `aria-invalid="true"`. Only the orphaned `Validated*` components have this.

**Impact:** Screen reader users don't know an input has an error.

**Fix:** Add `aria-invalid={error ? 'true' : 'false'}` to all form inputs with validation.

---

### 2.6 Missing `aria-labelledby` on Many Modals (P2)

**Problem:** Some modals have `aria-labelledby`, but many don't:

- `ConfirmModal.jsx` — no `aria-labelledby` or `aria-label`
- `ReceiptModal.jsx` — no `aria-labelledby`
- `PaperOptimizer.jsx` — no `aria-labelledby`
- `CouponManagement.jsx` — no `aria-labelledby`
- `MachineManagement.jsx` — no `aria-labelledby`

**Impact:** Screen readers announce "dialog" with no name.

**Fix:** Add `aria-labelledby` pointing to the modal title element, or `aria-label` if no title:
```jsx
<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Modal Title</h2>
</div>
```

---

### 2.7 Missing Semantic Landmarks on Client Pages (P2)

**Problem:** Client pages lack proper HTML5 landmark elements:
- No `<main>` element wrapping the primary content
- No `<header>` element for the app bar
- No `<nav>` element for sidebar navigation (some have `role="navigation"` but not `<nav>`)
- No `<search>` element for search regions

**Impact:** Screen reader users cannot jump to main content, navigation, or search using landmark shortcuts.

**Fix:**
```jsx
<header>...</header>
<nav aria-label="Main Navigation">...</nav>
<main id="main-content">...</main>
<footer>...</footer>
```

---

### 2.8 Missing `aria-current` on Active Navigation Items (P2)

**Problem:** Active navigation items may not have `aria-current="page"`.

**Impact:** Screen reader users don't know which page they're on.

**Fix:** Add `aria-current="page"` to the active `<NavLink>` or nav item. Some are already present in `Billing.jsx:1264` pagination.

---

### 2.9 Heading Hierarchy Skips (P2)

**Problem:** Heading levels are not sequential:

```jsx
// Dashboard.jsx:1277 → h2
<h2 className="modal-title">Edit Profile</h2>

// Dashboard.jsx:1373 → h4 (skips h3)
<h4>Password</h4>

// Dashboard.jsx:1523 → h2
<h2 className="section-title">Product Details</h2>
```

In the `Edit Profile` modal, there's an `h2` followed by `h4` without an `h3`.

**Impact:** Screen reader users navigating by heading level get confused by skipped levels.

**Fix:** Ensure heading levels are sequential: `h1` → `h2` → `h3` → `h4`. Never skip a level.

---

### 2.10 Missing `aria-sort` on Sortable Tables (P3)

**Problem:** Tables with sortable columns don't indicate which column is sorted or the sort direction.

**Impact:** Screen reader users don't know the current sort order.

**Fix:** Add `aria-sort="ascending"` or `aria-sort="descending"` to sorted column headers.

---

### 2.11 Missing `aria-busy` on Loading Regions (P3)

**Problem:** Loading regions (skeletons, spinners) don't have `aria-busy="true"`.

**Impact:** Screen readers may try to read content while it's still loading.

**Fix:**
```jsx
<div aria-busy="true" aria-live="polite">
  <SkeletonLoader />
</div>
```

---

### 2.12 Missing `aria-disabled` on Disabled Buttons (P3)

**Problem:** Some disabled buttons use `disabled` attribute (which removes them from tab order), but custom styled "disabled" elements may not.

**Impact:** If a custom disabled button is still focusable, screen readers don't know it's disabled.

**Fix:** Use native `<button disabled>` for true disabled state. For custom elements, add `aria-disabled="true"` and `tabIndex={-1}`.

---

## 3. COLOR & CONTRAST (5 findings)

### 3.1 Color-Only Status Indicators (P1)

**Problem:** Status is conveyed by color alone without text or icon labels:

```jsx
// AssignStaff.jsx:224
{a.status === 'Completed' && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}

// PaymentModal.jsx:91-93
const statusClass = {
  pending: 'status-badge status-badge--warning',
  paid: 'status-badge status-badge--success',
};

// DashboardQuickActions.jsx:7-9
{ id: 'expense', label: 'Expense', icon: IndianRupee, color: 'var(--warning)' },
{ id: 'transfer', label: 'Transfer', icon: ArrowLeftRight, color: 'var(--success)' },
{ id: 'bill', label: 'Bill', icon: FileText, color: 'var(--danger)' },
```

**Impact:** Colorblind users cannot distinguish status.

**Fix:** Always pair color with text or icon + text:
```jsx
<span className="status-badge status-badge--success">
  <CheckCircle2 size={14} aria-hidden="true" /> Paid
</span>
```

---

### 3.2 Missing `aria-label` on Color-Coded Charts (P1)

**Problem:** The `ForecastChart` and `VendorDashboard` charts use color-coded data without text alternatives for screen readers.

**Impact:** Screen reader users cannot understand chart data.

**Fix:** Provide a data table alternative or `aria-label` on chart segments with values.

---

### 3.3 Low Contrast on `var(--muted)` Text (P2)

**Problem:** `var(--muted)` is `#71717a` in light mode. On `#ffffff` background, the contrast ratio is approximately **4.6:1**, which meets WCAG AA for normal text (4.5:1) but is borderline.

However, on `var(--surface-2)` (`#f0f0f0`) background, the contrast drops further.

**Impact:** Users with low vision may struggle to read muted text.

**Fix:** Darken `--muted` to at least `#6b6b6b` or ensure all muted text is on pure white backgrounds.

---

### 3.4 Low Contrast on Disabled Inputs (P2)

**Problem:** Disabled input text uses `--text-disabled: #9ca3af` on `--input-bg: #ffffff`, which is approximately **2.7:1** contrast — below the 4.5:1 requirement.

**Impact:** Low vision users cannot read disabled field values.

**Fix:** Darken `--text-disabled` to at least `#757575` or use a different visual treatment for disabled fields.

---

### 3.5 Focus Indicators Too Subtle (P3)

**Problem:** Focus indicators are inconsistent:
- `buttons.css`: `outline: 2px solid var(--ring)` with `outline-offset: 2px` — good
- Some inline styled inputs: no explicit focus style defined
- Some custom components: focus may be invisible

**Impact:** Keyboard users can't see where focus is.

**Fix:** Ensure ALL interactive elements have a visible focus indicator (minimum 2px outline with 3:1 contrast against adjacent colors).

---

## 4. FORMS (8 findings)

### 4.1 Missing `<label>` Elements on Most Inputs (P1)

**Problem:** The vast majority of form inputs use `placeholder` text instead of proper `<label>` elements:

```jsx
// Billing.jsx:1063 — no label, only placeholder
<input ref={customerNameRef} ... placeholder="Customer name" />

// Billing.jsx:1072 — no label, only placeholder
<input ... placeholder="Mobile number" />

// Billing.jsx:1143 — has aria-label but no visible label
<input className="billing-field__input" aria-label="Search products by name or barcode" ... />
```

**Impact:**
- Screen reader users may not hear the field name if `aria-label` is missing
- Placeholder text disappears when typing, making it hard for users with cognitive disabilities to remember what the field is for
- Clicking placeholder text doesn't focus the input

**Fix:** Wrap every input in a `<label>` or use `<label htmlFor="id">`:
```jsx
<label htmlFor="customer-name">Customer Name</label>
<input id="customer-name" ... />
```

---

### 4.2 Missing `required` Indicators (P1)

**Problem:** Required fields don't have visible indicators or `aria-required="true"`:

```jsx
// Billing.jsx:967 — "Select Customer Type *" but no aria-required
<option value="" disabled>Select Customer Type *</option>
```

**Impact:** Screen reader users don't know which fields are required.

**Fix:** Add `aria-required="true"` and visual `*` indicator with `aria-hidden="true"` on the asterisk.

---

### 4.3 `autoComplete="off"` on Critical Fields (P2)

**Problem:** `autoComplete="off"` is used on many form fields, preventing browser autofill:

```jsx
// Billing.jsx:992
<input ... autoComplete="off" />

// Customers.jsx:613
<input ... autoComplete="off" />

// Invoices.jsx:338
<input ... autoComplete="off" />
```

While sometimes intentional for security, disabling autocomplete on name, email, phone, and address fields hurts accessibility. Users with motor disabilities rely on autofill.

**Impact:** Users with motor disabilities must type every character manually.

**Fix:** Use proper `autocomplete` values instead of `off`:
```jsx
<input autoComplete="name" />
<input autoComplete="email" />
<input autoComplete="tel" />
<input autoComplete="street-address" />
```

---

### 4.4 Missing `aria-describedby` on Inputs with Helper Text (P2)

**Problem:** Inputs with helper text or error messages don't link them with `aria-describedby`.

**Impact:** Screen readers don't read helper text or errors in context with the input.

**Fix:** See section 2.4.

---

### 4.5 Missing `type="submit"` on Some Form Buttons (P3)

**Problem:** Some form submission buttons may not have `type="submit"`, relying on default behavior.

**Impact:** If JavaScript fails, the form won't submit. Also, Enter key may not submit.

**Fix:** Explicitly add `type="submit"` to all form submit buttons.

---

### 4.6 Missing `autocomplete` on OTP Inputs (P3)

**Problem:** OTP input fields don't have `autocomplete="one-time-code"`.

**Impact:** Mobile users cannot auto-fill OTP from SMS.

**Fix:** Add `autocomplete="one-time-code"` to OTP inputs.

---

### 4.7 Missing `inputmode` on Numeric Inputs (P3)

**Problem:** Numeric inputs (quantity, price, phone) may not have `inputmode="numeric"` or `inputmode="tel"`.

**Impact:** Mobile users get the wrong virtual keyboard.

**Fix:** Add `inputmode="numeric"` to quantity/price fields, `inputmode="tel"` to phone fields.

---

### 4.8 Missing `pattern` on Formatted Inputs (P3)

**Problem:** Phone number, GST, and PIN code inputs don't have `pattern` attributes for validation.

**Impact:** Screen readers don't announce the expected format.

**Fix:** Add `pattern` and `title` attributes, or use `aria-describedby` to link to format instructions.

---

## 5. IMAGES & MEDIA (4 findings)

### 5.1 Missing `alt` Text on Some Images (P1)

**Problem:** Some images have empty `alt=""` that may not be decorative:

```jsx
// DesignChecker.jsx:87
<img loading="lazy" src={preview} alt="" style={{ width: 64, height: 64, ... }} />
// ^ This is a design preview thumbnail — it IS meaningful content

// PortfolioManager.jsx:142
<img src={form.cover_image} alt="" className="mgr-preview" />
// ^ This is a cover image preview — meaningful

// PortfolioManager.jsx:149
<img src={img} alt="" />
// ^ Gallery image — meaningful
```

**Impact:** Screen reader users don't know what these images show.

**Fix:** Add descriptive `alt` text:
```jsx
<img src={preview} alt={`Design preview for ${designName}`} />
```

---

### 5.2 Decorative Images with Non-Empty Alt (P2)

**Problem:** Some decorative images have non-empty alt text:

```jsx
// CameraCapture.jsx:214
<img src={capturedPhoto.src} alt="Captured" style={{ ... }} />
// "Captured" is not descriptive — better as alt="" or alt="Preview of captured photo"
```

**Impact:** Screen reader users hear redundant descriptions.

**Fix:** Use `alt=""` for truly decorative images. Use descriptive alt for meaningful images.

---

### 5.3 Missing `width`/`height` on Images (P2)

**Problem:** Some images lack `width` and `height` attributes, causing layout shift (CLS):

```jsx
// Dashboard.jsx:986
<img src="/icons/icon-192.png" alt="Sarga" className="logo-img" />
// No width/height

// ProductLibrary.jsx:1937
<img loading="lazy" src={catImagePreview} alt="Preview" className="thumb-img" />
// No width/height
```

**Impact:** Layout shifts as images load, disorienting screen reader users and causing visual instability.

**Fix:** Add `width` and `height` attributes to all images. Use CSS `aspect-ratio` for responsive scaling.

---

### 5.4 Missing `loading="lazy"` on Below-Fold Images (P3)

**Problem:** Some images below the fold don't have `loading="lazy"`:

```jsx
// Dashboard.jsx:1304
<img src={profilePreview} alt="Profile" className="profile-avatar-img" />
// No loading attribute
```

**Impact:** Slower page load, which can delay screen reader initialization.

**Fix:** Add `loading="lazy"` to all below-the-fold images.

---

## 6. TABLES (4 findings)

### 6.1 Missing `caption` on Most Tables (P1)

**Problem:** None of the 100+ tables in the app have `<caption>` elements or `aria-label`:

```jsx
// Accounts.jsx:177
<table className="acc-table">
  {/* No caption */}

// Billing.jsx:1283
<table className="billing-table">
  {/* No caption */}

// AccountantDashboard.jsx:613
<table className="acc-table">
  {/* No caption */}
```

**Impact:** Screen reader users don't know what a table is about before entering it.

**Fix:** Add `<caption>` or `aria-label`:
```jsx
<table className="acc-table" aria-label="Sales register for June 2026">
```

---

### 6.2 Missing `scope` on Some Table Headers (P2)

**Problem:** Some tables have `scope="col"` (Billing.jsx), but many don't:

```jsx
// Accounts.jsx:177 — no scope attributes visible
// DailyReport.jsx:677 — no scope attributes visible
```

**Impact:** Screen readers may not associate headers with data cells correctly.

**Fix:** Add `scope="col"` to all column headers and `scope="row"` to row headers.

---

### 6.3 Missing `aria-label` on Nested Tables (P2)

**Problem:** Nested tables (e.g., in `Accounts.jsx:524`) don't have labels to distinguish them from parent tables.

**Impact:** Screen reader users get confused about which table they're in.

**Fix:** Add `aria-label` to nested tables: `aria-label="Nested transaction details"`.

---

### 6.4 Missing `aria-sort` on Sortable Tables (P3)

Covered in 2.10.

---

## 7. MODALS & DIALOGS (6 findings)

### 7.1 Missing `aria-modal="true"` on Many Modals (P1)

**Problem:** Some custom modals don't have `aria-modal="true"`:

- `ConfirmModal.jsx` — no `aria-modal`
- `ReceiptModal.jsx` — no `aria-modal`
- `PaperOptimizer.jsx` — no `aria-modal`
- `PaperSidePanel.jsx` — no `aria-modal`
- `MachineManagement.jsx` (work modal) — no `aria-modal`

**Impact:** Screen readers may not treat these as modal dialogs, allowing users to navigate outside.

**Fix:** Add `aria-modal="true"` and `role="dialog"` to all modal containers.

---

### 7.2 Missing `aria-labelledby` on Many Modals (P1)

Covered in 2.6.

---

### 7.3 No Focus Trap in Custom Modals (P2)

Covered in 1.3.

---

### 7.4 No Escape Key Handler on Some Modals (P2)

Covered in 1.5.

---

### 7.5 Modal Backdrop Not Hidden from Screen Readers (P2)

**Problem:** When a modal is open, the background content is not hidden with `aria-hidden="true"` or `inert`.

**Impact:** Screen reader users can still navigate to and read background content.

**Fix:**
```jsx
// Add aria-hidden to everything except the modal
<div id="app-root" aria-hidden={modalOpen ? 'true' : undefined}>
  {/* app content */}
</div>
<div role="dialog" aria-modal="true">{/* modal */}</div>
```

---

### 7.6 `role="button"` on Modal Content (P3)

Covered in 1.6.

---

## 8. NAVIGATION (3 findings)

### 8.1 Missing Skip Links on Client Pages (P1)

**Problem:** Skip links exist only on the public website (`PublicLayout.jsx`). The client staff portal has NO skip links.

**Impact:** Keyboard users must tab through the entire sidebar navigation on every page load to reach main content.

**Fix:** Add skip links to all client layouts:
```jsx
<a href="#main-content" className="skip-link">Skip to main content</a>
...
<main id="main-content">...</main>
```

---

### 8.2 Missing `aria-current` on Pagination (P2)

**Problem:** Some pagination has `aria-current="page"` (Billing.jsx:1264), but not all pagination components.

**Impact:** Screen reader users don't know which page they're on.

**Fix:** Add `aria-current="page"` to all active page buttons in `Pagination.jsx`.

---

### 8.3 Missing `aria-label` on Pagination (P3)

**Problem:** The `Pagination` component has title attributes (`title="First page"`, `title="Previous page"`) but not all pagination buttons have `aria-label`.

**Impact:** Screen readers may not read title attributes consistently.

**Fix:** Add `aria-label` to all icon-only pagination buttons (some already have it in Billing.jsx).

---

## 9. SCREEN READER SUPPORT (4 findings)

### 9.1 Toast Notifications Not Announced (P1)

**Problem:** `react-hot-toast` is used for notifications, but there's no `aria-live` region configured to announce them. The `aria-live` in `Button.jsx` only covers loading state.

```jsx
// Button.jsx:49
<span aria-live="polite">{loadingText || children}</span>
```

This only announces loading state changes. Success/error toasts are NOT announced.

**Impact:** Screen reader users don't know when actions succeed or fail.

**Fix:** Configure `react-hot-toast` with an `aria-live` region, or add a custom live region:
```jsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {toastMessage}
</div>
```

---

### 9.2 Dynamic Content Updates Not Announced (P2)

**Problem:** When data updates (e.g., search results, dashboard stats), there's no `aria-live` announcement.

**Impact:** Screen reader users don't know when content changes.

**Fix:** Add `aria-live="polite"` to regions that update dynamically:
```jsx
<div aria-live="polite">
  <SearchResults results={results} />
</div>
```

---

### 9.3 Loading States Not Announced (P2)

**Problem:** Loading spinners don't have `aria-live` or `aria-label`:

```jsx
// Billing.jsx:1487
<Loader2 size={32} className="animate-spin" style={{ color: 'var(--muted)' }} />
```

**Impact:** Screen reader users don't know loading is in progress.

**Fix:** Add `aria-label="Loading"` or wrap in an `aria-live` region:
```jsx
<div aria-live="polite">
  {loading && <Loader2 size={32} className="animate-spin" aria-label="Loading" />}
</div>
```

---

### 9.4 Missing `aria-live` on Error Messages (P3)

**Problem:** Some error messages have `role="alert"` (good!), but not all:

```jsx
// Customers.jsx:950 — has role="alert" ✅
{error && <p className="text-sm text-error" role="alert">{error}</p>}

// Other pages may not have role="alert" on errors ❌
```

**Impact:** Errors may not be announced immediately.

**Fix:** Ensure ALL error messages have `role="alert"` or are in an `aria-live="assertive"` region.

---

## 10. MOBILE ACCESSIBILITY (2 findings)

### 10.1 Touch Targets on Pagination Buttons (P2)

**Problem:** Pagination icon buttons use 15px icons with no explicit sizing:

```jsx
// Pagination.jsx:59
<button className="pagination__btn" ...><ChevronsLeft size={15} /></button>
```

The button may be smaller than 44×44px depending on CSS.

**Impact:** Hard to tap on mobile for users with motor disabilities.

**Fix:** Ensure all interactive elements have a minimum 44×44px touch target.

---

### 10.2 Pinch-to-Zoom Not Disabled (P3)

**Problem:** The viewport meta tag does NOT disable user scaling:

```html
<!-- client/index.html:63 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

This is actually GOOD for accessibility (users can zoom). However, some design tools might need zoom disabled. This is a positive finding, not a negative.

**Impact:** None — this is correct. Users can zoom, which is an accessibility requirement.

**Fix:** No fix needed. Keep `user-scalable=yes` (default).

---

## APPENDIX: RAW STATISTICS

### `aria-*` Attribute Usage Across Client

| Attribute | Count | Files |
|-----------|-------|-------|
| `aria-label` | 298 | 45+ |
| `aria-hidden` | 90 | 25+ |
| `aria-live` | 2 | 2 |
| `aria-modal` | 12 | 8+ |
| `aria-labelledby` | 10 | 6+ |
| `aria-describedby` | 3 | 3 (all orphaned Validated* components) |
| `aria-invalid` | 3 | 3 (all orphaned Validated* components) |
| `aria-expanded` | 0 | — |
| `aria-haspopup` | 0 | — |
| `aria-pressed` | 0 | — |
| `aria-current` | 5 | 2 |
| `role` | 166 | 40+ |
| `tabIndex` | 87 | 35+ |

### Key Insight

The app has **good coverage of `aria-label` and `aria-hidden`** but is **missing critical ARIA states** (`aria-expanded`, `aria-haspopup`, `aria-pressed`, `aria-invalid`, `aria-describedby`) that are essential for interactive components.

### `role` Distribution

| Role | Count | Context |
|------|-------|---------|
| `button` | 87 | Mostly on divs that should be `<button>` |
| `dialog` | 12 | Modal backdrops |
| `navigation` | 3 | Sidebars |
| `alert` | 5 | Error messages |
| `listbox` | 8 | Autocomplete dropdowns |
| `option` | 10 | Dropdown items |
| `row` | 5 | Table rows |
| `dialog` | 3 | Modal content |

---

*End of Accessibility Audit Report.*
