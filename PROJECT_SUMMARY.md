# 🏢 SARGA - Software Bill & Expense Management System
**Project Summary & Architecture Guide**

---

## 📋 Project Overview

**SARGA** (Software Application for Receipt & General Accounting) is a full-stack web application built for managing bills, expenses, inventory, payments, and staff assignments. It handles vendor management, product tracking via QR codes, smart bill uploads with OCR, and complete billing workflows for customer work orders.

### Project Status
- ✅ **Live & Production-Ready**
- ✅ **Payment Flow Fixed & Deployed**
- ✅ **Inventory Integration Complete**
- ✅ **Vendor Management System Active**
- ✅ **QR Code Scanning Implemented**
- ✅ **Smart Bill Upload with OCR Enabled**

---

## 🏗️ Architecture Overview

### Tech Stack

**Frontend:**
- React 18+ with Vite (fast dev server & build)
- Modern JavaScript (ES2020+)
- CSS3 with CSS Variables for theming
- API communication via Axios

**Backend:**
- Node.js + Express.js
- MySQL 8.0+ database
- Middleware for authentication & branch filtering
- RESTful API with proper error handling

**Infrastructure:**
- Windows PowerShell deployment scripts
- LocalStorage-based offline support
- Session-based authentication
- Multi-branch organizational structure

**Tools & Utilities:**
- OCR (Tesseract via `/eng.traineddata`)
- QR Code generation & scanning
- PDF generation (PDFKit)
- Email support (Nodemailer)
- Scheduled tasks (node-cron)

---

## 📁 Project Structure

```
sarga/
├── client/                          # React + Vite frontend
│   ├── src/
│   │   ├── pages/                   # Page components
│   │   │   ├── Dashboard.jsx        # Main dashboard
│   │   │   ├── Customers.jsx        # Customer list & management
│   │   │   ├── CustomerDetails.jsx  # Customer work orders & payments
│   │   │   ├── Billing.jsx          # Billing interface with QR scanning
│   │   │   ├── expense-manager/
│   │   │   │   ├── VendorsTab.jsx   # Vendor management & bills
│   │   │   │   ├── SmartBillUpload.jsx # OCR bill upload
│   │   │   │   └── ...
│   │   │   ├── OfflineTestPage.jsx  # Development testing
│   │   │   └── ...
│   │   ├── components/              # Reusable components
│   │   ├── services/
│   │   │   └── api.js               # Axios instance & API config
│   │   ├── App.jsx                  # Main app component
│   │   └── index.css                # Global styling
│   ├── vite.config.js               # Vite configuration
│   ├── package.json                 # Frontend dependencies
│   └── index.html                   # HTML entry point
│
├── server/                          # Node.js + Express backend
│   ├── routes/
│   │   ├── auth.js                  # Authentication endpoints
│   │   ├── customerPayments.js       # Payment processing & stock deduction
│   │   ├── customers.js             # Customer CRUD
│   │   ├── expenses-extended.js      # Vendor bills & smart bill upload
│   │   ├── inventory.js             # Product inventory with auto-SKU
│   │   ├── jobs.js                  # Work order management
│   │   ├── vendors.js               # Vendor management & billing
│   │   └── ...
│   ├── middleware/
│   │   ├── branchFilter.js          # Multi-branch scoping
│   │   └── ...
│   ├── database.js                  # MySQL connection & pooling
│   ├── index.js                     # Express server entry point
│   ├── index.backup.js              # Backup of original server
│   ├── eng.traineddata              # Tesseract OCR data
│   ├── env.example                  # Environment variables template
│   ├── package.json                 # Backend dependencies
│   └── *.sql                        # Database backups
│
├── Documentation/                   # Project documentation
│   ├── README_FIX_DEPLOYED.md       # Latest deployment info
│   ├── CODE_CHANGES_EXACT.md        # Exact code changes
│   ├── DEPLOYMENT_CHECKLIST.md      # Deployment steps & tests
│   ├── PAYMENT_FLOW_FIX.md          # Payment workflow technical guide
│   ├── WHY_THIS_SOLUTION_WORKS.md   # Architecture decisions
│   ├── SALARY_SYSTEM_COMPLETE.md    # Salary management system (new feature)
│   ├── SMART_BILL_UPLOAD_GUIDE.md   # Smart bill upload process
│   ├── QR_SCANNING_IMPLEMENTATION_GUIDE.md # QR integration
│   ├── STAFF_DASHBOARD_IMPLEMENTATION.md   # Staff features
│   ├── STAFF_VALIDATION_FIX.md      # Staff module fixes
│   └── ...
│
├── package.json                     # Root package config
├── deploy.ps1                       # Deployment script
├── test-features.ps1                # Feature testing script
└── sarga_db_backup.sql              # Database backup
```

