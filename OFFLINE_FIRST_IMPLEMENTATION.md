> Master Context: [SARGA_WORK_CONTEXT.md](SARGA_WORK_CONTEXT.md)
> Source of truth for project state, architecture, and workflow decisions.

# Offline-First Data Strategy Implementation

## Overview

A comprehensive offline-first architecture has been implemented for the Sarga billing system, enabling seamless operation during network outages with automatic synchronization when connectivity returns.

---

## Architecture

### 1. **IndexedDB Storage Layer** (`client/src/services/offlineDb.js`)

#### Object Stores
- **`cachedData`** — Legacy store for product hierarchy cache (key-based)
- **`products`** — Full product list with pricing tiers (indexed by ID)
- **`customers`** — Customer directory with mobile numbers (indexed by ID)
- **`branches`** — Branch information (indexed by ID)
- **`machines`** — Machine/equipment list (indexed by ID)
- **`offlineBills`** — Bills created offline awaiting sync (status-indexed)
- **`pending_payments`** — Payments created offline awaiting sync (status-indexed)
- **`meta`** — Key-value metadata (sync timestamps, etc.)

#### New Functions

**Product/Customer/Branch/Machine Caching:**
```javascript
// Cache critical data from server
await offlineDb.cacheProducts(products)
await offlineDb.cacheCustomers(customers)
await offlineDb.cacheBranches(branches)
await offlineDb.cacheMachines(machines)

// Retrieve cached data
const products = await offlineDb.getCachedProducts()
const customers = await offlineDb.getCachedCustomers()
const branches = await offlineDb.getCachedBranches()
const machines = await offlineDb.getCachedMachines()
```

**Offline Payment Support:**
```javascript
// Save payment for later sync
await offlineDb.savePendingPayment(paymentData)

// Retrieve all unsynced payments
const pending = await offlineDb.getPendingPayments()

// Mark as synced after server confirms
await offlineDb.updatePaymentStatus(id, 'synced')

// Cleanup old synced records (>24h)
await offlineDb.deleteSyncedPayments()
```

**Generic Sync Marking:**
```javascript
// Mark any record as synced
await offlineDb.markSynced('pending_bills', billId)
await offlineDb.markSynced('pending_payments', paymentId)
```

---

### 2. **Background Sync Service** (`client/src/services/backgroundSync.js`)

Handles all syncing operations when connectivity returns.

#### Core Functions

**Download Fresh Data:**
```javascript
// Download and cache products, customers, branches, machines
const results = await downloadCriticalData()
// Returns: { products, customers, branches, machines }
```

**Sync All Pending Data:**
```javascript
// Main entry point: syncs bills, payments, and downloads fresh data
await syncWhenOnline()

// Shows toast: "✅ Synced X items"
// Emits sync events for UI updates
```

**Event System:**
```javascript
// Listen for sync events
import { onSyncEvent } from '../services/backgroundSync'

onSyncEvent((event) => {
  if (event.type === 'bill-sync-end') {
    console.log(`${event.synced} bills synced`)
  }
})
```

---

### 3. **Offline Sync Integration** (`client/src/services/offlineSync.js`)

Initializes the offline infrastructure and handles automatic reconnection.

**Initialization (called in App.jsx):**
```javascript
import { initOfflineSync } from '../services/offlineSync'

// Registers online/offline event listeners
// Pre-caches critical data on startup
// Syncs stale queued data if online on startup
initOfflineSync()
```

---

## Implementation in Pages

### [Billing.jsx](d:\software%20sarga\client\src\pages\Billing.jsx)

**Offline Detection:**
- Checks `navigator.onLine` when loading products
- If online: fetches fresh data and caches via `cacheProducts()`
- If offline: loads from `getCachedProducts()` immediately
- Sets `offlineMode` state to show banner

**Offline Banner:**
```jsx
{offlineMode && (
  <div style={{ backgroundColor: 'var(--warning-bg)' }}>
    <AlertCircle size={16} />
    <span>Using offline data. Changes will sync when connected.</span>
  </div>
)}
```

**Offline Bill Creation:**
- Network errors automatically trigger `offlineDb.queueBill()`
- Bill includes all fields: cashAmount, upiAmount, **chequeAmount**, **accountTransferAmount**
- Shows: "Bill saved offline! It will sync when internet returns."
- Bill persists in IndexedDB with status: `pending`

**Critical Additions:**
- Now sends `cheque_amount` and `account_transfer_amount` to server
- Includes both in offline queue
- Pre-caches products when online for instant offline availability

---

### [CustomerPayments.jsx](d:\software%20sarga\client\src\pages\CustomerPayments.jsx)

**Offline Mode Banner:**
```jsx
{!isOnline && (
  <div style={{ backgroundColor: 'var(--warning-bg)' }}>
    Offline mode. Payments will be saved locally and sync when connected.
  </div>
)}
```

