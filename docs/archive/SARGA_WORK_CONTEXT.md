# SARGA PRINTS — MASTER WORK CONTEXT FILE
> Last Updated: 2026-04-07
> Updated By: Copilot Agent
> Read this entire file before starting any task.

---

## COMPLETED (RECENT UI ENHANCEMENTS)

- Installed `three` and added a lightweight 3D hero background (`HeroBg3D`) using <canvas> + Three.js for subtle layered plane sheets.
- Added `useTilt` hook for card tilt interactions and `useMagnetic` hook for magnetic button CTAs.
- Implemented `CustomCursor` (desktop only) and a `Marquee` component for hero/product names.
- Added `Card3DStack` showcase component and updated `Summary` landing page to include these features.
- Global CSS utilities added: `tilt-card`, cursor hiding, marquee styles, and GPU-accelerated 3D will-change helpers.


## 1. PROJECT OVERVIEW

- **Business**: Sarga Prints — 30-year-old printing business
- **Branches**: Perambra, Meppayur, Kerala
- **Services**: Offset printing, digital printing, specialty printing
- **Software Purpose**: Internal management system for jobs, billing, staff, attendance, expenses, AI features
- **Developer**: Anirudh (owner), using GitHub Copilot agents — does not write code manually
- **Stack**:
  - Frontend: React + Vite
  - Backend: Express.js (Node.js)
  - Database: MySQL
  - Auth: Firebase Phone OTP (customer portal)
  - Repo: github.com/anirudhsargas/software-sarga

---

## 2. REPOSITORY STRUCTURE

```
/
├── client/
│   ├── public/
│   │   ├── icons/
│   │   ├── manifest.json
│   │   └── syncWorker.js
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── AnomalyPanel.jsx
│   │   │   ├── Button.jsx
│   │   │   ├── ConfirmModal.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── ForecastChart.jsx
│   │   │   ├── HolidayCalendar.jsx
│   │   │   ├── ImageCropModal.jsx
│   │   │   ├── InsightsPanel.jsx
│   │   │   ├── LoadingButton.jsx
│   │   │   ├── MeterVerification.jsx
│   │   │   ├── OfflineStatusBar.jsx
│   │   │   ├── OrderForecastWidget.jsx
│   │   │   ├── OTPVerification.jsx
│   │   │   ├── Pagination.jsx
│   │   │   ├── PaperOptimizer.jsx
│   │   │   ├── ProgressBar.jsx
│   │   │   ├── ReceiptModal.jsx
│   │   │   ├── RequiresConnection.jsx
│   │   │   ├── ScannerModal.jsx
│   │   │   ├── SecureImage.jsx
│   │   │   ├── ServerError.jsx
│   │   │   ├── SkeletonLoader.jsx
│   │   │   ├── SmartSearch.jsx
│   │   │   ├── SmartSearchBar.jsx
│   │   │   ├── SyncStatusBar.jsx
│   │   │   └── UpsellSuggestions.jsx
│   │   ├── constants/
│   │   │   └── index.js
│   │   ├── contexts/
│   │   │   └── ConfirmContext.jsx
│   │   ├── hooks/
│   │   │   ├── useApiRequest.js
│   │   │   ├── useAuth.jsx
│   │   │   ├── useDebounce.js
│   │   │   ├── useOffline.js
│   │   │   ├── useOptimistic.js
│   │   │   ├── useOTP.js
│   │   │   ├── usePagination.js
│   │   │   ├── usePolling.js
│   │   │   └── useSyncStatus.js
│   │   ├── pages/
│   │   │   ├── AccountantDashboard.jsx
│   │   │   ├── Accounts.jsx
│   │   │   ├── AIMonitoring.jsx
│   │   │   ├── AttendanceSalary.jsx
│   │   │   ├── Billing.jsx
│   │   │   ├── Branches.jsx
│   │   │   ├── CCTVAttendance.jsx
│   │   │   ├── CCTVManagement.jsx
│   │   │   ├── ChangePassword.jsx
│   │   │   ├── CouponManagement.jsx
│   │   │   ├── CustomerDetails.jsx
│   │   │   ├── CustomerPayments.jsx
│   │   │   ├── Customers.jsx
│   │   │   ├── DailyReport.jsx
│   │   │   ├── DailyReportOffset.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── DesignChecker.jsx
│   │   │   ├── DesignerDashboard.jsx
│   │   │   ├── EmployeeDetail.jsx
│   │   │   ├── expense-manager/ (sub-module)
│   │   │   ├── ExpenseManager.jsx
│   │   │   ├── FrontOffice.jsx
│   │   │   ├── IDChangeRequests.jsx
│   │   │   ├── Inventory.jsx
│   │   │   ├── JobDetail.jsx
│   │   │   ├── JobPriority.jsx
│   │   │   ├── Jobs.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── MachineManagement.jsx
│   │   │   ├── NotFound.jsx
│   │   │   ├── OfflineTestPage.jsx
│   │   │   ├── OrderPredictions.jsx
│   │   │   ├── OtherStaffDashboard.jsx
│   │   │   ├── PaperLayoutGenerator.jsx
│   │   │   ├── Payments.jsx
│   │   │   ├── PaymentVerification.jsx
│   │   │   ├── PlateManagement.jsx
│   │   │   ├── PrinterDashboard.jsx
│   │   │   ├── ProductionTracker.jsx
│   │   │   ├── ProductLibrary.jsx
│   │   │   ├── QRDiagnostic.jsx
│   │   │   ├── Reports.jsx
│   │   │   ├── Requests.jsx
│   │   │   ├── SalesPrediction.jsx
│   │   │   ├── StaffManagement.jsx
│   │   │   ├── StockPlanning.jsx
│   │   │   ├── StockVerification.jsx
│   │   │   └── Summary.jsx
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   ├── auth.js
│   │   │   ├── backgroundSync.js
│   │   │   ├── firebase.js
│   │   │   ├── localDb.js
│   │   │   ├── offlineDb.js
│   │   │   ├── offlineSync.js
│   │   │   ├── serverTime.js
│   │   │   ├── syncWorkerManager.js
│   │   │   └── utils.js
│   │   ├── styles/
│   │   │   └── buttons.css
│   │   ├── utils/
│   │   │   ├── imageCrop.js
│   │   │   ├── invoicePdf.js
│   │   │   ├── paperOptimizer.js
│   │   │   ├── pricing.js
│   │   │   ├── ripple.js
│   │   │   └── whatsapp.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
├── server/
│   ├── config/
│   │   └── ml.js
│   ├── helpers/
│   │   ├── anomalyDetection.js
│   │   ├── billExtraction.js
│   │   ├── designAnalyzer.js
│   │   ├── index.js
│   │   ├── jobCost.js
│   │   ├── layoutOptimizer.js
│   │   ├── pagination.js
│   │   └── smartSearch.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── branchFilter.js
│   │   ├── compressImageUpload.js
│   │   └── validate.js
│   ├── migrations/
│   │   ├── 2026-02-25-add-category-to-jobs.sql
│   │   ├── 2026-02-25-add-opening-count-to-assignments.sql
│   │   ├── 2026-02-job-status-profit.sql
│   │   ├── 2026-03-stock-verification.sql
│   │   └── add_missing_indexes.sql
│   ├── routes/
│   │   ├── accounts.js
│   │   ├── aiMonitoring.js
│   │   ├── aiSearch.js
│   │   ├── aiTurnaround.js
│   │   ├── aiUpsell.js
│   │   ├── anomalies.js
│   │   ├── auditInvoice.js
│   │   ├── auth.js
│   │   ├── backup.js
│   │   ├── branches.js
│   │   ├── cctvAttendance.js
│   │   ├── cctvCameras.js
│   │   ├── coupons.js
│   │   ├── customerDesigns.js
│   │   ├── customerPayments.js
│   │   ├── customers.js
│   │   ├── dailyReports.js
│   │   ├── dailyReportUnified.js
│   │   ├── designCheck.js
│   │   ├── expenseCategorizer.js
│   │   ├── expenses-extended.js
│   │   ├── expenses.js
│   │   ├── finance.js
│   │   ├── forecast.js
│   │   ├── frontOffice.js
│   │   ├── insights.js
│   │   ├── inventory.js
│   │   ├── jobPriority.js
│   │   ├── jobs.js
│   │   ├── machines.js
│   │   ├── orderForecast.js
│   │   ├── orderPredictions.js
│   │   ├── paperLayout.js
│   │   ├── payments.js
│   │   ├── productionTracker.js
│   │   ├── products.js
│   │   ├── requests.js
│   │   ├── salesPrediction.js
│   │   ├── search.js
│   │   ├── seasonal.js
│   │   ├── staff.js
│   │   ├── staffDashboard.js
│   │   ├── stockPlanning.js
│   │   ├── stockRequests.js
│   │   ├── stockVerification.js
│   │   ├── upsell.js
│   │   └── vendors.js
│   ├── schemas/
│   │   └── paymentSchemas.js
│   ├── services/
│   │   └── mprIntegration.js
│   ├── utils/
│   │   └── ocrParser.js
│   ├── uploads/
│   ├── backups/
│   ├── reports/
│   ├── scripts/
│   ├── dev-scripts/
│   ├── database.js
│   ├── index.js
│   └── package.json
├── ml-service/
│   ├── app.py
│   ├── expense_categorizer.py
│   ├── fraud_monitor.py
│   ├── insights.py
│   ├── order_predict.py
│   ├── requirements.txt
│   ├── sales_model.py
│   ├── seasonal.py
│   ├── stock.py
│   ├── turnaround.py
│   └── upsell.py
├── tools/
│   ├── config.example.json
│   ├── face_recognition_attendance.py
│   ├── probe-bizhub.js
│   └── README.md
├── SARGA_WORK_CONTEXT.md  ← this file
├── package.json
├── deploy.ps1
├── start.ps1
├── sarga_db_backup.sql
└── [documentation .md files]
```

