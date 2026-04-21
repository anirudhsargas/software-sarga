/**
 * offlineDb.js — IndexedDB wrapper for offline-first Sarga shop.
 */

const DB_NAME = 'sarga-offline';
const DB_VERSION = 5;

let dbInstance = null;
let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            if (!db.objectStoreNames.contains('cachedData')) {
                db.createObjectStore('cachedData', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('products')) {
                db.createObjectStore('products', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('customers')) {
                const store = db.createObjectStore('customers', { keyPath: 'id' });
                store.createIndex('name', 'name', { unique: false });
                store.createIndex('mobile', 'mobile', { unique: false });
            }
            if (!db.objectStoreNames.contains('branches')) {
                db.createObjectStore('branches', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('machines')) {
                db.createObjectStore('machines', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('offlineBills')) {
                const store = db.createObjectStore('offlineBills', { keyPath: 'id', autoIncrement: true });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('syncStatus', 'syncStatus', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
            // [NOTE] pending_payments sync logic now handled by syncWorker
            if (!db.objectStoreNames.contains('pending_payments')) {
                const store = db.createObjectStore('pending_payments', { keyPath: 'id', autoIncrement: true });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('syncStatus', 'syncStatus', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('meta')) {
                db.createObjectStore('meta', { keyPath: 'key' });
            }

            if (!db.objectStoreNames.contains('staff')) {
                const store = db.createObjectStore('staff', { keyPath: 'id' });
                store.createIndex('branch_id', 'branch_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('pricing')) {
                db.createObjectStore('pricing', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('jobs')) {
                const store = db.createObjectStore('jobs', { keyPath: 'id' });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('customer_id', 'customer_id', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
                store.createIndex('syncStatus', 'syncStatus', { unique: false });
            }
            if (!db.objectStoreNames.contains('payments')) {
                const store = db.createObjectStore('payments', { keyPath: 'id' });
                store.createIndex('job_id', 'job_id', { unique: false });
                store.createIndex('customer_id', 'customer_id', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
                store.createIndex('syncStatus', 'syncStatus', { unique: false });
            }
            if (!db.objectStoreNames.contains('attendance')) {
                const store = db.createObjectStore('attendance', { keyPath: 'localId', autoIncrement: true });
                store.createIndex('staff_id', 'staff_id', { unique: false });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('syncStatus', 'syncStatus', { unique: false });
            }
            if (!db.objectStoreNames.contains('expenses')) {
                const store = db.createObjectStore('expenses', { keyPath: 'localId', autoIncrement: true });
                store.createIndex('category', 'category', { unique: false });
                store.createIndex('date', 'date', { unique: false });
                store.createIndex('syncStatus', 'syncStatus', { unique: false });
            }
            if (!db.objectStoreNames.contains('bills_documents')) {
                const store = db.createObjectStore('bills_documents', { keyPath: 'id', autoIncrement: true });
                store.createIndex('document_type', 'document_type', { unique: false });
                store.createIndex('vendor_name', 'vendor_name', { unique: false });
                store.createIndex('bill_date', 'bill_date', { unique: false });
            }

            if (!db.objectStoreNames.contains('vendors')) {
                const store = db.createObjectStore('vendors', { keyPath: 'id' });
                store.createIndex('type', 'type', { unique: false });
                store.createIndex('name', 'name', { unique: false });
            }
            if (!db.objectStoreNames.contains('vendor_bills')) {
                const store = db.createObjectStore('vendor_bills', { keyPath: 'id', autoIncrement: true });
                store.createIndex('vendor_id', 'vendor_id', { unique: false });
                store.createIndex('syncStatus', 'syncStatus', { unique: false });
            }
            if (!db.objectStoreNames.contains('inventory')) {
                const store = db.createObjectStore('inventory', { keyPath: 'id' });
                store.createIndex('category', 'category', { unique: false });
            }
            if (!db.objectStoreNames.contains('payment_methods')) {
                db.createObjectStore('payment_methods', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('offline_payments')) {
                const store = db.createObjectStore('offline_payments', { keyPath: 'id', autoIncrement: true });
                store.createIndex('syncStatus', 'syncStatus', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }

            if (!db.objectStoreNames.contains('assignments')) {
                const store = db.createObjectStore('assignments', { keyPath: 'id' });
                store.createIndex('job_id', 'job_id', { unique: false });
                store.createIndex('staff_id', 'staff_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('paper_logs')) {
                const store = db.createObjectStore('paper_logs', { keyPath: 'id', autoIncrement: true });
                store.createIndex('job_id', 'job_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('designs')) {
                const store = db.createObjectStore('designs', { keyPath: 'id' });
                store.createIndex('job_id', 'job_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('proofs')) {
                const store = db.createObjectStore('proofs', { keyPath: 'id' });
                store.createIndex('job_id', 'job_id', { unique: false });
            }
        };

        req.onblocked = () => {
            console.warn('[OfflineDB] Upgrade blocked by another tab. Please close other tabs.');
        };

        req.onsuccess = () => {
            dbInstance = req.result;
            dbInstance.onversionchange = () => {
                // Close local handle so future openDb() calls will recreate the connection.
                dbInstance.close();
                dbInstance = null;
                dbPromise = null;
                // Do NOT force a full page reload here — that was closing user dialogs unexpectedly.
                // Instead, emit an application event so the UI can choose how to notify the user.
                console.warn('[OfflineDB] Database version changed elsewhere. Connection closed.');
                try {
                    if (typeof window !== 'undefined' && window.dispatchEvent) {
                        window.dispatchEvent(new CustomEvent('offline-db-versionchange'));
                    }
                } catch (e) {
                    // Fallback: log but avoid throwing
                    console.warn('[OfflineDB] Failed to dispatch versionchange event:', e);
                }
            };
            resolve(dbInstance);
        };

        req.onerror = () => {
            dbPromise = null;
            reject(req.error);
        };
    });
    return dbPromise;
}

function closeDb() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
        dbPromise = null;
    }
}

async function bulkCache(storeName, records) {
    const db = await openDb();
    const CHUNK_SIZE = 100; // Process 100 records at a time to avoid blocking
    
    // Step 1: Clear the store first
    const clearTxn = db.transaction(storeName, 'readwrite');
    clearTxn.objectStore(storeName).clear();
    await new Promise((resolve, reject) => {
        clearTxn.oncomplete = resolve;
        clearTxn.onerror = () => reject(clearTxn.error);
    });
    
    // Step 2: Insert records in chunks, yielding between each chunk
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        
        await new Promise((resolve, reject) => {
            const txn = db.transaction(storeName, 'readwrite');
            const store = txn.objectStore(storeName);
            
            chunk.forEach(r => {
                store.put({ ...r, cachedAt: Date.now() });
            });
            
            txn.oncomplete = resolve;
            txn.onerror = () => reject(txn.error);
        });
        
        // Yield to browser between chunks to allow rendering and other tasks
        if (i + CHUNK_SIZE < records.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

async function getAll(storeName) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readonly');
    const req = txn.objectStore(storeName).getAll();
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function getById(storeName, id) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readonly');
    const req = txn.objectStore(storeName).get(id);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function getAllByIndex(storeName, indexName, value) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readonly');
    const store = txn.objectStore(storeName);
    const idx = store.index(indexName);
    const req = idx.getAll(value);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function putRecord(storeName, record) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readwrite');
    const req = txn.objectStore(storeName).put(record);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        txn.onerror = () => reject(txn.error);
    });
}

async function addRecord(storeName, record) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readwrite');
    const req = txn.objectStore(storeName).add(record);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        txn.onerror = () => reject(txn.error);
    });
}

async function countByIndex(storeName, indexName, value) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readonly');
    const req = txn.objectStore(storeName).index(indexName).count(value);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deleteByIndex(storeName, indexName, value) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readwrite');
    const idx = txn.objectStore(storeName).index(indexName);
    const req = idx.openCursor(value);
    let count = 0;
    return new Promise((resolve, reject) => {
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) { cursor.delete(); count++; cursor.continue(); }
        };
        txn.oncomplete = () => resolve(count);
        txn.onerror = () => reject(txn.error);
    });
}

async function save(storeName, data) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readwrite');
    const store = txn.objectStore(storeName);
    const req = store.put(data);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        txn.onerror = () => reject(txn.error);
    });
}

