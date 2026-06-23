# SARGA PRINTS MIS — ACCESSIBILITY FIX PROMPT

> **Repo:** `D:\software sarga`  
> **Scope:** `client/src/`, `website/src/`  
> **Standard:** WCAG 2.1 Level AA  
> **Total Issues:** 55 (P1: 19, P2: 22, P3: 14)  
> **Generated:** 2026-06-22

---

## RULES FOR THE FIX AGENT

1. **Read every file before editing.** Use `Read` to inspect the exact content.
2. **Make surgical edits.** Change only what's needed for accessibility. Do not refactor unrelated code.
3. **Preserve working behavior.** Every fix must maintain existing functionality.
4. **Verify with `npm run build`** in `client/` and `website/` after all changes. Build must pass with zero new errors.
5. **Do not delete files.** Only edit existing files. If an orphaned component needs changes, still edit it (it's not deleted yet).
6. **Use `Edit` tool for all changes.** Never use `Write` to overwrite an entire file unless explicitly instructed.
7. **Batch similar fixes.** If the same fix applies to 20 files, fix all 20 in one pass before moving to the next issue.

---

## ISSUE 1 — Icon-Only Buttons Missing `aria-label` (P1)

**Problem:** Screen readers announce "button" with no context for icon-only buttons. `title` attributes are NOT sufficient.

**Files to fix (batch this):**

### `client/src/components/InvoiceModal.jsx`
```jsx
// Line ~143 — BEFORE:
<button onClick={onClose} className="icon-button"><X size={20} /></button>
// AFTER:
<button onClick={onClose} className="icon-button" aria-label="Close invoice modal"><X size={20} aria-hidden="true" /></button>
```

### `client/src/components/PaperOptimizer.jsx`
```jsx
// Line ~149 — BEFORE:
<button style={s.closeBtn} onClick={onClose}><X size={20} /></button>
// AFTER:
<button style={s.closeBtn} onClick={onClose} aria-label="Close paper optimizer"><X size={20} aria-hidden="true" /></button>
```

### `client/src/components/quickbilling/ShortcutModal.jsx`
```jsx
// Line ~59 — BEFORE:
<button className="btn btn-icon" onClick={onClose}><X size={20} /></button>
// AFTER:
<button className="btn btn-icon" onClick={onClose} aria-label="Close shortcut modal"><X size={20} aria-hidden="true" /></button>
```

### `client/src/components/ScannerModal.jsx`
Search for all `<button>` elements containing only icons. Add `aria-label` and `aria-hidden="true"` on the icon.

### `client/src/pages/design-studio/DesignEditor.jsx` — 20+ toolbar buttons
```jsx
// Lines ~105-119 — BEFORE (all of these):
<button className="dse-tb-btn" onClick={handleSave} title="Save"><Save size={18} /></button>
<button className="dse-tb-btn" title="Undo"><Undo2 size={18} /></button>
<button className="dse-tb-btn" title="Redo"><Redo2 size={18} /></button>
<button className="dse-tb-btn" title="Preview"><Eye size={18} /></button>
<button className="dse-tb-btn" title="Export"><Download size={18} /></button>
<button className="dse-tb-btn" title="Share"><Share2 size={18} /></button>
<button className="dse-tb-btn" title="Version History"><Clock size={18} /></button>
<button className="dse-tb-btn" onClick={handleZoomOut} title="Zoom Out"><ZoomOut size={16} /></button>
<button className="dse-tb-btn" onClick={handleZoomIn} title="Zoom In"><ZoomIn size={16} /></button>
<button className="dse-tb-btn" title="Group"><Group size={16} /></button>
<button className="dse-tb-btn" title="Duplicate"><Copy size={16} /></button>
<button className="dse-tb-btn" title="Align Left"><AlignLeft size={16} /></button>
<button className="dse-tb-btn" title="Align Center"><AlignCenter size={16} /></button>
<button className="dse-tb-btn" title="Align Right"><AlignRight size={16} /></button>
<button className="dse-tb-btn" title="Align Top"><AlignStartVertical size={16} /></button>
<button className="dse-tb-btn" title="Align Middle"><AlignCenterVertical size={16} /></button>
<button className="dse-tb-btn" title="Align Bottom"><AlignEndVertical size={16} /></button>
<button className="dse-tb-btn" title="Distribute"><Minimize2 size={16} /></button>
<button className="dse-tb-btn" title="Lock"><Lock size={16} /></button>
<button className="dse-tb-btn" title="Delete"><Trash2 size={16} /></button>

// AFTER — add aria-label to each (keep title as hover tooltip):
<button className="dse-tb-btn" onClick={handleSave} title="Save" aria-label="Save design"><Save size={18} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Undo" aria-label="Undo"><Undo2 size={18} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Redo" aria-label="Redo"><Redo2 size={18} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Preview" aria-label="Preview design"><Eye size={18} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Export" aria-label="Export design"><Download size={18} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Share" aria-label="Share design"><Share2 size={18} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Version History" aria-label="Version history"><Clock size={18} aria-hidden="true" /></button>
<button className="dse-tb-btn" onClick={handleZoomOut} title="Zoom Out" aria-label="Zoom out"><ZoomOut size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" onClick={handleZoomIn} title="Zoom In" aria-label="Zoom in"><ZoomIn size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Group" aria-label="Group objects"><Group size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Duplicate" aria-label="Duplicate objects"><Copy size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Align Left" aria-label="Align left"><AlignLeft size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Align Center" aria-label="Align center horizontally"><AlignCenter size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Align Right" aria-label="Align right"><AlignRight size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Align Top" aria-label="Align top"><AlignStartVertical size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Align Middle" aria-label="Align middle vertically"><AlignCenterVertical size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Align Bottom" aria-label="Align bottom"><AlignEndVertical size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Distribute" aria-label="Distribute evenly"><Minimize2 size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Lock" aria-label="Lock objects"><Lock size={16} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Delete" aria-label="Delete objects"><Trash2 size={16} aria-hidden="true" /></button>
```

### `client/src/pages/design-studio/AlbumDesigner.jsx`
```jsx
// Lines ~138-140 — BEFORE:
<button className="dse-tb-btn" title="Replace"><Image size={14} /></button>
<button className="dse-tb-btn" title="Crop"><ZoomIn size={14} /></button>
<button className="dse-tb-btn" title="Swap"><Move size={14} /></button>

// AFTER:
<button className="dse-tb-btn" title="Replace" aria-label="Replace image"><Image size={14} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Crop" aria-label="Crop image"><ZoomIn size={14} aria-hidden="true" /></button>
<button className="dse-tb-btn" title="Swap" aria-label="Swap image"><Move size={14} aria-hidden="true" /></button>
```

### `client/src/pages/design-studio/CreateDesignModal.jsx`
```jsx
// Line ~93 — BEFORE:
<button className="ds-modal-close" onClick={onClose}><X size={20} /></button>
// AFTER:
<button className="ds-modal-close" onClick={onClose} aria-label="Close create design modal"><X size={20} aria-hidden="true" /></button>
```

### `client/src/pages/AccountantDashboard.jsx`
```jsx
// Line ~67 — BEFORE:
<button className="acc-alert__action" onClick={onAction}><ArrowRight size={14} /></button>
// AFTER:
<button className="acc-alert__action" onClick={onAction} aria-label={onActionLabel || "View alert details"}><ArrowRight size={14} aria-hidden="true" /></button>
```

### `client/src/pages/Billing.jsx`
```jsx
// Line ~1045 — BEFORE:
<button className="btn btn-ghost btn-xs" onClick={handleChangeCustomer} style={{ marginLeft: 'auto' }}><X size={14} /></button>
// AFTER:
<button className="btn btn-ghost btn-xs" onClick={handleChangeCustomer} style={{ marginLeft: 'auto' }} aria-label="Clear customer selection"><X size={14} aria-hidden="true" /></button>
```

**General rule:** Search ALL `.jsx` files for `<button` followed by `>` (no text children) with an icon inside. Add `aria-label` to the button and `aria-hidden="true"` to the icon.

---

## ISSUE 2 — `role="button"` Elements Missing Keyboard Handlers (P1)

**Problem:** Keyboard-only users can tab to `role="button"` elements but pressing Enter/Space does nothing.

**Pattern to apply everywhere:**
```jsx
// BEFORE:
<div role="button" tabIndex={0} ... onClick={handleClick}>

// AFTER:
<div role="button" tabIndex={0} ... onClick={handleClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}>
```

**Files to fix (batch this):**

### `client/src/pages/AccountantDashboard.jsx`
```jsx
// Line ~30 — BEFORE:
<div role="button" tabIndex={0} className={`acc-kpi ${color} ${onClick ? 'acc-kpi--clickable' : ''} hover-lift`} onClick={onClick}>
// AFTER:
<div role="button" tabIndex={0} className={`acc-kpi ${color} ${onClick ? 'acc-kpi--clickable' : ''} hover-lift`} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick(); } }}>
```

### `client/src/pages/AccountantDashboard.jsx` (line ~457)
```jsx
// BEFORE:
<div role="button" tabIndex={0} key={j.id} className="acc-list-item acc-list-item--clickable" onClick={() => navigate(`/dashboard/sales/orders/${j.id}`)}>
// AFTER:
<div role="button" tabIndex={0} key={j.id} className="acc-list-item acc-list-item--clickable" onClick={() => navigate(`/dashboard/sales/orders/${j.id}`)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/dashboard/sales/orders/${j.id}`); } }}>
```

### `client/src/pages/AIMonitoring.jsx`
```jsx
// Line ~131 — BEFORE:
<div role="button" tabIndex={0} key={alert.id} ... onClick={() => setSelectedAlert(alert.id)}>
// AFTER:
<div role="button" tabIndex={0} key={alert.id} ... onClick={() => setSelectedAlert(alert.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAlert(alert.id); } }}>
```

### `client/src/pages/CustomerDetails.jsx`
```jsx
// Line ~447 — BEFORE:
<div role="button" tabIndex={0} className="cd-order-header" onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
// AFTER:
<div role="button" tabIndex={0} className="cd-order-header" onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedJob(expandedJob === job.id ? null : job.id); } }} aria-expanded={expandedJob === job.id}>
```

### `client/src/pages/CustomerDetails.jsx` (line ~741)
```jsx
// BEFORE:
<div role="button" tabIndex={0} onClick={() => isImage ? setPreviewDesign(d) : window.open(fileUrl, '_blank')}>
// AFTER:
<div role="button" tabIndex={0} onClick={() => isImage ? setPreviewDesign(d) : window.open(fileUrl, '_blank')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isImage ? setPreviewDesign(d) : window.open(fileUrl, '_blank'); } }} aria-label={isImage ? `Preview ${d.title || 'design'}` : `Open ${d.title || 'file'}`}>
```

### `client/src/pages/Branches.jsx`
```jsx
// Line ~194 — BEFORE:
<div role="button" tabIndex={0} className="row gap-sm" onClick={(e) => e.stopPropagation()}>
// AFTER:
<div role="button" tabIndex={0} className="row gap-sm" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
```

### `client/src/pages/Dashboard.jsx`
```jsx
// Line ~1019 — BEFORE:
<div className="user-profile" onClick={() => setShowProfilePanel(true)} role="button" tabIndex={0} aria-label="User profile">
// AFTER:
<div className="user-profile" onClick={() => setShowProfilePanel(true)} role="button" tabIndex={0} aria-label="User profile" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowProfilePanel(true); } }}>
```

### `client/src/pages/Dashboard.jsx` (line ~1058)
```jsx
// BEFORE:
<div className="appbar-search" onClick={() => setSearchOpen(true)} role="button" tabIndex={0} aria-label="Search" onKeyDown={(e) => { if (e.key === 'Enter') setSearchOpen(true); }}>
// This one already has onKeyDown! Good. Just add 'Space':
// AFTER:
<div className="appbar-search" onClick={() => setSearchOpen(true)} role="button" tabIndex={0} aria-label="Search" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSearchOpen(true); } }}>
```

### `client/src/pages/InventoryOverview.jsx`
```jsx
// Line ~162 — BEFORE:
<div role="button" tabIndex={0} key={c.key} className="panel stack-xs" style={{ cursor: 'pointer' }} onClick={() => navigate(c.href)}>
// AFTER:
<div role="button" tabIndex={0} key={c.key} className="panel stack-xs" style={{ cursor: 'pointer' }} onClick={() => navigate(c.href)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(c.href); } }}>
```

**General rule:** Search ALL `.jsx` files for `role="button"` + `tabIndex={0}` + `onClick` but NO `onKeyDown`. Add the keyboard handler to every single one. This is a batch operation.

---

## ISSUE 3 — Missing `aria-expanded` on Collapsible Sections (P1)

**Problem:** Screen reader users don't know whether collapsible sections are open or closed.

**Files to fix:**

### `client/src/pages/CustomerDetails.jsx`
```jsx
// Line ~447 — add aria-expanded (already shown in Issue 2):
<div role="button" tabIndex={0} className="cd-order-header" onClick={() => setExpandedJob(...)} onKeyDown={...} aria-expanded={expandedJob === job.id}>
```

### `client/src/pages/DailyReport.jsx`
```jsx
// Line ~1124 — BEFORE:
<tr className={hasLines ? 'entry-table tr--clickable' : ''} onClick={hasLines ? () => toggleExpand(entry.id) : undefined} role={hasLines ? "button" : "row"} tabIndex={hasLines ? 0 : undefined} onKeyDown={hasLines ? (e) => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(entry.id); } } : undefined}>
// AFTER — add aria-expanded:
<tr className={hasLines ? 'entry-table tr--clickable' : ''} onClick={hasLines ? () => toggleExpand(entry.id) : undefined} role={hasLines ? "button" : "row"} tabIndex={hasLines ? 0 : undefined} onKeyDown={hasLines ? (e) => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(entry.id); } } : undefined} aria-expanded={hasLines ? expandedEntry === entry.id : undefined}>
```

### `client/src/components/AnomalyPanel.jsx`
```jsx
// Line ~74 — BEFORE:
<button ... onClick={() => setExpanded(x => !x)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x); } }}>
// AFTER:
<button ... onClick={() => setExpanded(x => !x)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x); } }} aria-expanded={expanded}>
```

### `client/src/components/InsightsPanel.jsx`
```jsx
// Line ~184 — BEFORE:
<div ... onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x); } }}>
// AFTER:
<div ... onKeyDown={...} aria-expanded={expanded}>
```

**General rule:** Find every toggleable/collapsible element. Add `aria-expanded={isOpen}`.

---

## ISSUE 4 — Missing `aria-label` / `aria-labelledby` on Modals (P1)

**Problem:** Screen readers announce "dialog" with no name for many custom modals.

**Files to fix:**

### `client/src/components/ConfirmModal.jsx`
```jsx
// BEFORE:
<div role="button" tabIndex={0} className="modal-backdrop animate-fade-in" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) { onCancel(); } }}>
    <div role="button" tabIndex={0} className="confirm-modal animate-scale-in" onClick={e => e.stopPropagation()}>

