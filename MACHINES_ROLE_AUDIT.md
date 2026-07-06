# Machine Role-Based Access Control (RBAC) Audit Report
**Sarga Prints MIS Codebase**
*Date: 2026-07-06*

---

## 1. Executive Summary
An audit was conducted across the backend machine routes (`server/routes/machines.js`) and the frontend React application (`client/src/`) to analyze access controls, identify role-based gaps, and determine if production roles (*Designer*, *Printer*, or *Other Staff*) need access.

### Key Conclusions:
1. **No Frontend Printer/Designer Integration**: Currently, production roles (*Designer*, *Printer*, and *Other Staff*) do not access machine status, health, readings, or work logs on the frontend. The `PrinterDashboard.jsx` and `OtherStaffDashboard.jsx` components do not make any API calls related to machines.
2. **Strictly Gated on Frontend**: Machine management views and components (`MachineManagement.jsx`, `MeterVerification.jsx`) are gated behind React routes permitting only `['Admin', 'Front Office']`. Cash book and billing screens (`DailyReport.jsx`, `FrontOffice.jsx`) containing machine opening reading modal components (`OpeningSetupModal.jsx`) permit only `Admin`, `Accountant`, and `Front Office`.
3. **Route Duplication Conflict on Backend**:
   * `POST /:id/assign-staff` is declared twice: at line 116 (allowing `Admin` and `Accountant`) and at line 632 (allowing `Admin` only).
   * `DELETE /:id/unassign-staff/:staffId` (or `:staff_id`) is declared twice: at line 139 (allowing `Admin` and `Accountant`) and at line 678 (allowing `Admin` only).
   * In Express, the first declaration in registration order takes precedence, leaving the second declaration dead and unreachable.
4. **Incorrect/Wide Backend Access**: Endpoints like `GET /machines/:id/live-count`, `GET /machines/:id/mpr-meter-data`, `POST /machines/:id/verify-count`, `GET /machines/:id/meter-comparison`, and `/work` logs are only restricted by `auth.authenticate` on the backend, allowing any authenticated worker to make requests even though only administrators/front office handle them on the frontend.

---

## 2. Detailed Route Audit Table

| Endpoint | Current Backend Middleware | asyncHandler Applied? | Calling Frontend Component(s) | Roles Frontend Currently Allows | Notes |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `GET /book-assignments` | `auth.authenticate` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Lists staff assigned to books. |
| `POST /book-assignments` | `auth.authenticate`, `auth.requireRole(['Admin', 'Accountant'])` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Assigns staff to books. Already restricted. |
| `GET /my-books` | `auth.authenticate` | No | `DailyReport.jsx`, `FrontOffice.jsx`, `PaymentModal.jsx` | `Admin`, `Accountant`, `Front Office` | Lists books by user branch. |
| `POST /:id/assign-staff` | `auth.authenticate`, `auth.requireRole(['Admin', 'Accountant'])` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Assigns staff (line 116 takes precedence). Already restricted. |
| `DELETE /:id/unassign-staff/:staff_id` | `auth.authenticate`, `auth.requireRole(['Admin', 'Accountant'])` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Unassigns staff (line 139 takes precedence). Already restricted. |
| `GET /:id/staff-assignments` | `auth.authenticate`, `auth.requireRole(['Admin', 'Accountant'])` | No | None | None | Unused helper. Already restricted. |
| `GET /` | `auth.authenticate`, `redisCache(...)` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Lists all machines. |
| `GET /count-requests` | `auth.authenticate`, `auth.requireRole(['Admin', 'Accountant'])` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Lists meter count adjustment requests. Already restricted. |
| `GET /health` | `auth.authenticate` | No | None | None | Health check. |
| `GET /:id` | `auth.authenticate` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Machine detail fetch. |
| `POST /` | `auth.authenticate`, `auth.requireRole(['Admin'])` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Adds a new machine. Already restricted. |
| `PUT /:id` | `auth.authenticate`, `auth.requireRole(['Admin'])` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Updates machine. Already restricted. |
| `DELETE /:id` | `auth.authenticate`, `auth.requireRole(['Admin'])` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Deletes machine. Already restricted. |
| `GET /:id/staff` | `auth.authenticate` | No | None | None | Unused helper. |
| `GET /:id/readings` | `auth.authenticate` | No | None | None | Fetch past readings. |
| `POST /:id/readings` | `auth.authenticate` | No | `OpeningSetupModal.jsx` (via `DailyReport.jsx` & `FrontOffice.jsx`), `MachineManagement.jsx` | `Admin`, `Accountant`, `Front Office` | Saves machine meter readings. Contains inline checks for assignees and `Admin` role. |
| `POST /:id/work` | `auth.authenticate` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Records work log entries. |
| `GET /:id/work` | `auth.authenticate` | No | None | None | Fetch machine work log history. |
| `DELETE /:id/work/:entryId` | `auth.authenticate` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Deletes work log entry. |
| `GET /:id/production-summary` | `auth.authenticate` | No | None | None | MPR summary. |
| `PUT /count-requests/:reqId` | `auth.authenticate`, `auth.requireRole(['Admin', 'Accountant'])` | No | `MachineManagement.jsx` | `Admin`, `Front Office` | Approves count request. Already restricted. |
| `GET /:id/mpr-meter-data` | `auth.authenticate` | No | `MeterVerification.jsx` (via `MachineManagement.jsx`), `MachineManagement.jsx` | `Admin`, `Front Office` | Fetches raw MPR values. |
| `POST /:id/verify-count` | `auth.authenticate` | No | `MeterVerification.jsx` | `Admin`, `Front Office` | Submits count verification request. |
| `GET /:id/meter-comparison` | `auth.authenticate` | No | `MeterVerification.jsx` | `Admin`, `Front Office` | MPR vs manual readings comparison. |
| `GET /:id/live-count` | `auth.authenticate` | No | `MachineCounterCard.jsx`, `MachineLiveStatus.jsx` | None | Dead code (defined components are never rendered). |

---

## 3. Production Workflow Analysis & Role Requirements
* **No Printer/Staff Machine Work Logging**: Although the backend has `/work` and `/:id/readings` endpoints configured to allow staff assigned to a machine to submit work logs or readings, the frontend does *not* provide any views for Printers or Other Staff to perform these actions.
* **Administrative Context**: Configuration of machines, editing assignments, verifying count differences, and deleting records are strictly restricted to `Admin` and `Accountant` roles.
* **Front Office Context**: Front Office staff needs access to read machines and submit machine readings during opening balance set setups (`OpeningSetupModal.jsx`).
