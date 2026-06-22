# UI Refactor Plan — Front Office + Opening Setup

## Overview
Refactor layout, reduce duplication, improve performance. Preserve business logic and dark premium theme.

---

## Task 1: Opening Setup Modal (HIGH PRIORITY)

### Files to Modify
- `client/src/components/OpeningSetupModal.jsx`
- `client/src/components/CashOpeningSection.jsx`
- `client/src/components/MachineCounterCard.jsx`
- `client/src/pages/FrontOffice.css` (os-* classes)

### 1A. Compact Header

**Current** (OpeningSetupModal.jsx:192-204):
- Icon 48x48 + "Good Evening" title + "Opening Setup — Branch" subtitle + date + hint paragraph
- ~120px height consumed

**New** — Single-line compact header:
```jsx
<div className="os-header">
  <div className="os-header__icon"><Sunrise size={20} /></div>
  <div className="os-header__text">
    <h2 className="os-header__title">Opening Setup</h2>
    <p className="os-header__meta">{branchName} • {formattedDate}</p>
  </div>
</div>
```

**CSS Changes** (FrontOffice.css):
- `.os-header__icon`: 48px → 36px
- `.os-header__title`: Remove greeting, just "Opening Setup", use var(--text-lg)
- Remove `.os-header__subtitle` — merge into meta line
- `.os-header__meta`: Show "Branch • Monday, 22 June"
- Remove `.os-header__hint` paragraph entirely
- `.os-header` padding: `var(--space-24) var(--space-24) 0` → `var(--space-16) var(--space-24) 0`
- Remove `getGreeting()` function and its import usage

### 1B. Compact Cash Section

**Current** (CashOpeningSection.jsx):
- Section header with icon + title + subtitle
- 3 cards in a grid, each with: dot + label + yesterday + input + 3 quick amount chips
- ~180px per card

**New** — Tighter cards:
- `.os-cash-card` padding: `var(--space-14)` → `var(--space-12)`
- `.os-cash-card__input` font-size: `var(--text-lg)` → `var(--text-base)`
- `.os-cash-card__input` padding: `var(--space-12) var(--space-8)` → `var(--space-10) var(--space-8)`
- `.os-chip` padding: `var(--space-4) var(--space-10)` → `var(--space-3) var(--space-8)` (smaller chips)
- `.os-cash-grid` minmax: `200px` → `160px`

### 1C. Machine Counter → Compact Rows

**Current** (MachineCounterCard.jsx):
- Card with icon header (32x32 icon + name + location)
- Previous label + value, Current label + input
- Diff indicator, error messages
- Grid: `repeat(auto-fill, minmax(280px, 1fr))` — big cards

**New** — Replace card layout with table rows. Either:
- Option A: Refactor MachineCounterCard to render as a row
- Option B: Inline the row rendering directly in OpeningSetupModal

New CSS for row layout:
```css
.os-machines-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.os-machine-row {
  display: grid;
  grid-template-columns: 1fr auto 140px auto;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-10) var(--space-14);
  background: var(--surface-2);
}

.os-machine-row__name {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.os-machine-row__prev {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  min-width: 80px;
}

.os-machine-row__input {
  height: 40px;
  max-height: 52px;
  padding: 0 var(--space-10);
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  outline: none;
  text-align: right;
}

.os-machine-row__input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
}

.os-machine-row__diff {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--success);
}

.os-machine-row__error {
  font-size: var(--text-xs);
  color: var(--danger);
  grid-column: 3 / -1;
}

/* Mobile: stack */
@media (max-width: 600px) {
  .os-machine-row {
    grid-template-columns: 1fr;
    gap: var(--space-6);
  }
}
```

### 1D. Footer Fix

**Current** (OpeningSetupModal.jsx:277-287):
- Always visible, Save button disabled until valid
- Wastes space when not actionable

**New**:
- Hide footer entirely when `!isValid && !saving`
- Show "Continue →" as CTA text
- Remove "Skip" button (use X close button instead)
- Make footer sticky at bottom

CSS:
```css
.os-footer {
  position: sticky;
  bottom: 0;
  background: var(--surface);
  z-index: 1;
}
```

JSX:
```jsx
{(isValid || saving) && (
  <div className="os-footer">
    <button
      className="btn btn-primary os-footer__save"
      onClick={handleSave}
      disabled={saving}
    >
      {saving ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
      {saving ? 'Saving...' : 'Continue →'}
    </button>
  </div>
)}
```

### 1E. Remove Summary Section
The "Opening Summary" section (lines 239-274) duplicates info already visible in the cash/machine sections. Remove it entirely to save scroll space.

---