// AFTER:
<div className="modal-backdrop animate-fade-in" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) { onCancel(); } }} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div className="confirm-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Change h3 to have id: */}
        <h3 id="confirm-title" className="confirm-modal__title">{title}</h3>
```

Also remove `role="button"` and `tabIndex={0}` from the modal content container (see Issue 6).

### `client/src/components/ReceiptModal.jsx`
```jsx
// Add role="dialog" aria-modal="true" aria-labelledby="receipt-title" to the overlay div
// Add id="receipt-title" to the modal title element
```

### `client/src/components/PaperOptimizer.jsx`
```jsx
// Add role="dialog" aria-modal="true" aria-label="Paper optimizer" to the overlay div
// Remove role="button" and tabIndex from modal content
```

### `client/src/pages/CouponManagement.jsx`
```jsx
// Lines ~227-228 — BEFORE:
<div role="button" tabIndex={0} className="modal-backdrop" ...>
  <div role="button" tabIndex={0} className="modal" ...>
// AFTER:
<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="coupon-modal-title" ...>
  <div className="modal" ...>
    {/* Add id="coupon-modal-title" to the modal heading */}
```

### `client/src/pages/MachineManagement.jsx` (all 3 modals)
```jsx
// Lines ~1003-1004, ~1122-1123, ~1304-1305 — add role="dialog" aria-modal="true" aria-labelledby="..." to each modal backdrop
// Remove role="button" and tabIndex from modal content divs
```

### `client/src/pages/ExpenseManager.jsx`
```jsx
// Lines ~269-270 — add role="dialog" aria-modal="true" to the sidepanel backdrop
```

### `client/src/pages/CustomerDetails.jsx` (image preview modal)
```jsx
// Line ~955 — add role="dialog" aria-modal="true" aria-label="Design preview" to the overlay
```

---

## ISSUE 5 — Missing `aria-describedby` + `aria-invalid` on Form Inputs (P1)

**Problem:** Only the 3 orphaned `Validated*` components have these. All active form inputs lack them.

**Pattern to apply everywhere:**
```jsx
// BEFORE:
<input className="billing-field__input" ... />
{error && <p className="text-error">{error}</p>}

