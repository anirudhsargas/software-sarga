# Inventory Role-Based Access Control (RBAC) Audit Report
**Sarga Prints MIS Codebase**
*Date: 2026-07-06*

---

## 1. Executive Summary
An audit was conducted across the backend inventory routes (`server/routes/paperInventory.js`, `server/routes/inventory.js`, and `server/routes/consumablesInventory.js`) and the frontend React application (`client/src/`) to understand how role-based permissions are enforced and whether production roles (*Designer*, *Printer*, or *Other Staff*) need write access to these routes.

### Key Conclusions:
1. **Frontend-Backend Discrepancy (Over-privilege on Backend)**: The backend inventory write/adjustment endpoints allow roles like *Designer* or *Printer* (e.g. `POST /inventory/:id/consume` and `PUT /inventory/consumables/:id/adjust`). However, on the frontend, all pages containing these actions (`ScanItem.jsx`, `ConsumablesManagement.jsx`, `PaperStockDashboard.jsx`, etc.) are gated behind `ProtectedSubRoute` arrays permitting only `['Admin', 'Front Office', 'Accountant']`.
2. **Production Consumption Encapsulation**: Production workflows (e.g., logging paper consumed for a print job) do *not* hit the direct `/api/inventory` or `/api/paperInventory` write endpoints. Instead, they hit `/api/jobs/:id/consume-paper` (registered in `server/routes/jobs.js`), which handles the stock reductions and movement logging automatically on the database layer.
3. **No Legitimate Production Write Access Needed**: Production roles (*Designer*, *Printer*, and *Other Staff*) have no legitimate reason to write directly to these inventory endpoints. Direct modification of inventory tables should be restricted on the backend to `['Admin', 'Accountant', 'Front Office']`.

---

## 2. Detailed Route Audit Table

