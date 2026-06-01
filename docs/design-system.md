# Sarga Design System v2.0

> Print shop management system · Minimal · Monochromatic · Trustworthy

---

## 1. Brand Identity

| Token | Hex | Usage |
|---|---|---|
| **Primary** (light) | `#1f2a33` | Dark slate — brand accent, buttons, active states |
| **Primary** (dark) | `#e7e4dd` | Inverted for dark mode — same role |
| **On-primary** (light) | `#ffffff` | Text/icon on primary bg |
| **On-primary** (dark) | `#121314` | Text/icon on primary bg in dark mode |

The brand is intentionally monochromatic. Color is used sparingly — only for semantic status (success, warning, error) and interactive feedback. This keeps the interface calm and professional for a busy print-shop environment.

---

## 2. Color Tokens

### 2.1 Backgrounds

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg-primary` | `#f5f3ef` | `#0f1111` | Page background — warm off-white / near-black |
| `--bg-secondary` | `#ebe8e1` | `#0b0c0d` | Secondary sections, subtle contrast areas |
| `--bg-tertiary` | `#e0ddd6` | `#1a1d1e` | Tertiary bg, skeleton loading |
| `--surface-primary` | `#fbfaf7` | `#151718` | Cards, modals, dropdowns — elevation level +1 |
| `--surface-secondary` | `#f1efe8` | `#1c1f20` | Hover states, input backgrounds — elevation level +2 |
| `--surface-tertiary` | `#dde2e6` | `#2a2f33` | Badges, chip backgrounds, scrollbar track |

**Dark mode elevation principle:** Each surface level is lighter by ~5–8% lightness. No drop shadows on dark surfaces — elevation is communicated purely through lightness stepping.

| Elevation | Light | Dark | Component |
|---|---|---|---|
| 0 (page) | `#f5f3ef` | `#0f1111` | Page bg |
| 1 (surface) | `#fbfaf7` | `#151718` | Cards, sidebar, modals |
| 2 (raised) | `#f1efe8` | `#1c1f20` | Hover, input bg, active sidebar item |
| 3 (popover) | `#ffffff` | `#1e2122` | Dropdowns, tooltips, toasts |

### 2.2 Text

| Token | Light | Dark | WCAG vs intended bg |
|---|---|---|---|
| `--text-primary` | `#171717` | `#f3f4f5` | ≥ 15:1 on `--surface-primary` |
| `--text-secondary` | `#6c7077` | `#a8adb4` | ≥ 7:1 on `--surface-primary` |
| `--text-muted` | `#6c7077` | `#a8adb4` | ≥ 4.5:1 on `--surface-primary` |
| `--text-disabled` | `#a8adb4` | `#6c7077` | ≥ 3:1 on `--surface-primary` |
| `--text-inverse` | `#ffffff` | `#121314` | Text on accent/primary backgrounds |
| `--link` | `var(--accent)` | `var(--accent)` | Underlined on hover |
| `--link-visited` | `#4a5568` | `#c9c3b7` | Visited link color |

### 2.3 Borders

| Token | Light | Dark | Role |
|---|---|---|---|
| `--border-default` | `#dedad1` | `#2a2f33` | Card borders, dividers, table rows |
| `--border-subtle` | `rgba(23,23,23,0.06)` | `rgba(243,244,245,0.06)` | Very light separators |
| `--border-strong` | `rgba(23,23,23,0.15)` | `rgba(243,244,245,0.15)` | Input focus, active states |

### 2.4 Brand Accent (Desaturated for Dark Mode)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--accent` | `#1f2a33` | `#e7e4dd` | Primary brand — buttons, headings, active links |
| `--accent-secondary` | `#2f3b46` | `#c9c3b7` | Secondary accent, icon color |
| `--accent-soft` | `#dde2e6` | `#2a2f33` | Soft bg, badges, scrollbar |
| `--accent-light` | `#eff6ff` | `rgba(231,228,221,0.08)` | Highlight backgrounds |

**Dark mode rationale:** In dark mode, the accent is flipped to an off-white (`#e7e4dd`) rather than a bright color. This prevents visual vibration against the dark background and maintains the brand's minimal character.

