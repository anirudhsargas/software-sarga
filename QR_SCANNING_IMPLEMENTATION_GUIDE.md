# QR Code Scanning Implementation Guide

## Overview
The application has a complete QR code scanning system with three main entry points:
1. **Billing Page** - For adding products to bills via QR codes
2. **Dashboard** - For inventory lookups via hardware scanner
3. **QR Diagnostic** - For testing/verifying QR codes

---

## 1. Frontend Components

### Main QR Scanner Component
**File:** [client/src/components/ScannerModal.jsx](client/src/components/ScannerModal.jsx)

**Key Features:**
- Dual-mode: Camera (live) or File (photo upload)
- Multiple detection methods: jsQR, BarcodeDetector, Html5Qrcode
- Normalizes scanned codes (uppercase, removes spaces)
- Callback: `onScan(normalizedCode)` when QR is detected

**Key Code Sections:**
- Lines 1-80: Setup, live camera initialization
- Lines 100-190: File upload and QR detection
- Lines 205-295: UI with mode tabs and hidden file input

**Supported Formats:** QR codes, Code 128, EAN-13, EAN-8, Code 39, UPC-A, UPC-E

---

## 2. Billing Page - Product Scanning & Display

**File:** [client/src/pages/Billing.jsx](client/src/pages/Billing.jsx)

### Scanner Integration
- **Lines 7:** Imports ScannerModal
- **Line 72:** State: `const [showScanner, setShowScanner] = useState(false);`
- **Line 78:** State: `const [scannedPreview, setScannedPreview] = useState(null);`
- **Line 1319:** Scan button triggers modal
- **Lines 1326-1334:** ScannerModal component with `onScan` callback

### QR Lookup Logic
**Lines 750-810: `handleQrLookup()` function**

Two-tier lookup strategy:
1. **Product Hierarchy Lookup** (O(1) via Map - Lines 750-780)
   - Searches local product hierarchy by product code
   - If inventory-only item → shows preview modal
   - Otherwise → auto-selects product for billing

2. **Fallback Inventory Lookup** (Lines 800-810)
   - Calls `/inventory/by-sku/:sku` endpoint
   - Shows preview for any inventory item not in product hierarchy

### Product Detail Preview Modal
**Lines 1335-1375: Scanned Preview Display**

Shows when scanning inventory-only or unlinked items:
- Product image (if available)
- Product name & SKU
- Category information
- MRP, Sell Price, Stock quantity
- "Add to Bill" button
- Shows out-of-stock warning

**Image Display:** [Line 1339-1345]
```jsx
{scannedPreview.item.image_url ? (
  <img src={scannedPreview.item.image_url} alt={scannedPreview.item.name}
       style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: 8 }} />
) : (
  <div style={{ width: '100px', height: '100px', background: '#f0f0f0', borderRadius: 8 }} />
)}
```

### Add to Order
**Lines 863-888: `addScannedItemToOrder()` function**
- Creates invoice line item with full product data
- Stores inventory_item_id, unit_price, category info
- Shows toast notification with price

---

## 3. Dashboard - Global Scanner & Inventory Lookup

**File:** [client/src/pages/Dashboard.jsx](client/src/pages/Dashboard.jsx)

### Hardware Scanner Listener
**Lines 171-222: Global hardware barcode scanner detection**

Monitors keyboard input for rapid character sequences (< 100ms apart) followed by Enter:
- Accumulates characters in buffer
- When 3+ chars + Enter detected → treated as scanner event
- Ignores events when input/textarea/select focused
- Calls `handleInventoryScan(code)`

### Inventory Scan Handler
**Lines 208-221: `handleInventoryScan()` function**
- Normalizes scanned code (uppercase, trim)
- Calls `/inventory/by-sku/:sku` endpoint
- Sets loading state and displays result modal

### Scan Results Display
**Lines 598-658: Inventory Scan Result Modal**

Shows detailed product information:
- **SKU Display** (prominent banner with primary color)
- **Product Image** (if available)
- **Product Name** with Category
- **Price Info**: MRP, Sell Price
- **Stock Info**: Quantity, Unit type
- **Additional**: HSN/GST info when available

**Image Display:** [Lines 610-616]
```jsx
{inventoryScanResult.image_url && (
  <img
    src={`${fileBaseUrl}${inventoryScanResult.image_url}`}
    alt={inventoryScanResult.name}
    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px' }}
  />
)}
```

### Scanner Modal (Button)
**Lines 585-589:** Opens ScannerModal for manual scanning
**Lines 592-598:** Loading overlay while looking up

---

## 4. QR Diagnostic Page - Verification Tool

**File:** [client/src/pages/QRDiagnostic.jsx](client/src/pages/QRDiagnostic.jsx)

**Purpose:** Test and verify QR codes match inventory records

**Features:**
- Manual code input or scan via ScannerModal
- Displays: Input, Normalized code, Match type, Item details
- Visual feedback: ✓ Found or ✗ Not Found
- Used for debugging/validation (no image display)

---

## 5. Backend API Endpoints

**File:** [server/routes/inventory.js](server/routes/inventory.js)

### Endpoint 1: Product Lookup by SKU
```
GET /inventory/by-sku/:sku
Authentication: Required
Purpose: Used by Billing page and Dashboard scanner
```

**Lines 67-83:**
- Normalizes SKU code
- Calls `findInventoryByScannedCode()`
- Returns full item with: id, name, sku, quantity, cost_price, gst_rate, mrp, **image_url**
- Calculates MRP using formula: (cost_price + gst) * 2