// AFTER:
<input className="billing-field__input" aria-describedby={error ? 'field-error' : undefined} aria-invalid={error ? 'true' : 'false'} ... />
{error && <p id="field-error" className="text-error" role="alert">{error}</p>}
```

**Key files to fix:**

### `client/src/pages/Billing.jsx` — All form inputs
Add `aria-describedby` and `aria-invalid` to:
- Customer name input (line ~1063)
- Mobile input (line ~1072)
- GST input (line ~1083)
- Email input (line ~1092)
- Address input (line ~1097)
- Search products input (line ~1143)
- Quick entry name (line ~1188)
- All payment inputs (lines ~1450-1516)

### `client/src/pages/Customers.jsx` — All form inputs
Add `aria-describedby` and `aria-invalid` to all customer form inputs (lines ~613, ~849, ~985, ~1095).

### `client/src/pages/Invoices.jsx` — All form inputs
Add `aria-describedby` and `aria-invalid` to invoice inputs (lines ~338, ~351, ~363, ~571).

### `client/src/pages/Payments.jsx` — All form inputs
Add `aria-describedby` and `aria-invalid` to payment inputs (lines ~470, ~722).

### `client/src/pages/MachineManagement.jsx` — Form inputs
Add `aria-describedby` and `aria-invalid` to machine form inputs (line ~1381).

### `client/src/pages/FrontOffice.jsx` — Form inputs
Add `aria-describedby` and `aria-invalid` to form inputs (line ~590).

### `client/src/pages/CustomerPayments.jsx` — Form inputs
Add `aria-describedby` and `aria-invalid` to payment inputs (line ~1334).

**General rule:** For every form input that has validation or helper text, add:
1. `aria-describedby={error ? 'id-error' : helperText ? 'id-help' : undefined}`
2. `aria-invalid={error ? 'true' : 'false'}`
3. Add `id` attributes to error messages and helper text paragraphs.

---

## ISSUE 6 — Remove `role="button"` and `tabIndex={0}` from Modal Content Containers (P2)

**Problem:** Modal content containers should not be focusable or have `role="button"`. Only the backdrop (if clickable) and interactive elements inside should be focusable.

**Files to fix:**

### `client/src/components/ConfirmModal.jsx`
```jsx
// BEFORE:
<div role="button" tabIndex={0} className="confirm-modal animate-scale-in" onClick={e => e.stopPropagation()}>
// AFTER:
<div className="confirm-modal animate-scale-in" onClick={e => e.stopPropagation()}>
```

### `client/src/pages/AIMonitoring.jsx`
```jsx
// Lines ~198-199 — BEFORE:
<div role="button" tabIndex={0} className="modal-backdrop" ...>
<div role="button" tabIndex={0} className="modal" ... onClick={e => e.stopPropagation()}>
// AFTER:
<div className="modal-backdrop" role="dialog" aria-modal="true" ... onClick={...}>
<div className="modal" ... onClick={e => e.stopPropagation()}>
```

### `client/src/pages/CouponManagement.jsx`
```jsx
// Lines ~227-228 — BEFORE:
<div role="button" tabIndex={0} className="modal-backdrop" ...>
<div role="button" tabIndex={0} className="modal" ... onClick={e => e.stopPropagation()}>
// AFTER:
<div className="modal-backdrop" role="dialog" aria-modal="true" ... onClick={...}>
<div className="modal" ... onClick={e => e.stopPropagation()}>
```

### `client/src/pages/MachineManagement.jsx`
```jsx
// Lines ~1004, ~1123, ~1305 — remove role="button" and tabIndex from all modal content divs
// Keep role="dialog" aria-modal="true" on the backdrop only
```

### `client/src/components/PaperOptimizer.jsx`
```jsx
// Lines ~141-142 — BEFORE:
<div role="button" tabIndex={0} style={s.overlay} onClick={onClose}>
<div role="button" tabIndex={0} style={s.modal} onClick={(e) => e.stopPropagation()}>
// AFTER:
<div style={s.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Paper optimizer">
<div style={s.modal} onClick={(e) => e.stopPropagation()}>
```

### `client/src/components/PaperSidePanel.jsx`
```jsx
// Lines ~199-200 — BEFORE:
<div role="button" tabIndex={0} className="modal-backdrop" ...>
<div role="button" tabIndex={0} className="em-modal" ...>
// AFTER:
<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Paper side panel" ...>
<div className="em-modal" ...>
```

### `client/src/components/ReceiptModal.jsx`
```jsx
// Lines ~53-54 — BEFORE:
<div role="button" tabIndex={0} className="receipt-overlay" onClick={onClose}>
<div role="button" tabIndex={0} className="receipt-modal" onClick={e => e.stopPropagation()}>
// AFTER:
<div className="receipt-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="receipt-title">
<div className="receipt-modal" onClick={e => e.stopPropagation()}>
```

---

## ISSUE 7 — Add `aria-label` to Images Missing `alt` or with Empty `alt` (P1)

**Problem:** Some meaningful images have empty `alt=""` or no alt text.

**Files to fix:**

### `client/src/pages/DesignChecker.jsx`
```jsx
// Line ~87 — BEFORE:
<img loading="lazy" src={preview} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
// AFTER:
<img loading="lazy" src={preview} alt={`Design preview for ${designName}`} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
```

### `client/src/pages/admin/PortfolioManager.jsx`
```jsx
// Line ~142 — BEFORE:
<img src={form.cover_image} alt="" className="mgr-preview" />
// AFTER:
<img src={form.cover_image} alt="Portfolio cover image preview" className="mgr-preview" />

// Line ~149 — BEFORE:
<img src={img} alt="" />
// AFTER:
<img src={img} alt={`Portfolio gallery image ${i + 1}`} />

// Line ~169 — BEFORE:
<img src={p.cover_image} alt="" className="mgr-thumb" />
// AFTER:
<img src={p.cover_image} alt={`Cover for ${p.title || 'portfolio item'}`} className="mgr-thumb" />
```

### `client/src/pages/CameraCapture.jsx`
```jsx
// Line ~214 — BEFORE:
<img src={capturedPhoto.src} alt="Captured" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
// AFTER:
<img src={capturedPhoto.src} alt="Preview of captured photo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
```

### `client/src/pages/design-studio/AIDesignGenerator.jsx`
```jsx
// Line ~82 — BEFORE:
<img src={preview} alt="Uploaded design" />
// This is okay, but can be better:
// AFTER:
<img src={preview} alt={`AI design preview: ${designName || 'uploaded design'}`} />
```

---

## ISSUE 8 — Add `aria-live` Region for Toast Notifications (P1)

**Problem:** `react-hot-toast` notifications are not announced to screen readers.

**Fix:** Add a custom live region that mirrors toast messages.

### `client/src/App.jsx`
```jsx
// Add a hidden live region near the Toaster component:

import { useState, useEffect } from 'react';

// Add this component inside App:
function ToastAnnouncer() {
  const [message, setMessage] = useState('');
  
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const toastText = mutation.target.textContent;
          if (toastText && toastText !== message) {
            setMessage(toastText);
          }
        }
      });
    });
    
    const toastContainer = document.querySelector('.react-hot-toast');
    if (toastContainer) {
      observer.observe(toastContainer, { childList: true, subtree: true });
    }
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only" style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}>
      {message}
    </div>
  );
}

