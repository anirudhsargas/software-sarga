# QR Diagnostic Feature Analysis

## Overview
The QR diagnostic feature is designed to verify product codes against inventory lookup. It provides a scanner verification page where users can test QR codes and check if they match inventory items.

---

## 1. Route Handler for QR Code Verification

**Location**: [server/routes/inventory.js](server/routes/inventory.js) (Lines 87-130)

**Endpoint**: `GET /inventory/qr-diagnostic/:code`

**Access Control**: Requires authentication and allowed roles:
- Admin
- Front Office
- Designer
- Printer
- Accountant
- Other Staff

**Response Behavior**:
```javascript
// Success (found = true)
{
  "found": true,
  "input": "MYS-POLO-L",
  "normalized": "MYSPOLOL",
  "match_type": "sku",
  "item": {
    "id": 123,
    "sku": "MYS-POLO-L",
    "name": "Product Name",
    "category": "Category",
    "quantity": 50,
    "reorder_level": 10,
    "image_url": "url"
  }
}

// Not found (found = false)
{
  "found": false,
  "input": "MYS-POLO-L",
  "normalized": "MYSPOLOL",
  "message": "No inventory item matches this code"
}

// Invalid/empty code (found = false)
{
  "found": false,
  "input": "",
  "normalized": "",
  "message": "Empty/invalid code"
}
```

---

## 2. Normalization Logic - Converting Input Codes

**Location**: [server/routes/inventory.js](server/routes/inventory.js) (Line 18)

```javascript
const normalizeScannedCode = (value) => 
  String(value || '').trim().replace(/\s+/g, '').toUpperCase();
```

**Transformation Steps**:
1. **Convert to String**: `String(value || '')` - ensures the value is a string, defaults to empty string
2. **Trim whitespace**: `.trim()` - removes leading/trailing spaces
3. **Replace spaces**: `.replace(/\s+/g, '')` - removes ALL internal spaces/whitespace characters
4. **Uppercase**: `.toUpperCase()` - converts to uppercase

**Example Transformations**:
- Input: `"MYS-POLO-L"` → Output: `"MYSPOLOL"` ✓ (hyphen stays)
- Input: `"MYS POLO L"` → Output: `"MYSPOLO l"` (only spaces removed)
- Input: `"my s polo"` → Output: `"MYSPOLO"` (spaces removed, then uppercased)
- Input: `" MYS-POLO-L "` → Output: `"MYS-POLO-L"` (trimmed, then uppercased)  
- Input: `""` or `null` → Output: `""` (empty string)

**Issue Note**: If normalized code becomes empty, the endpoint returns "Empty/invalid code" message (displayed as "-" in UI).

---

## 3. Inventory Lookup/Matching Logic

**Location**: [server/routes/inventory.js](server/routes/inventory.js) (Lines 20-35)

```javascript
async function findInventoryByScannedCode(rawCode) {
    const normalized = normalizeScannedCode(rawCode);
    if (!normalized) return { normalized, item: null, matchType: null };

    let rows;
    const itemIdMatch = normalized.match(/^ITEM-(\d+)$/i);

    // Strategy 1: Match ITEM-{ID} pattern
    if (itemIdMatch) {
        [rows] = await pool.query(
            'SELECT i.*, p.image_url FROM sarga_inventory i LEFT JOIN sarga_products p ON i.id = p.inventory_item_id WHERE i.id = ? LIMIT 1',
            [itemIdMatch[1]]
        );
        return { normalized, item: rows[0] || null, matchType: rows[0] ? 'fallback-id' : null };
    }

    // Strategy 2: Match by SKU (case-insensitive, space-insensitive)
    [rows] = await pool.query(
        "SELECT i.*, p.image_url FROM sarga_inventory i LEFT JOIN sarga_products p ON i.id = p.inventory_item_id WHERE REPLACE(UPPER(i.sku), ' ', '') = ? LIMIT 1",
        [normalized]
    );
    return { normalized, item: rows[0] || null, matchType: rows[0] ? 'sku' : null };
}
```

**Two Matching Strategies**:

### Strategy 1: ITEM-ID Pattern
- Pattern: `ITEM-{number}` (e.g., `ITEM-42`)
- Regex: `/^ITEM-(\d+)$/i`
- Query: Matches by `sarga_inventory.id` primary key
- Match Type: `fallback-id`

### Strategy 2: SKU Lookup (Primary)
- Pattern: Any other scanned code
- SQL Query: `WHERE REPLACE(UPPER(i.sku), ' ', '') = ?`
- Behavior:
  - Takes the normalized input (already uppercased, spaces removed)
  - Compares against SKU field after removing spaces
  - Case-insensitive match (using UPPER())
  - Space-insensitive match (using REPLACE)
- Match Type: `sku`
- Left Join: Also fetches related product image from `sarga_products` table

**Database Join**:
```sql
FROM sarga_inventory i 
LEFT JOIN sarga_products p ON i.id = p.inventory_item_id
```

---

## 4. SKU Field Storage in Database

**Location**: [server/database.js](server/database.js) (Lines 90-120)