## Task 2: Dashboard Duplicate Removal

### Files to Modify
- `client/src/pages/FrontOffice.jsx`
- `client/src/components/DashboardQuickActions.jsx`

### Current State
| Source | Items |
|--------|-------|
| `DashboardQuickActions` (line 583) | New Order, Expense, Transfer, Bill, Inventory, Customer |
| `fo-toolbar__actions` (line 643-660) | New Order, Take Payment, Attendance, Customers |

### Duplicates to Remove
- **New Order** — exists in both QuickActions and Toolbar → keep in Toolbar only
- **Customers** — exists in both QuickActions and Toolbar → keep in Toolbar only

### Plan
**Remove from `DashboardQuickActions` DEFAULT_SHORTCUTS:**
- Remove `new-order` entry
- Remove `customer` entry

Updated DEFAULT_SHORTCUTS:
```js
const DEFAULT_SHORTCUTS = [
    { id: 'expense', label: 'Expense', icon: IndianRupee, route: '/dashboard/expenses', color: 'var(--warning)' },
    { id: 'transfer', label: 'Transfer', icon: ArrowLeftRight, route: '/dashboard/stock-transfer', color: 'var(--success)' },
    { id: 'bill', label: 'Bill', icon: FileText, route: '/dashboard/sales/invoices', state: { action: 'create' }, color: 'var(--danger)' },
    { id: 'inventory', label: 'Scan', icon: ScanLine, route: '/dashboard/inventory/scan', color: '#8b5cf6' },
];
```

**Remove `<QuickActionsDashboard />`** from FrontOffice.jsx (line 664) — quick billing shortcuts widget duplicates dashboard purpose. Quick billing should live on its own page.

**Keep in Toolbar** (primary entry points):
- Search
- + New Order (primary CTA)
- Take Payment
- Customers

**Remove from Toolbar:**
- Attendance button (already accessible via sidebar nav)

---

## Task 3: KPI Card Optimization

### Files to Modify
- `client/src/styles/dashboard-redesign.css`
- `client/src/pages/FrontOffice.css`

### 3A. FrontOffice Stats Cards (fo-stat-card)

Current CSS (FrontOffice.css:783-804):
- Grid: `repeat(6, 1fr)` — 6 fixed columns
- Height: 80px fixed

New:
```css
.fo-stats-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-12);
}

.fo-stat-card {
  height: auto;
  min-height: 72px;
  max-height: 96px;
  padding: var(--space-12) var(--space-14);
}

.fo-stat-card__icon {
  width: 40px;
  height: 40px;
}

.fo-stat-card__icon svg {
  width: 20px;
  height: 20px;
}

.fo-stat-card__value {
  font-size: var(--text-base);
}

.fo-stat-card__label {
  font-size: var(--text-2xs);
}
```

### 3B. Summary KPI Cards (kpi-card)

Current (dashboard-redesign.css:580-655):
- Grid: `repeat(auto-fit, minmax(220px, 1fr))`
- Padding: `var(--space-20)`

New:
```css
.kpi-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-12);
}

.kpi-card {
  padding: var(--space-14);
  border-radius: var(--radius-lg);
}

.kpi-card__header {
  margin-bottom: var(--space-8);
}

.kpi-card__icon {
  width: 36px;
  height: 36px;
}

.kpi-card__value {
  font-size: var(--text-xl);
}
```

---

## Task 4: Filter Cleanup

### Files to Modify
- `client/src/pages/FrontOffice.jsx`

### Current State
- Tab bar (line 721-740): Active Jobs, Due Collection, Overdue, Completed Jobs, Recent Payments, Delivered
- Category chips (line 743-750): All, Offset, Laser, Others

### Plan
Move category filter **inside** each tab's content area header, not as a separate global row. This reduces vertical stacking.

Remove the standalone `.fo-category-filter` div (line 742-750) from the global layout.

Add chips inside each tab panel header:
```jsx
{activeTab === 'queue' && (
  <div className="fo-panel">
    <div className="fo-panel__header">
      <div className="fo-panel__title-row">
        <span>Active Jobs</span>
        <div className="fo-category-filter__chips">
          {/* chips here */}
        </div>
      </div>
      {/* pagination controls */}
    </div>
    {/* table */}
  </div>
)}
```

CSS:
```css
.fo-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-12) var(--space-16);
  border-bottom: 1px solid var(--border);
}

.fo-panel__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  font-weight: 700;
  font-size: var(--text-sm);
}
```

---

## Task 5: Search + Action Bar

### Files to Modify
- `client/src/pages/FrontOffice.jsx`
- `client/src/pages/FrontOffice.css`