// Add <ToastAnnouncer /> inside the App return, right after <SyncStatusBar /> or before <Toaster>
```

Alternatively, configure the `Toaster` component with a custom `aria-live` wrapper:
```jsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  <Toaster ... />
</div>
```

---

## ISSUE 9 — Add Skip Links to Client Portal Layouts (P1)

**Problem:** Skip links exist only on the public website. Staff portal layouts need them too.

**Files to fix:**

### `client/src/layouts/StaffLayout.jsx`
```jsx
// Add at the very top of the rendered layout, before the sidebar:
<a href="#main-content" className="skip-link">Skip to main content</a>

// Then wrap the main content area:
<main id="main-content">...</main>
```

### `client/src/layouts/DesignerLayout.jsx`
```jsx
// Add at the very top:
<a href="#main-content" className="skip-link">Skip to main content</a>

// Wrap main content:
<main id="main-content">...</main>
```

### `client/src/layouts/AccountantLayout.jsx`
```jsx
// Add at the very top:
<a href="#main-content" className="skip-link">Skip to main content</a>

// Wrap main content:
<main id="main-content">...</main>
```

### `client/src/pages/Dashboard.jsx` (the main dashboard router)
```jsx
// The Dashboard component renders the page content. Ensure it renders inside a `<main id="main-content">` element.
```

The `.skip-link` CSS already exists in `index.css:455-468`. It just needs to be added to the JSX.

---

## ISSUE 10 — Add `aria-pressed` to Toggle Buttons (P2)

**Problem:** Toggle buttons don't indicate pressed state to screen readers.

**Files to fix:**

### `client/src/pages/CouponManagement.jsx` (active toggle)
```jsx
// The toggle button that switches between active/inactive:
<button ... aria-pressed={c.is_active}>
  {c.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
</button>
```

### `client/src/layouts/StaffLayout.jsx` (sidebar toggle)
```jsx
// The sidebar toggle button:
<button ... aria-pressed={sidebarOpen} aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}>
```

### `client/src/layouts/AccountantLayout.jsx` (sidebar toggle)
```jsx
// Same as above:
<button ... aria-pressed={sidebarOpen} ...>
```

### `client/src/pages/Dashboard.jsx` (profile panel toggle)
```jsx
<div ... aria-pressed={showProfilePanel} ...>
```

---

## ISSUE 11 — Add `aria-haspopup` + `aria-expanded` to Dropdowns (P2)

**Problem:** Dropdown triggers don't indicate they open a popup.

**Files to fix:**

### `client/src/pages/Billing.jsx` (customer autocomplete)
```jsx
// The customer search input that triggers a dropdown:
<input ... aria-haspopup="listbox" aria-expanded={customerDropdownOpen} aria-controls="customer-dropdown-list" />