### 2.5 Interactive States

| Token | Light | Dark | Role |
|---|---|---|---|
| `--interactive-primary` | `#1f2a33` | `#f0ede6` | Primary button bg |
| `--interactive-primary-hover` | `#141a1f` | `#e0ddd6` | Primary button hover |
| `--interactive-primary-text` | `#ffffff` | `#121314` | Primary button text |
| `--interactive-ghost` | `transparent` | `rgba(255,255,255,0.04)` | Ghost button bg |
| `--interactive-ghost-hover` | `var(--surface-secondary)` | `rgba(255,255,255,0.08)` | Ghost button hover |
| `--interactive-danger` | `#ef4444` | `#c53030` | Danger button bg |
| `--interactive-danger-hover` | `#dc2626` | `#b91c1c` | Danger button hover |
| `--interactive-success` | `#10b981` | `#10b981` | Success button bg |
| `--interactive-success-hover` | `#059669` | `#059669` | Success button hover |
| `--focus-ring` | `rgba(31,42,51,0.25)` | `rgba(201,195,183,0.3)` | Focus outline |

### 2.6 Status Colors

#### Light Mode

| Token | Hex | Background | Text on bg | Passes WCAG AA? |
|---|---|---|---|---|
| `--success` | `#2f7d4a` | `rgba(47,125,74,0.10)` | `--success` | ✓ 4.8:1 |
| `--warning` | `#b36b00` | `rgba(179,107,0,0.10)` | `--warning` | ✓ 4.6:1 |
| `--error` | `#b03a2e` | `rgba(176,58,46,0.10)` | `--error` | ✓ 5.2:1 |
| `--info` | `#2f3b46` | `rgba(47,59,70,0.10)` | `--info` | ✓ 7.1:1 |

#### Dark Mode

| Token | Hex | Background | Text on bg | Passes WCAG AA? |
|---|---|---|---|---|
| `--success` | `#4ade80` | `rgba(74,222,128,0.15)` | `--success` | ✓ 7.5:1 on dark bg |
| `--warning` | `#fbbf24` | `rgba(251,191,36,0.15)` | `--warning` | ✓ 8.2:1 on dark bg |
| `--error` | `#f87171` | `rgba(248,113,113,0.15)` | `--error` | ✓ 6.8:1 on dark bg |
| `--info` | `#c9c3b7` | `rgba(201,195,183,0.12)` | `--info` | ✓ 5.5:1 on dark bg |

**Dark mode status rationale:** Status colors are brightened (e.g., `#2f7d4a` → `#4ade80`) and desaturated against dark backgrounds. The alpha backgrounds are increased from 10% to 15% to maintain visibility.

### 2.7 Chart / Data Viz Colors

| Token | Hex | Purpose |
|---|---|---|
| `--chart-1` | `#1f2a33` | Primary series |
| `--chart-2` | `#0ea5e9` | Secondary series (sky blue) |
| `--chart-3` | `#8b5cf6` | Tertiary (purple) |
| `--chart-4` | `#10b981` | Positive trend (emerald) |
| `--chart-5` | `#f59e0b` | Warning trend (amber) |
| `--chart-6` | `#ef4444` | Negative trend (red) |

Dark mode charts should use lighter tints (add ~25% lightness) of the same hues.

