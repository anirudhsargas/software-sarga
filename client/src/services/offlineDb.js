/**
 * offlineDb.js — IndexedDB wrapper for offline-first Sarga shop.
 *
 * Stores:
 *   cachedData    – product hierarchy, branches, machines (for offline bill form)
 *   offlineBills  – bills created while offline, waiting to sync
 *   meta          – key/value pairs (lastSync timestamps, etc.)
 *
 * Usage:
 *   import db from '../services/offlineDb';
 *   await db.cacheData('product-hierarchy', data);
 *   const hierarchy = await db.getCachedData('product-hierarchy');
 *   await db.queueBill(billPayload);
 *   const pending = await db.getPendingBills();
 */

const DB_NAME = 'sarga-offline';
const DB_VERSION = 1;

// ──────────────────── Open / Upgrade ────────────────────
function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('cachedData')) {
                db.createObjectStore('cachedData', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('offlineBills')) {
                const store = db.createObjectStore('offlineBills', { keyPath: 'id', autoIncrement: true });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('meta')) {
                db.createObjectStore('meta', { keyPath: 'key' });
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Run a single read/write transaction on one store */
async function tx(storeName, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const result = fn(store);

        transaction.oncomplete = () => {
            db.close();
            resolve(result._result ?? undefined);
        };
        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };

        // If fn returned an IDBRequest, capture its result
        if (result && typeof result.onsuccess === 'undefined' && result._result === undefined) {
            // fn returned a wrapper — skip
        }
    });
}

/** Simplified helpers that return promises from IDB requests */
function reqToPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ──────────────────── Cached Data (product hierarchy, branches etc.) ────────────────────

async function cacheData(key, data) {
    const db = await openDb();
    const txn = db.transaction('cachedData', 'readwrite');
    const store = txn.objectStore('cachedData');
    store.put({ key, data, updatedAt: Date.now() });
    return new Promise((resolve, reject) => {
        txn.oncomplete = () => { db.close(); resolve(); };
        txn.onerror = () => { db.close(); reject(txn.error); };
    });
}

async function getCachedData(key) {
    const db = await openDb();
    const txn = db.transaction('cachedData', 'readonly');
    const store = txn.objectStore('cachedData');
    const req = store.get(key);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => { db.close(); resolve(req.result?.data ?? null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function getCachedDataAge(key) {
    const db = await openDb();
    const txn = db.transaction('cachedData', 'readonly');
    const store = txn.objectStore('cachedData');
    const req = store.get(key);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => {
            db.close();
            const ts = req.result?.updatedAt;
            resolve(ts ? Date.now() - ts : Infinity);
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

// ──────────────────── Offline Bills Queue ────────────────────

/**
 * Queue a bill for later sync.
 * Payload should match the same shape as the online billing API call.
 */
async function queueBill(payload) {
    const db = await openDb();
    const txn = db.transaction('offlineBills', 'readwrite');
    const store = txn.objectStore('offlineBills');
    const record = {
        ...payload,
        status: 'pending',      // pending | syncing | synced | failed
        createdAt: Date.now(),
        attempts: 0,
        lastError: null,
        offlineInvoiceRef: `OFFLINE-${Date.now().toString(36).toUpperCase()}`,
    };
    const req = store.add(record);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => { db.close(); resolve(req.result); }; // returns auto-incremented id
        txn.onerror = () => { db.close(); reject(txn.error); };
    });
}

async function getPendingBills() {
    const db = await openDb();
    const txn = db.transaction('offlineBills', 'readonly');
    const store = txn.objectStore('offlineBills');
    const idx = store.index('status');
    const req = idx.getAll('pending');
    return new Promise((resolve, reject) => {
        req.onsuccess = () => { db.close(); resolve(req.result || []); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function getAllBills() {
    const db = await openDb();
    const txn = db.transaction('offlineBills', 'readonly');
    const store = txn.objectStore('offlineBills');
    const req = store.getAll();
    return new Promise((resolve, reject) => {
        req.onsuccess = () => { db.close(); resolve(req.result || []); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function updateBillStatus(id, status, error = null) {
    const db = await openDb();
    const txn = db.transaction('offlineBills', 'readwrite');
    const store = txn.objectStore('offlineBills');
    const req = store.get(id);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => {
            const record = req.result;
            if (!record) { db.close(); resolve(false); return; }
            record.status = status;
            record.lastError = error;
            record.attempts = (record.attempts || 0) + (status === 'syncing' ? 1 : 0);
            record.syncedAt = status === 'synced' ? Date.now() : record.syncedAt;
            store.put(record);
            txn.oncomplete = () => { db.close(); resolve(true); };
        };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function deleteSyncedBills() {
    const db = await openDb();
    const txn = db.transaction('offlineBills', 'readwrite');
    const store = txn.objectStore('offlineBills');
    const idx = store.index('status');
    const req = idx.openCursor('synced');
    let count = 0;
    return new Promise((resolve, reject) => {
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                cursor.delete();
                count++;
                cursor.continue();
            }
            // oncomplete fires after all cursor iterations
        };
        txn.oncomplete = () => { db.close(); resolve(count); };
        txn.onerror = () => { db.close(); reject(txn.error); };
    });
}

async function getPendingBillCount() {
    const db = await openDb();
    const txn = db.transaction('offlineBills', 'readonly');
    const store = txn.objectStore('offlineBills');
    const idx = store.index('status');
    const req = idx.count('pending');
    return new Promise((resolve, reject) => {
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

// ──────────────────── Meta ────────────────────

async function setMeta(key, value) {
    const db = await openDb();
    const txn = db.transaction('meta', 'readwrite');
    txn.objectStore('meta').put({ key, value, updatedAt: Date.now() });
    return new Promise((resolve, reject) => {
        txn.oncomplete = () => { db.close(); resolve(); };
        txn.onerror = () => { db.close(); reject(txn.error); };
    });
}

async function getMeta(key) {
    const db = await openDb();
    const txn = db.transaction('meta', 'readonly');
    const req = txn.objectStore('meta').get(key);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => { db.close(); resolve(req.result?.value ?? null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

// ──────────────────── Export ────────────────────

const offlineDb = {
    cacheData,
    getCachedData,
    getCachedDataAge,
    queueBill,
    getPendingBills,
    getAllBills,
    updateBillStatus,
    deleteSyncedBills,
    getPendingBillCount,
    setMeta,
    getMeta,
};

export default offlineDb;