---

## 3. ALL FEATURES & MODULES

### ✅ Completed & Working
- [x] Jobs / Order management (Jobs.jsx, JobDetail.jsx, jobs.js routes)
- [x] Billing & invoicing (Billing.jsx, auditInvoice.js routes)
- [x] Staff dashboard (PrinterDashboard.jsx, DesignerDashboard.jsx, OtherStaffDashboard.jsx, staffDashboard.js)
- [x] Salary management (AttendanceSalary.jsx, salary_records / salary_tracking tables)
- [x] Attendance system (AttendanceSalary.jsx, sarga_staff_attendance table)
- [x] Expense manager with OCR bill upload (ExpenseManager.jsx, expense-manager/ sub-module, expenses.js, expenses-extended.js)
- [x] QR code scanning (ScannerModal.jsx, QRDiagnostic.jsx, inventory.js QR endpoints)
- [x] AI monitoring module (AIMonitoring.jsx, aiMonitoring.js routes, fraud_monitor.py)
- [x] Sales prediction (SalesPrediction.jsx, salesPrediction.js, sales_model.py)
- [x] Offline PWA support (syncWorker.js, offlineDb.js, backgroundSync.js, useOffline.js, manifest.json)
- [x] Branch management — Perambur + Meppayur (Branches.jsx, branches.js routes)
- [x] Skeleton loading states (SkeletonLoader.jsx)
- [x] Pagination on all pages (Pagination.jsx, usePagination.js, server helpers/pagination.js)
- [x] Multi-method payment validation (paymentSchemas.js, CustomerPayments.jsx)
- [x] Background sync with Web Worker (syncWorkerManager.js, syncWorker.js)
- [x] Optimistic UI updates (useOptimistic.js hook)
- [x] Button ripple effects (ripple.js utility, buttons.css)
- [x] Firebase OTP phone auth — customer portal (firebase.js, OTPVerification.jsx, useOTP.js)
- [x] Customer management (Customers.jsx, CustomerDetails.jsx, customers.js routes)
- [x] Front office dashboard (FrontOffice.jsx, frontOffice.js routes)
- [x] Product library & pricing (ProductLibrary.jsx, products.js routes, pricing.js util)
- [x] Machine management (MachineManagement.jsx, machines.js routes)
- [x] Daily reports — offset & unified (DailyReport.jsx, DailyReportOffset.jsx, dailyReports.js, dailyReportUnified.js)
- [x] Payment verification (PaymentVerification.jsx, customerPayments.js verify endpoints)
- [x] Inventory management (Inventory.jsx, inventory.js routes)
- [x] Smart search (SmartSearch.jsx, SmartSearchBar.jsx, aiSearch.js, search.js, smartSearch.js helper)
- [x] Coupon management (CouponManagement.jsx, coupons.js routes)
- [x] Accountant dashboard (AccountantDashboard.jsx, accounts.js routes)
- [x] Reports & analytics (Reports.jsx, Summary.jsx, expenses-extended.js report endpoints)
- [x] Vendor management (vendors.js routes, expenses.js vendor-requests)
- [x] Backup & restore (backup.js routes)
- [x] Staff requests & ID change (Requests.jsx, IDChangeRequests.jsx, requests.js routes)
- [x] Production tracker (ProductionTracker.jsx, productionTracker.js routes)
- [x] Paper layout generator (PaperLayoutGenerator.jsx, paperLayout.js routes, layoutOptimizer.js)
- [x] Stock verification (StockVerification.jsx, stockVerification.js routes)
- [x] EMI & KURI finance management (finance.js routes)
- [x] Petty cash ledger (expenses-extended.js petty-cash endpoints)
- [x] Audit logging (sarga_audit_logs table, auditInvoice.js)
- [x] Design management (DesignChecker.jsx, customerDesigns.js routes)
- [x] WhatsApp integration utility (whatsapp.js)
- [x] Image crop & upload (ImageCropModal.jsx, imageCrop.js, compressImageUpload.js middleware)
- [x] Invoice PDF generation (invoicePdf.js util)
- [x] Confirm modal context (ConfirmContext.jsx, ConfirmModal.jsx)
- [x] Error boundary (ErrorBoundary.jsx)
- [x] Anomaly detection (AnomalyPanel.jsx, anomalies.js routes, anomalyDetection.js helper)
- [x] Order forecast widget (OrderForecastWidget.jsx, orderForecast.js, orderPredictions.js)
- [x] Job priority management (JobPriority.jsx, jobPriority.js routes)
- [x] Plate management (PlateManagement.jsx)
- [x] Stock planning (StockPlanning.jsx, stockPlanning.js routes, stock.py ML)

