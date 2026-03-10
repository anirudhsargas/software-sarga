/**
 * offlineSync.js — Background sync manager for Sarga offline bills.
 *
 * Responsibilities:
 *  1. Pre-cache essential data (product hierarchy, branches, machines) for offline billing
 *  2. Sync queued offline bills when connectivity returns
 *  3. Expose online/offline event hooks
 *
 * Usage:
 *   import { initOfflineSync, syncPendingBills, prefetchBillingData } from '../services/offlineSync';
 *   initOfflineSync();                    // call once at app startup
 *   await prefetchBillingData();          // warm the cache
 *   const synced = await syncPendingBills(); // force sync now
 */

import api from './api';
import offlineDb from './offlineDb';

// ──────────────────── Constants ────────────────────
const CACHE_KEYS = {
    HIERARCHY: 'product-hierarchy',
    BRANCHES: 'branches',
    MACHINES: 'machines',
    STAFF: 'staff-list',
};

const CACHE_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours

// ──────────────────── Listeners ────────────────────
const listeners = new Set();

export function onSyncEvent(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function emit(event) {
    listeners.forEach(fn => { try { fn(event); } catch (_) { /* no-op */ } });
}

// ──────────────────── Pre-cache billing data ────────────────────

/**
 * Fetches data the Billing page needs and saves it in IndexedDB.
 * Called on app startup and periodically.
 * Fails silently if already offline (stale cache is still usable).
 */
export async function prefetchBillingData() {
    const tasks = [
        { key: CACHE_KEYS.HIERARCHY, url: 'product-hierarchy' },
        { key: CACHE_KEYS.BRANCHES, url: 'branches' },
        { key: CACHE_KEYS.MACHINES, url: 'machines' },
    ];

    const results = await Promise.allSettled(
        tasks.map(async ({ key, url }) => {
            // Skip if cache is fresh
            const age = await offlineDb.getCachedDataAge(key);
            if (age < CACHE_MAX_AGE) return 'fresh';

            const res = await api.get(url);
            await offlineDb.cacheData(key, res.data);
            return 'updated';
        })
    );

    const updated = results.filter(r => r.status === 'fulfilled' && r.value === 'updated').length;
    if (updated > 0) {
        console.log(`[OfflineSync] Pre-cached ${updated} datasets for offline billing`);
    }
}

/**
 * Get cached billing data — falls back to IndexedDB when the network is unavailable.
 */
export async function getCachedHierarchy() {
    return offlineDb.getCachedData(CACHE_KEYS.HIERARCHY);
}

export async function getCachedBranches() {
    return offlineDb.getCachedData(CACHE_KEYS.BRANCHES);
}

export async function getCachedMachines() {
    return offlineDb.getCachedData(CACHE_KEYS.MACHINES);
}

// ──────────────────── Sync offline bills ────────────────────

/**
 * Processes the offline bill queue one-by-one.
 * Returns { synced: number, failed: number }.
 */
export async function syncPendingBills() {
    const pending = await offlineDb.getPendingBills();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    emit({ type: 'sync-start', count: pending.length });

    let synced = 0;
    let failed = 0;

    for (const bill of pending) {
        try {
            await offlineDb.updateBillStatus(bill.id, 'syncing');
            emit({ type: 'sync-progress', id: bill.id, name: bill.customerName || 'Bill' });

            // Step 1: Create jobs
            let createdJobs = [];
            if (bill.orderLines?.length > 0) {
                const jobRes = await api.post('jobs/bulk', {
                    customer_id: bill.customerId || null,
                    order_lines: bill.orderLines,
                });
                createdJobs = jobRes.data?.jobs || [];
            }

            // Step 2: Create payment
            await api.post('customer-payments', {
                customer_id: bill.customerId || null,
                customer_name: bill.customerName,
                customer_mobile: bill.customerMobile || null,
                total_amount: bill.totalAmount,
                net_amount: bill.netAmount,
                sgst_amount: bill.sgstAmount,
                cgst_amount: bill.cgstAmount,
                discount_percent: bill.discountPercent || null,
                discount_amount: bill.discountAmount || null,
                advance_paid: bill.advancePaid,
                payment_method: bill.paymentMethod,
                cash_amount: bill.cashAmount || 0,
                upi_amount: bill.upiAmount || 0,
                reference_number: bill.referenceNumber || null,
                description: bill.description || `Offline bill synced (ref: ${bill.offlineInvoiceRef})`,
                payment_date: bill.paymentDate,
                order_lines: bill.orderLines,
                job_ids: createdJobs.map(j => j.id),
            });

            await offlineDb.updateBillStatus(bill.id, 'synced');
            synced++;
            emit({ type: 'sync-item-ok', id: bill.id });
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Sync failed';
            await offlineDb.updateBillStatus(bill.id, 'pending', msg); // stay pending for retry
            failed++;
            emit({ type: 'sync-item-fail', id: bill.id, error: msg });
            console.warn(`[OfflineSync] Failed to sync bill #${bill.id}:`, msg);
        }
    }

    emit({ type: 'sync-end', synced, failed });

    // Clean up synced records older than 24h
    try { await offlineDb.deleteSyncedBills(); } catch (_) { /* no-op */ }

    return { synced, failed };
}

// ──────────────────── Auto-sync on reconnect ────────────────────

let syncInProgress = false;

async function handleOnline() {
    if (syncInProgress) return;
    syncInProgress = true;
    emit({ type: 'online' });
    console.log('[OfflineSync] Back online — syncing pending bills...');

    try {
        // Re-cache fresh data first
        await prefetchBillingData();
        // Then sync queued bills
        const result = await syncPendingBills();
        if (result.synced > 0) {
            console.log(`[OfflineSync] Synced ${result.synced} bills`);
        }
    } catch (err) {
        console.warn('[OfflineSync] Auto-sync error:', err);
    } finally {
        syncInProgress = false;
    }
}

function handleOffline() {
    emit({ type: 'offline' });
    console.log('[OfflineSync] Gone offline — bills will be queued locally');
}

/**
 * Call once at app startup. Sets up:
 *  - online/offline event listeners
 *  - Initial data prefetch
 *  - Immediate sync attempt (in case there are stale queued bills)
 */
export function initOfflineSync() {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial prefetch (non-blocking)
    prefetchBillingData().catch(() => { /* offline — that's fine */ });

    // Try syncing any bills left from a previous session
    if (navigator.onLine) {
        syncPendingBills().catch(() => { /* will retry on next reconnect */ });
    }
}

export function destroyOfflineSync() {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
}

export { CACHE_KEYS };