async function deleteRecord(storeName, id) {
    const db = await openDb();
    const txn = db.transaction(storeName, 'readwrite');
    const store = txn.objectStore(storeName);
    const req = store.delete(id);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve();
        txn.onerror = () => reject(txn.error);
    });
}

// ── Entities ──
const cacheProducts = (p) => bulkCache('products', p);
const getCachedProducts = () => getAll('products');
const cacheCustomers = (c) => bulkCache('customers', c);
const getCachedCustomers = () => getAll('customers');
const cacheBranches = (b) => bulkCache('branches', b);
const getCachedBranches = () => getAll('branches');
const cacheMachines = (m) => bulkCache('machines', m);
const getCachedMachines = () => getAll('machines');
const cacheStaff = (s) => bulkCache('staff', s);
const getCachedStaff = () => getAll('staff');
const cachePricing = (r) => bulkCache('pricing', r);
const getCachedPricing = () => getAll('pricing');
const cacheJobs = (j) => bulkCache('jobs', j);
const getCachedJobs = () => getAll('jobs');
const getJobById = (id) => getById('jobs', isNaN(id) || typeof id === 'string' && (id.startsWith('LOCAL') || id.startsWith('CUST')) ? id : Number(id));
const putJob = (job) => putRecord('jobs', job);
const cachePayments = (p) => bulkCache('payments', p);
const getCachedPayments = () => getAll('payments');
const getPaymentsByCustomer = (id) => getAllByIndex('payments', 'customer_id', isNaN(id) || typeof id === 'string' && id.startsWith('CUST') ? id : Number(id));
const cacheAssignments = (a) => bulkCache('assignments', a);
const getCachedAssignments = () => getAll('assignments');
const getAssignmentsByStaff = (id) => getAllByIndex('assignments', 'staff_id', isNaN(id) ? id : Number(id));