---

## 🔄 Core Business Workflows

### 1. Customer Billing & Payment Workflow
```
Customer → Add Work Order → Billing Interface
  ↓
  Select Products (with QR scanning) → Create Bill
  ↓
  Payment Page → Enter Charges/Deductions → Save Payment
  ↓
  Payment recorded & Stock automatically deducted
  ↓
  Customer Details page refreshed with updated balance
```

**Key Features:**
- Auto-refetch after payment (prevents stale data)
- QR code scanning for quick product entry
- Product preview popup (image, MRP, stock)
- Intelligent billing filters & suggestions

**Files:**
- [Billing.jsx](client/src/pages/Billing.jsx)
- [CustomerPayments.jsx](client/src/pages/CustomerPayments.jsx)
- [customerPayments.js route](server/routes/customerPayments.js)

---

### 2. Vendor Management & Bill Processing
```
Vendor → Bills → Smart Bill Upload
  ↓
  OCR extracts line items
  ↓
  Bills appear in Inventory (auto-SKU: CAT-0001)
  ↓
  Products available for billing/scanning
```

**Key Features:**
- Vendor statement with outstanding balance
- Bill-with-items modal for manual entry
- Smart bill upload with OCR (Tesseract)
- Auto-SKU generation (pattern: `{CATEGORY_PREFIX}-{PADDED_ID}`)
- Vendor name de-duplication (handles fiscal year suffixes)
- Vendor drill-down view for full transaction history

**Files:**
- [VendorsTab.jsx](client/src/pages/expense-manager/VendorsTab.jsx)
- [vendors.js route](server/routes/vendors.js)
- [expenses-extended.js route](server/routes/expenses-extended.js)

---

### 3. Inventory & Product Management
```
Vendor Bills → Auto-SKU Creation
  ↓
  Products stored in `sarga_inventory`
  ↓
  Available for QR scanning in billing
  ↓
  Stock deducted on payment
```

**Auto-SKU Pattern:**
- Format: `{PREFIX}-{PADDED_ID}` (e.g., `MEM-0042`)
- Prefix: First 3 chars of category (alpha only), uppercase
- Fallback: `INV` if no valid prefix
- Generated in: POST /inventory and vendor-bills routes

**Stock Deduction:**
- Triggered: POST /customer-payments
- Logic: Checks `line.is_inventory_item && line.inventory_item_id`
- Formula: `GREATEST(quantity - ?, 0)` (prevents negative stock)

**Files:**
- [inventory.js route](server/routes/inventory.js)
- [customerPayments.js route](server/routes/customerPayments.js)

---

### 4. Staff Assignment & Salary Management
```
Staff → Assign to Jobs/Branches
  ↓
  Track Hours & Performance
  ↓
  Calculate Salary (Flat/Commission/Hourly)
  ↓
  Generate Payment Certificates
```

**Features:**
- Multi-branch staff assignment
- Flexible salary types
- Automatic calculation
- Payment history tracking

**Files:**
- SALARY_SYSTEM_COMPLETE.md
- STAFF_DASHBOARD_IMPLEMENTATION.md
- [staffAssignment routes](server/routes/)

---

### 5. QR Code Scanning in Billing
```
Billing Page → Scan QR Code
  ↓
  Product retrieved from inventory
  ↓
  Item preview popup shown (image, MRP, stock)
  ↓
  Add to bill items
  ↓
  Generate bill with scanned items
```

**Features:**
- Real-time QR decoding
- Product availability check
- Stock level validation
- Rapid item entry

**Files:**
- [Billing.jsx](client/src/pages/Billing.jsx)
- [QR_SCANNING_IMPLEMENTATION_GUIDE.md](QR_SCANNING_IMPLEMENTATION_GUIDE.md)

---

## 🗄️ Database Schema