### Plan
Combine search + new order into a single row. Remove extra toolbar actions that duplicate quick actions.

Desktop layout:
```jsx
<div className="fo-toolbar">
  <div className="fo-search-bar">
    <Search />
    <input placeholder="Search orders..." />
  </div>
  <div className="fo-toolbar__actions">
    <button className="fo-toolbar-btn fo-toolbar-btn--primary">
      <Plus /> New Order
    </button>
  </div>
</div>
```

Remove horizontal overflow:
```css
@media (max-width: 768px) {
  .fo-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .fo-toolbar__actions {
    display: flex;
    overflow-x: auto;
    gap: var(--space-8);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .fo-toolbar__actions::-webkit-scrollbar {
    display: none;
  }
}
```

---

## Task 6: Performance Fixes

### 6A. Font Display
Ensure `display=swap` is present in all Google Font URLs in `client/index.html`.

### 6B. Lazy Load Heavy Components
Lazy load `QuickActionsDashboard` (if kept):
```jsx
const QuickActionsDashboard = React.lazy(() => import('../components/quickbilling/QuickActionsDashboard'));
```

### 6C. Remove Unused Imports
Audit icon imports in FrontOffice.jsx — remove: `Printer`, `MessageSquare`, `ArrowRight`, `LayoutGrid`, `List` (if no longer used after filter refactor).

### 6D. Remove Dead Code
- Remove the `.fo-pipeline` section (FrontOffice.jsx line 1380-1394) — duplicates tab counts
- Remove corresponding `.fo-pipeline-*` CSS (FrontOffice.css lines 1327-1394)

### 6E. Image Optimization
For any `<img>` tags, add `loading="lazy"`, `decoding="async"`, and appropriate `width`/`height`.

---

## Task 7: Cleanup

### 7A. Remove Unnecessary Wrappers
- Remove `<h2 className="sr-only">Dashboard Summary</h2>` and `<h2 className="sr-only">Recent Activity</h2>` (semantic noise)

### 7B. Standardize Spacing
Ensure all spacing uses design tokens: `var(--space-8)`, `var(--space-12)`, `var(--space-16)`, `var(--space-24)`, `var(--space-32)`.
Remove hardcoded pixel values from inline styles.

### 7C. Standardize Radius
- Cards: `var(--radius-lg)` = 16px
- Buttons: `var(--radius-sm)` = 8px
- Inputs: `var(--radius-md)` = 10px
- Chips: `var(--radius-full)` = pill

### 7D. Animation Limits
All transitions use `var(--transition-fast)` (150ms) or `var(--transition-normal)` (200ms). Remove any animations > 200ms.

### 7E. Reduce Box Shadows
- `.fo-quick-action-card:hover`: Remove `box-shadow: var(--shadow-md)` — keep border-color change only
- `.fo-stat-card:hover`: Remove `transform: translateY(-2px)` — keep simple hover
- `.fo-due-card:hover`: Remove `box-shadow: var(--shadow-md)` — keep border-color change only

---

## Execution Order

1. **Task 1** (Opening Setup Modal) — Highest priority
2. **Task 2** (Dashboard Duplicate Removal) — Quick win
3. **Task 3** (KPI Card Optimization) — CSS-only
4. **Task 4** (Filter Cleanup) — Layout restructure
5. **Task 5** (Search + Action Bar) — Minor cleanup
6. **Task 7** (Cleanup) — Polish pass
7. **Task 6** (Performance Fixes) — Audit and optimize

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `client/src/components/OpeningSetupModal.jsx` | Compact header, remove summary, conditional footer, remove greeting |
| `client/src/components/CashOpeningSection.jsx` | Tighter padding, smaller chips |
| `client/src/components/MachineCounterCard.jsx` | Replace with row-based layout |
| `client/src/pages/FrontOffice.jsx` | Remove duplicates, move filters, clean imports, lazy load, remove pipeline |
| `client/src/components/DashboardQuickActions.jsx` | Remove New Order + Customer entries |
| `client/src/pages/FrontOffice.css` | Modal styles, stats grid, toolbar, filters, animation cleanup |
| `client/src/styles/dashboard-redesign.css` | KPI card optimization |
| `client/index.html` | font-display: swap |

---

## Verification Steps

After each task:
1. `npm run build` — no build errors
2. `npm run lint` — no lint errors
3. Visual: Opening modal renders without excessive scroll
4. Visual: Dashboard shows no duplicate buttons
5. Visual: Stats cards fit in ≤ 96px height
6. Visual: No horizontal overflow on mobile (375px width)
7. Lighthouse: Performance > 85, Best Practices > 90