**Table**: `sarga_inventory`

**Column Definition**:
```sql
CREATE TABLE IF NOT EXISTS sarga_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  sku VARCHAR(80) UNIQUE,              -- ← SKU Field
  category VARCHAR(80),
  unit VARCHAR(30) DEFAULT 'pcs',
  quantity INT DEFAULT 0,
  reorder_level INT DEFAULT 0,
  cost_price DECIMAL(10, 2) DEFAULT 0,
  sell_price DECIMAL(10, 2) DEFAULT 0,
  hsn VARCHAR(20),
  discount DECIMAL(5, 2) DEFAULT 0,
  gst_rate DECIMAL(5, 2) DEFAULT 0,
  source_code VARCHAR(3),
  model_name VARCHAR(100),
  size_code VARCHAR(10),
  item_type ENUM('Retail', 'Consumable') DEFAULT 'Retail',
  vendor_name VARCHAR(255),
  vendor_contact VARCHAR(255),
  purchase_link TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**SKU Constraints**:
- Data Type: `VARCHAR(80)`
- **UNIQUE**: Only one item can have a specific SKU value
- Indexed: `CREATE INDEX idx_inventory_sku ON sarga_inventory (sku)`
- Nullable: Yes (can be NULL or empty string)

**Related Tables**:
- `sarga_products`: Links to inventory via `inventory_item_id` column
- `sarga_inventory_consumption`: Tracks consumptions
- `sarga_inventory_reorders`: Tracks reorder history

---

## 5. Product "MYS-POLO-L" Inventory Check

**Search Results**: ❌ **NOT FOUND**

Comprehensive search performed across:
- ✅ Server routes and main files
- ✅ Database schema definitions
- ✅ Test/check scripts
- ✅ All code files

**Findings**:
- No product with code/name containing "POLO" exists in the codebase
- No test data or fixtures reference this product
- The SKU field would store products like this

**To check database directly**, run:
```sql
-- Check if product exists by SKU
SELECT * FROM sarga_inventory 
WHERE REPLACE(UPPER(sku), ' ', '') = 'MYSPOLOL' 
OR REPLACE(UPPER(name), ' ', '') = 'MYSPOLOL';

-- Find all items with 'POLO' in name or SKU
SELECT * FROM sarga_inventory 
WHERE name LIKE '%POLO%' 
OR sku LIKE '%POLO%';
```

---

## 6. Client-Side UI Component

**Location**: [client/src/pages/QRDiagnostic.jsx](client/src/pages/QRDiagnostic.jsx)

**Features**:
- Manual code input field
- Barcode scanner integration (via ScannerModal)
- Real-time result display
- Visual indicators (CheckCircle2 for match, XCircle for no match)

**API Call**:
```javascript
const { data } = await api.get(`/inventory/qr-diagnostic/${encodeURIComponent(trimmed)}`);
```

**UI Display**:
```
Input:       MYS-POLO-L
Normalized:  MYSPOLOL
Match Type:  sku (or "fallback-id" if ITEM-ID pattern)
Item:        [Name, SKU, Category, Stock quantity]
```

---

## Summary of Code Flow

```
User Input: "MYS-POLO-L"
    ↓
[Client] QRDiagnostic.jsx → GET /inventory/qr-diagnostic/MYS-POLO-L
    ↓
[Server] Route Handler:
  1. Extract code: "MYS-POLO-L"
  2. Call findInventoryByScannedCode("MYS-POLO-L")
  3. Normalize: "MYSPOLOL"
  4. Check ITEM-ID pattern: NO MATCH
  5. Query SKU: SELECT * FROM sarga_inventory 
                WHERE REPLACE(UPPER(sku), ' ', '') = 'MYSPOLOL'
  6. If found: Return item data with match_type: "sku"
  7. If not found: Return 404 with "No inventory item matches this code"
    ↓
[Client] Display result or error
```

---

## Potential Issues & Debugging

### Issue 1: "MYS-POLO-L" Shows as "-" in Normalized Field
- **Cause**: The normalized value is empty (not the input becomes "-")
- **Solution**: Check original code - spaces might not be the only whitespace characters
- **Debug**: Log the raw input to see invisible characters

### Issue 2: SKU Match Fails Even Though Item Exists
- **Cause**: SKU field in database might have different spaces or casing
- **Solution**: Query directly: `SELECT * FROM sarga_inventory WHERE UPPER(sku) LIKE '%POLO%'`
- **Debug**: Verify SKU value in inventory exactly

### Issue 3: Code Matches as "fallback-id" But Shows Item Not Found
- **Cause**: ITEM-ID exists as pattern but that ID doesn't exist in inventory
- **Solution**: Verify the ID is valid in sarga_inventory table

---

## Related Components

- **Lookup for SKU in Billing**: [server/routes/inventory.js](server/routes/inventory.js) (Line 67, `/inventory/by-sku/:sku` endpoint)
- **QR Code Generation**: [server/routes/inventory.js](server/routes/inventory.js) (Line 494, generates QR data using `normalizeScannedCode`)
- **Audit Logging**: Uses `auditLog()` helper for tracking