**Updated Subtitle:**
- Online: "Collect advance or full payment for customer orders"
- Offline: "Offline — payments will sync when internet returns."

**Offline Payment Saving:**
```javascript
try {
  // Normal server submission
  const response = await api.post('/customer-payments', {...})
} catch (err) {
  if (isNetworkError) {
    // Queue payment for sync
    await offlineDb.savePendingPayment({
      customer_id, customer_name, customer_mobile,
      total_amount, net_amount, sgst_amount, cgst_amount,
      cash_amount, upi_amount, cheque_amount, 
      account_transfer_amount,
      // ... other fields
    })
    toast.success("Payment saved offline!")
  }
}
```

---

### [App.jsx](d:\software%20sarga\client\src\App.jsx)

**Global Sync Trigger:**
```javascript
import { syncWhenOnline } from './services/backgroundSync'

useEffect(() => {
  // Initialize offline infrastructure
  initOfflineSync()
  
  // Add online event listener
  const handleOnline = () => {
    syncWhenOnline().catch((err) => {
      console.warn('Failed to sync:', err)
    })
  }
  
  window.addEventListener('online', handleOnline)
  
  return () => {
    window.removeEventListener('online', handleOnline)
  }
}, [])
```

---

## Sync Flow

### When Connection Returns:

1. **Browser fires `online` event**
2. **App.jsx trigger:** Calls `syncWhenOnline()`
3. **Background Sync Step 1:** Downloads fresh data
   - Calls API endpoints: `/product-hierarchy`, `/customers`, `/branches`, `/machines`
   - Stores results in IndexedDB via `cache*()` functions
   - Emits: `{ type: 'data-download', success: true }`

4. **Background Sync Step 2:** Syncs pending bills
   - Retrieves all `pending` bills from `offlineBills` store
   - For each bill:
     - Creates jobs via `/api/jobs/bulk`
     - Creates payment via `/api/customer-payments` (includes cheque + transfer amounts)
     - Updates bill status to `synced`
   - Emits: `{ type: 'bill-sync-end', synced, failed }`

5. **Background Sync Step 3:** Syncs pending payments
   - Retrieves all `pending` payments from `pending_payments` store
   - For each payment:
     - Posts to `/api/customer-payments` (includes all 4 payment methods)
     - Updates status to `synced`
   - Emits: `{ type: 'payment-sync-end', synced, failed }`

6. **Success Toast:**
   - "✅ Synced 5 items" (if multiple items)
   - "✅ Synced 1 item" (if single item)
   - Shows failed count if any: "(2 failed)"

7. **Cleanup:**
   - Deletes synced records older than 24 hours
   - Preserves recent synced records for user review

---

## Data Structures

### Pending Bill (offlineBills store)
```javascript
{
  id: 1,  // auto-incremented
  status: 'pending|syncing|synced|failed',
  createdAt: 1700000000000,
  syncedAt: 1700001000000,  // set when synced
  attempts: 2,
  lastError: 'Network timeout',
  offlineInvoiceRef: 'OFFLINE-ABC123',
  
  // Bill data
  customerId: 123,
  customerName: 'ABC Corp',
  customerMobile: '9876543210',
  customerType: 'Retail',
  totalAmount: 5000,
  netAmount: 4237.29,
  sgstAmount: 381.36,
  cgstAmount: 381.35,
  discountPercent: 5,
  discountAmount: 263.16,
  advancePaid: 5000,
  paymentMethod: 'Both',  // 'Both' = Cash + UPI
  cashAmount: 3000,
  upiAmount: 2000,
  chequeAmount: 0,
  accountTransferAmount: 0,
  referenceNumber: 'CHQ123456',
  description: 'Methods: Cash + UPI',
  paymentDate: '2024-12-20',
  
  // Order details
  orderLines: [
    {
      product_id: 45,
      product_name: 'Gloss Paper 200gsm',
      quantity: 100,
      unit_price: 25,
      total_amount: 2500,
      ...
    }
  ]
}
```

### Pending Payment (pending_payments store)
```javascript
{
  id: 1,  // auto-incremented
  status: 'pending|syncing|synced|failed',
  createdAt: 1700000000000,
  syncedAt: 1700001000000,
  attempts: 1,
  lastError: null,
  offlinePaymentRef: 'OFFLINE-PAY-XYZ789',
  
  // Payment data
  customer_id: 123,
  customer_name: 'ABC Corp',
  customer_mobile: '9876543210',
  total_amount: 5000,
  net_amount: 4237.29,
  sgst_amount: 381.36,
  cgst_amount: 381.35,
  discount_percent: 5,
  discount_amount: 263.16,
  advance_paid: 5000,
  cash_amount: 2000,
  upi_amount: 2000,
  cheque_amount: 1000,
  account_transfer_amount: 0,
  reference_number: 'UPI123',
  description: 'Offline payment',
  payment_date: '2024-12-20',
  
  // Associated jobs
  order_lines: [...],
  job_ids: [101, 102, 103]
}
```

