// This runs in a completely separate thread
// Cannot access DOM or React state
// Communicates via messages only

let syncInterval = null;
let isSyncing = false;
let dbName = 'sarga-offline';

// ── IndexedDB helpers inside worker ──
// Open without a version number so it works with whatever schema version already exists
const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(dbName);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
  req.onupgradeneeded = () => {}; // no-op: schema managed by offlineDb.js
});

const getAllFromStore = (db, storeName) => new Promise((resolve, reject) => {
  try {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  } catch {
    resolve([]);
  }
});

const putToStore = (db, storeName, data) => new Promise((resolve, reject) => {
  try {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  } catch {
    resolve(null);
  }
});

const clearStore = (db, storeName) => new Promise((resolve) => {
  try {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  } catch {
    resolve(false);
  }
});

const deleteFromStore = (db, storeName, key) => new Promise((resolve) => {
  try {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  } catch {
    resolve(false);
  }
});

// ── API fetch inside worker ──
const normalizeAndJoinUrl = (base, url) => {
  if (!base) return url;
  // If the URL is already absolute, return as-is
  if (/^https?:\/\//i.test(url)) return url;

  // Avoid duplicate '/api' segments (base may include '/api' and urls also start with '/api')
  let path = url;
  if (base.includes('/api') && path.startsWith('/api')) {
    path = path.replace(/^\/api/, '');
  }

  if (base.endsWith('/') && path.startsWith('/')) return base.slice(0, -1) + path;
  if (!base.endsWith('/') && !path.startsWith('/')) return base + '/' + path;
  return base + path;
};

const workerFetch = async (url, options = {}) => {
  const baseUrl = self.API_BASE_URL || '';
  const token = self.AUTH_TOKEN || '';

  const fullUrl = normalizeAndJoinUrl(baseUrl, url);

  // Build headers: include Authorization always, and only set Content-Type
  // when sending a body or a non-GET method (avoids causing unnecessary CORS preflights).
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  const method = (options.method || 'GET').toUpperCase();
  if (options.body || method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  // Some endpoints (or CORS preflight responses) return 204 No Content.
  // Attempt to read the body safely: if there's no content, return null.
  if (response.status === 204) return null;

  // Read as text first to handle empty-body cases or non-JSON responses.
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    // Fallback: return raw text if it's not JSON
    return text;
  }
};

// ── Upload pending bills ──
const syncPendingBills = async (db) => {
  const pending = await getAllFromStore(db, 'pending_bills');
  if (!pending.length) return { synced: 0 };

  let synced = 0;
  for (const bill of pending) {
    if (bill._synced) continue;
    try {
      const result = await workerFetch('/api/jobs/bulk', {
        method: 'POST',
        body: JSON.stringify(bill)
      });
      await deleteFromStore(db, 'pending_bills', bill.localId);
      synced++;
      // Notify main thread
      self.postMessage({
        type: 'BILL_SYNCED',
        localId: bill.localId,
        serverId: result.id
      });
    } catch (err) {
      // Increment retry count
      await putToStore(db, 'pending_bills', {
        ...bill,
        _retryCount: (bill._retryCount || 0) + 1,
        _lastError: err.message
      });
    }
  }
  return { synced };
};

// ── Upload pending payments ──
const syncPendingPayments = async (db) => {
  const pending = await getAllFromStore(db, 'pending_payments');
  if (!pending.length) return { synced: 0 };

  let synced = 0;
  for (const payment of pending) {
    if (payment._synced) continue;
    try {
      const result = await workerFetch('/api/customer-payments', {
        method: 'POST',
        body: JSON.stringify(payment)
      });
      await deleteFromStore(db, 'pending_payments', payment.localId);
      synced++;
      self.postMessage({
        type: 'PAYMENT_SYNCED',
        localId: payment.localId,
        serverId: result.id
      });
    } catch (err) {
      await putToStore(db, 'pending_payments', {
        ...payment,
        _retryCount: (payment._retryCount || 0) + 1,
        _lastError: err.message
      });
    }
  }
  return { synced };
};

// ── Download master data ──
const downloadMasterData = async (db) => {
  const results = {};

  // Download one at a time with delays
  const downloads = [
    { key: 'products', url: '/api/product-hierarchy', store: 'products' },
    { key: 'branches', url: '/api/branches', store: 'branches' },
    { key: 'customers', url: '/api/customers?limit=500', store: 'customers' },
    { key: 'staff', url: '/api/staff', store: 'staff' },
    { key: 'machines', url: '/api/machines', store: 'machines' },
    // INVENTORY SYNC: Download all inventory items from server and store in IndexedDB
    { key: 'inventory', url: '/api/inventory', store: 'inventory' },
    // JOBS SYNC: Download recent jobs to ensure local status/balance accuracy
    { key: 'jobs', url: '/api/jobs?limit=500', store: 'jobs' },
    // VENDORS SYNC: Download expense vendors to sync IndexedDB and server sarga_vendors table
    { key: 'vendors', url: '/api/expense-vendors', store: 'vendors' },
  ];

  for (const item of downloads) {
    try {
      // Check if cache is fresh — jobs and vendors use a shorter 2-min TTL so deletions reflect quickly
      const cacheTTL = (item.key === 'jobs' || item.key === 'vendors') ? 2 * 60 * 1000 : 30 * 60 * 1000;
      const meta = await getAllFromStore(db, 'sync_meta');
      const lastSync = meta.find(m => m.id === item.key);
      const age = lastSync ? Date.now() - lastSync.time : Infinity;

      if (age < cacheTTL) {
        results[item.key] = 'cached';
        continue;
      }

      const data = await workerFetch(item.url);
      if (item.key === 'products') {
        const tx_data = await openDB();
        // 1. Save full hierarchy to cachedData
        const hierarchyRecord = { key: 'product-hierarchy', data: data, updatedAt: Date.now() };
        await putToStore(tx_data, 'cachedData', hierarchyRecord);

        // 2. Flatten for individual products
        const flatProducts = [];
        if (Array.isArray(data)) {
          data.forEach(cat => {
            (cat.subcategories || []).forEach(sub => {
              (sub.products || []).forEach(p => flatProducts.push(p));
            });
          });
        }
        
        // 3. Store flat products in the products store
        for (const record of flatProducts) {
          await putToStore(tx_data, item.store, record);
        }
        console.log(`[Sync] Saved hierarchy and ${flatProducts.length} flat products`);
        continue;
      }

      const items = Array.isArray(data) ? data : (data.data || []);
      const tx_db = await openDB();
      // For jobs and vendors, clear the local store first so deleted items don't persist
      if (item.key === 'jobs' || item.key === 'vendors') {
        await clearStore(tx_db, item.store);
      }
      for (const record of items) {
        await putToStore(tx_db, item.store, record);
      }

      // Update sync meta
      await putToStore(db, 'sync_meta', {
        id: item.key,
        time: Date.now(),
        count: items.length
      });

      results[item.key] = items.length;

      // Notify main thread of new data
      self.postMessage({
        type: 'MASTER_DATA_UPDATED',
        key: item.key,
        count: items.length
      });

      // Wait between downloads to not hammer server
      await new Promise(r => setTimeout(r, 800));

    } catch (err) {
      results[item.key] = 'failed';
    }
  }

  return results;
};

// ── Main sync function ──
const runSync = async () => {
  if (isSyncing) return;
  isSyncing = true;

  self.postMessage({ type: 'SYNC_STARTED' });

  try {
    const db = await openDB();

    // 1. Upload pending data first
    const billsResult = await syncPendingBills(db);
    const paymentsResult = await syncPendingPayments(db);

    // 2. Download fresh master data
    const downloadResult = await downloadMasterData(db);

    self.postMessage({
      type: 'SYNC_COMPLETED',
      billsSynced: billsResult.synced,
      paymentsSynced: paymentsResult.synced,
      downloaded: downloadResult,
      timestamp: Date.now()
    });

  } catch (err) {
    self.postMessage({
      type: 'SYNC_FAILED',
      error: err.message
    });
  } finally {
    isSyncing = false;
  }
};

// ── Invalidate cache for a specific data key ──
const invalidateCache = async (dataKey) => {
  try {
    const db = await openDB();
    
    // Check if sync_meta store exists
    if (!db.objectStoreNames.contains('sync_meta')) {
      console.log(`[Sync] sync_meta store not found, skipping cache invalidation for ${dataKey}`);
      return;
    }
    
    const tx = db.transaction('sync_meta', 'readwrite');
    const store = tx.objectStore('sync_meta');
    store.delete(dataKey);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log(`[Sync] Invalidated cache for ${dataKey}`);
        resolve(true);
      };
      tx.onerror = () => {
        console.error(`[Sync] Failed to invalidate cache for ${dataKey}`);
        reject(tx.error);
      };
    });
  } catch (err) {
    console.error(`[Sync] Error invalidating cache: ${err.message}`);
  }
};

