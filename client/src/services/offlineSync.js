/**
 * offlineSync.js — Offline sync lifecycle manager for Sarga.
 *
 * Responsibilities:
 *  1. Initialize sync timers on app startup
 *  2. Auto-sync on reconnect
 *  3. Periodic master data refresh (every 30 min)
 *  4. Periodic pending data upload (every 2 min)
 *  5. Expose prefetch and force-download helpers
 *
 * Usage:
 *   import { initOfflineSync, destroyOfflineSync } from '../services/offlineSync';
 *   initOfflineSync();  // call once at app startup
 */

// [REMOVED] All backgroundSync/offlineDb imports — replaced by syncWorker

// ──────────────────── Constants ────────────────────
// All logic moved to syncWorker. This file is now a stub for compatibility.

// No-op exports for compatibility
export function initOfflineSync() {}
export function destroyOfflineSync() {}
export function forcePrefetchBillingData() { return Promise.resolve(); }
export function prefetchBillingData() { return Promise.resolve(); }
export function getCachedHierarchy() { return Promise.resolve([]); }
export function getCachedBranches() { return Promise.resolve([]); }
export function getCachedMachines() { return Promise.resolve([]); }
export function syncPendingBills() { return Promise.resolve(); }
export const onSyncEvent = () => () => {};