### 🔄 In Progress
- [ ] Customer portal (order tracking, bill viewing, design approval) — customer-facing pages not yet complete
- [ ] CCTV face recognition attendance (CCTVAttendance.jsx, CCTVManagement.jsx, face_recognition_attendance.py — Hikvision cameras, Python local scripts)
- [ ] KSEB bill tracking via Puppeteer
- [ ] Gmail IMAP payment confirmation integration

### 📋 Planned (42-Day Roadmap: Apr 16 – May 27)
- Weeks 1–3: Bug fixes and UI polish
- Week 4+: Customer portal, AI/ML features, face recognition integration

### 🤖 AI/ML Features (via ml-service Python Flask)
- [x] Fraud detection (fraud_monitor.py, aiMonitoring.js)
- [x] Sales forecasting (sales_model.py, forecast.js)
- [x] Seasonal analysis (seasonal.py, seasonal.js)
- [x] Stock planning (stock.py, stockPlanning.js)
- [x] Upsell suggestions — Apriori algorithm (upsell.py, aiUpsell.js)
- [x] Order predictions (order_predict.py, orderPredictions.js)
- [x] Turnaround prediction — Gradient Boosted Regression (turnaround.py, aiTurnaround.js)
- [x] Expense categorization — TF-IDF (expense_categorizer.py, expenseCategorizer.js)
- [x] Business insights (insights.py, insights.js)

---

## Completed Recently

- Chatbot NLP microservice (Flask) with training, prediction, continuous learning, and DB tables added under `ml_service/`.
- Admin Chatbot Training UI: `client/src/pages/admin/ChatbotTraining.jsx` and `client/src/components/chatbot/ChatWidget.jsx` added to the frontend.

---

## 4. API ROUTES

**Total endpoints: ~236**