// The dropdown itself:
<div className="billing-dropdown" ref={customerDropdownRef} id="customer-dropdown-list" role="listbox" aria-label="Customer suggestions">
```

### `client/src/pages/Customers.jsx` (autocomplete dropdowns)
```jsx
// Lines ~853, ~900 — same pattern for customer suggestions
<input ... aria-haspopup="listbox" aria-expanded={suggestOpen} />
<div ... role="listbox" aria-label="Customer suggestions">
```

---

## ISSUE 12 — Add `required` Indicators to Form Fields (P2)

**Problem:** Required fields don't have `aria-required="true"`.

**Files to fix:** Apply to ALL required form inputs in:
- `Billing.jsx` (customer type, customer name, etc.)
- `Customers.jsx` (name, phone, etc.)
- `Invoices.jsx`
- `Payments.jsx`
- `MachineManagement.jsx`

**Pattern:**
```jsx
// BEFORE:
<input ... placeholder="Customer name *" />

// AFTER:
<label htmlFor="customer-name">Customer Name <span aria-hidden="true">*</span></label>
<input id="customer-name" ... aria-required="true" />
```

Note: The `*` should have `aria-hidden="true"` so screen readers don't read "star".

---

## ISSUE 13 — Add `aria-label` to Tables (P1)

**Problem:** None of the 100+ tables have `<caption>` or `aria-label`.

**Pattern:**
```jsx
// BEFORE:
<table className="acc-table">

