// [REMOVED] All backgroundSync/offlineDb imports — replaced by syncWorker

// All logic moved to syncWorker. This file is now a stub for compatibility.

export function useOnlineStatus() {
  return navigator.onLine;
}

export function useOfflineSync() {
  // Return stub values for compatibility
  return {
    isOnline: navigator.onLine,
    pendingCounts: { bills: 0, payments: 0, attendance: 0, expenses: 0, total: 0 },
    pendingCount: 0,
    syncState: 'idle',
    lastSyncTime: null,
    triggerSync: () => {},
    triggerDownload: () => {},
    triggerReset: () => {},
    refreshCounts: () => {},
  };
}