### Core Tables
- `sarga_customers` - Customer master data
- `sarga_jobs` - Work orders
- `sarga_customer_payments` - Payment records
- `sarga_payment_items` - Payment line items (with stock deduction)
- `sarga_inventory` - Product inventory with auto-SKU
- `sarga_vendors` - Vendor master
- `sarga_vendor_bills` - Vendor bills
- `sarga_bill_items` - Vendor bill line items (auto-created from smart upload)
- `sarga_staff` - Staff master
- `sarga_staff_salaries` - Salary records
- `sarga_users` - User accounts & authentication

### Key Design Decisions
- **Branch Scoping:** Multi-branch support via `branch_id` in most tables
- **Stock Deduction:** `payment_items` table tracks inventory deduction per line item
- **Vendor Bills:** Smart upload auto-creates `bill_items` from OCR'd line items
- **Outstanding Balance:** Computed server-side in vendor statement endpoint

---

## 🔐 API Architecture

### Authentication & Authorization
- Session-based authentication (login/logout)
- Role-based access control (Admin, Accountant, Staff, etc.)
- Branch filtering via `getUserBranchId()` helper
- [branchFilter.js](server/middleware/branchFilter.js) - Shared middleware for scope enforcement

### Key API Endpoints

#### Customers
- `GET /api/customers` - List customers
- `GET /api/customers/:id` - Customer details with jobs & payments
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer

#### Billing & Payments
- `GET /api/jobs/customer/:customerId` - Jobs for customer
- `POST /api/customer-payments` - Save payment → Stock deduction triggered
- `GET /api/customer-payments/:customerId` - Payment history

#### Vendors & Inventory
- `GET /api/vendors` - List vendors
- `GET /api/vendors/:id/statement` - Vendor statement with outstanding balance
- `POST /api/vendor-bills` - Create bill (auto-SKU generated)
- `GET /api/vendor-bills/:id/full` - Full bill drill-down (metadata + items)
- `GET /api/inventory` - List inventory items
- `POST /api/inventory` - Add product (auto-SKU generated)

#### Smart Bill Upload
- `POST /api/smart-bill-upload` - Upload PDF → OCR extract → Auto-create vendor + bill items
- Supports: Vendor name dedup, auto-SKU on items, outstanding balance calc

#### QR Scanning
- Built into Billing page
- Uses existing inventory/product endpoints
- Client-side QR decoding

---

## 🚀 Deployment & Setup

### Prerequisites
- Node.js 14+ (16+ recommended)
- MySQL 8.0+
- Windows with PowerShell 5.1+
- Environment variables configured (see `env.example`)

### Quick Start

1. **Setup Backend:**
   ```bash
   cd server
   npm install
   # Configure database in env.example → .env
   node index.js
   ```

2. **Setup Frontend:**
   ```bash
   cd client
   npm install
   npm run dev    # Development with HMR
   npm run build  # Production build
   ```

3. **Deploy via PowerShell:**
   ```powershell
   .\deploy.ps1
   ```

### Environment Configuration
See [server/env.example](server/env.example) for required variables:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `API_PORT`, `NODE_ENV`
- `VITE_API_BASE_URL` (frontend)

### Database Setup
```bash
# Restore from backup
mysql -u root -p sarga < sarga_db_backup.sql

# Or initialize with schema
# (See schema creation steps in DEPLOYMENT_CHECKLIST.md)
```

---

## 📊 Recent Fixes & Enhancements

### Payment Flow Fix (Latest)
**Issue:** Work orders & payments weren't showing after billing workflow
**Solution:** Auto-refetch on return from payment page
**Status:** ✅ Deployed
**Details:** [README_FIX_DEPLOYED.md](README_FIX_DEPLOYED.md)

### Vendor Outstanding Balance
**Added:** Server-side computation in vendor statement endpoint
**Status:** ✅ Complete
**Details:** [Vendors Route](server/routes/vendors.js)

### Smart Bill Upload with OCR
**Added:** PDF upload → OCR extraction → Auto-vendor-bill creation
**Status:** ✅ Complete
**Details:** [SMART_BILL_UPLOAD_GUIDE.md](SMART_BILL_UPLOAD_GUIDE.md)

### QR Code Scanning
**Added:** Real-time QR decoding in billing interface
**Status:** ✅ Complete
**Details:** [QR_SCANNING_IMPLEMENTATION_GUIDE.md](QR_SCANNING_IMPLEMENTATION_GUIDE.md)

### Salary System
**Added:** Complete staff salary management with multiple calculation types
**Status:** ✅ Complete
**Details:** [SALARY_SYSTEM_COMPLETE.md](SALARY_SYSTEM_COMPLETE.md)