// ── Listen for messages from main thread ──
self.onmessage = (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'INIT':
      // Receive config from main thread
      self.API_BASE_URL = payload.apiBaseUrl;
      self.AUTH_TOKEN = payload.token;
      self.dbName = payload.dbName || 'sarga-offline';
      self.postMessage({ type: 'WORKER_READY' });
      break;

    case 'UPDATE_TOKEN':
      // Update auth token when user logs in
      self.AUTH_TOKEN = payload.token;
      break;

    case 'SYNC_NOW':
      // Manual sync trigger from UI
      runSync();
      break;

    case 'INVALIDATE_CACHE':
      // Invalidate specific cache entries (e.g., machines, products, branches)
      invalidateCache(payload.dataKey).then(() => {
        // Trigger sync immediately after invalidation
        runSync();
      }).catch(err => console.error('Cache invalidation error:', err));
      break;

    case 'START_AUTO_SYNC':
      // Start periodic sync every 2 minutes
      if (syncInterval) clearInterval(syncInterval);
      syncInterval = setInterval(runSync, 2 * 60 * 1000);
      // Run immediately once
      setTimeout(runSync, 3000);
      break;

    case 'STOP_AUTO_SYNC':
      if (syncInterval) clearInterval(syncInterval);
      syncInterval = null;
      break;

    case 'UPDATE_ONLINE_STATUS':
      if (payload.online && !isSyncing) {
        // Run sync when coming back online
        setTimeout(runSync, 1000);
      }
      break;
  }
};