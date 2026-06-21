# UI Regression Checklist

Run this checklist before deploying any frontend change.

---

## Navigation / Routing

- [ ] **Desktop sidebar (≥1024px):** Sidebar is visible, collapsible, nav links work
- [ ] **Tablet drawer (768–1023px):** Hamburger opens sidebar as overlay drawer
- [ ] **Mobile drawer (<768px):** Hamburger opens sidebar as full overlay drawer
- [ ] **Drawer closes on:** overlay tap, nav link tap, Escape key
- [ ] **Focus trap:** Tab cycling stays within drawer when open
- [ ] **Body scroll:** Page behind drawer does not scroll while open
- [ ] **Active route:** Current nav item is visually highlighted
- [ ] **Deep links:** Every sidebar route is directly visitable via URL (no 404)
- [ ] **Back/forward:** Browser navigation works correctly

### Layouts to test

- [ ] Dashboard (`/dashboard/*`) — Main app sidebar
- [ ] Accountant (`/accounting/*`) — Accountant sidebar
- [ ] Designer (`/designer/*`) — Designer sidebar
- [ ] Staff (`/staff/*`) — Staff sidebar
- [ ] Website (`/`) — Public website navbar

### Viewport widths (test each layout at)

- [ ] 375px (mobile)
- [ ] 768px (tablet portrait)
- [ ] 1024px (tablet landscape / small desktop)
- [ ] 1279px (below desktop breakpoint if applicable)
- [ ] 1440px (desktop)

---

## Layout

- [ ] No horizontal scrollbar at any tested width
- [ ] Content area fills remaining space correctly
- [ ] Modals/panels are centered and properly sized
- [ ] Tables are horizontally scrollable on narrow widths

---

## Theme

- [ ] Light mode — all elements visible, no contrast issues
- [ ] Dark mode — all elements visible, no contrast issues
- [ ] Theme toggle works without flicker

---

## Performance

- [ ] No console errors
- [ ] No layout shift when opening/closing drawers/modals
- [ ] Service worker update does not cause stale chunk errors

---

## History of additions

| Date | Added by | Step |
|------|----------|------|
| 2024-06-20 | TASK-101 | Mobile/tablet drawer test for all four layouts at four widths |
| 2024-06-20 | TASK-101 | Deep-link / direct-visit test for all sidebar routes |