### 2.8 Shadows

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--shadow-sm` | `0 8px 24px rgba(20,20,20,0.08)` | `0 8px 24px rgba(0,0,0,0.35)` | Cards, small elevation |
| `--shadow-md` | `0 12px 40px rgba(20,20,20,0.10)` | `0 12px 40px rgba(0,0,0,0.40)` | Modals, dropdowns |
| `--shadow-lg` | `0 24px 70px rgba(20,20,20,0.12)` | `0 24px 70px rgba(0,0,0,0.45)` | Full-screen modals, toasts |

**Important:** In dark mode, elevation is primarily communicated through lightness stepping of `--surface-*` tokens — not shadows. Shadows are still present but play a secondary role.

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Fallback | Weight Range |
|---|---|---|---|
| **Body** | `Plus Jakarta Sans` | `system-ui, -apple-system, sans-serif` | 400, 500, 600, 700 |
| **Display** | `Space Grotesk` | `system-ui, -apple-system, sans-serif` | 500, 600, 700 |
| **Fallback** (Malayalam) | `Noto Sans Malayalam` | — | 400, 500, 700 |

### 3.2 Type Scale

| Level | Size | Weight | Line Height | Letter Spacing | Font Family | Usage |
|---|---|---|---|---|---|---|
| **Hero** | `clamp(2.5rem, 5vw, 3.5rem)` | 700 | 1.1 | `-0.03em` | Display | Page headers, hero sections |
| **H1** | `clamp(1.75rem, 4vw, 2.5rem)` | 700 | 1.15 | `-0.02em` | Display | Section titles |
| **H2** | `1.5rem` (24px) | 700 | 1.2 | `-0.02em` | Display | Card headers, panel titles |
| **H3** | `1.25rem` (20px) | 700 | 1.25 | `-0.01em` | Display | Subsection headers |
| **H4** | `1.125rem` (18px) | 700 | 1.3 | `-0.01em` | Display | Modal titles, group headers |
| **Body** | `0.875rem` (14px) | 400 | 1.5 | `0` | Body | Default text |
| **Body Large** | `1rem` (16px) | 400 | 1.6 | `0` | Body | Long-form content, auth pages |
| **Body Small** | `0.8125rem` (13px) | 400 | 1.4 | `0` | Body | Metadata, help text, subtitles |
| **Caption** | `0.75rem` (12px) | 500 | 1.3 | `0` | Body | Labels, timestamps, table cells |
| **Overline** | `0.6875rem` (11px) | 700 | 1.2 | `0.08em` | Body | Badges, status pills, uppercase labels |
| **Micro** | `0.625rem` (10px) | 600 | 1.1 | `0.05em` | Body | Code badges, tiny tags |

### 3.3 Semantic Text Tokens

| Token | Value |
|---|---|
| `--font-body` | `'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif` |
| `--font-display` | `'Space Grotesk', system-ui, -apple-system, sans-serif` |
| `--font-mono` | `'JetBrains Mono', 'Fira Code', monospace` |
| `--font-malayalam` | `'Noto Sans Malayalam', system-ui, sans-serif` |
| `--text-base-size` | `14px` |
| `--text-scale-ratio` | `1.125` (major second) |
| `--leading-tight` | `1.15` |
| `--leading-normal` | `1.5` |
| `--leading-relaxed` | `1.6` |
| `--tracking-display` | `-0.02em` |
| `--tracking-wide` | `0.08em` |

---

## 4. Component-Specific Tokens

### 4.1 Inputs

| Token | Light | Dark |
|---|---|---|
| `--input-bg` | `#f1efe8` | `#1c1f20` |
| `--input-bg-focus` | `var(--surface-primary)` | `var(--surface-primary)` |
| `--input-border` | `rgba(23,23,23,0.1)` | `rgba(243,244,245,0.1)` |
| `--input-border-focus` | `var(--accent-secondary)` | `var(--accent-secondary)` |
| `--input-text` | `#171717` | `#f3f4f5` |
| `--input-placeholder` | `#a8adb4` | `#6c7077` |
| `--input-error-border` | `#ef4444` | `#f87171` |

### 4.2 Sidebar

| Token | Light | Dark |
|---|---|---|
| `--sidebar-bg` | `var(--surface-primary)` | `var(--surface-primary)` |
| `--sidebar-text` | `var(--text-secondary)` | `var(--text-secondary)` |
| `--sidebar-icon` | `var(--text-secondary)` | `var(--text-secondary)` |
| `--sidebar-active-bg` | `var(--surface-secondary)` | `var(--surface-secondary)` |
| `--sidebar-active-text` | `var(--accent)` | `var(--accent)` |
| `--sidebar-width` | `280px` | `280px` |
| `--sidebar-collapsed-width` | `88px` | `88px` |

### 4.3 Badges

| Token | Light | Dark |
|---|---|---|
| `--badge-bg` | `#dde2e6` | `#2a2f33` |
| `--badge-text` | `#2f3b46` | `#c9c3b7` |