### Inventory Auto-SKU
**Added:** Automatic SKU generation (CAT-0001 pattern)
**Status:** ✅ Complete
**Details:** [sarga-memento-workflow.md](/memories/repo/sarga-memento-workflow.md)

---

## 🧪 Testing

### Test Categories Available

1. **Payment Flow Tests** → [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md#post-deployment-testing)
   - 10 comprehensive test cases
   - Covers workflow, edge cases, data verification

2. **Feature Tests** → `test-features.ps1`
   - PowerShell script for quick feature validation
   - Tests all major workflows

3. **Database Verification**
   - SQL checks for schema integrity
   - Data consistency validation

4. **Offline Testing**
   - [OfflineTestPage.jsx](client/src/pages/OfflineTestPage.jsx)
   - Development-only testing interface

---

## 🔧 Configuration & Customization

### API URL Handling (Important!)
- Frontend API config: [client/src/services/api.js](client/src/services/api.js)
- Default `API_URL`: Ends with `/api/`
- When building file URLs: Strip `/api` with regex `/\/api\/?$/` (handles trailing slash)
- Dashboard inventory scan: Use `fileBaseUrl + image_url` (not `VITE_API_URL`)

### CSS Theming
- CSS Variables used throughout for consistency
- Theme colors configured via `var(--accent)`, `var(--error)`, etc.
- See: [OfflineTestPage.css](client/src/pages/OfflineTestPage.css)

### Branch Filtering
- Use `branchFilter.js` middleware helpers instead of repeating role + `getUserBranchId()` checks
- Standardizes multi-branch access control across routes

---

## 📖 Documentation Guide

### For Quick Start
1. [START_HERE.md](START_HERE.md) - 5-minute overview
2. [README_FIX_DEPLOYED.md](README_FIX_DEPLOYED.md) - Latest deployment
3. [QUICK_FIX_REFERENCE.md](QUICK_FIX_REFERENCE.md) - Business impact

### For Development
1. [CODE_CHANGES_EXACT.md](CODE_CHANGES_EXACT.md) - Exact code changes
2. [STEP_BY_STEP_WALKTHROUGH.md](STEP_BY_STEP_WALKTHROUGH.md) - Technical walkthrough
3. [PAYMENT_FLOW_FIX.md](PAYMENT_FLOW_FIX.md) - Deep technical dive

### For Deployment
1. [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Overall summary
2. [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Step-by-step deployment
3. [DEPLOYMENT_CHECKLIST_FINAL.md](DEPLOYMENT_CHECKLIST_FINAL.md) - Final verification

### For Architecture
1. [WHY_THIS_SOLUTION_WORKS.md](WHY_THIS_SOLUTION_WORKS.md) - Design decisions
2. [sarga-memento-workflow.md](#) - Vendor → Bill → Stock → SKU → QR flow
3. Inline code comments in route handlers

---

## 🎯 Next Steps & Roadmap

### Upcoming Features
- [ ] Advanced reporting & analytics
- [ ] Mobile app version
- [ ] Integration with accounting software (Tally, etc.)
- [ ] Automated reconciliation
- [ ] Multi-currency support
- [ ] Batch operations

### Known Limitations
- Single-database (multi-tenant via branch scoping only)
- Local file storage (consider S3/cloud storage for production)
- Manual backup required (consider automated backups)

### Maintenance Tasks
- Regular database backups (automated via cron job)
- Log rotation & cleanup
- Performance monitoring & optimization
- Security updates for dependencies

---

## 📞 Support & Troubleshooting

### Common Issues

**"Payment not showing in Customer Details"**
→ Ensure refetch logic is in place (see [PAYMENT_FLOW_FIX.md](PAYMENT_FLOW_FIX.md))

**"QR code not recognized"**
→ Verify QR format; test with sample codes in Billing page

**"Vendor bills not appearing in inventory"**
→ Check smart bill upload OCR extraction; verify `line_items` in response

**"Stock going negative"**
→ Use `GREATEST(quantity - ?, 0)` formula; see [customerPayments.js](server/routes/customerPayments.js)

---

## 📝 License & Copyright

SARGA is a proprietary software application. All rights reserved.

---

## 🙋 Questions?

Refer to relevant documentation file above, or check inline code comments in implementation files.

**Last Updated:** 2024  
**Project Status:** Production Ready ✅