// ── KV Cache ──
async function cacheData(key, data) {
    const db = await openDb();
    const txn = db.transaction('cachedData', 'readwrite');
    txn.objectStore('cachedData').put({ key, data, updatedAt: Date.now() });
    return new Promise((resolve, reject) => {
        txn.oncomplete = () => resolve();
        txn.onerror = () => reject(txn.error);
    });
}
async function getCachedData(key) {
    const db = await openDb();
    const txn = db.transaction('cachedData', 'readonly');
    const req = txn.objectStore('cachedData').get(key);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result?.data ?? null);
        req.onerror = () => reject(req.error);
    });
}
async function getCachedDataAge(key) {
    const db = await openDb();
    const txn = db.transaction('cachedData', 'readonly');
    const req = txn.objectStore('cachedData').get(key);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => {
            const ts = req.result?.updatedAt;
            resolve(ts ? Date.now() - ts : Infinity);
        };
        req.onerror = () => reject(req.error);
    });
}

// ── Bills & Payments Queue ──
async function queueBill(p) {
    const r = { ...p, status: 'pending', syncStatus: 'pending', createdAt: Date.now(), attempts: 0, lastError: null, offlineInvoiceRef: `OFFLINE-${Date.now().toString(36).toUpperCase()}` };
    return addRecord('offlineBills', r);
}
const getPendingBills = () => getAllByIndex('offlineBills', 'status', 'pending');
const getAllBills = () => getAll('offlineBills');
const getPendingBillCount = () => countByIndex('offlineBills', 'status', 'pending');
const deleteSyncedBills = () => deleteByIndex('offlineBills', 'status', 'synced');
async function updateBillStatus(id, status, error = null) {
    const r = await getById('offlineBills', id);
    if (!r) return false;
    r.status = status;
    r.syncStatus = status;
    r.lastError = error;
    r.attempts = (r.attempts || 0) + (status === 'syncing' ? 1 : 0);
    r.syncedAt = status === 'synced' ? Date.now() : r.syncedAt;
    await putRecord('offlineBills', r);
    return true;
}

