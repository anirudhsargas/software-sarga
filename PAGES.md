# Sarga Printing MIS — Page & Route Audit

This document serves as the master catalog of all routed pages and unrouted/orphaned files in both the Staff MIS Portal (`client/`) and the Customer-Facing Website (`website/`).

---

## Build Risk Audit: Product3DPreview.jsx

> [!WARNING]
> **Build Risk Assessment: Product3DPreview.jsx**
> * **File Location:** [Product3DPreview.jsx](file:///d:/software%20sarga/website/src/components/Product3DPreview.jsx)
> * **Imports:** `three`, `@react-three/fiber`, and `@react-three/drei`.
> * **Audit Finding:** **None** of these packages are declared in [package.json (Website)](file:///d:/software%20sarga/website/package.json).
> * **Reachability:** We audited the entire customer-facing website routes in [App.jsx (Website)](file:///d:/software%20sarga/website/src/App.jsx) and verified that **no routed page imports or references `Product3DPreview`**. It is currently an orphaned component.
> * **Risk Level:** **Low / None in the current routing configuration** due to bundler tree-shaking. However, any future attempt to import it into a routed page will break the production build unless these dependencies are added to `website/package.json`. It is recommended to either delete this file or add the missing packages to the dependencies list.

---

## Dashboard & Overview

### Route & Data Summary

| Page | File | Route Path | Auth Requirement | Branch Lock (Front Office) | Data Dependencies (API) |
|---|---|---|---|---|---|
| **Overview Dashboard** | [Summary.jsx](file:///d:/software%20sarga/client/src/pages/Summary.jsx) | `/dashboard` (Admin / generic) | `Admin` | Scoped via global selected branch | **GET** `/stats/dashboard` |
| **Front Office Dashboard** | [FrontOffice.jsx](file:///d:/software%20sarga/client/src/pages/FrontOffice.jsx) | `/dashboard` (Front Office) | `Front Office` | Scoped via global selected branch | **GET** `/front-office/dashboard`<br>**GET** `/front-office/attendance-reminder`<br>**GET** `/machines/my-books`<br>**GET** `/daily-report/opening-balance`<br>**GET** `/daily-report/laser-live`<br>**GET** `/daily-report/previous-closing`<br>**GET** `/front-office/completed`<br>**GET** `/front-office/active-jobs`<br>**GET** `/front-office/due-customers`<br>**GET** `/front-office/overdue-jobs`<br>**GET** `/front-office/recent-payments`<br>**GET** `/front-office/delivered`<br>**PUT** `/daily-report/opening-balance` |
| **Accountant Dashboard** | [AccountantDashboard.jsx](file:///d:/software%20sarga/client/src/pages/AccountantDashboard.jsx) | `/dashboard` (Accountant) | `Accountant` | None (can query all branches) | **GET** `/expense-dashboard`<br>**GET** `/stats/dashboard`<br>**GET** `/reports/cash-vs-bank`<br>**GET** `/requests/discount`<br>**GET** `/branches` |
| **Other Staff Dashboard** | [OtherStaffDashboard.jsx](file:///d:/software%20sarga/client/src/pages/OtherStaffDashboard.jsx) | `/dashboard` (Other Staff) | `Other Staff` | None | None |
| **Designer Dashboard** | [DesignDashboard.jsx](file:///d:/software%20sarga/client/src/pages/designer/DesignDashboard.jsx) | `/designer/` | `Designer`, `Admin` | None | **GET** `/design-workspace/bookings`<br>**GET** `/design-workspace/assets` |
| **Staff Dashboard** | [StaffDashboard.jsx](file:///d:/software%20sarga/client/src/pages/staff/StaffDashboard.jsx) | `/staff` | Any authenticated staff role | None | **GET** `/staff-portal/attendance`<br>**GET** `/staff-portal/timeline`<br>**GET** `/staff-portal/tasks` |
| **Printer Dashboard** | [PrinterDashboard.jsx](file:///d:/software%20sarga/client/src/pages/PrinterDashboard.jsx) | `/dashboard/printer-dashboard` | `Printer` | Scoped via global selected branch | Uses offline IndexedDB wrappers:<br>`localDb.getStaffWorkHistory`<br>`localDb.getBranches` |
| **Assigned Design Jobs** | [DesignerDashboard.jsx](file:///d:/software%20sarga/client/src/pages/DesignerDashboard.jsx) | `/dashboard/designer-dashboard` | `Designer` | Scoped via global selected branch | Uses offline IndexedDB wrappers:<br>`localDb.getStaffWorkHistory`<br>`localDb.getBranches` |
| **Login** | [Login.jsx](file:///d:/software%20sarga/client/src/pages/Login.jsx) | `/login` | Public | None | **POST** `/staff/login` |
| **Forgot Password** | [ForgotPassword.jsx](file:///d:/software%20sarga/client/src/pages/ForgotPassword.jsx) | `/forgot-password` | Public | None | **POST** `/auth/forgot-password` (Raw fetch) |
| **Reset Password** | [ResetPassword.jsx](file:///d:/software%20sarga/client/src/pages/ResetPassword.jsx) | `/reset-password` | Public | None | **GET** `/auth/reset-password/verify`<br>**POST** `/auth/reset-password` (Raw fetch) |
| **Change Password** | [ChangePassword.jsx](file:///d:/software%20sarga/client/src/pages/ChangePassword.jsx) | `/change-password` | Any authenticated user | None | **POST** `/staff/change-password` |
| **Staff Settings** | [StaffSettingsPage.jsx](file:///d:/software%20sarga/client/src/pages/StaffSettingsPage.jsx) | `/staff-settings` | `Other Staff`, `Designer`, `Printer`, `Front Office`, `Accountant` | None | **PATCH** `/staff/settings` |
| **Server Error** | [ServerError.jsx](file:///d:/software%20sarga/client/src/pages/ServerError.jsx) | `/error/server` | Public | None | None |
| **Network Error** | [NetworkError.jsx](file:///d:/software%20sarga/client/src/pages/NetworkError.jsx) | `/error/network` | Public | None | None |

### Details & Nuances

#### Front Office Role Branch Lock Defect (Resolved)
* **Nuance:** Previously, `BranchSelect.jsx` had a broken dependency on context fields that were not returned. This has been fully resolved by refactoring [BranchSelect.jsx](file:///d:/software%20sarga/client/src/components/ui/BranchSelect.jsx) to retrieve roles directly from `auth.getUser()` and check the user's role.
* **Resolution:** All non-admin roles (including Front Office, Printers, Designers, etc.) are now correctly locked to their assigned branch via a read-only branch badge rendering, while only admins can access the `<select>` dropdown.
* **Component Composition:** Composes [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [QuickActionsDashboard](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--staff-mis-client), [BranchSelect](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Skeleton](file:///d:/software%20sarga/COMPONENTS.md#data-display), and [SkeletonLoader](file:///d:/software%20sarga/COMPONENTS.md#data-display).

#### Raw Fetch Directives
* **Nuance:** [ForgotPassword.jsx](file:///d:/software%20sarga/client/src/pages/ForgotPassword.jsx) and [ResetPassword.jsx](file:///d:/software%20sarga/client/src/pages/ResetPassword.jsx) bypass the standard Axios API client wrapper (`api.js`) and issue native `fetch` requests directly targeting the raw `VITE_API_URL` endpoint.
* **Known Issues:** Leftover debugging `console.error` statements in [Summary.jsx](file:///d:/software%20sarga/client/src/pages/Summary.jsx) on line 82. Empty catch block `catch (err) {}` in [PrinterDashboard.jsx](file:///d:/software%20sarga/client/src/pages/PrinterDashboard.jsx) and [DesignerDashboard.jsx](file:///d:/software%20sarga/client/src/pages/DesignerDashboard.jsx) inside visibility listeners.

---

## Job Management

### Route & Data Summary

| Page | File | Route Path | Auth Requirement | Branch Lock (Front Office) | Data Dependencies (API) |
|---|---|---|---|---|---|
| **Orders Queue** | [Jobs.jsx](file:///d:/software%20sarga/client/src/pages/Jobs.jsx) | `/dashboard/sales/orders` | `Admin`, `Front Office`, `Accountant` | Scoped via global selected branch | **GET** `/jobs`<br>**PUT** `/jobs/:id` (status updates)<br>**POST** `/requests/discount`<br>**POST** `/jobs/:id/repeat`<br>**DELETE** `/jobs/:id` |
| **Order Details Dashboard** | [JobDetail.jsx](file:///d:/software%20sarga/client/src/pages/JobDetail.jsx) | `/dashboard/sales/orders/:id` | Any authenticated user | None (viewing scoped context) | **GET** `/jobs/:id`<br>**GET** `/jobs/:id/designs`<br>**GET** `/jobs/:id/matter`<br>**GET** `/jobs/:id/proofs`<br>**GET** `/branches`<br>**POST** `/jobs/:id/matter`<br>**POST** `/jobs/:id/designs`<br>**POST** `/jobs/:id/proofs`<br>**POST** `/jobs/:id/repeat`<br>**POST** `/customer-payments/refund`<br>**PUT** `/jobs/:id/proofs/:proofId/review`<br>**DELETE** `/jobs/:id/paper-logs/:logId`<br>**DELETE** `/jobs/:id/matter/:matterId`<br>**DELETE** `/jobs/:id/designs/:designId`<br>**DELETE** `/jobs/:id/proofs/:proofId` |
| **Quotations** | [Quotes.jsx](file:///d:/software%20sarga/client/src/pages/Quotes.jsx) | `/dashboard/sales/quotes` | `Admin`, `Front Office`, `Accountant` | Scoped via global selected branch | **GET** `/product-hierarchy`<br>**GET** `/quotes`<br>**GET** `/customers`<br>**POST** `/quotes`<br>**PUT** `/quotes/:id`<br>**GET** `/quotes/:id`<br>**DELETE** `/quotes/:id`<br>**POST** `/quotes/:id/convert`<br>**POST** `/quotes/:id/send-email` |
| **Product Library** | [ProductLibrary.jsx](file:///d:/software%20sarga/client/src/pages/ProductLibrary.jsx) | `/dashboard/products` | `Admin`, `Front Office`, `Designer` | None | **GET** `/vendors`<br>**POST** `/product-hierarchy/refresh`<br>**GET** `/product-hierarchy`<br>**GET** `/products/image-update-requests`<br>**GET** `/products/update-requests`<br>**DELETE** `/products/:id`<br>**PATCH** `/products/:id/toggle-active`<br>**GET** `/unique-company-code`<br>**POST/PUT** `/product-categories`<br>**POST/PUT** `/product-subcategories`<br>**POST/PUT** `/products`<br>**DELETE** `/products/:id/image`<br>**POST** `/products/:id/image-update-requests`<br>**POST** `/products/:id/update-requests`<br>**PATCH** `/products/image-update-requests/:reqId`<br>**PATCH** `/products/update-requests/:reqId`<br>**PUT** `/product-positions`<br>**GET** `/products/:prodId`<br>**POST** `/product-usage/reset` |
| **Product Requests** | [ProductRequests.jsx](file:///d:/software%20sarga/client/src/pages/ProductRequests.jsx) | `/dashboard/product-requests` | `Admin`, `Accountant` | None | **GET** `/products`<br>**GET** `/products/update-requests`<br>**PATCH** `/products/update-requests/:id`<br>**POST** `/products/update-requests` |
| **Plate Management** | [PlateManagement.jsx](file:///d:/software%20sarga/client/src/pages/PlateManagement.jsx) | `/dashboard/plates` | `Designer`, `Admin` | None | **GET** `/jobs/offset-pending` |
| **Machine Management** | [MachineManagement.jsx](file:///d:/software%20sarga/client/src/pages/MachineManagement.jsx) | `/dashboard/machines` | `Admin`, `Front Office` | Scoped via global selected branch | **GET** `/branches`<br>**GET** `/staff`<br>**GET** `/machines`<br>**GET** `/machines/book-assignments`<br>**GET** `/machines/:id/mpr-meter-data`<br>**POST** `/machines/book-assignments`<br>**GET** `/machines/:id`<br>**POST/PUT** `/machines`<br>**POST** `/machines/:id/assign-staff`<br>**POST** `/machines/:id/readings`<br>**PUT** `/machines/count-requests/:reqId`<br>**POST** `/machines/:id/work`<br>**DELETE** `/machines/:id/work/:entryId` |
| **Production Tracker** | [ProductionTracker.jsx](file:///d:/software%20sarga/client/src/pages/ProductionTracker.jsx) | `/dashboard/production-tracker` | `Admin`, `Front Office` | None | **GET** `/branches`<br>**GET** `/production-tracker` |
| **Design Checker** | [DesignChecker.jsx](file:///d:/software%20sarga/client/src/pages/DesignChecker.jsx) | `/dashboard/design-check` | `Designer` | None | **POST** `/design-check/analyze` |
| **Paper Layout Generator** | [PaperLayoutGenerator.jsx](file:///d:/software%20sarga/client/src/pages/PaperLayoutGenerator.jsx) | `/dashboard/paper-layout` | `Front Office`, `Designer` | None | **POST** `/ai/paper-layout/calculate`<br>**POST** `/ai/paper-layout/compare` |
| **Job Priority Override** | [JobPriority.jsx](file:///d:/software%20sarga/client/src/pages/JobPriority.jsx) | `/dashboard/job-priority` | `Admin`, `Front Office` | None | **POST** `/job-priority/override`<br>**GET** `/job-priority/queue`<br>**GET** `/job-priority/stats` |
| **Design Bookings CMS** | [DesignBookingsCMS.jsx](file:///d:/software%20sarga/client/src/pages/DesignBookingsCMS.jsx) | `/dashboard/design-bookings` | `Admin`, `Front Office`, `Designer` | None | **GET** `/admin/consultations`<br>**GET** `/admin/designers`<br>**PUT** `/admin/consultations/:id` |
| **Designer Bookings** | [DesignBooking.jsx](file:///d:/software%20sarga/client/src/pages/designer/DesignBooking.jsx) | `/designer/bookings` | `Designer`, `Admin` | None | **GET** `/design-workspace/bookings`<br>**GET** `/admin/designers`<br>**POST** `/design-workspace/bookings`<br>**PUT** `/design-workspace/bookings/:id/status` |
| **Block Journal** | [BlockJournal.jsx](file:///d:/software%20sarga/client/src/pages/designer/BlockJournal.jsx) | `/designer/blocks` | `Designer`, `Admin` | None | **GET** `/design-workspace/blocks`<br>**GET** `/customers`<br>**POST** `/design-workspace/blocks` |
| **Assigned Jobs** | [AssignedJobs.jsx](file:///d:/software%20sarga/client/src/pages/designer/AssignedJobs.jsx) | `/designer/assigned` | `Designer`, `Admin` | None | **GET** `/design-workspace/bookings`<br>**PUT** `/design-workspace/bookings/:id/status` |
| **Design Studio Home** | [DesignStudioHome.jsx](file:///d:/software%20sarga/client/src/pages/design-studio/DesignStudioHome.jsx) | `/dashboard/design-studio` | `Admin`, `Designer` | None | None (Pure frontend templates) |
| **Design Editor** | [DesignEditor.jsx](file:///d:/software%20sarga/client/src/pages/design-studio/DesignEditor.jsx) | `/dashboard/design-studio/editor/:id` | `Admin`, `Designer` | None | None (Pure frontend canvas) |
| **Album Designer** | [AlbumDesigner.jsx](file:///d:/software%20sarga/client/src/pages/design-studio/AlbumDesigner.jsx) | `/dashboard/design-studio/album` | `Admin`, `Designer` | None | None (Pure frontend canvas) |
| **Invitation Scanner** | [InvitationScanner.jsx](file:///d:/software%20sarga/client/src/pages/design-studio/InvitationScanner.jsx) | `/dashboard/design-studio/scanner` | `Admin`, `Designer` | None | None (Pure frontend scanner mockup) |
| **AI Matter Builder** | [AIMatterBuilder.jsx](file:///d:/software%20sarga/client/src/pages/design-studio/AIMatterBuilder.jsx) | `/dashboard/design-studio/ai-matter` | `Admin`, `Designer` | None | None (AI mockup editor) |
| **AI Design Generator** | [AIDesignGenerator.jsx](file:///d:/software%20sarga/client/src/pages/design-studio/AIDesignGenerator.jsx) | `/dashboard/design-studio/ai-design` | `Admin`, `Designer` | None | None (AI mockup editor) |

### Details & Nuances

#### Offline Sync Dual Strategy
* **Nuance:** [JobDetail.jsx](file:///d:/software%20sarga/client/src/pages/JobDetail.jsx) relies on a dual strategy for state tracking. While reading files, proofs, and refunds are handled through standard Axios REST endpoints, job status updating, assignment status marking, and paper usage logs are processed directly via a local IndexedDB client (`localDb` via Dexie) to support offline branch workflows.
* **Key Composed Components:** [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [SecureImage](file:///d:/software%20sarga/COMPONENTS.md#data-display), [Button](file:///d:/software%20sarga/COMPONENTS.md#forms--inputs), [LoadingButton](file:///d:/software%20sarga/COMPONENTS.md#forms--inputs).
* **Known Issues:** Leftover debugging `console.log` statements in `JobDetail.jsx` on lines 371 & 375.

---

## Customer Management

### Route & Data Summary

| Page | File | Route Path | Auth Requirement | Branch Lock (Front Office) | Data Dependencies (API) |
|---|---|---|---|---|---|
| **Customers Directory** | [Customers.jsx](file:///d:/software%20sarga/client/src/pages/Customers.jsx) | `/dashboard/sales/customers` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/customers`<br>**POST** `/requests/customer-change`<br>**DELETE** `/customers/:id`<br>**POST** `/ai/turnaround`<br>**GET** `/product-hierarchy`<br>**GET** `/products/:id`<br>**POST** `/jobs` |
| **Customer Profile** | [CustomerDetails.jsx](file:///d:/software%20sarga/client/src/pages/CustomerDetails.jsx) | `/dashboard/sales/customers/:id` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/customers/:id/dashboard`<br>**GET** `/customers/:id/designs`<br>**POST** `/jobs/:jobId/repeat`<br>**POST** `/customers/:id/designs`<br>**DELETE** `/customers/:id/designs/:designId` |
| **Coupons** | [CouponManagement.jsx](file:///d:/software%20sarga/client/src/pages/CouponManagement.jsx) | `/dashboard/coupons` | `Admin` | None | **GET** `/coupons`<br>**POST** `/coupons`<br>**PUT** `/coupons/:id`<br>**DELETE** `/coupons/:id` |
| **Web Inquiries** | [WebInquiries.jsx](file:///d:/software%20sarga/client/src/pages/WebInquiries.jsx) | `/dashboard/web-inquiries` | `Admin`, `Front Office` | None | **GET** `/website-inquiries`<br>**PATCH** `/website-inquiries/:id/status` |
| **Sample Requests CMS** | [SampleRequestsCMS.jsx](file:///d:/software%20sarga/client/src/pages/SampleRequestsCMS.jsx) | `/dashboard/sample-requests` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/admin/sample-requests`<br>**GET** `/admin/samples/inventory`<br>**PUT** `/admin/sample-requests/:id`<br>**POST** `/admin/samples/inventory`<br>**PUT** `/admin/samples/inventory/:id` |

### Details & Nuances

#### Customers Inline Quick-Billing
* **Nuance:** [Customers.jsx](file:///d:/software%20sarga/client/src/pages/Customers.jsx) features a complex, inline quick-billing dialog flow. Instead of redirecting to the standard Invoice creation route, it queries `/product-hierarchy` and individual products directly to calculate rates and posts a complete order record to `/jobs` instantly.
* **Key Composed Components:** [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Pagination](file:///d:/software%20sarga/COMPONENTS.md#data-display), [CountryCodeSelect](file:///d:/software%20sarga/COMPONENTS.md#forms--inputs).
* **Known Issues:** Leftover debug logs in [CustomerDetails.jsx](file:///d:/software%20sarga/client/src/pages/CustomerDetails.jsx) on lines 226 & 237 (`console.log`).

---

## Inventory & Stock

### Route & Data Summary

| Page | File | Route Path | Auth Requirement | Branch Lock (Front Office) | Data Dependencies (API) |
|---|---|---|---|---|---|
| **Inventory Directory** | [Inventory.jsx](file:///d:/software%20sarga/client/src/pages/Inventory.jsx) | `/dashboard/inventory` | `Admin`, `Front Office`, `Accountant` | Restricts cost fields | **GET** `/inventory`<br>**GET** `/paperInventory/stock`<br>**GET** `/inventory/consumables`<br>**GET** `/stock-requests`<br>**GET** `/inventory/:id/branch-availability`<br>**POST** `/stock-requests`<br>**PUT** `/stock-requests/:id/approve`<br>**POST** `/inventory`<br>**PUT** `/inventory/:id`<br>**DELETE** `/inventory/:id`<br>**POST** `/inventory/generate-labels`<br>**POST** `/inventory/:id/consume`<br>**POST** `/inventory/:id/restock`<br>**GET** `/inventory/:id`<br>**POST** `/inventory/bulk-generate-images` |
| **Inventory Overview** | [InventoryOverview.jsx](file:///d:/software%20sarga/client/src/pages/InventoryOverview.jsx) | `/dashboard/inventory/overview` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/inventory`<br>**GET** `/inventory/paper`<br>**GET** `/inventory/paper/low-stock`<br>**GET** `/inventory/consumables`<br>**GET** `/inventory/consumables/low-stock` |
| **Scan Stock Item** | [ScanItem.jsx](file:///d:/software%20sarga/client/src/pages/ScanItem.jsx) | `/dashboard/inventory/scan` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/inventory/by-sku/:sku`<br>**POST** `/inventory/:id/restock`<br>**POST** `/inventory/:id/consume` |
| **Stock Auditing** | [StockVerification.jsx](file:///d:/software%20sarga/client/src/pages/StockVerification.jsx) | `/dashboard/stock-verification` | `Accountant`, `Admin` | None | **GET** `/stock-verification/:month`<br>**GET** `/stock-verification/history/list`<br>**POST** `/stock-verification` |
| **Stock AI Planning** | [StockPlanning.jsx](file:///d:/software%20sarga/client/src/pages/StockPlanning.jsx) | `/dashboard/stock-planning` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/ai/stock-planning/stock-status`<br>**GET** `/ai/stock-planning/purchase-list`<br>**POST** `/ai/stock-planning/approve-purchase-list`<br>**GET** `/products` |
| **Inter-Branch Transfer** | [StockTransfer.jsx](file:///d:/software%20sarga/client/src/pages/StockTransfer.jsx) | `/dashboard/stock-transfer` | `Admin`, `Accountant`, `Front Office` | Filters to user branch | **GET** `/branches`<br>**GET** `/inventory`<br>**GET** `/stock-requests`<br>**GET** `/branch-stock/:id`<br>**POST** `/inventory/transfer`<br>**POST** `/stock-requests`<br>**PUT** `/stock-requests/:id/approve`<br>**PUT** `/stock-requests/:id/send`<br>**PUT** `/stock-requests/:id/receive` |
| **Paper Stock Ledger** | [PaperStockDashboard.jsx](file:///d:/software%20sarga/client/src/pages/PaperStockDashboard.jsx) | `/dashboard/paper/stock` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/inventory`<br>**GET** `/paperInventory/stock`<br>**GET** `/inventory/consumables`<br>**GET** `/branches` |
| **Paper Inward** | [PaperInward.jsx](file:///d:/software%20sarga/client/src/pages/PaperInward.jsx) | `/dashboard/paper/inward` | `Admin`, `Front Office`, `Accountant` | Restricts inward logs to branch | **GET** `/paperInventory/types`<br>**GET** `/branches`<br>**POST** `/paperInventory/inward` |
| **Paper Outward** | [PaperOutward.jsx](file:///d:/software%20sarga/client/src/pages/PaperOutward.jsx) | `/dashboard/paper/outward` | `Admin`, `Front Office`, `Accountant` | Restricts outward logs to branch | **GET** `/paperInventory/types`<br>**GET** `/branches`<br>**GET** `/paperInventory/stock`<br>**GET** `/jobs`<br>**POST** `/paperInventory/outward` |
| **Paper Movements** | [PaperMovementHistory.jsx](file:///d:/software%20sarga/client/src/pages/PaperMovementHistory.jsx) | `/dashboard/paper/movements` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/paperInventory/movements`<br>**GET** `/branches` |
| **Paper Alerts** | [PaperAlerts.jsx](file:///d:/software%20sarga/client/src/pages/PaperAlerts.jsx) | `/dashboard/paper/alerts` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/paperInventory/alerts`<br>**GET** `/paperInventory/stock` |
| **Paper Stock Transfer** | [PaperTransfer.jsx](file:///d:/software%20sarga/client/src/pages/PaperTransfer.jsx) | `/dashboard/paper/transfer` | `Admin`, `Front Office`, `Accountant` | Restricts source branch | **GET** `/paperInventory/types`<br>**GET** `/branches`<br>**GET** `/paperInventory/stock`<br>**POST** `/paperInventory/transfer` |
| **Consumables Stock** | [ConsumablesManagement.jsx](file:///d:/software%20sarga/client/src/pages/ConsumablesManagement.jsx) | `/dashboard/inventory/consumables` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/inventory`<br>**GET** `/paperInventory/stock`<br>**GET** `/inventory/consumables`<br>**DELETE** `/inventory/consumables/:id`<br>**POST** `/inventory/consumables`<br>**PUT** `/inventory/consumables/:id`<br>**PUT** `/inventory/consumables/:id/adjust` |

### Details & Nuances

#### Scoped Cost Visibility
* **Nuance:** [Inventory.jsx](file:///d:/software%20sarga/client/src/pages/Inventory.jsx) evaluates `auth.getUser()?.role === 'Front Office'` to determine cost visibility. When matched, all columns displaying cost price, stock valuation totals, and purchase margins are hidden from view.
* **Key Composed Components:** [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Pagination](file:///d:/software%20sarga/COMPONENTS.md#data-display), [SecureImage](file:///d:/software%20sarga/COMPONENTS.md#data-display), [InventoryImage](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--staff-mis-client), [ScannerErrorBoundary](file:///d:/software%20sarga/COMPONENTS.md#feedback), [ScannerModal](file:///d:/software%20sarga/COMPONENTS.md#modals--dialogs).
* **Known Issues:** Leftover debug logs in `Inventory.jsx` on lines 150 & 995 (`console.log`).

---

## Vendor & Procurement

### Route & Data Summary

| Page | File | Route Path | Auth Requirement | Branch Lock (Front Office) | Data Dependencies (API) |
|---|---|---|---|---|---|
| **Vendor Directory** | [Vendors.jsx](file:///d:/software%20sarga/client/src/pages/Vendors.jsx) | `/dashboard/vendors/*` | `Admin`, `Accountant`, `Front Office` | None | **DELETE** `/vendors/:id`<br>**GET** `/vendors/:id`<br>**GET** `/vendors/:id/spend-trend`<br>**GET** `/vendors/dashboard/stats`<br>**POST** `/vendor-payments`<br>**POST** `/bills-documents/extract-details`<br>**POST** `/vendor-invoices`<br>**GET** `/vendors/:id/statement`<br>**GET** `/vendors/:id/items` |

### Details & Nuances

#### Offline IndexedDB Cache
* **Nuance:** The directory listing of vendors inside [Vendors.jsx](file:///d:/software%20sarga/client/src/components/Vendors.jsx) relies on a local Dexie offline database (`localDb.getVendors`, `localDb.deleteVendor`), which acts as an offline cache layer synchronized asynchronously with the server.
* **Key Composed Components:** [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Vendors](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--staff-mis-client), [VendorDetail](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--staff-mis-client), [VendorDashboard](file:///d:/software%20sarga/COMPONENTS.md#charts--analytics-recharts), [VendorModal](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--staff-mis-client), [InvoiceModal](file:///d:/software%20sarga/COMPONENTS.md#modals--dialogs), [PaymentModal](file:///d:/software%20sarga/COMPONENTS.md#modals--dialogs).

---

## Finance & Payments

### Route & Data Summary

| Page | File | Route Path | Auth Requirement | Branch Lock (Front Office) | Data Dependencies (API) |
|---|---|---|---|---|---|
| **Invoices** | [Invoices.jsx](file:///d:/software%20sarga/client/src/pages/Invoices.jsx) | `/dashboard/sales/invoices` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/customer-payments`<br>**PUT** `/invoice-tracking/:id` |
| **Customer Payments** | [CustomerPayments.jsx](file:///d:/software%20sarga/client/src/pages/CustomerPayments.jsx) | `/dashboard/sales/payments` | `Admin`, `Front Office`, `Accountant` | None | **GET** `/customer-payments`<br>**PATCH** `/customer-payments/:id/verify`<br>**GET** `/requests/discount/my`<br>**POST** `/requests/discount`<br>**GET** `/customer-payments` |
| **Payment Verification** | [PaymentVerification.jsx](file:///d:/software%20sarga/client/src/pages/PaymentVerification.jsx) | `/dashboard/payment-verification` | `Accountant`, `Admin` | None | **GET** `/customer-payments/verification-stats`<br>**GET** `/customer-payments/pending-verification`<br>**PATCH** `/customer-payments/:id/verify` |
| **Expense Hub** | [ExpenseManager.jsx](file:///d:/software%20sarga/client/src/pages/ExpenseManager.jsx) | `/dashboard/expenses` | `Admin`, `Front Office`, `Accountant` | Scopes payroll & cash ledgers | **GET** `/vendor-requests`<br>**POST** `/vendor-requests`<br>**PUT** `/vendor-requests/:id/review`<br>**DELETE** `/payments/:id`<br>**DELETE** `/utility-bills/:id`<br>**GET/POST/DELETE** `/utility-connections`<br>**POST** `/utility-bills`<br>**POST** `/utility-bills/fetch-from-email`<br>**GET** `/reports/utility-statement`<br>**GET** `/transport-dashboard`<br>**GET** `/transport-expenses`<br>**POST/PUT** `/transport-expenses`<br>**DELETE** `/transport-expenses/:id`<br>**GET** `/staff`<br>**GET** `/staff/:id/salary-info`<br>**GET** `/staff/:id/salary-slip/:ym`<br>**POST** `/staff/bulk-pay-salary`<br>**GET** `/rent-locations`<br>**POST/PUT** `/rent-locations`<br>**DELETE** `/rent-locations/:id`<br>**GET** `/petty-cash-dashboard`<br>**GET** `/petty-cash-ledger`<br>**POST/PUT** `/petty-cash`<br>**DELETE** `/petty-cash/:id` |
| **Upload Bills** | [UploadBills.jsx](file:///d:/software%20sarga/client/src/pages/UploadBills.jsx) | `/dashboard/expenses/upload-bills` | `Admin`, `Front Office`, `Accountant` | None | **POST** `/bills-documents/extract-details`<br>**POST** `/bills-documents/upload` |
| **Accounts & GST** | [Accounts.jsx](file:///d:/software%20sarga/client/src/pages/Accounts.jsx) | `/dashboard/accounts` | `Accountant`, `Admin` | None | **GET** `/branches`<br>**GET** `/accounts/gst-summary`<br>**GET** `/accounts/sales-register`<br>**GET** `/accounts/purchase-register`<br>**GET** `/accounts/gst-report`<br>**GET** `/bills-documents`<br>**DELETE** `/bills-documents/:id`<br>**POST/PUT** `/bills-documents`<br>**POST** `/bills-documents/extract-details`<br>**POST** `/bills-documents/upload` |
| **Recurring Invoices** | [RecurringInvoices.jsx](file:///d:/software%20sarga/client/src/pages/RecurringInvoices.jsx) | `/dashboard/recurring-invoices` | `Admin`, `Accountant` | None | **GET** `/recurring-invoices`<br>**GET** `/customers`<br>**POST/PUT** `/recurring-invoices`<br>**DELETE** `/recurring-invoices/:id`<br>**POST** `/recurring-invoices/process` |
| **Accountant Home** | [AccountantDashboard.jsx](file:///d:/software%20sarga/client/src/pages/accounting/AccountantDashboard.jsx) | `/accounting/dashboard` | `Accountant`, `Admin` | None | **GET** `/expense-dashboard` |

### Details & Nuances

#### AI/OCR Bill Processing
* **Nuance:** [UploadBills.jsx](file:///d:/software%20sarga/client/src/pages/UploadBills.jsx) integrates detail extraction and expense categorization via AI. It hits `/bills-documents/extract-details` (OCR) and requests category classifications via `/ai/categorize-expense`, gathering manual corrections through `/ai/categorize-expense/feedback` POST calls.
* **Key Composed Components:** [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Pagination](file:///d:/software%20sarga/COMPONENTS.md#data-display), [ErrorBoundary](file:///d:/software%20sarga/COMPONENTS.md#feedback), [SectionErrorBoundary](file:///d:/software%20sarga/COMPONENTS.md#feedback), [ServerError](file:///d:/software%20sarga/COMPONENTS.md#feedback), [Vendors](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--staff-mis-client), [PaymentModal](file:///d:/software%20sarga/COMPONENTS.md#modals--dialogs).

---

## Staff & Attendance

### Route & Data Summary

| Page | File | Route Path | Auth Requirement | Branch Lock (Front Office) | Data Dependencies (API) |
|---|---|---|---|---|---|
| **Staff Directory** | [StaffManagement.jsx](file:///d:/software%20sarga/client/src/pages/StaffManagement.jsx) | `/dashboard/staff` | `Admin`, `Accountant`, `Front Office` | None | **GET** `/branches`<br>**GET** `/staff`<br>**POST** `/staff`<br>**PUT** `/staff/:id`<br>**DELETE** `/staff/:id/image`<br>**DELETE** `/staff/:id`<br>**PUT** `/staff/:id/reset-password`<br>**GET** `/cctv/attendance/summary`<br>**POST** `/staff/:id/attendance` |
| **Employee Detail** | [EmployeeDetail.jsx](file:///d:/software%20sarga/client/src/pages/EmployeeDetail.jsx) | `/dashboard/employee/:staffId` | `Admin`, `Accountant`, `Front Office` | None | **POST** `/staff/:id/attendance`<br>**GET** `/staff/:id/work-history`<br>**GET** `/staff/:id/salary-info`<br>**GET** `/staff/:id/attendance/:month`<br>**GET** `/staff/:id/salary-calculation/:month`<br>**POST** `/staff/:id/pay-salary`<br>**POST** `/staff/:id/attendance-change-request` |
| **Approval Requests** | [Requests.jsx](file:///d:/software%20sarga/client/src/pages/Requests.jsx) | `/dashboard/requests` | `Admin`, `Accountant` | None | **GET** `/requests/discount`<br>**GET** `/requests/id-change`<br>**GET** `/requests/customer-change`<br>**GET** `/vendor-requests`<br>**GET** `/daily-report/change-requests`<br>**GET** `/requests/attendance`<br>**POST** `/requests/id-change/:id/review`<br>**POST** `/requests/customer-change/:id/review`<br>**POST** `/daily-report/change-requests/:id/review`<br>**POST** `/requests/attendance/:id/review`<br>**POST** `/requests/discount/:id/review`<br>**PUT** `/vendor-requests/:id/review` |
| **CCTV Matcher** | [CCTVAttendance.jsx](file:///d:/software%20sarga/client/src/pages/CCTVAttendance.jsx) | `/dashboard/cctv-attendance` | `Admin`, `Accountant` | None | **GET** `/cctv/attendance/summary`<br>**GET** `/staff`<br>**POST** `/cctv/attendance` |
| **CCTV Settings** | [CCTVManagement.jsx](file:///d:/software%20sarga/client/src/pages/CCTVManagement.jsx) | `/dashboard/cctv-management` | `Admin` | None | **GET** `/cctv/cameras`<br>**GET** `/staff`<br>**GET** `/cctv/cameras/:id`<br>**POST/PUT** `/cctv/cameras`<br>**DELETE** `/cctv/cameras/:id`<br>**GET** `/cctv/cameras/:id/snapshot`<br>**POST** `/cctv/attendance`<br>**GET** `/cctv/face-data/stats`<br>**GET** `/cctv/face-data`<br>**POST** `/cctv/face-data`<br>**DELETE** `/cctv/face-data/:id` |
| **Shift Schedules** | [ScheduleManagement.jsx](file:///d:/software%20sarga/client/src/pages/ScheduleManagement.jsx) | `/dashboard/schedules` | `Admin`, `Accountant` | None | **GET** `/staff`<br>**GET** `/schedules`<br>**GET** `/schedules/latetime`<br>**GET** `/schedules/overtime`<br>**POST/PUT** `/schedules`<br>**DELETE** `/schedules/:id`<br>**PUT** `/schedules/latetime/:id/excuse`<br>**POST** `/schedules/overtime`<br>**PUT** `/schedules/overtime/:id/approve` |
| **My Salaries (Slip)** | [AttendanceSalary.jsx](file:///d:/software%20sarga/client/src/pages/AttendanceSalary.jsx) | `/dashboard/attendance-salary` | Any authenticated user | None | **GET** `/staff-portal/attendance`<br>**GET** `/staff-portal/salary-info` |
| **Staff Leaves** | [LeaveManagement.jsx](file:///d:/software%20sarga/client/src/pages/staff/LeaveManagement.jsx) | `/staff/leaves` | Any authenticated user | None | **GET** `/staff-portal/leaves`<br>**POST** `/staff-portal/leaves`<br>**PUT** `/staff-portal/leaves/:id/cancel` |
| **My Tasks checklist** | [MyTasks.jsx](file:///d:/software%20sarga/client/src/pages/staff/MyTasks.jsx) | `/staff/tasks` | Any authenticated user | None | **GET** `/staff-portal/tasks` |

### Details & Nuances

#### CCTV Facial Data Management
* **Nuance:** [CCTVManagement.jsx](file:///d:/software%20sarga/client/src/pages/CCTVManagement.jsx) coordinates camera streams and facial verification biometric database management. Face profile creation handles multi-part form submissions straight to `/cctv/face-data` along with camera snapshot capture features.
* **Key Composed Components:** [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Pagination](file:///d:/software%20sarga/COMPONENTS.md#data-display), [SecureImage](file:///d:/software%20sarga/COMPONENTS.md#data-display), [ImageCropModal](file:///d:/software%20sarga/COMPONENTS.md#modals--dialogs), [HolidayCalendar](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--staff-mis-client).

---

## Reports & Analytics

### Route & Data Summary

| Page | File | Route Path | Auth Requirement | Branch Lock (Front Office) | Data Dependencies (API) |
|---|---|---|---|---|---|
| **Daily Cash Book** | [DailyReport.jsx](file:///d:/software%20sarga/client/src/pages/DailyReport.jsx) | `/dashboard/daily-report` | `Front Office`, `Admin`, `Accountant` | Locked to user branch | **GET** `/branches`<br>**GET** `/machines/my-books`<br>**GET** `/daily-report/opening-balance`<br>**GET** `/daily-report/laser-live`<br>**GET** `/daily-report/previous-closing`<br>**PUT** `/daily-report/opening-balance`<br>**POST** `/machines/:id/readings`<br>**POST** `/daily-report/change-request`<br>**GET** `/cctv/attendance/summary`<br>**GET** `/daily-report/live-counts`<br>**GET** `/daily-reports/offset`<br>**GET** `/daily-reports/offset/:id`<br>**GET** `/daily-report/credits`<br>**DELETE** `/daily-report/credits/:id`<br>**POST** `/daily-report/credits` |
| **Internal Transactions** | [InternalTransactions.jsx](file:///d:/software%20sarga/client/src/pages/InternalTransactions.jsx) | `/dashboard/internal-transactions` | `Admin`, `Accountant`, `Front Office` | None | Scoped to child component (`InternalTransfers.jsx`) |
| **AI Alerts & Anomaly** | [AIMonitoring.jsx](file:///d:/software%20sarga/client/src/pages/AIMonitoring.jsx) | `/dashboard/ai-monitoring` | `Admin`, `Accountant`, `Front Office` | None | **GET** `/ai/monitoring/dashboard`<br>**GET** `/ai/monitoring/alerts`<br>**POST** `/ai/monitoring/analyze`<br>**PUT** `/ai/monitoring/alerts/:id/resolve` |
| **Sales Forecasting** | [SalesPrediction.jsx](file:///d:/software%20sarga/client/src/pages/SalesPrediction.jsx) | `/dashboard/sales-prediction` | `Admin`, `Accountant`, `Front Office` | None | **GET** `/ai/sales-prediction/forecast`<br>**GET** `/ai/sales-prediction/insights`<br>**GET** `/ai/sales-prediction/stock-recommendations`<br>**GET** `/ai/sales-prediction/seasonal`<br>**GET** `/ai/sales-prediction/purchase-suggestions` |
| **Order Frequency AI** | [OrderPredictions.jsx](file:///d:/software%20sarga/client/src/pages/OrderPredictions.jsx) | `/dashboard/order-predictions` | `Admin`, `Accountant`, `Front Office` | None | **GET** `/branches`<br>**GET** `/ai/order-predictions/predictions`<br>**GET** `/ai/order-predictions/predictions/customer/:id` |
| **Exportable PDFs** | [Reports.jsx](file:///d:/software%20sarga/client/src/pages/Reports.jsx) | `/dashboard/reports` | `Admin`, `Accountant` | None | **GET** `/reports/:reportType` |
| **Designer Analytics** | [DesignAnalytics.jsx](file:///d:/software%20sarga/client/src/pages/designer/DesignAnalytics.jsx) | `/designer/analytics` | `Designer`, `Admin` | None | **GET** `/design-workspace/bookings`<br>**GET** `/admin/designers` |
| **Global Settings** | [SettingsPage.jsx](file:///d:/software%20sarga/client/src/pages/SettingsPage.jsx) | `/dashboard/settings` | `Admin` | None | **GET** `/company-settings`<br>**PUT** `/company-settings`<br>**GET** `/tax-settings`<br>**POST/PUT** `/tax-settings`<br>**DELETE** `/tax-settings/:id`<br>**GET** `/payment-modes`<br>**POST/PUT** `/payment-modes`<br>**DELETE** `/payment-modes/:id`<br>**GET** `/i18n/:locale`<br>**PUT** `/i18n/:locale` |
| **Branches** | [Branches.jsx](file:///d:/software%20sarga/client/src/pages/Branches.jsx) | `/dashboard/branches` | `Admin` | None | **GET** `/branches`<br>**POST/PUT** `/branches`<br>**DELETE** `/branches/:id` |

### Details & Nuances

#### Daily Cash Book & Closing
* **Nuance:** [DailyReport.jsx](file:///d:/software%20sarga/client/src/pages/DailyReport.jsx) represents the core cash book reconciliation interface. Reconciling transaction logs, laser counts, collections, and credit payments requires loading a substantial set of concurrent endpoints. If a lock override is requested, it issues a change request via `/daily-report/change-request`.
* **Sub-Component Inclusion:** The page lazy-loads the helper layout [DailyReportPDFExport.jsx](file:///d:/software%20sarga/client/src/pages/DailyReportPDFExport.jsx) directly (line 11) to manage PDF exports.
* **Key Composed Components:** [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [BranchSelect](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Skeleton](file:///d:/software%20sarga/COMPONENTS.md#data-display).

---

## Customer-Facing Website

This section covers the public customer-facing pages configured in the client build and their corresponding MIS CMS administration portals.

### Route & Data Summary (Public Pages)

All public page routes utilize unified API wrapper methods defined in [api.js (Website)](file:///d:/software%20sarga/website/src/api.js) rather than direct URL axios requests.

| Page | File | Route Path | Auth Requirement | Data Dependencies (API Helper / Endpoint) |
|---|---|---|---|---|
| **Home** | [Home.jsx](file:///d:/software%20sarga/website/src/pages/Home.jsx) | `/` | Public | None |
| **Services Showcase** | [Services.jsx](file:///d:/software%20sarga/website/src/pages/Services.jsx) | `/services` | Public | None |
| **Product Catalog** | [Products.jsx](file:///d:/software%20sarga/website/src/pages/Products.jsx) | `/products` | Public | **GET** `/website/products` (via `getProducts`) <br>**GET** `/website/categories` (via `getCategories`) |
| **Order Tracking** | [TrackOrder.jsx](file:///d:/software%20sarga/website/src/pages/TrackOrder.jsx) | `/track` | Public | **GET** `/website/track/:jobCode` (via `trackJob`) |
| **Sign In / OTP** | [SignIn.jsx](file:///d:/software%20sarga/website/src/pages/SignIn.jsx) | `/signin` | Public | **POST** `/website/customer/send-otp` (via `customerSendOtp`) <br>**POST** `/website/customer/verify-otp` (via `customerVerifyOtp`) |
| **Customer Portal** | [PortalDashboard.jsx](file:///d:/software%20sarga/website/src/pages/PortalDashboard.jsx) | `/portal/dashboard` | Customer (Authenticated) | **GET** `/customers/:id/dashboard` (via `getCustomerDashboard`) |
| **Proof Review** | [JobDetail.jsx](file:///d:/software%20sarga/website/src/pages/JobDetail.jsx) | `/portal/job/:id` | Customer (Authenticated) | **GET** `/website/job/:id` (via `getWebsiteJob`) <br>**POST** `/website/jobs/:id/proofs/:proofId/review-customer` (via `reviewProofCustomer`) |
| **Contact Form** | [Contact.jsx](file:///d:/software%20sarga/website/src/pages/Contact.jsx) | `/contact` | Public | **POST** `/website/inquiry` (via `submitInquiry`) |
| **Privacy Policy** | [Privacy.jsx](file:///d:/software%20sarga/website/src/pages/Privacy.jsx) | `/privacy` | Public | None |
| **Terms of Service** | [Terms.jsx](file:///d:/software%20sarga/website/src/pages/Terms.jsx) | `/terms` | Public | None |
| **Design Canvas Hub** | [DesignHub.jsx](file:///d:/software%20sarga/website/src/pages/design/DesignHub.jsx) | `/design` | Public | None |
| **Photo Layout Planner**| [PhotoSheetLayout.jsx](file:///d:/software%20sarga/website/src/pages/design/PhotoSheetLayout.jsx) | `/design/sheet-layout` | Public | None |
| **PhotoBook Designer** | [AlbumDesigner.jsx](file:///d:/software%20sarga/website/src/pages/design/AlbumDesigner.jsx) | `/design/album` | Public | None |
| **Fabric Editor Hub** | [FabricEditorHub.jsx](file:///d:/software%20sarga/website/src/pages/design/print-editor/FabricEditorHub.jsx) | `/design/print-editor` | Public | None |
| **Print & Gift Editor** | [PrintEditor.jsx](file:///d:/software%20sarga/website/src/pages/design/print-editor/PrintEditor.jsx) | `/design/print-editor/:productId`<br>`/design/print-editor/:productId/:designId` | Public | Uploads assets to Cloudinary directly |
| **Upload Canvas File** | [UploadDesign.jsx](file:///d:/software%20sarga/website/src/pages/design/UploadDesign.jsx) | `/design/upload-design` | Public | **POST** `/website/upload-design` (via `uploadDesign`) |

### Route & Data Summary (CMS Admin Pages)

These pages run in the Staff MIS client interface to administer customer-facing aspects of the system.

| Page | File | Route Path | Auth Requirement | Data Dependencies (API) |
|---|---|---|---|---|
| **Chatbot Training** | [ChatbotTraining.jsx](file:///d:/software%20sarga/client/src/pages/admin/ChatbotTraining.jsx) | `/dashboard/admin/chatbot-training` | `Admin` | **GET** `/chatbot/model-status`<br>**GET** `/chatbot/training-examples`<br>**GET** `/chatbot/logs`<br>**GET** `/chatbot/model-versions`<br>**POST** `/chatbot/retrain`<br>**POST** `/chatbot/label`<br>**POST** `/chatbot/training-examples` |
| **Customer Reviews** | [ReviewsManagement.jsx](file:///d:/software%20sarga/client/src/pages/admin/ReviewsManagement.jsx) | `/dashboard/admin/reviews` | `Admin` | **GET** `/reviews`<br>**POST** `/reviews`<br>**PUT** `/reviews/:id`<br>**PUT** `/reviews/:id/feature`<br>**DELETE** `/reviews/:id`<br>**POST** `/website/reviews/fetch-google` |
| **Artwork Uploads** | [ArtworkManager.jsx](file:///d:/software%20sarga/client/src/pages/admin/ArtworkManager.jsx) | `/dashboard/admin/artwork` | `Admin` | **GET** `/artwork/list`<br>**GET** `/artwork/:id`<br>**GET** `/artwork/designers/list`<br>**PUT** `/artwork/:id/status`<br>**PUT** `/artwork/:id/assign-designer`<br>**PUT** `/artwork/:id/notes`<br>**DELETE** `/artwork/:id` |
| **Portfolio Manager** | [PortfolioManager.jsx](file:///d:/software%20sarga/client/src/pages/admin/PortfolioManager.jsx) | `/dashboard/admin/portfolio` | `Admin` | **GET** `/portfolio`<br>**GET** `/portfolio/:id`<br>**POST** `/portfolio`<br>**POST** `/portfolio/upload`<br>**PUT** `/portfolio/:id`<br>**DELETE** `/portfolio/:id` |
| **Promotions Manager** | [PromotionsManager.jsx](file:///d:/software%20sarga/client/src/pages/admin/PromotionsManager.jsx) | `/dashboard/admin/promotions` | `Admin` | **GET** `/promotions`<br>**POST** `/promotions`<br>**PUT** `/promotions/:id`<br>**DELETE** `/promotions/:id` |
| **Pickup Bookings** | [PickupBookings.jsx](file:///d:/software%20sarga/client/src/pages/admin/PickupBookings.jsx) | `/dashboard/admin/pickup-bookings` | `Admin` | **GET** `/branches`<br>**GET** `/pickup/bookings`<br>**PUT** `/pickup/bookings/:id/status` |
| **Delivery Rules** | [DeliveryRulesManager.jsx](file:///d:/software%20sarga/client/src/pages/admin/DeliveryRulesManager.jsx) | `/dashboard/admin/delivery-rules` | `Admin` | **GET** `/delivery/rules`<br>**POST** `/delivery/rules`<br>**PUT** `/delivery/rules/:id`<br>**DELETE** `/delivery/rules/:id` |
| **Translations CMS** | [TranslationsManager.jsx](file:///d:/software%20sarga/client/src/pages/admin/TranslationsManager.jsx) | `/dashboard/admin/translations` | `Admin` | **GET** `/translations`<br>**POST** `/translations`<br>**DELETE** `/translations/:id` |
| **Blog CMS** | [BlogCMS.jsx](file:///d:/software%20sarga/client/src/pages/BlogCMS.jsx) | `/dashboard/blog-cms` | `Admin`, `Front Office`, `Designer` | **GET** `/blog/admin/posts`<br>**GET** `/blog/admin/authors`<br>**GET** `/blog/admin/analytics`<br>**GET** `/blog/posts/:slug`<br>**POST/PUT** `/blog/admin/posts`<br>**DELETE** `/blog/admin/posts/:id`<br>**POST** `/blog/admin/authors` |

### Details & Nuances

#### Key Composed Components
* **Website Layouts:** Composes website-specific global components [Navbar](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Footer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [Chatbot](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--customer-facing-website), and [CartDrawer](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--customer-facing-website).
* **CMS Components:** Composes [PageContainer](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [BranchSelect](file:///d:/software%20sarga/COMPONENTS.md#layout--navigation), [ChatWidget](file:///d:/software%20sarga/COMPONENTS.md#domain-specific--staff-mis-client).
* **Known Issues / Silent Catches:** Empty catch blocks in [PickupBookings.jsx](file:///d:/software%20sarga/client/src/pages/admin/PickupBookings.jsx) on line 17 and in [ChatbotTraining.jsx](file:///d:/software%20sarga/client/src/pages/admin/ChatbotTraining.jsx) on lines 46, 60, 91.

---

## Unrouted / Orphaned Pages

These are unrouted or orphaned page components that exist in the codebase but are currently disconnected from active routes in [App.jsx (Client)](file:///d:/software%20sarga/client/src/App.jsx) or [App.jsx (Website)](file:///d:/software%20sarga/website/src/App.jsx).

### Client Portal (`client/src/pages/`)

* **[AccessRestricted.jsx](file:///d:/software%20sarga/client/src/pages/AccessRestricted.jsx)**
  * *Purpose:* Renders a generic "403 Forbidden" unauthorized access panel.
  * *Classification:* Dev-Utility (Provides security fallbacks).
  * *Recommendation:* **Keep & Resurrect**; configure as the redirect fallback for unauthorized role access inside `ProtectedRoute`.
* **[DailyReportPDFExport.jsx](file:///d:/software%20sarga/client/src/pages/DailyReportPDFExport.jsx)**
  * *Purpose:* Generates printable cash book reports.
  * *Classification:* Active / Composed (Composed inside [DailyReport.jsx](file:///d:/software%20sarga/client/src/pages/DailyReport.jsx)).
  * *Recommendation:* **DO NOT delete**; misclassified as orphaned, it is lazy-imported and active.
* **[InternalTransfers.jsx](file:///d:/software%20sarga/client/src/pages/InternalTransfers.jsx)**
  * *Purpose:* Grid for stock transfers.
  * *Classification:* Active / Composed (Composed inside [InternalTransactions.jsx](file:///d:/software%20sarga/client/src/pages/InternalTransactions.jsx)).
  * *Recommendation:* **DO NOT delete**; active sub-component layout.
* **[InternalUsageReport.jsx](file:///d:/software%20sarga/client/src/pages/InternalUsageReport.jsx)**
  * *Purpose:* Tracks printing consumption across departments.
  * *Classification:* Dev-Utility.
  * *Recommendation:* **Worth resurrecting**; provides valuable internal department print analysis.
* **Other Unrouted Pages (Cleaned Up / Deleted)**
  * The following orphaned/unrouted files have been cleared of code contents:
    * `PaperManagement.jsx`
    * `AccountsLayout.jsx`
    * `AdminLayout.jsx`
    * `InventoryLayout.jsx`
    * `IDChangeRequests.jsx`
    * `InternalTransactions.jsx`
    * `RateCalculator.jsx`
    * `OfflineTestPage.jsx`
    * `OfflineTestPage.css`
    * `QRDiagnostic.jsx`
    * `SummaryWidgets.jsx`
    * `design-studio/` (folder and all sub-files)

### Website Portal (`website/src/pages/`)

* **[ArtworkUpload.jsx](file:///d:/software%20sarga/website/src/pages/ArtworkUpload.jsx)**
  * *Purpose:* Customer upload form for design print files.
  * *Classification:* Mid-Development.
  * *Recommendation:* **Worth resurrecting** to enable anonymous customer file uploads.
* **[BlogList.jsx](file:///d:/software%20sarga/website/src/pages/BlogList.jsx) & [BlogPostDetail.jsx](file:///d:/software%20sarga/website/src/pages/BlogPostDetail.jsx)**
  * *Purpose:* Customer blogs showcase.
  * *Classification:* Mid-Development.
  * *Recommendation:* **Worth resurrecting** to connect published BlogCMS entries.
* **[Checkout.jsx](file:///d:/software%20sarga/website/src/pages/Checkout.jsx)**
  * *Purpose:* Customer checkout payment form.
  * *Classification:* Mid-Development / Critical Omission.
  * *Recommendation:* **Critically worth resurrecting**; route to `/checkout` in website `App.jsx` to enable online orders.
* **[DesignBooking.jsx](file:///d:/software%20sarga/website/src/pages/DesignBooking.jsx)**
  * *Purpose:* Booking form for print consultation sessions.
  * *Classification:* Mid-Development.
  * *Recommendation:* **Worth resurrecting** if online scheduler launches.
* **[PickupBooking.jsx](file:///d:/software%20sarga/website/src/pages/PickupBooking.jsx)**
  * *Purpose:* Order collection pickup scheduler.
  * *Classification:* Mid-Development.
  * *Recommendation:* **Worth resurrecting** once pickup rules are active.
* **[Portfolio.jsx](file:///d:/software%20sarga/website/src/pages/Portfolio.jsx)**
  * *Purpose:* Visual gallery of completed print work.
  * *Classification:* Mid-Development.
  * *Recommendation:* **Worth resurrecting** to improve customer marketing pages.
* **[PricingPage.jsx](file:///d:/software%20sarga/website/src/pages/PricingPage.jsx)**
  * *Purpose:* Dynamic service pricing calculator widget.
  * *Classification:* Mid-Development.
  * *Recommendation:* **Worth resurrecting** to enable pricing estimates.
* **[SampleRequest.jsx](file:///d:/software%20sarga/website/src/pages/SampleRequest.jsx)**
  * *Purpose:* Request form for physical print media samples.
  * *Classification:* Mid-Development.
  * *Recommendation:* **Worth resurrecting** to capture print leads.
* **[EditorOnboarding.jsx](file:///d:/software%20sarga/website/src/pages/design/print-editor/EditorOnboarding.jsx)**
  * *Purpose:* Tooltips guide for the canvas designer.
  * *Classification:* Dev-Utility.
  * *Recommendation:* **Keep** in editor component sub-flow.
* **OrderView.jsx**
  * *Purpose:* Post-checkout Razorpay transaction receipt details page.
  * *Classification:* Mid-Development.
  * *Recommendation:* **Worth resurrecting**; route as checkout success landing page.

---

## Last Updated
* **Timestamp**: 2026-06-22
* **Changes**: Noted branch lock lock fixes, updated unrouted/orphaned pages clean up details.
