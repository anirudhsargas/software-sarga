# AI Agent Rules — Sarga MIS

Read this at session start. One-time instructions are below; conventions inferred from codebase patterns follow.

---

## Critical Don'ts

| # | Don't | Why (Incident) | Do Instead |
|---|---|---|---|
| 1 | Commit `.env`, `.env.local`, `.env.bak` or any file under `dev-scripts/` | Past `.env` files committed in worktree history; `render.yaml` once contained hardcoded credentials. | Check `git status` before every commit. `.env` is in `.gitignore` — verify ignore works. |
| 2 | Add `CREATE TABLE IF NOT EXISTS` inside route handlers or helper files | **15 inline CREATE statements** exist across `routes/` + `helpers/` (customerPayments.js, invoiceFeatures.js, passwordReset.js, products.js, quotes.js, website.js, anomalyDetection.js). This is technical debt, not a pattern to extend. | Add a numbered `.sql` file in `server/schemas/` (next: `022_*.sql`). |
| 3 | Create a page file without wiring it into `App.jsx` | Route audit (2026-06-16) found **23 orphaned pages** (13 client, 10 website) — files that exist but are neither imported nor routed. | After creating a page, add its `lazy(() => import(...))` and `<Route>` in `App.jsx`. |
| 4 | Let Kilo/other AI finish a session in a git worktree without merging to main | Commit `fd24229` shows "restore: admin pages and CMS pages from equinox-drop worktree" — work done in a worktree branch that never merged automatically. | End every session with explicit commit + push to main. Verify with `git branch`. |
| 5 | Name a file `nul`, `CON`, `PRN`, `AUX`, `LPT1`, or any Windows reserved name | `nul` is a Windows device name — `git add .` silently skips it or errors. The same applies to files named after these patterns. | Use descriptive lowercase names; avoid single-word reserved names. |
| 6 | Introduce a new external integration (payment gateway, API, SDK) without explicit confirmation | Past confusion between Razorpay vs BaseUPI integration — never assume which gateway. | Ask the user. Do not add new payment/SMS/email providers unless explicitly told which one. |
| 7 | Hardcode secrets or API keys in `render.yaml`, `vercel.json`, `vercel_env_setup.ps1`, or any tracked file | `render.yaml` historically used `value:` instead of `fromSecret:`; `vercel_env_setup.ps1` reads `.env` files. | Use `fromSecret:` in render.yaml, `process.env.*` in code, or Vercel dashboard env vars. |
| 8 | Delete a component, page, or route without first checking if anything imports it | The route-audit found 23 orphaned pages, but some may be loaded dynamically or via legacy redirects. | Use `grep -rn "from.*'./path'" src/` to verify zero importers before deleting. |
| 9 | Add dependencies for Three.js, recharts, or react-hook-form without verifying they're in `package.json` | `Product3DPreview.jsx` imports `@react-three/fiber`, `@react-three/drei`, `three` — **none are in** `website/package.json`. The component will fail at build. | Check `package.json` first. If the dep isn't listed, either add it or delete the importing code. |

---

## Git & Worktree Discipline

- **Default branch:** `main`. Branch names on origin: `copilot/*`, `v0/*`, `dependabot/*`.
- **Worktrees** live under `.kilo/worktrees/`. They do **not** auto-merge. After working in a worktree:
  1. Commit all changes in the worktree
  2. Push the worktree branch to origin
  3. Switch to main and `git merge <worktree-branch>`
  4. Push main
- `.kilo/` is **not** in `.gitignore`. Do not commit worktree artifacts or `.env` files within `.kilo/`.
- **Reserved filenames on Windows** (`nul`, `CON`, `PRN`, `AUX`, `LPT1`–`LPT9`, `COM1`–`COM9`):
  - `git add .` will silently skip these or error.
  - Never name a file or directory after any of these.
- **Commit messages** in this repo are short (1 line, lowercase). Examples: `fix: enable SSL for Aiven`, `feat: add /api/health endpoint`. Use `fix:` / `feat:` / `chore:` / `refactor:` prefixes.
- Before committing, run `git status` and `git diff --staged` to verify only intended files are staged.

---

## Secrets & Environment Variables