async function savePendingPayment(p) {
    const r = { ...p, status: 'pending', syncStatus: 'pending', createdAt: Date.now(), attempts: 0, lastError: null, offlinePaymentRef: `OFFLINE-PAY-${Date.now().toString(36).toUpperCase()}` };
    // [NOTE] pending_payments sync logic now handled by syncWorker
    return addRecord('pending_payments', r);
}
// [NOTE] pending_payments sync logic now handled by syncWorker
const getPendingPayments = () => getAllByIndex('pending_payments', 'status', 'pending');
// [NOTE] pending_payments sync logic now handled by syncWorker
const getPendingPaymentCount = () => countByIndex('pending_payments', 'status', 'pending');
// [NOTE] pending_payments sync logic now handled by syncWorker
const deleteSyncedPayments = () => deleteByIndex('pending_payments', 'status', 'synced');
async function updatePaymentStatus(id, status, error = null) {
    const r = await getById('pending_payments', id);
    if (!r) return false;
    r.status = status;
    r.syncStatus = status;
    r.lastError = error;
    r.attempts = (r.attempts || 0) + (status === 'syncing' ? 1 : 0);
    r.syncedAt = status === 'synced' ? Date.now() : r.syncedAt;
    await putRecord('pending_payments', r);
    return true;
}

// ── Attendance & Expenses ──
async function saveAttendance(d) {
    return addRecord('attendance', { ...d, syncStatus: 'pending', createdAt: Date.now(), attempts: 0, lastError: null });
}
const getPendingAttendance = () => getAllByIndex('attendance', 'syncStatus', 'pending');
const getPendingAttendanceCount = () => countByIndex('attendance', 'syncStatus', 'pending');
const getAllAttendance = () => getAll('attendance');
const deleteSyncedAttendance = () => deleteByIndex('attendance', 'syncStatus', 'synced');
async function updateAttendanceStatus(id, status, err = null) {
    const r = await getById('attendance', id);
    if (!r) return false;
    r.syncStatus = status;
    r.lastError = err;
    r.attempts = (r.attempts || 0) + (status === 'syncing' ? 1 : 0);
    r.syncedAt = status === 'synced' ? Date.now() : r.syncedAt;
    await putRecord('attendance', r);
    return true;
}
async function cacheAttendance(records) {
    const db = await openDb();
    const txn = db.transaction('attendance', 'readwrite');
    const store = txn.objectStore('attendance');
    records.forEach(r => { if (r.localId || r.id) store.put({ ...r, localId: r.localId || r.id, syncStatus: 'synced', cachedAt: Date.now() }); });
    return new Promise((resolve, reject) => {
        txn.oncomplete = () => resolve();
        txn.onerror = () => reject(txn.error);
    });
}

async function saveExpense(d) {
    return addRecord('expenses', { ...d, syncStatus: 'pending', createdAt: Date.now(), attempts: 0, lastError: null });
}
const getPendingExpenses = () => getAllByIndex('expenses', 'syncStatus', 'pending');
const getPendingExpenseCount = () => countByIndex('expenses', 'syncStatus', 'pending');
const getAllExpenses = () => getAll('expenses');
const deleteSyncedExpenses = () => deleteByIndex('expenses', 'syncStatus', 'synced');
async function updateExpenseStatus(id, status, err = null) {
    const r = await getById('expenses', id);
    if (!r) return false;
    r.syncStatus = status;
    r.lastError = err;
    r.attempts = (r.attempts || 0) + (status === 'syncing' ? 1 : 0);
    r.syncedAt = status === 'synced' ? Date.now() : r.syncedAt;
    await putRecord('expenses', r);
    return true;
}