| Method | Route | Description | File |
|--------|-------|-------------|------|
| GET | `/api/server-time` | Server time (tamper-proof) | index.js |
| GET | `/api/ping` | Health check with DB ping | index.js |
| **Auth** | | | |
| POST | `/api/auth/login` | User login | auth.js |
| POST | `/api/auth/change-password` | Change password | auth.js |
| GET | `/api/staff/me` | Get current staff profile | auth.js |
| PUT | `/api/staff/me` | Update current staff profile | auth.js |
| **Branches** | | | |
| GET | `/api/branches` | List all branches | branches.js |
| POST | `/api/branches` | Create branch | branches.js |
| PUT | `/api/branches/:id` | Update branch | branches.js |
| DELETE | `/api/branches/:id` | Delete branch | branches.js |
| **Payments** | | | |
| GET | `/api/payments` | List payments | payments.js |
| POST | `/api/payments` | Add payment | payments.js |
| DELETE | `/api/payments/:id` | Delete payment (Admin Only) | payments.js |
| GET | `/api/payment-methods` | List payment methods | payments.js |
| POST | `/api/payment-methods` | Add payment method | payments.js |
| PUT | `/api/payment-methods/:id` | Update payment method | payments.js |
| DELETE | `/api/payment-methods/:id` | Delete payment method | payments.js |
| **Customer Payments** | | | |
| GET | `/api/customer-payments` | List customer payments | customerPayments.js |
| POST | `/api/customer-payments` | Add customer payment | customerPayments.js |
| POST | `/api/customer-payments/refund` | Process refund | customerPayments.js |
| GET | `/api/stats/dashboard` | Payment stats dashboard | customerPayments.js |
| GET | `/api/customer-payments/pending-verification` | List pending payments | customerPayments.js |
| PATCH | `/api/customer-payments/:id/verify` | Verify payment | customerPayments.js |
| GET | `/api/customer-payments/verification-stats` | Payment verification stats | customerPayments.js |
| **Customers** | | | |
| GET | `/api/customers` | List customers | customers.js |
| GET | `/api/customers/:id` | Get customer details | customers.js |
| POST | `/api/customers` | Add customer | customers.js |
| PUT | `/api/customers/:id` | Update customer | customers.js |
| DELETE | `/api/customers/:id` | Delete customer | customers.js |
| GET | `/api/customers/:id/dashboard` | Customer dashboard | customers.js |
| **Customer Designs** | | | |
| GET | `/api/customers/:id/designs` | List designs for customer | customerDesigns.js |
| POST | `/api/customers/:id/designs` | Add design for customer | customerDesigns.js |
| PUT | `/api/customers/:customerId/designs/:designId` | Update design | customerDesigns.js |
| DELETE | `/api/customers/:customerId/designs/:designId` | Delete design | customerDesigns.js |
| GET | `/api/jobs/:jobId/designs` | List designs for job | customerDesigns.js |
| POST | `/api/jobs/:jobId/designs` | Add design for job | customerDesigns.js |
| DELETE | `/api/jobs/:jobId/designs/:designId` | Delete job design | customerDesigns.js |
| **Vendors** | | | |
| GET | `/api/vendors` | List vendors | vendors.js |
| POST | `/api/vendors` | Add vendor | vendors.js |
| PUT | `/api/vendors/:id` | Update vendor | vendors.js |
| DELETE | `/api/vendors/:id` | Delete vendor | vendors.js |
| **Staff** | | | |
| POST | `/api/staff` | Add staff | staff.js |
| GET | `/api/staff` | List staff | staff.js |
| PUT | `/api/staff/:id` | Update staff | staff.js |
| DELETE | `/api/staff/:id` | Delete staff | staff.js |
| DELETE | `/api/staff/:id/image` | Delete staff image | staff.js |
| PUT | `/api/staff/:id/reset-password` | Reset staff password | staff.js |
| GET | `/api/staff/dashboard` | Staff dashboard | staffDashboard.js |
| **Requests** | | | |
| GET | `/api/requests` | List requests | requests.js |
| POST | `/api/requests` | Create request | requests.js |
| PUT | `/api/requests/:id` | Update request | requests.js |
| DELETE | `/api/requests/:id` | Delete request | requests.js |
| **Jobs** | | | |
| GET | `/api/jobs` | List jobs | jobs.js |
| GET | `/api/jobs/completed-by-date` | Jobs completed by date | jobs.js |
| GET | `/api/customers/:id/jobs` | Jobs for customer | jobs.js |
| POST | `/api/jobs/bulk` | Bulk create jobs | jobs.js |
| POST | `/api/jobs` | Create single job | jobs.js |
| GET | `/api/product-hierarchy` | Fetch product hierarchy tree | jobs.js |
| GET | `/api/jobs/assignments/suggestions` | Suggest staff for jobs | jobs.js |
| GET | `/api/jobs/assignments/all` | All job assignments | jobs.js |
| POST | `/api/jobs/assignments/bulk` | Bulk assign staff to jobs | jobs.js |
| **Products** | | | |
| GET | `/api/products` | List products | products.js |
| POST | `/api/products` | Add product | products.js |
| PUT | `/api/products/:id` | Update product | products.js |
| DELETE | `/api/products/:id` | Delete product | products.js |
| **Inventory** | | | |
| GET | `/api/inventory` | List inventory | inventory.js |
| GET | `/api/inventory/:id` | Get inventory item | inventory.js |
| GET | `/api/inventory/:id/branch-availability` | Branch availability | inventory.js |
| GET | `/api/inventory/by-sku/:sku` | Inventory by SKU | inventory.js |
| GET | `/api/inventory/qr-diagnostic/:code` | QR code diagnostic | inventory.js |
| POST | `/api/inventory/extract-bill` | Extract bill data | inventory.js |
| POST | `/api/inventory` | Add inventory item | inventory.js |
| PUT | `/api/inventory/:id` | Update inventory item | inventory.js |
| POST | `/api/inventory/:id/consume` | Consume inventory | inventory.js |
| POST | `/api/inventory/:id/restock` | Restock inventory | inventory.js |
| POST | `/api/inventory/generate-labels` | Generate QR labels | inventory.js |
| DELETE | `/api/inventory/all` | Delete all inventory (Admin) | inventory.js |
| DELETE | `/api/inventory/:id` | Delete inventory item | inventory.js |
| **Front Office** | | | |
| GET | `/api/front-office/attendance-reminder` | Attendance reminder | frontOffice.js |
| GET | `/api/front-office/dashboard` | Front office dashboard | frontOffice.js |
| GET | `/api/front-office/active-jobs` | Active jobs | frontOffice.js |
| GET | `/api/front-office/due-customers` | Due customers | frontOffice.js |
| GET | `/api/front-office/overdue-jobs` | Overdue jobs | frontOffice.js |
| GET | `/api/front-office/recent-payments` | Recent payments | frontOffice.js |
| GET | `/api/front-office/search` | Search orders | frontOffice.js |
| GET | `/api/front-office/delivered` | Delivered jobs | frontOffice.js |
| GET | `/api/front-office/completed` | Completed jobs | frontOffice.js |
| PATCH | `/api/front-office/jobs/:id/work-name` | Update job work name | frontOffice.js |
| **Expenses** | | | |
| GET | `/api/expense-dashboard` | Expense dashboard | expenses.js |
| GET | `/api/rent-locations` | List rent locations | expenses.js |
| POST | `/api/rent-locations` | Add rent location | expenses.js |
| PUT | `/api/rent-locations/:id` | Update rent location | expenses.js |
| DELETE | `/api/rent-locations/:id` | Delete rent location | expenses.js |
| GET | `/api/expense-categories` | List categories | expenses.js |
| GET | `/api/vendor-requests` | List vendor requests | expenses.js |
| POST | `/api/vendor-requests` | Create vendor request | expenses.js |
| PUT | `/api/vendor-requests/:id/review` | Review vendor request | expenses.js |
| GET | `/api/payment-suggestions` | Payment suggestions | expenses.js |
| PUT | `/api/payment-suggestions/:id/convert` | Convert suggestion | expenses.js |
| PUT | `/api/payment-suggestions/:id/dismiss` | Dismiss suggestion | expenses.js |
| **Finance (EMI/KURI)** | | | |
| GET | `/api/emi-master` | List EMI records | finance.js |
| GET | `/api/emi-dashboard` | EMI dashboard | finance.js |
| GET | `/api/emi-master/:id` | Get EMI details | finance.js |
| POST | `/api/emi-master` | Create EMI | finance.js |
| PUT | `/api/emi-master/:id` | Update EMI | finance.js |
| DELETE | `/api/emi-master/:id` | Delete EMI | finance.js |
| POST | `/api/emi-payments` | Record EMI payment | finance.js |
| GET | `/api/kuri-master` | List KURI records | finance.js |
| GET | `/api/kuri-dashboard` | KURI dashboard | finance.js |
| GET | `/api/kuri-master/:id` | Get KURI details | finance.js |
| POST | `/api/kuri-master` | Create KURI | finance.js |
| PUT | `/api/kuri-master/:id` | Update KURI | finance.js |
| DELETE | `/api/kuri-master/:id` | Delete KURI | finance.js |
| POST | `/api/kuri-payments` | Record KURI payment | finance.js |
| **Extended Expenses** | | | |
| GET | `/api/office-dashboard` | Office expenses dashboard | expenses-extended.js |
| GET | `/api/office-expenses` | List office expenses | expenses-extended.js |
| POST | `/api/office-expenses` | Add office expense | expenses-extended.js |
| PUT | `/api/office-expenses/:id` | Update office expense | expenses-extended.js |
| DELETE | `/api/office-expenses/:id` | Delete office expense | expenses-extended.js |
| GET | `/api/transport-dashboard` | Transport dashboard | expenses-extended.js |
| GET | `/api/transport-expenses` | List transport expenses | expenses-extended.js |
| POST | `/api/transport-expenses` | Add transport expense | expenses-extended.js |
| PUT | `/api/transport-expenses/:id` | Update transport expense | expenses-extended.js |
| DELETE | `/api/transport-expenses/:id` | Delete transport expense | expenses-extended.js |
| GET | `/api/misc-dashboard` | Misc expenses dashboard | expenses-extended.js |
| GET | `/api/misc-expenses` | List misc expenses | expenses-extended.js |
| POST | `/api/misc-expenses` | Add misc expense | expenses-extended.js |
| PUT | `/api/misc-expenses/:id` | Update misc expense | expenses-extended.js |
| DELETE | `/api/misc-expenses/:id` | Delete misc expense | expenses-extended.js |
| GET | `/api/petty-cash-dashboard` | Petty cash dashboard | expenses-extended.js |
| GET | `/api/petty-cash-ledger` | List petty cash ledger | expenses-extended.js |
| POST | `/api/petty-cash` | Add petty cash entry | expenses-extended.js |
| PUT | `/api/petty-cash/:id` | Update petty cash entry | expenses-extended.js |
| DELETE | `/api/petty-cash/:id` | Delete petty cash entry | expenses-extended.js |
| **Bills & Documents** | | | |
| GET | `/api/bills-documents` | List bills/documents | expenses-extended.js |
| GET | `/api/bills-documents/:id/full` | Get full bill document | expenses-extended.js |
| POST | `/api/bills-documents/upload` | Upload bill document | expenses-extended.js |
| POST | `/api/bills-documents` | Create bill record | expenses-extended.js |
| PUT | `/api/bills-documents/:id` | Update bill record | expenses-extended.js |
| DELETE | `/api/bills-documents/:id` | Delete bill record | expenses-extended.js |
| POST | `/api/bills-documents/extract-details` | Extract bill details (ML) | expenses-extended.js |
| GET | `/api/bills-documents/suggest-products` | Suggest products from bill | expenses-extended.js |
| POST | `/api/bills-documents/:id/link-product` | Link product to bill | expenses-extended.js |
| **Reports** | | | |
| GET | `/api/reports/monthly-expenses` | Monthly expenses | expenses-extended.js |
| GET | `/api/reports/category-wise` | Category-wise expenses | expenses-extended.js |
| GET | `/api/reports/branch-wise` | Branch-wise expenses | expenses-extended.js |
| GET | `/api/reports/vendor-ledger` | Vendor ledger | expenses-extended.js |
| GET | `/api/reports/utility-statement` | Utility statement | expenses-extended.js |
| GET | `/api/reports/rent-statement` | Rent statement | expenses-extended.js |
| GET | `/api/reports/emi-statement` | EMI statement | expenses-extended.js |
| GET | `/api/reports/kuri-statement` | KURI statement | expenses-extended.js |
| GET | `/api/reports/cash-vs-bank` | Cash vs bank | expenses-extended.js |
| **Utility Bills** | | | |
| POST | `/api/utility-bills` | Add utility bill | expenses-extended.js |
| GET | `/api/utility-bills` | List utility bills | expenses-extended.js |
| DELETE | `/api/utility-bills/:id` | Delete utility bill | expenses-extended.js |
| **Coupons** | | | |
| GET | `/api/coupons` | List coupons | coupons.js |
| POST | `/api/coupons` | Create coupon | coupons.js |
| PUT | `/api/coupons/:id` | Update coupon | coupons.js |
| DELETE | `/api/coupons/:id` | Delete coupon | coupons.js |
| POST | `/api/coupons/validate` | Validate coupon | coupons.js |
| **Backups** | | | |
| GET | `/api/backups` | List backups | backup.js |
| POST | `/api/backups` | Create backup | backup.js |
| POST | `/api/backups/restore` | Restore backup | backup.js |
| DELETE | `/api/backups/:filename` | Delete backup | backup.js |
| GET | `/api/backups/download/:filename` | Download backup | backup.js |
| **Stock** | | | |
| GET | `/api/stock-verification/items` | Stock verification items | stockVerification.js |
| POST | `/api/stock-verification/verify` | Verify stock item | stockVerification.js |
| GET | `/api/stock-requests` | List stock requests | stockRequests.js |
| POST | `/api/stock-requests` | Create stock request | stockRequests.js |
| **Machines** | | | |
| GET | `/api/machines` | List machines | machines.js |
| POST | `/api/machines` | Add machine | machines.js |
| PUT | `/api/machines/:id` | Update machine | machines.js |
| DELETE | `/api/machines/:id` | Delete machine | machines.js |
| **Daily Reports** | | | |
| GET | `/api/daily-reports/offset` | Get daily offset report | dailyReports.js |
| GET | `/api/daily-reports/offset/sync-data` | Sync daily report data | dailyReports.js |
| GET | `/api/daily-reports/offset/:id` | Specific offset report | dailyReports.js |
| POST | `/api/daily-reports/offset` | Create daily offset report | dailyReports.js |
| POST | `/api/daily-reports/offset/:id/finalize` | Finalize daily report | dailyReports.js |
| GET | `/api/daily-report/opening-balance` | Opening balance | dailyReportUnified.js |
| PUT | `/api/daily-report/opening-balance` | Update opening balance | dailyReportUnified.js |
| POST | `/api/daily-report/change-request` | Create change request | dailyReportUnified.js |
| GET | `/api/daily-report/change-requests` | List change requests | dailyReportUnified.js |
| POST | `/api/daily-report/change-requests/:id/review` | Review change request | dailyReportUnified.js |
| GET | `/api/daily-report/previous-closing` | Previous closing balance | dailyReportUnified.js |
| GET | `/api/daily-report/offset-live` | Live offset data | dailyReportUnified.js |
| GET | `/api/daily-report/laser-live` | Live laser data | dailyReportUnified.js |
| GET | `/api/daily-report/other-live` | Live other data | dailyReportUnified.js |
| GET | `/api/daily-report/live-counts` | Live job counts | dailyReportUnified.js |
| **AI / Monitoring** | | | |
| GET | `/api/ai/monitoring/alerts` | AI monitoring alerts | aiMonitoring.js |
| GET | `/api/ai/monitoring/dashboard` | AI monitoring dashboard | aiMonitoring.js |
| PUT | `/api/ai/monitoring/alerts/:id/resolve` | Resolve alert | aiMonitoring.js |
| GET | `/api/ai/monitoring/staff/:id/profile` | Staff profile analytics | aiMonitoring.js |
| POST | `/api/ai/monitoring/analyze` | Run analytics | aiMonitoring.js |
| POST | `/api/ai/monitoring/recompute-baselines` | Recompute baselines | aiMonitoring.js |
| **AI / Search** | | | |
| GET | `/api/ai/search` | Smart search | aiSearch.js |
| GET | `/api/ai/search/suggestions` | Search suggestions | aiSearch.js |
| GET | `/api/search` | Fast text search | search.js |
| **Accounts** | | | |
| GET | `/api/accounts/gst-summary` | GST summary | accounts.js |
| GET | `/api/accounts/sales-register` | Sales register | accounts.js |
| GET | `/api/accounts/purchase-register` | Purchase register | accounts.js |
| GET | `/api/accounts/gst-report` | GST report | accounts.js |
| **Audit & Invoices** | | | |
| GET | `/api/audit-logs` | List audit logs | auditInvoice.js |
| GET | `/api/audit-logs/entity/:type/:id` | Audit logs for entity | auditInvoice.js |
| GET | `/api/invoices` | List invoices | auditInvoice.js |
| POST | `/api/invoices/generate` | Generate invoice | auditInvoice.js |
| PUT | `/api/invoices/:id/cancel` | Cancel invoice | auditInvoice.js |
| **Job Priority** | | | |
| GET | `/api/job-priority/list` | List job priorities | jobPriority.js |
| POST | `/api/job-priority` | Set job priority | jobPriority.js |
| **AI / ML Predictions** | | | |
| GET | `/api/ai/sales-prediction` | Sales prediction | salesPrediction.js |
| GET | `/api/ai/order-predictions/predictions` | Order predictions | orderPredictions.js |
| GET | `/api/ai/order-predictions/predictions/customer/:id` | Customer predictions | orderPredictions.js |
| POST | `/api/ai/paper-layout/calculate` | Calculate paper layout | paperLayout.js |
| POST | `/api/ai/paper-layout/compare` | Compare layouts | paperLayout.js |
| POST | `/api/ai/paper-layout/generate-pdf` | Generate layout PDF | paperLayout.js |
| GET | `/api/ai/paper-layout/paper-sizes` | Paper sizes | paperLayout.js |
| GET | `/api/ai/anomalies` | Get anomalies | anomalies.js |
| POST | `/api/ai/anomalies/check` | Trigger anomaly check | anomalies.js |
| GET | `/api/ai/forecast` | ML forecast (Python) | forecast.js |
| GET | `/api/ai/business-insights` | Business insights (Python) | insights.js |
| GET | `/api/ai/seasonal` | Seasonal analysis (Python) | seasonal.js |
| GET | `/api/ai/stock-planning` | Stock planning (Python) | stockPlanning.js |
| GET | `/api/ai/order-forecast` | Order forecast (Python) | orderForecast.js |
| POST | `/api/ai/upsell` | Upsell suggestions (Apriori) | aiUpsell.js |
| POST | `/api/ai/turnaround` | Turnaround prediction (GBR) | aiTurnaround.js |
| POST | `/api/ai/categorize-expense` | Expense categorizer (TF-IDF) | expenseCategorizer.js |
| GET | `/api/upsell` | Get upsell suggestions | upsell.js |
| **Production** | | | |
| POST | `/api/production-tracker` | Track production | productionTracker.js |
| GET | `/api/production-tracker` | Get production data | productionTracker.js |
| **CCTV** | | | |
| POST | `/api/cctv/attendance` | Record CCTV attendance | cctvAttendance.js |
| GET | `/api/cctv/attendance/today` | Today's attendance | cctvAttendance.js |
| GET | `/api/cctv/attendance/staff/:id` | Staff attendance | cctvAttendance.js |
| GET | `/api/cctv/attendance/summary` | Attendance summary | cctvAttendance.js |
| POST | `/api/cctv/attendance/unknown-alert` | Report unknown person | cctvAttendance.js |
| DELETE | `/api/cctv/attendance/:id` | Delete attendance record | cctvAttendance.js |
| GET | `/api/cctv/cameras` | List cameras | cctvCameras.js |
| GET | `/api/cctv/cameras/:id` | Camera details | cctvCameras.js |
| POST | `/api/cctv/cameras` | Add camera | cctvCameras.js |
| PUT | `/api/cctv/cameras/:id` | Update camera | cctvCameras.js |
| DELETE | `/api/cctv/cameras/:id` | Delete camera | cctvCameras.js |
| GET | `/api/cctv/cameras/:id/snapshot` | Camera snapshot | cctvCameras.js |
| GET | `/api/cctv/cameras/:id/stream-url` | Camera stream URL | cctvCameras.js |
| GET | `/api/cctv/face-data` | List face data | cctvCameras.js |
| GET | `/api/cctv/face-data/stats` | Face data statistics | cctvCameras.js |
| DELETE | `/api/cctv/face-data/:id` | Delete face data | cctvCameras.js |
| POST | `/api/cctv/face-data` | Add face data | cctvCameras.js |