// AFTER:
<table className="acc-table" aria-label="Sales register for June 2026">
```

**Key tables to label (at minimum):**
- `Accounts.jsx` — all 8 tables
- `AccountantDashboard.jsx` — all 3 tables
- `Billing.jsx` — billing table
- `DailyReport.jsx` — all 4 tables
- `AttendanceSalary.jsx` — attendance table, salary table
- `CustomerPayments.jsx` — payments table
- `FrontOffice.jsx` — all tables
- `VendorDetail.jsx` — transaction table

---

## ISSUE 14 — Add `aria-sort` to Sortable Table Headers (P3)

**Problem:** Sortable tables don't indicate which column is sorted and in what direction.

**Pattern:**
```jsx
// When a column is sorted ascending:
<th scope="col" aria-sort="ascending">Date</th>

// When a column is sorted descending:
<th scope="col" aria-sort="descending">Date</th>

// When not sorted:
<th scope="col" aria-sort="none">Date</th>
```

Apply to any table headers that are clickable for sorting.

---

## ISSUE 15 — Add `aria-busy` to Loading Regions (P3)

**Problem:** Loading regions don't indicate they're busy to screen readers.

**Pattern:**
```jsx
// BEFORE:
<div className="loading">
  <Loader2 size={32} className="animate-spin" />