// ── Meta & Job Details ──
async function setMeta(key, value) {
    const db = await openDb();
    const txn = db.transaction('meta', 'readwrite');
    txn.objectStore('meta').put({ key, value, updatedAt: Date.now() });
    return new Promise((resolve, reject) => {
        txn.oncomplete = () => resolve();
        txn.onerror = () => reject(txn.error);
    });
}
async function getMeta(key) {
    const db = await openDb();
    const txn = db.transaction('meta', 'readonly');
    const req = txn.objectStore('meta').get(key);
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result?.value ?? null);
        req.onerror = () => reject(req.error);
    });
}
const getAssignmentsByJob = (id) => getAllByIndex('assignments', 'job_id', isNaN(id) || typeof id === 'string' && id.startsWith('LOCAL') ? id : Number(id));
const getPaperLogsByJob = (id) => getAllByIndex('paper_logs', 'job_id', isNaN(id) || typeof id === 'string' && id.startsWith('LOCAL') ? id : Number(id));
const getDesignsByJob = (id) => getAllByIndex('designs', 'job_id', isNaN(id) || typeof id === 'string' && id.startsWith('LOCAL') ? id : Number(id));
const getProofsByJob = (id) => getAllByIndex('proofs', 'job_id', isNaN(id) || typeof id === 'string' && id.startsWith('LOCAL') ? id : Number(id));
async function cacheJobDetails(id, details) {
    const { assignments, paper_logs, designs, proofs } = details;
    if (assignments) await bulkCache('assignments', assignments.map(a => ({ ...a, job_id: Number(id) })));
    if (paper_logs) await bulkCache('paper_logs', paper_logs.map(l => ({ ...l, job_id: Number(id) })));
    if (designs) await bulkCache('designs', designs.map(d => ({ ...d, job_id: Number(id) })));
    if (proofs) await bulkCache('proofs', proofs.map(p => ({ ...p, job_id: Number(id) })));
}

async function markSynced(store, id) {
    // [NOTE] pending_bills sync logic now handled by syncWorker
    if (['offlineBills', 'pending_bills'].includes(store)) return updateBillStatus(id, 'synced');
    if (store === 'pending_payments') return updatePaymentStatus(id, 'synced');
    if (store === 'attendance') return updateAttendanceStatus(id, 'synced');
    if (store === 'expenses') return updateExpenseStatus(id, 'synced');
    return Promise.reject(new Error(`Unknown store: ${store}`));
}

async function getAllPendingCounts() {
    const [bills, payments, attendance, expenses] = await Promise.all([
        getPendingBillCount().catch(() => 0),
        getPendingPaymentCount().catch(() => 0),
        getPendingAttendanceCount().catch(() => 0),
        getPendingExpenseCount().catch(() => 0),
    ]);
    return { bills, payments, attendance, expenses, total: bills + payments + attendance + expenses };
}

// ──────────────────── Reset Database ────────────────────

/**
 * Delete the entire IndexedDB and reload the page.
 * This is the "nuclear option" for fixing corrupted local states.
 */
async function resetDatabase() {
    closeDb();
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => {
            console.log('[OfflineDB] Database deleted successfully. Reloading...');
            window.location.reload();
            resolve();
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
            console.warn('[OfflineDB] Delete blocked. Please close other tabs.');
            alert('Reset blocked by another open tab. Please close all other tabs of this app and try again.');
            reject(new Error('Delete blocked'));
        };
    });
}

const offlineDb = {
    bulkCache, getAll, getById, getAllByIndex, putRecord, addRecord, save, delete: deleteRecord, deleteByIndex, countByIndex,
    cacheData, getCachedData, getCachedDataAge,
    cacheProducts, getCachedProducts,
    cacheCustomers, getCachedCustomers,
    cacheBranches, getCachedBranches,
    cacheMachines, getCachedMachines,
    cacheStaff, getCachedStaff,
    cachePricing, getCachedPricing,
    cacheJobs, getCachedJobs, getJobById, putJob,
    cachePayments, getCachedPayments, getPaymentsByCustomer,
    cacheAssignments, getCachedAssignments, getAssignmentsByStaff,
    queueBill, getPendingBills, getAllBills, updateBillStatus, deleteSyncedBills, getPendingBillCount,
    savePendingPayment, getPendingPayments, getPendingPaymentCount, updatePaymentStatus, deleteSyncedPayments,
    saveAttendance, getPendingAttendance, getPendingAttendanceCount, getAllAttendance, updateAttendanceStatus, cacheAttendance, deleteSyncedAttendance,
    saveExpense, getPendingExpenses, getPendingExpenseCount, getAllExpenses, updateExpenseStatus, deleteSyncedExpenses,
    markSynced, setMeta, getMeta,
    getAssignmentsByJob, getPaperLogsByJob, getDesignsByJob, getProofsByJob, cacheJobDetails,
    getAllPendingCounts, resetDatabase
};

export default offlineDb;