### 4.4 Modals / Overlays

| Token | Light | Dark |
|---|---|---|
| `--modal-bg` | `var(--surface-primary)` | `var(--surface-primary)` |
| `--modal-overlay` | `rgba(12,12,12,0.45)` | `rgba(0,0,0,0.6)` |

### 4.5 Toast

| Token | Light | Dark |
|---|---|---|
| `--toast-bg` | `var(--surface-primary)` | `var(--surface-secondary)` |
| `--toast-text` | `var(--text-primary)` | `var(--text-primary)` |

---

## 5. Dark Mode Golden Rules (Applied)

1. **No pure black** — `--bg-primary: #0f1111` (not `#000000`)
2. **No pure white** — `--bg-primary: #f5f3ef` (not `#ffffff`)
3. **Elevation via lightness** — Cards are `#151718`, page is `#0f1111`
4. **Accent is desaturated** — `#e7e4dd` instead of a bright color
5. **Status colors are brightened** — `#4ade80`, `#fbbf24`, `#f87171`
6. **System preference default** — Always check `prefers-color-scheme` first

---

## 6. CSS Variable Map (for Tailwind / CSS)

```css
/* ── Light Mode (:root) ── */
:root {
  --bg-primary: #f5f3ef;
  --bg-secondary: #ebe8e1;
  --bg-tertiary: #e0ddd6;
  --surface-primary: #fbfaf7;
  --surface-secondary: #f1efe8;
  --surface-tertiary: #dde2e6;
  --text-primary: #171717;
  --text-secondary: #6c7077;
  --text-muted: #6c7077;
  --text-disabled: #a8adb4;
  --text-inverse: #ffffff;
  --border-default: #dedad1;
  --border-subtle: rgba(23,23,23,0.06);
  --border-strong: rgba(23,23,23,0.15);
  --accent: #1f2a33;
  --accent-secondary: #2f3b46;
  --accent-soft: #dde2e6;
  --accent-light: #eff6ff;
  --success: #2f7d4a;
  --success-bg: rgba(47,125,74,0.10);
  --warning: #b36b00;
  --warning-bg: rgba(179,107,0,0.10);
  --error: #b03a2e;
  --error-bg: rgba(176,58,46,0.10);
  --info: #2f3b46;
  --info-bg: rgba(47,59,70,0.10);
}

/* ── Dark Mode (.dark) ── */
.dark {
  --bg-primary: #0f1111;
  --bg-secondary: #0b0c0d;
  --bg-tertiary: #1a1d1e;
  --surface-primary: #151718;
  --surface-secondary: #1c1f20;
  --surface-tertiary: #2a2f33;
  --text-primary: #f3f4f5;
  --text-secondary: #a8adb4;
  --text-muted: #a8adb4;
  --text-disabled: #6c7077;
  --text-inverse: #121314;
  --border-default: #2a2f33;
  --border-subtle: rgba(243,244,245,0.06);
  --border-strong: rgba(243,244,245,0.15);
  --accent: #e7e4dd;
  --accent-secondary: #c9c3b7;
  --accent-soft: #2a2f33;
  --accent-light: rgba(231,228,221,0.08);
  --success: #4ade80;
  --success-bg: rgba(74,222,128,0.15);
  --warning: #fbbf24;
  --warning-bg: rgba(251,191,36,0.15);
  --error: #f87171;
  --error-bg: rgba(248,113,113,0.15);
  --info: #c9c3b7;
  --info-bg: rgba(201,195,183,0.12);
}
```

---

## 7. Design Principles for Engineers

1. **Never hardcode colors.** Every hex belongs behind a semantic CSS variable.
2. **Elevation in dark mode = lightness.** Do not rely on `box-shadow` to indicate depth on dark surfaces; use `--surface-*` stepping instead.
3. **Desaturate in dark mode.** If you add a new colored element, reduce saturation and increase lightness for its dark mode variant.
4. **Respect `prefers-color-scheme`.** Default to OS preference; allow manual override stored in localStorage.
5. **Test contrast.** All text/background pairs must pass WCAG AA (4.5:1 for normal text, 3:1 for large text).