</div>

// AFTER:
<div className="loading" aria-busy="true" aria-live="polite">
  <Loader2 size={32} className="animate-spin" aria-label="Loading" />
</div>
```

Apply to loading states in:
- `CouponManagement.jsx` (lines ~134-135)
- `Billing.jsx` (lines ~1487, ~1611)
- `Dashboard.jsx` (skeleton loaders)
- `Inventory.jsx` (skeleton loaders)

---

## ISSUE 16 — Add `aria-live` to Dynamic Content Regions (P2)

**Problem:** Content that updates dynamically (search results, stats, dashboard cards) is not announced.

**Pattern:**
```jsx
// BEFORE:
<div className="search-results">
  {results.map(r => <SearchResultItem key={r.id} {...r} />)}
</div>

// AFTER:
<div className="search-results" aria-live="polite" aria-atomic="false">
  {results.map(r => <SearchResultItem key={r.id} {...r} />)}
</div>
```

Apply to:
- Search results in `SmartSearch.jsx` / `SmartSearchBar.jsx`
- Dashboard KPI cards
- Anomaly panel
- Insights panel

---

## ISSUE 17 — Fix Heading Hierarchy (P2)

**Problem:** Heading levels skip (e.g., h2 → h4 without h3).

### `client/src/pages/Dashboard.jsx`
```jsx
// Line ~1373 — BEFORE:
<h4>Password</h4>
// This is inside the "Edit Profile" modal (h2). h4 skips h3.
// AFTER:
<h3>Password</h3>
```

**General rule:** Search all `.jsx` files for heading patterns. Ensure `<h1>` is used once per page (the page title), then `<h2>` for sections, `<h3>` for subsections, `<h4>` for sub-subsections. Never skip a level.

---

## ISSUE 18 — Add `aria-label` to Pagination Buttons (P3)

**Problem:** Some pagination buttons in `Pagination.jsx` have title attributes but not all have `aria-label`.

### `client/src/components/Pagination.jsx`
```jsx
// Lines ~53-60 — First page button:
<button className="pagination__btn" ... disabled={page === 1 || loading} title="First page" aria-label="First page">
  <ChevronsLeft size={15} aria-hidden="true" />
</button>

