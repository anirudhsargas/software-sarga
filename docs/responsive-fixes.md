# Responsive Breakpoint Matrix

## Desktop breakpoint: 1024px

All sidebar/drawer layouts use `1024px` as the desktop breakpoint threshold.

| Layout | CSS Breakpoint | JS Breakpoint | Notes |
|--------|----------------|---------------|-------|
| Dashboard (index.css) | `max-width: 1023px` | `window.innerWidth < 1024` | Sidebar becomes fixed drawer |
| Dashboard (dashboard-redesign.css) | `max-width: 767px` | — | Legacy: narrow mobile refinements |
| Designer | `max-width: 1023px` | — (always toggles) | Sidebar becomes fixed drawer |
| Accountant | `max-width: 1023px` | `window.innerWidth < 1024` | Sidebar becomes fixed drawer |
| Staff | `max-width: 1023px` | `window.innerWidth < 1024` | Sidebar becomes fixed drawer |

## Fix History

### 2024-06-20 — TASK-101: Hamburger non-functional at 768–1023px

**Root cause:** CSS hid the sidebar at `1023px` (`transform: translateX(-100%)`) but JS
`handleHamburgerClick` only treated the hamburger as a drawer toggle below `768px`.
At 768–1023px, the hamburger called `toggleSidebarCollapsed()` (desktop collapse)
which had no visible effect while CSS had already hidden the sidebar off-screen.

**Fix:** Changed all JS thresholds from `768` → `1024` in `Dashboard.jsx`:
- `handleHamburgerClick` — now calls `toggleSidebar()` (drawer) below 1024
- Body scroll lock guard
- Focus trap guard
- Auto-close on route change
- Viewport sync

Also added hamburger + drawer support to:
- `AccountantLayout.jsx` / `AccountantSidebar.jsx` — new hamburger button, overlay, focus trap
- `StaffLayout.jsx` — new hamburger button, overlay, focus trap

The `DesignerLayout.jsx` already worked correctly.

### Overlay visibility fix

The sidebar overlay in `index.css` had `opacity: 0; pointer-events: none` by default
inside the `@media (max-width: 1023px)` block, with a `.sidebar-overlay--visible` class
to make it visible. The JSX was only rendering the base class. Fixed by adding
`sidebar-overlay--visible` to Dashboard.jsx and StaffLayout.jsx.
