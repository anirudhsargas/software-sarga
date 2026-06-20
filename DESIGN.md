# Sarga Prints MIS — Design Token System

This document is the single source of truth for visual design tokens used across `client/src/`. All CSS variables are defined in `client/src/index.css` (`:root` for light theme, `.dark` for dark theme overrides, except spacing and typography tokens which don't vary by theme).

## The core rule

**Never hardcode a color, spacing value, font-size, or border-radius in component CSS or JSX inline styles.** Always reference a token from this system. If a value genuinely doesn't fit any existing token after checking the scale below, leave it as a raw value — don't force a bad mapping — but flag it for review rather than letting it become silent technical debt.

---

## 1. Border-radius

```css
--radius-xs:   6px
--radius-sm:   8px
--radius-md:   10px
--radius-lg:   16px
--radius-xl:   20px
--radius-full: 9999px
```

Computed aliases for common use cases: `--radius-input` (→ md), `--radius-card` (→ lg), `--radius-modal` (→ xl), `--radius-button` (→ sm).

Use `--radius-full` for circles, pills, and fully-rounded elements (was previously written as `50%` or `9999px` directly).

---

## 2. Typography (font-size)

10 tokens, fluid via `clamp()` from `--text-xs` through `--text-4xl`; fixed px for the smallest sizes where fluid scaling isn't needed.

```css
--text-3xs:  9px                                  /* smallest fine-print/badges */
--text-2xs:  10px                                 /* fine-print, meta labels */
--text-xs:   clamp(11px, 0.6875rem + 0.15vw, 12px)
--text-sm:   clamp(13px, 0.8125rem + 0.2vw, 14px)
--text-base: clamp(14px, 0.875rem  + 0.3vw,  16px)
--text-lg:   clamp(16px, 1rem      + 0.4vw,  18px)
--text-xl:   clamp(18px, 1.125rem  + 0.5vw,  22px)
--text-2xl:  clamp(22px, 1.375rem  + 0.6vw,  28px) /* large headings */
--text-3xl:  clamp(26px, 1.625rem  + 0.8vw,  34px) /* display headings */
--text-4xl:  clamp(30px, 1.875rem  + 1vw,    42px) /* hero/largest headings */
```

At typical desktop viewport widths (1440px+), each token resolves to its stated maximum. `--text-xs` through `--text-xl` are the everyday body/UI scale; `--text-2xs`/`--text-3xs` cover badges and meta text; `--text-2xl`/`--text-3xl`/`--text-4xl` cover section and page headings.

### Known permanent exceptions (intentionally left hardcoded)
These don't fit the scale cleanly and weren't worth forcing — left as one-off raw values:
`8px`, `17px`, and decimal sizes (`11.5px`, `12.5px`, `13.5px`, `14.5px`, `15.5px`) found in a handful of files, mostly `ExpenseManager.css`.

---

## 3. Spacing (padding, margin, gap)

26 tokens covering every even step from 2–24px, then standard jumps to 96px, plus odd-number fill-ins at the low end:

```css
--space-1:  1px    --space-10: 10px   --space-24: 24px   --space-56: 56px
--space-2:  2px    --space-12: 12px   --space-28: 28px   --space-64: 64px
--space-3:  3px    --space-14: 14px   --space-32: 32px   --space-72: 72px
--space-4:  4px    --space-16: 16px   --space-36: 36px   --space-80: 80px
--space-5:  5px    --space-18: 18px   --space-40: 40px   --space-96: 96px
--space-6:  6px    --space-20: 20px   --space-48: 48px
--space-7:  7px    --space-22: 22px
--space-8:  8px
```

### Negative spacing
Don't create negative token variants. Use `calc()`:
```css
margin: calc(-1 * var(--space-16));
margin: 0 calc(-1 * var(--space-16));  /* works fine inside shorthand too */
```

### Compound/shorthand declarations
Mixed token + raw px in the same shorthand is expected and fine — only convert the values that actually match a token:
```css
padding: 15px var(--space-16);  /* 15px doesn't match anything, 16px does */
```

### Known permanent exceptions
`11px`, `30px`, `34px`, `44px`, `60px` — single/rare instances across the codebase, not worth a dedicated token. Compound declarations using `0`, `auto`, or values outside the scale are correctly left untouched.

### Component-scoped exceptions
`WebInquiries.css` intentionally defines its own spacing/radius scale at different pixel values than the global tokens (it predates this system and has its own visual needs). To avoid collisions, its local tokens are prefixed: `--wi-space-xs/sm/md/lg/xl`, `--wi-radius-sm/md/lg/xl`. Its `--status-new-bg`, `--status-contacted-bg`, `--status-closed-bg` (and `-color` pairs) are page-specific and don't need global equivalents.

If you need a new component-specific override elsewhere, follow this same pattern: prefix with a short component code rather than colliding with the global `--space-*`/`--radius-*` names.

---

## 4. Color

### Semantic tokens (light / dark)

| Token | Purpose | Light | Dark |
|---|---|---|---|
| `--background` | Page background | `#f9fafb` | `#09090b` |
| `--card` | Card background | `#ffffff` | `#18181b` |
| `--elevated` | Elevated surface | `#ffffff` | `#27272a` |
| `--sidebar` | Nav sidebar | `#fcfcfc` | `#09090b` |
| `--modal` | Modal background | `#ffffff` | `#18181b` |
| `--hover` | Hover state | `#f4f4f5` | `#27272a` |
| `--text-primary` | Headers, high-contrast text | `#09090b` | `#f4f4f5` |
| `--text-secondary` | Body copy | `#52525b` | `#a1a1aa` |
| `--text-muted` | Placeholders, low-emphasis | `#71717a` | `#71717a` |
| `--text-inverse` | Text on high-contrast bg | `#ffffff` | `#09090b` |
| `--success` | Positive status | `#10b981` | `#34d399` |
| `--warning` | Warning status | `#f59e0b` | `#fbbf24` |
| `--danger` | Danger/error status (canonical) | `#ef4444` | `#f87171` |
| `--error` | One-way alias of `--danger` | → `--danger` | → `--danger` |
| `--info` | Informational status | `#3b82f6` | `#60a5fa` |
| `--border` | Generic separators | `#e4e4e7` | `#27272a` |
| `--ring` | Focus ring | `#09090b` | `#f4f4f5` |
| `--accent` | Brand accent | `#09090b` | `#f4f4f5` |
| `--selected` | Active/selected bg | `#f4f4f5` | `#27272a` |
| `--primary` | Primary buttons/interactive | `#000000` | `#ffffff` |
| `--secondary` | Secondary interactive | `#f0f0f0` | `#1f1f1f` |
| `--modal-overlay` | Modal backdrop | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.3)` |

`--danger` is the canonical source; `--error`, `--destructive`, and related aliases all resolve one-way from it. Never write a circular `var()` reference between two tokens.

### Using color with opacity
For tinted backgrounds/shadows, use the `-rgb` companion token where one exists:
```css
background: rgba(var(--error-rgb), 0.1);
box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.2);
```
Currently defined: `--error-rgb`. If you need `-rgb` variants for `--success`/`--warning`/`--info`, add them to `index.css` rather than reaching for `color-mix()` as a workaround — `color-mix(in srgb, var(--warning) 3%, transparent)` works but is inconsistent with the rest of the system and harder to scan.

### Gradients
Don't build a gradient from two different semantic tokens (e.g. `--primary` → `--accent`) — in this theme they're nearly identical (`#000000` vs `#09090b` in light mode) and the gradient will render flat. Instead use one token at two opacity levels:
```css
background: linear-gradient(135deg, var(--accent), rgba(var(--accent-rgb), 0.5));
```