---

## 5. DATABASE SCHEMA

### Tables (76 tables)

| # | Table | Key Columns |
|---|-------|-------------|
| 1 | `barcode_inventory` | id, variant_id, barcode_generated, quantity_in_stock, branch_id, last_scanned |
| 2 | `barcode_print_jobs` | id, variant_ids (JSON), quantity_per_variant, num_columns, num_rows, paper_size, status |
| 3 | `branches` | id, name, location |
| 4 | `categories` | id, name, parent_id |
| 5 | `customer_logs` | id, customer_id, action, old_value, new_value, performed_by |
| 6 | `customers` | id, customer_type, name, business_name, primary_mobile, gstin, credit_enabled, credit_limit, balance_outstanding, advance_balance, status, is_blocked |
| 7 | `daily_machine_counter` | id, machine_id, counter_date, marked_by_staff_id, color_count, bw_count, total_count, status |
| 8 | `digital_machines` | id, machine_code, ip_address, machine_name, branch_id, machine_type, counter_type, color_rate, bw_rate, rate_matrix (JSON), opening_count |
| 9 | `inventory` | id, branch_id, item_name, quantity, unit, min_threshold, company, sku, image_url |
| 10 | `invoice_items` | id, invoice_id, description, quantity, rate, amount, unit |
| 11 | `invoice_payments` | id, invoice_id, amount, payment_date, payment_method, transaction_id, recorded_by |
| 12 | `invoices` | id, invoice_number, order_id, customer_id, subtotal, tax_rate, tax_amount, discount_amount, total_amount, paid_amount, balance_amount, payment_status, payment_method |
| 13 | `job_dependencies` | id, job_id, depends_on_job_id |
| 14 | `machine_logs` | id, machine_id, action, details, performed_by |
| 15 | `machine_readings` | id, machine_id, reading_date, color_count, bw_count, total_count, prev_total_count, copies_taken, entered_by |
| 16 | `order_staff_assignments` | id, order_id, assigned_staff_id, assigned_role, assignment_type, status |
| 17 | `orders` | id, customer_id, description, quantity, estimated_amount, status, assigned_staff_id, assigned_role, assignment_type |
| 18 | `paper_rates` | id, paper_type, gsm, price_per_sheet, paper_size, rate_multiplier |
| 19 | `product_papers` | product_id, paper_id |
| 20 | `product_pricing_slabs` | id, product_id, min_qty, max_qty, retail_rate, wholesale_rate |
| 21 | `product_variants` | id, product_id, sku, supplier, cost_price, margin_percentage, quality_level |
| 22 | `products` | id, category_id, product_type, name, description, image_url, price, unit, price_type, is_paper_included, sku, product_code |
| 23 | `salary_records` | id, staff_id, paid_by_staff_id, salary_type, amount, days_worked, payment_date, month_year, status |
| 24 | `salary_sync_log` | id, record_id, synced_by_role, admin_approved |
| 25 | `salary_tracking` | id, staff_id, month_year, total_days_worked, total_amount_due, total_amount_collected, remaining_amount, status |
| 26 | `sarga_attendance_requests` | id, staff_id, attendance_date, requested_status, requested_time, status |
| 27 | `sarga_audit_logs` | id, user_id_internal, action, entity_type, entity_id, field_name, old_value, new_value, ip_address |
| 28 | `sarga_bills_documents` | id, branch_id, document_type, related_tab, vendor_name, bill_number, bill_date, amount, file_path, file_type, uploaded_by |
| 29 | `sarga_branches` | id, name, address, phone, email, smtp_user, smtp_pass, upi_id |
| 30 | `sarga_companies` | id, name, code |
| 31 | `sarga_credit_customers` | id, customer_id, customer_name, customer_phone, credit_limit, current_balance, branch_id, is_active |
| 32 | `sarga_credit_ledger` | id, credit_customer_id, transaction_date, transaction_type, debit_amount, credit_amount, balance_after, reference_type, reference_id |
| 33 | `sarga_customer_designs` | id, customer_id, job_id, title, file_url, file_type, original_name, tags, uploaded_by |
| 34 | `sarga_customer_payments` | id, customer_id, customer_name, total_amount, net_amount, sgst_amount, cgst_amount, advance_paid, balance_amount, payment_method, cash_amount, upi_amount, branch_id, order_lines (JSON), verification_status, verified_by |
| 35 | `sarga_customer_requests` | id, requester_id, customer_id, request_type, subject, priority, status |
| 36 | `sarga_customers` | id, mobile, name, type, email, address, branch_id, gst |
| 37 | `sarga_emi_master` | id, payment_id, emi_count, emi_paid_count, total_amount, emi_amount, start_date, next_due_date, status |
| 38 | `sarga_emi_payments` | id, emi_id, payment_number, amount_paid, payment_date, status |
| 39 | `sarga_fraud_alerts` | id, staff_id, alert_type, severity, message, details (JSON), status, resolved_by |
| 40 | `sarga_id_requests` | id, user_id_internal, old_user_id, new_user_id, status |
| 41 | `sarga_inventory` | id, name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, hsn, gst_rate, item_type, vendor_name |
| 42 | `sarga_inventory_categories` | id, name, description |
| 43 | `sarga_inventory_consumption` | id, inventory_item_id, quantity_consumed, consumed_by_user_id |
| 44 | `sarga_inventory_items` | id, company_id, category_id, name, sku, unit, quantity, reorder_level, cost_price, sale_price, attributes (JSON) |
| 45 | `sarga_inventory_reorders` | id, inventory_item_id, quantity_received, cost_price, days_since_last_reorder |
| 46 | `sarga_inventory_stock` | id, item_id, type, quantity, note |
| 47 | `sarga_invoice_sequence` | id, financial_year, last_number, prefix |
| 48 | `sarga_invoices` | id, invoice_number, financial_year, payment_id, customer_id, total_amount, tax_amount, net_amount, status, generated_by |
| 49 | `sarga_job_proofs` | id, job_id, version, file_url, original_name, status, designer_notes, customer_feedback, uploaded_by, reviewed_by |
| 50 | `sarga_job_staff_assignments` | id, job_id, staff_id, role, assigned_date, completed_date, status, stage |
| 51 | `sarga_job_status_history` | id, job_id, status, staff_id, changed_at |
| 52 | `sarga_jobs` | id, customer_id, job_number, job_name, description, quantity, unit_price, total_amount, advance_paid, balance_amount, status, payment_status, delivery_date, branch_id, entry_date, due_date_original, priority, paper_cost, machine_cost, labour_cost, total_cost, profit, margin, product_id, category, subcategory, applied_extras (JSON), machine_id, plate_count, payment_id |
| 53 | `sarga_machines` | id, machine_name, machine_type, counter_type, branch_id, location, is_active |
| 54 | `sarga_misc_expenses` | id, branch_id, expense_category, vendor_name, amount, payment_method, expense_date, bill_number, is_recurring |
| 55 | `sarga_office_expenses` | id, branch_id, expense_type, vendor_name, amount, payment_method, expense_date, bill_number |
| 56 | `sarga_opening_change_requests` | id, requester_id, branch_id, report_date, request_type, book_type, machine_id, current_value, requested_value, status |
| 57 | `sarga_paper_usage_logs` | id, job_id, stage, paper_size, sheets_used, sheets_wasted, logged_by |
| 58 | `sarga_payment_methods` | id, name, is_active |
| 59 | `sarga_payment_suggestions` | id, payee_name, payment_category, occurrence_count, total_amount_paid, suggested_as_vendor, suggestion_dismissed |
| 60 | `sarga_payments` | id, branch_id, type, payee_name, amount, payment_method, reference_number, payment_date, cash_amount, upi_amount, vendor_id, staff_id, bill_total_amount, is_partial_payment, payment_status |
| 61 | `sarga_petty_cash` | id, branch_id, transaction_date, transaction_type, amount, balance_after, received_from, paid_to, category |
| 62 | `sarga_product_categories` | id, name, position |
| 63 | `sarga_product_extras_template` | id, product_id, purpose, amount |
| 64 | `sarga_product_slabs` | id, product_id, min_qty, base_value, unit_rate, max_qty, offset_unit_rate, double_side_unit_rate |
| 65 | `sarga_product_subcategories` | id, category_id, name, position |
| 66 | `sarga_product_usage` | id, user_id_internal, entity_type, entity_id, usage_count, last_used_at |
| 67 | `sarga_products` | id, subcategory_id, name, calculation_type, image_url, has_paper_rate, paper_rate, position, inventory_item_id, product_code, has_double_side_rate, is_physical_product |
| 68 | `sarga_refunds` | id, job_id, customer_id, refund_amount, refund_method, reason, processed_by, branch_id |
| 69 | `sarga_rent_locations` | id, property_name, location, owner_name, owner_mobile, monthly_rent, due_day, advance_deposit, branch_id, is_active |
| 70 | `sarga_staff` | id, user_id, password, role, name, is_first_login, branch_id, image_url, salary_type, base_salary, daily_rate |
| 71 | `sarga_staff_activity_log` | id, staff_id, action_type, details, ip_address, device_info |
| 72 | `sarga_staff_attendance` | id, staff_id, attendance_date, status, notes, in_time, out_time, work_hours |
| 73 | `sarga_staff_behavior_profile` | id, staff_id, avg_login_hour, std_login_hour, avg_discount_pct, avg_order_value, avg_daily_actions, known_devices, last_computed |
| 74 | `sarga_staff_leave_balance` | id, staff_id, year_month, paid_leaves_used, unpaid_leaves_used |
| 75 | `sarga_staff_salary` | id, staff_id, base_salary, net_salary, payment_month, bonus, deduction, paid_date, payment_method, reference_number, status |
| 76 | `sarga_staff_salary_payments` | (salary payment records — structure in migrations) |