**Returns:**
```json
{
  "id": 123,
  "sku": "MEM-0042",
  "name": "A4 White Paper 500 sheets",
  "category": "Paper",
  "quantity": 1500,
  "cost_price": 250,
  "gst_rate": 5,
  "mrp": 500,
  "image_url": "/uploads/products/mem-0042.jpg",
  "scanned_code": "MEM0042"
}
```

### Endpoint 2: QR Diagnostic Verification
```
GET /inventory/qr-diagnostic/:code
Authentication: Required
Purpose: Used by QR Diagnostic page and system testing
```

**Lines 88-117:**
- Verifies if code matches inventory
- Returns match type: 'sku' or 'fallback-id'
- Limited response fields (no image for this endpoint)

### Lookup Helper Function
**Lines 20-40: `findInventoryByScannedCode()`**
- Normalizes code (uppercase, remove spaces)
- Tries two lookup methods:
  1. ITEM-{id} format match
  2. SKU match
- **LEFT JOIN** with sarga_products to get image_url
- Returns: { normalized, item, matchType }

---

## 6. Image Display Functionality

### Database Integration
**Images stored in:**
1. **sarga_inventory.image_url** - For inventory items
2. **sarga_products.image_url** - For product items

**Lookup Query** (Lines 29, 36):
```sql
SELECT i.*, p.image_url FROM sarga_inventory i 
LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
```

### Image Display in Frontend

#### Billing Preview Modal (Lines 1339-1345)
- Shows item image with fallback placeholder
- Dimensions: 100x100px, cover fit
- Displayed alongside product details

#### Dashboard Result Modal (Lines 610-616)
- Shows item image when available
- Dimensions: 80x80px, cover fit
- Bordered with rounded corners
- Uses fileBaseUrl prefix for full path

#### Image URL Construction
```js
// Dashboard
src={`${fileBaseUrl}${inventoryScanResult.image_url}`}

// fileBaseUrl = API_URL.replace(/\/api\/?$/, '')
// Example: http://localhost:3001/uploads/products/item.jpg
```

---

## 7. QR Code Lookup Workflow (Billing Page)

```
User Scans QR Code
    ↓
ScannerModal detects code → onScan(normalizedCode)
    ↓
handleQrLookup(code) called
    ↓
    ├─ Check local hierarchy Map (O(1))
    │  ├─ If found & inventory_only → Show preview modal
    │  └─ If found & regular product → Select product
    │
    └─ Not in hierarchy → Call /inventory/by-sku/:sku
       ├─ If found → Show preview modal with image & details
       └─ If not found → Show error message
```

---

## 8. File Paths Summary

### Frontend
| File | Purpose |
|------|---------|
| [client/src/components/ScannerModal.jsx](client/src/components/ScannerModal.jsx) | QR scanning UI component |
| [client/src/pages/Billing.jsx](client/src/pages/Billing.jsx) | Billing with QR product selection |
| [client/src/pages/Dashboard.jsx](client/src/pages/Dashboard.jsx) | Main app with hardware scanner |
| [client/src/pages/QRDiagnostic.jsx](client/src/pages/QRDiagnostic.jsx) | QR code testing page |

### Backend
| File | Purpose |
|------|---------|
| [server/routes/inventory.js](server/routes/inventory.js) | QR lookup endpoints |

### Key Functions

**Frontend:**
- [ScannerModal.handleFileChange](client/src/components/ScannerModal.jsx#L155-L190) - File upload scanning
- [Billing.handleQrLookup](client/src/pages/Billing.jsx#L750-L810) - Product lookup with dual-tier strategy
- [Billing.addScannedItemToOrder](client/src/pages/Billing.jsx#L863-L888) - Add to bill
- [Dashboard.handleInventoryScan](client/src/pages/Dashboard.jsx#L208-L221) - Hardware scanner handler

**Backend:**
- [findInventoryByScannedCode](server/routes/inventory.js#L20-L40) - Code lookup helper
- [GET /inventory/by-sku/:sku](server/routes/inventory.js#L67-L83) - Main lookup endpoint
- [GET /inventory/qr-diagnostic/:code](server/routes/inventory.js#L88-L117) - Diagnostic endpoint

---

## 9. Key Implementation Details

### Code Normalization
```js
normalizeScannedCode = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();
// Input: "mem-0042 " → Output: "MEM0042"
```

### Product Code Format
- **Inventory Items:** Either SKU or "ITEM-{id}" format
- **Products:** Custom product_code in hierarchy
- **Fallback:** Always includes ITEM-{id} as backup

### Image Handling
- **Upload Location:** Images stored in `/uploads/products/` directory
- **Database Storage:** Relative path stored (e.g., `/uploads/products/item.jpg`)
- **Frontend URL:** Constructed by prepending fileBaseUrl
- **Fallback:** Gray placeholder if no image_url available

---

## 10. Feature Comparison

| Feature | Billing | Dashboard | Diagnostic |
|---------|---------|-----------|------------|
| Scanner Input | Camera or File | Hardware or Modal | Manual or Modal |
| Image Display | ✓ Yes | ✓ Yes | ✗ No |
| Pricing Info | ✓ MRP, Sell Price | ✓ MRP, Qty | ✗ No |
| Add to Cart | ✓ Yes | ✗ No | ✗ No |
| Verification Only | ✗ No | ✗ No | ✓ Yes |
| Stock Info | ✓ Yes | ✓ Yes | ✓ Yes |

---