// Previous button:
<button className="pagination__btn" ... disabled={page === 1 || loading} title="Previous page" aria-label="Previous page">
  <ChevronLeft size={15} aria-hidden="true" />
</button>

// Next button:
<button className="pagination__btn" ... disabled={page === totalPages || loading} title="Next page" aria-label="Next page">
  <ChevronRight size={15} aria-hidden="true" />
</button>

// Last page button:
<button className="pagination__btn" ... disabled={page === totalPages || loading} title="Last page" aria-label="Last page">
  <ChevronsRight size={15} aria-hidden="true" />
</button>
```

---

## ISSUE 19 — Add `aria-label` to Loading Spinners (P3)

**Problem:** Loading spinners don't have accessible labels.

**Pattern:**
```jsx
// BEFORE:
<Loader2 size={32} className="animate-spin" style={{ color: 'var(--muted)' }} />

// AFTER:
<Loader2 size={32} className="animate-spin" style={{ color: 'var(--muted)' }} aria-label="Loading" />
```

Apply to ALL `Loader2` components that are used as loading indicators (not inline with text). The ones in `Billing.jsx:1487`, `Billing.jsx:1611`, `CouponManagement.jsx:135` need `aria-label`.

---

## ISSUE 20 — Fix `autocomplete` on Form Fields (P2)

**Problem:** Many fields use `autoComplete="off"` instead of proper values. Some fields that should have autocomplete don't.

**Pattern:**
```jsx
// BEFORE:
<input ... autoComplete="off" />

// AFTER (for appropriate fields):
<input ... autoComplete="name" />
<input ... autoComplete="email" />
<input ... autoComplete="tel" />
<input ... autoComplete="street-address" />
<input ... autoComplete="postal-code" />
<input ... autoComplete="organization" />
<input ... autoComplete="off" />  // Keep off only for sensitive/search fields
```

Apply to `Billing.jsx`, `Customers.jsx`, `Invoices.jsx`, `Payments.jsx`, `MachineManagement.jsx`.

---

## ISSUE 21 — Ensure Focus Returns to Trigger After Modal Close (P2)

**Pattern to apply to all modal components:**
```jsx
// In each modal component, save the trigger element before opening:
const triggerRef = useRef(null);

const openModal = () => {
  triggerRef.current = document.activeElement;
  setIsOpen(true);
};

const closeModal = () => {
  setIsOpen(false);
  // Return focus after modal closes
  setTimeout(() => {
    triggerRef.current?.focus();
  }, 0);
};
```

Apply to:
- `ConfirmModal.jsx`
- `ReceiptModal.jsx`
- `PaperOptimizer.jsx`
- `PaperSidePanel.jsx`
- `InvoiceModal.jsx`
- `PaymentModal.jsx`
- `ScannerModal.jsx`
- `ImageCropModal.jsx`
- All custom modals in page files

---

## ISSUE 22 — Add `aria-current="page"` to Active Pagination (P3)

Already partially done in `Billing.jsx`. Apply to `Pagination.jsx` component:
```jsx
// In Pagination.jsx, active page button:
<button ... aria-current={pageNum === safePage ? 'page' : undefined}>
  {pageNum}
</button>
```

---

## ISSUE 23 — Add `aria-label` to Search Input in `SmartSearchBar.jsx` (P3)

```jsx
// Add aria-label to the search input:
<input ... aria-label="Search customers, jobs, and products" />
```

---

## ACCEPTANCE CRITERIA

- [ ] `npm run build` passes in `client/` with zero new errors.
- [ ] `npm run build` passes in `website/` with zero new errors.
- [ ] `npm run lint` passes in `client/` with zero new errors.
- [ ] Every `<button>` that contains only an icon has `aria-label`.
- [ ] Every `role="button"` element has `onKeyDown` for Enter/Space.
- [ ] Every modal has `role="dialog"` and `aria-modal="true"`.
- [ ] Every modal has `aria-labelledby` or `aria-label`.
- [ ] No modal content container has `role="button"` or `tabIndex={0}`.
- [ ] Every form input with validation has `aria-invalid` and `aria-describedby`.
- [ ] Every collapsible section has `aria-expanded`.
- [ ] Every `<table>` has `aria-label` or `<caption>`.
- [ ] Every `<img>` has a meaningful `alt` (or `alt=""` for truly decorative images).
- [ ] Skip links exist on all client layouts.
- [ ] Toast notifications are announced via `aria-live`.
- [ ] Heading hierarchy is sequential (no skipped levels).
- [ ] Focus returns to the trigger element after any modal closes.
- [ ] No new `console.log` or `console.error` statements are added.

---

*End of Accessibility Fix Prompt.*