| Endpoint | Current Backend Middleware | Calling Frontend Component(s) | Roles Frontend Currently Allows | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **`paperInventory.js`** | | | | |
| `GET /types` | `authenticateToken` | `PaperInward.jsx`, `PaperOutward.jsx`, `PaperTransfer.jsx` | `Admin`, `Front Office`, `Accountant` | Fetches paper size/gsm catalog. |
| `POST /types` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | Used to insert new paper types. |
| `GET /stock` | `authenticateToken` | `PaperAlerts.jsx`, `PaperOutward.jsx`, `PaperStockDashboard.jsx`, `PaperTransfer.jsx` | `Admin`, `Front Office`, `Accountant` | Fetches stock quantities by branch. |
| `POST /inward` | `authenticateToken` | `PaperInward.jsx` | `Admin`, `Front Office`, `Accountant` | Records manual stock purchases. |
| `POST /outward` | `authenticateToken` | `PaperOutward.jsx` | `Admin`, `Front Office`, `Accountant` | Records manual stock removals. |
| `POST /transfer` | `authenticateToken` | `PaperTransfer.jsx` | `Admin`, `Front Office`, `Accountant` | Inter-branch paper movement. |
| `GET /movements` | `authenticateToken` | `PaperMovementHistory.jsx` | `Admin`, `Front Office`, `Accountant` | Lists historical stock movements. |
| `GET /alerts` | `authenticateToken` | `PaperAlerts.jsx` | `Admin`, `Front Office`, `Accountant` | Fetches active low-stock alerts. |
| **`inventory.js`** | | | | |
| `GET /inventory` | `authenticateToken`, `authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff')` | `InventoryOverview.jsx`, `PaperStockDashboard.jsx`, `StockTransfer.jsx` | `Admin`, `Front Office`, `Accountant` | Lists general product inventory. |
| `GET /inventory/low-stock` | `authenticateToken` | `InventoryOverview.jsx` | `Admin`, `Front Office`, `Accountant` | Lists low-stock general items. |
| `GET /inventory/:id/movements` | `authenticateToken` | None | None | Fetch single item movement log. |
| `GET /inventory/:id` | `authenticateToken`, `authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff')` | None | None | Fetch single item details. |
| `GET /inventory/:id/branch-availability` | `authenticateToken` | None | None | Fetch stock at other branches. |
| `GET /inventory/paper-cut-maps` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | Parent-child paper sheet mappings. |
| `POST /inventory/paper-cut-maps` | `authenticateToken`, `authorizeRoles('Admin')` | None | None | Saves sheet size cut mapping. |
| `DELETE /inventory/paper-cut-maps/:id` | `authenticateToken`, `authorizeRoles('Admin')` | None | None | Deletes sheet size cut mapping. |
| `GET /inventory/paper-types` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | Fetches distinct category groups. |
| `POST /inventory/paper-map` | `authenticateToken`, `authorizeRoles('Admin')` | None | None | Maps inventory items to paper categories. |
| `GET /inventory/by-sku/:sku` | `authenticateToken` | `ScanItem.jsx`, `Dashboard.jsx` (barcode search) | `Admin`, `Front Office`, `Accountant` | Fetches details when QR code is scanned. |
| `GET /inventory/qr-diagnostic/:code` | `authenticateToken`, `authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff')` | None | None | Scanner test diagnostic lookup. |
| `POST /inventory/extract-bill` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | OCR data extraction from uploaded bills. |
| `POST /inventory` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | Adds new general inventory item. |
| `PUT /inventory/:id` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | `ScanItem.jsx` (via edit click redirection) | `Admin`, `Front Office`, `Accountant` | Updates general inventory details. |
| `POST /inventory/:id/consume` | `authenticateToken`, `authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff')` | `ScanItem.jsx` | `Admin`, `Front Office`, `Accountant` | Reduces stock level via scanner interface. |
| `POST /inventory/:id/restock` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant', 'Front Office')` | `ScanItem.jsx` | `Admin`, `Front Office`, `Accountant` | Restocks item via scanner interface. |
| `POST /inventory/generate-labels` | `authenticateToken`, `authorizeRoles('Admin', 'Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff')` | None | None | Generates barcode labels PDF. |
| `DELETE /inventory/all` | `authenticateToken`, `authorizeRoles('Admin')` | None | None | Clears inventory database table. |
| `DELETE /inventory/:id` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | Soft/hard deletes inventory item. |
| `POST /inventory/transfer` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant', 'Front Office')` | `StockTransfer.jsx` | `Admin`, `Front Office`, `Accountant` | Inter-branch item transfer. |
| `GET /inventory/settings/image` | `authenticateToken` | None | None | Fetches image processing settings. |
| `PUT /inventory/settings/image` | `authenticateToken`, `authorizeRoles('Admin')` | None | None | Updates image processing configuration. |
| `POST /inventory/:id/image` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | Uploads item photo asset. |
| `DELETE /inventory/:id/image` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | Deletes item photo asset. |
| `POST /inventory/:id/regenerate-image` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | None | None | Triggers image regeneration. |
| `POST /inventory/bulk-generate-images` | `authenticateToken`, `authorizeRoles('Admin')` | None | None | Triggers batch image generations. |
| **`consumablesInventory.js`** | | | | |
| `GET /inventory/consumables` | `authenticateToken` | `InventoryOverview.jsx`, `ConsumablesManagement.jsx`, `PaperStockDashboard.jsx` | `Admin`, `Front Office`, `Accountant` | Lists active branch consumables. |
| `GET /inventory/consumables/low-stock` | `authenticateToken` | `InventoryOverview.jsx`, `ConsumablesManagement.jsx` | `Admin`, `Front Office`, `Accountant` | Lists low-stock consumables. |
| `POST /inventory/consumables` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | `ConsumablesManagement.jsx` | `Admin`, `Front Office`, `Accountant` | Creates a new consumable record. |
| `PUT /inventory/consumables/:id` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | `ConsumablesManagement.jsx` | `Admin`, `Front Office`, `Accountant` | Updates a consumable record. |
| `DELETE /inventory/consumables/:id` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant')` | `ConsumablesManagement.jsx` | `Admin`, `Front Office`, `Accountant` | Deletes a consumable record. |
| `PUT /inventory/consumables/:id/adjust` | `authenticateToken`, `authorizeRoles('Admin', 'Accountant', 'Printer', 'Front Office')` | `ConsumablesManagement.jsx` | `Admin`, `Front Office`, `Accountant` | Manual delta-based adjustments. |

*Note: All endpoints use asynchronous route handlers with try/catch logic; none are wrapped in `asyncHandler`.*

---

## 3. Production Workflow Analysis (e.g. Job Consumption)
The audit inspected whether Designer or Printer roles need write access to log materials during job progress:
* **The Flow**: In `client/src/components/PaperSidePanel.jsx` (the paper side drawer) and `client/src/services/localDb.js` (offline sync), the frontend issues a `POST` request to `/api/jobs/:id/consume-paper`.
* **The Endpoint**: This endpoint is defined in `server/routes/jobs.js` and is gated only by `authenticateToken`.
* **Database Updates**: The handler queries the `sarga_jobs` branch information and updates the inventory stock tables (`sarga_inventory` and `sarga_branch_stock`) directly from the backend database connection.
* **No Direct Write Calls**: Because the database adjustment is encapsulated within `/jobs/:id/consume-paper`, production workers (Designer, Printer) do *not* directly query or modify `/api/inventory` or `/api/paperInventory` write routes.
* **Typo/Dead Route Identified**: In `client/src/pages/InventoryOverview.jsx`, the calls to `/inventory/paper` and `/inventory/paper/low-stock` do not correspond to any registered backend endpoint (the backend registers paper stock under `/api/paperInventory/stock`). In production, this causes the dashboard counters for paper stock on this specific page to receive a 404 response.