---

## Features

### ✅ Automatic Detection
- Detects network unavailability in real-time
- Checks `navigator.onLine` and API response errors
- Distinguishes between network errors and server errors

### ✅ Data Preservation
- All bill and payment details indexed in IndexedDB
- Auto-cleanup: removes synced records after 24 hours
- Keeps recent history for user reference

### ✅ Sync Robustness
- Retries failed syncs on next reconnection
- Tracks attempt count and last error per record
- Non-atomic: syncs one-by-one, doesn't lose progress on partial failures

### ✅ User Feedback
- Offline banner on Billing and Payment pages
- Toast notifications on sync completion
- "X items synced successfully" message
- Shows failed count if any items didn't sync

### ✅ Multi-Method Payment Support
- All 4 payment methods cached: Cash, UPI, Cheque, Account Transfer
- Cheque/Account Transfer numbers are now transmitted
- Offline bills/payments include all method amounts

### ✅ Product Data Pre-caching
- "Download for Offline" button in Billing header
- Forces fresh download of products, branches, machines, customers
- Manual override for users preparing for known outages

---

## API Changes

### `/api/customer-payments` (POST) — Now Includes:
```javascript
{
  // ... existing fields ...
  cash_amount: 2000,
  upi_amount: 1500,
  cheque_amount: 500,           // NEW
  account_transfer_amount: 0,   // NEW
  // ... rest of fields ...
}
```

### New Sync API Pattern:
**via backgroundSync.js**
- `POST /api/jobs/bulk` — Creates multiple jobs in one call
- `POST /api/customer-payments` — Records payment (handles both online and offline flows)

---

## Configuration

### Sync Intervals
- **Data TTL:** 4 hours (checked on prefetch)
- **Cleanup:** Synced records older than 24 hours are deleted
- **Retry:** On next `online` event (browser fires when connectivity returns)

### Retry Logic
- Max 10 attempts per record (tracked in `attempts` field)
- No exponential backoff (syncs immediately on reconnect)
- Failures persist as `pending` for automatic retry

---

## Testing Offline Behavior

### Manual Testing:

1. **Start Billing:**
   - Go to Billing page
   - Disable network (DevTools → Offline or unplug)
   - Create a bill
   - Should see: "Bill saved offline!"

2. **Resume Online:**
   - Re-enable network
   - Browser automatically fires `online` event
   - Should see: "✅ Synced X items"

3. **Payment offline:**
   - Go to Customer Payments
   - Disable network
   - Create a payment
   - Should see: "Payment saved offline!"

### Network Debug:

```javascript
// In browser console
// Check pending bills
const db = await indexedDB.databases()
const pendingBills = await offlineDb.getPendingBills()
const pendingPayments = await offlineDb.getPendingPayments()
console.log(pendingBills, pendingPayments)

// Manually trigger sync
import { syncWhenOnline } from './services/backgroundSync'
await syncWhenOnline()
```

---

## Browser Compatibility

- **IndexedDB:** All modern browsers (IE 10+, Safari, Firefox, Chrome, Edge)
- **Online Event:** All modern browsers
- **Service Worker:** Optional (not required; sync can happen even without SW)

---

## Files Modified

1. **`client/src/services/offlineDb.js`**
   - Added 4 new object stores (products, customers, branches, machines)
   - Added 1 new payment store (pending_payments)
   - Added cache functions for each store
   - Added payment sync functions

2. **`client/src/services/backgroundSync.js`** *(NEW)*
   - Downloads fresh data on reconnection
   - Syncs pending bills to `/api/jobs/bulk` and `/api/customer-payments`
   - Syncs pending payments to `/api/customer-payments`
   - Emits sync events for UI updates

3. **`client/src/services/offlineSync.js`**
   - Updated `initOfflineSync()` to use `backgroundSync`
   - Updated `handleOnline()` to call `syncWhenOnline()`

4. **`client/src/pages/Billing.jsx`**
   - Added offline detection on mount
   - Caches products when fetched
   - Shows offline banner
   - Sends `cheque_amount` and `account_transfer_amount` to server
   - Includes both in offline queue

5. **`client/src/pages/CustomerPayments.jsx`**
   - Added `offlineDb` import and `useOnlineStatus` hook
   - Shows offline banner in header
   - Catches network errors and queues payments offline
   - Sends all 4 payment method amounts

6. **`client/src/App.jsx`**
   - Added `syncWhenOnline` import
   - Added explicit `online` event listener
   - Calls `syncWhenOnline()` when connectivity returns

---

## Future Enhancements

- [ ] Encrypt sensitive data in IndexedDB
- [ ] Implement service worker for true PWA sync
- [ ] Add conflict resolution for data updated both offline and online
- [ ] Support offline preview of cached reports/dashboards
- [ ] Batch sync optimization for high-volume offline periods