### Brand-color decision: indigo/violet
`#6366f1` (indigo) and `#8b5cf6` (violet) appeared repeatedly as stale fallback values — these are **not** intentional brand colors and have been replaced with `var(--primary)`/`var(--accent)` throughout. If a future design genuinely wants a distinct indigo/violet accent, add it as a real named token rather than reintroducing raw hex.

### JSX inline styles
CSS custom properties work fine as plain strings in React inline styles — no context provider or theme-JS layer needed:
```jsx
style={{ color: 'var(--danger)' }}
```
Existing `var(--token, #fallback)` patterns in JSX should have the fallback corrected to match the real token value, same as CSS — don't leave stale fallback hex sitting there even though the `var()` reference wins.

---

## 5. Status of this system

| Category | Status |
|---|---|
| Border-radius | ✅ Complete — 370+ instances tokenized across 51 CSS files |
| Font-size | ✅ Complete — 1,068 instances tokenized across 48 CSS files |
| Spacing | ✅ Complete — 2,302 instances tokenized across all CSS files (single-value + compound) |
| Color (CSS, exact/near-match) | ✅ Complete — 81 instances across 30 CSS files |
| Color (indigo/violet cleanup) | ✅ Complete — 32+ instances across 14 files |
| Color (JSX inline styles, remaining ~80 instances) | ⏳ Not yet done — mostly genuine custom status colors and theme-preview mockups that need case-by-case judgment rather than mechanical replacement |

Build verified clean (`npm run build`, zero errors/warnings, correct per-route code-splitting) as of the last token pass.

---

## 6. Workflow for future additions

1. Check this document and the live tokens in `index.css` first — don't assume a value needs a new token without checking if one already covers it.
2. If a hardcoded value recurs **5 or more times** across multiple files, it's a real pattern — add a token rather than leaving it as a permanent exception.
3. If it's a one-off or appears in only 1–2 places, leave it as a raw value. Don't inflate the token scale for noise.
4. Component-specific overrides that intentionally diverge from the global scale should use a prefixed name (see WebInquiries pattern above), not redefine the global token name locally.
5. After any token-system change, run `npm run build` and verify: zero warnings, correct per-route CSS/JS chunk count (not a single giant bundle), and the PWA precache block present in the output.