- **Never hardcode** credentials, API keys, or tokens in any tracked file.
- `render.yaml` must use `fromSecret:` for every secret value, never `value:`.
- Required secrets pattern (from `server/env.example`):

  | Category | Keys |
  |---|---|
  | Database | `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
  | Auth | `JWT_SECRET` (min 32 chars, random 256-bit) |
  | Email | `EMAIL_FROM`, `EMAIL_TO`, `EMAIL_PASS`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` |
  | Firebase | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` |
  | Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
  | AI | `GEMINI_API_KEY`, `GEMINI_MODEL` |
  | CORS | `CORS_ORIGIN` (comma-separated) |
  | Deployment | `CLIENT_URL`, `VITE_API_URL` |

- When adding a new env var:
  1. Add it to `server/env.example` with a placeholder value
  2. Add it to `server/render.yaml` as `fromSecret:`
  3. Add to `vercel_env_setup.ps1` if frontend needs it
  4. Document in any relevant `.md` at project root
- The `JWT_SECRET` is validated at startup — if it equals `'printing_shop_secret_key_2025'` or is <32 chars, the server throws. Never use that default.
- `JWT_SECRET_PREVIOUS` can be set during key rotation to support overlapping tokens.

---

## Database Schema Rules

- **New tables MUST be added as numbered migration files** in `server/schemas/`. Never as `CREATE TABLE IF NOT EXISTS` inside route handlers or helpers.
- Numbering convention: `001_core.sql` through `021_add_customer_client_type.sql`. Next number: **022**.
- Schema files **must** use `CREATE TABLE IF NOT EXISTS` (migrations are idempotent).
- Existing offenders (do NOT extend — migrate into schema files on next refactor):
  - `server/routes/customerPayments.js:643` — `sarga_refunds`
  - `server/routes/invoiceFeatures.js:14,38,63,76,90,100` — 6 tables
  - `server/routes/passwordReset.js:21` — `sarga_password_reset_tokens`
  - `server/routes/products.js:46,66,80` — 3 tables
  - `server/routes/quotes.js:13,41` — 2 tables
  - `server/routes/website.js:210,387` — 2 tables
  - `server/helpers/anomalyDetection.js:38` — `sarga_staff_behavior_profile`
- Unnumbered schema files that predate the migration system (`designer_workspace.sql`, `paymentSchemas.js`, `sessions.sql`, `staff_portal.sql`) should be converted to numbered files on next touch.
- **SSL cert:** The file `server/aiven-ca.pem` is required for production Aiven MySQL connections. Any new service or script connecting to Aiven MySQL must reference this cert (`rejectUnauthorized: true`).
- DB connection logic in `server/database.js` reads `DB_SSL=true` or `DB_SSL_MODE=REQUIRED` to enable SSL. Use `process.env.DB_SSL` for connection flags in new scripts.

---

## API & Route Conventions

- **Auth middleware** (from `server/middleware/auth.js`):
  - `authenticateToken` — validates JWT, attaches `req.user`
  - `authenticate` — enhanced version (validates JWT + checks DB for user + enforces Front Office branch rules)
  - `authorizeRoles(...roles)` — after authenticate, restricts to specific roles
  - `requireRole(allowedRoles)` — newer role gate, same pattern
- **Exact role strings** (case is normalized by `normalizeRole()` — use this canonical form everywhere):

  | Role | Used For |
  |---|---|
  | `'Admin'` | Everything |
  | `'Accountant'` | Accounting, reports, finance |
  | `'Front Office'` | Billing, orders — **auto-restricted to own branch** |
  | `'Designer'` | Design studio, product library |
  | `'Printer'` | Production, machines |
  | `'Other Staff'` | General staff dashboard, leave, tasks |

- **Front Office branch enforcement** (in `authenticate`): GET/DELETE/HEAD requests get `req.query.branch_id` overridden. POST/PUT/PATCH requests get body `branch_id` enforced. New front-office endpoints must NOT bypass this.
- **Route registration pattern** (in `server/index.js`):
  ```js
  app.use('/api', require('./routes/featureName'));
  app.use('/api/prefix', require('./routes/featureName'));
  ```
  Always match the path pattern to the route file's internal `router.get` path prefix.
- **CORS allowlist** in `server/index.js:42-53` — must add any new frontend origin (Vercel preview deploy, localhost port, custom domain). The env var `CORS_ORIGIN` supports comma-separated origins.

---

## Before Marking Any Task Complete — Checklist

- [ ] New pages imported (`lazy(() => import(...))`) AND routed (`<Route>`) in `App.jsx` — for **both** `client/src/App.jsx` and `website/src/App.jsx` as applicable.
- [ ] New API routes registered in `server/index.js` via `app.use()`.
- [ ] New env vars added to `server/env.example`, `server/render.yaml`, and documented.
- [ ] New external integration explicitly confirmed by user (no surprise Razorpay/BaseUPI-style additions).
- [ ] Schema changes use numbered migration file (`server/schemas/0NN_*.sql`), not inline CREATE.
- [ ] Frontend changes: run `npm run build` (or verify with `npx vite build` in the project subfolder) to catch import errors.
- [ ] No `.env`, `dev-scripts/`, or secrets in `git status`.
- [ ] If working in a worktree: committed, pushed, merged to main, pushed main.
- [ ] Component deleted: verify zero importers with `grep -rn "ComponentName" src/`.

---

## File Structure Reference

```
D:\software sarga\
├── client/                    # Staff MIS portal (React 19, Vite)
│   └── src/
│       ├── App.jsx            # Routes, lazy imports, providers
│       ├── components/        # Reusable UI components (~50)
│       ├── pages/             # Page-level components (~80+)
│       ├── hooks/             # Custom React hooks (useAuth, useSEO, …)
│       ├── contexts/          # React contexts (Branch, Auth, Confirm, …)
│       ├── services/          # API client, auth, sync manager
│       ├── theme/             # ThemeProvider, light/dark tokens
│       ├── styles/            # Button system, modal system, global CSS
│       └── bones/             # boneyard-js animation registry
├── website/                   # Customer-facing site (React 19, Vite)
│   └── src/
│       ├── App.jsx            # Routes, lazy imports
│       ├── components/        # UI components (~16)
│       └── pages/             # Page components (~20)
├── server/                    # Express backend (Node)
│   ├── index.js               # App bootstrap, middleware, route wiring
│   ├── database.js            # MySQL pool + SSL config
│   ├── aiven-ca.pem           # Production SSL cert (do not delete)
│   ├── env.example            # Documented env var template
│   ├── render.yaml            # Render deployment config
│   ├── routes/                # ~45 route modules
│   ├── schemas/               # Numbered SQL migrations (001–021)
│   ├── middleware/             # auth.js, branchFilter.js, etc.
│   ├── helpers/               # Shared utilities
│   └── services/              # Scheduler, etc.
├── mcp-server/                # MCP server (separate Python service)
├── ml-service/                # Python ML service (Flask, scikit-learn)
├── DESIGN.md                  # Client design tokens (living doc)
├── ARCHITECTURE.md            # System architecture overview
├── COMPONENTS.md              # Component inventory (generated)
└── AGENT_RULES.md             # This file
```

---

## Common Patterns Summary

| Concern | Pattern |
|---|---|
| Frontend routing | `lazy(() => import())` + `<Suspense>` + `<Route>` in App.jsx |
| Backend route guard | `authenticateToken, authorizeRoles('Admin', 'Accountant')` |
| DB connection | `pool.query('SELECT …', [params])` via `server/database.js` |
| Schema migration | `server/schemas/0NN_descriptive_name.sql` (next: 022) |
| Env var access | `process.env.VAR_NAME` (server) / `import.meta.env.VITE_VAR` (client Vite) |
| CORS | Hardcoded list in `index.js` + `CORS_ORIGIN` env var |
| Button styles | `className="btn btn-primary"` (client) / `className="btn btn-primary"` (website — different CSS) |
| Icons | `lucide-react` (both apps) |
| Toast | `react-hot-toast` (both apps) |
| Charts | `recharts` (client only) |
| Image handling | Cloudinary via `helpers/cloudinaryUpload.js` + `secureUpload` helper |
| File upload | Multer → `/uploads/` dir → Cloudinary fallback |
| API pattern | `express.Router()` → `asyncHandler` wrapper → `module.exports` |