---

## 6. KNOWN BUGS & ISSUES

| # | Bug Description | File/Location | Status | Fixed On |
|---|----------------|---------------|--------|----------|
| 1 | attendance-reminder API error | server/routes/frontOffice.js | ✅ Fixed | — |
| 2 | upsell-suggestions API error | server/routes/aiUpsell.js | ✅ Fixed | — |
| 3 | Multi-method payment validation failing | server/schemas/paymentSchemas.js | ✅ Fixed | — |

---

## 7. RECENT CHANGES LOG

| Date | Change Description | Files Modified | Done By |
|------|--------------------|----------------|---------|
| 2026-04-08 | Added Documentation Governance policy to enforce master-context linkage in all Markdown docs | SARGA_WORK_CONTEXT.md | Copilot Agent |
| 2026-04-07 | Created SARGA_WORK_CONTEXT.md — master work context file | SARGA_WORK_CONTEXT.md | Copilot Agent |

---

## 8. ENVIRONMENT & CONFIG

### Frontend (.env)
```
VITE_API_BASE_URL=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

### Backend (.env)
```
PORT=
JWT_SECRET=
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
NODE_ENV=
EMAIL_FROM=
EMAIL_TO=
EMAIL_PASS=
BRANCH_EMAIL_PERAMBRA=
BRANCH_EMAIL_MEPPAYUR=
CORS_ORIGIN=
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_MODEL_FALLBACKS=
```

### ML Service (.env)
```
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
OPENAI_API_KEY=
FRONTEND_URL=
PORT=
FLASK_DEBUG=
```

---

## 9. BRANCH & DEPLOYMENT INFO

- **Frontend**: Deployed on Vercel — auto-deploys on push to `main`
- **Backend**: Runs locally, exposed via ngrok tunnel
- **Database**: MySQL local instance
- **Branches in repo**:
  - `main` — production branch (single working branch)
  - Multiple `dependabot/` security-update branches (auto-generated by GitHub Dependabot for npm/pip dependency patches — do not manually merge these, let Dependabot handle them):
    - `dependabot/npm_and_yarn/client/*` — client dependency updates
    - `dependabot/npm_and_yarn/server/*` — server dependency updates
    - `dependabot/pip/ml-service/*` — Python ML service dependency updates
- **Security Note**: Repo must remain PRIVATE. No secrets in commits.

---

## 10. AGENT INSTRUCTIONS (READ EVERY TIME)

Rules the AI agent must follow when working on this project:

1. **READ THIS FILE FIRST** before doing anything in a session
2. **NEVER hardcode secrets** — use environment variables only
3. **Always check the known bugs list** before starting — don't re-fix what's done
4. **Update Section 7 (Recent Changes Log)** after every completed task
5. **Update Section 6 (Known Bugs)** when a bug is found or fixed
6. **Update Section 4 (API Routes)** when a new route is added or changed
7. **Update Section 5 (Database Schema)** when schema changes
8. **Update Section 3 (Features)** when a feature is completed or started
9. **Do not break existing working features** — check what's marked ✅ before touching it
10. **Backend runs locally** — do not try to deploy backend to Vercel
11. **Developer does not write code manually** — all code must be complete and working, no TODOs left unimplemented
12. **Theme support** — all UI must work in both light and dark mode using CSS variables

---

## 11. COMPONENT PATTERNS & CONVENTIONS

- **API calls**: Axios via centralized `client/src/services/api.js` — includes request deduplication and response caching wrappers
- **State management**: useState + React Context API (AuthProvider via `hooks/useAuth.jsx`, ConfirmContext via `contexts/ConfirmContext.jsx`) — no Redux/Zustand
- **Styling approach**: Plain CSS with CSS custom properties (design tokens in `index.css`: `--bg`, `--text`, `--accent`, `--shadow-*`, etc.) — supports light/dark themes via variables. No Tailwind, CSS Modules, or styled-components
- **Icon library**: `lucide-react` (v0.563.0)
- **Toast notifications**: `react-hot-toast` (v2.6.0) — configured in App.jsx with `<Toaster>`
- **Date formatting**: Native JavaScript `Date` API — no external date library
- **Form handling**: Manual `useState` per field — no react-hook-form or Formik
- **Routing**: `react-router-dom` (v7.13.0) — `BrowserRouter`, `Routes`, `Route`, `Navigate` with custom protected route wrapper
- **Offline support**: Custom hooks (`useOffline`, `useSyncStatus`) + IndexedDB (`offlineDb.js`, `localDb.js`) + Web Worker (`syncWorker.js`)
- **Authentication**: JWT-based (server) + Firebase Phone OTP (customer portal) via `hooks/useAuth.jsx` and `services/firebase.js`
- **Image handling**: Client-side crop (`ImageCropModal.jsx`) + server-side compression middleware (`compressImageUpload.js`)
- **Pagination**: Reusable `Pagination.jsx` component + `usePagination.js` hook + server helper `helpers/pagination.js`

---

## 12. DOCUMENTATION GOVERNANCE

This section is mandatory policy for all `.md` documentation files in this repository.

### 12.1 Master Source of Truth
- `SARGA_WORK_CONTEXT.md` is the canonical context source for project state, architecture, and workflow decisions.
- If any other documentation conflicts with this file, this file takes precedence unless explicitly updated.

### 12.2 Mandatory Header For Markdown Files
- Every `.md` file except `SARGA_WORK_CONTEXT.md` must begin with the following two-line banner at the top:

```
> Master Context: [RELATIVE_PATH_TO_SARGA_WORK_CONTEXT.md](RELATIVE_PATH_TO_SARGA_WORK_CONTEXT.md)
> Source of truth for project state, architecture, and workflow decisions.
```

- `RELATIVE_PATH_TO_SARGA_WORK_CONTEXT.md` must be a valid relative path from that file's directory.
- Allowed examples:
  - Root-level docs: `SARGA_WORK_CONTEXT.md`
  - One folder deep: `../SARGA_WORK_CONTEXT.md`
  - Two folders deep: `../../SARGA_WORK_CONTEXT.md`

### 12.3 Ongoing Maintenance Rules
- New `.md` files must include the mandatory header at creation time.
- Existing `.md` files must not contain duplicate master-context banners.
- Do not use empty links like `[]()`.
- Keep references synchronized whenever files are moved across directories.

### 12.4 Agent Compliance Checklist
Before concluding any documentation-related task, the agent must verify:
1. All targeted `.md` files include exactly one master-context banner.
2. All banner links resolve correctly to `SARGA_WORK_CONTEXT.md`.
3. No malformed/empty master-context links remain.

---

*This file is auto-maintained. Manual edits are allowed for policy sections (Section 10 and Section 12) when governance needs to be updated.*
