import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { onSyncEvent, syncPendingBills } from '../services/offlineSync';
import offlineDb from '../services/offlineDb';

// ──────────────────── useOnlineStatus ────────────────────
// Reactively tracks navigator.onLine using useSyncExternalStore (React 18+)

function subscribeOnline(callback) {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
    };
}

function getOnlineSnapshot() {
    return navigator.onLine;
}

export function useOnlineStatus() {
    return useSyncExternalStore(subscribeOnline, getOnlineSnapshot);
}

// ──────────────────── useOfflineSync ────────────────────
// Provides sync state + pending bill count for the UI

export function useOfflineSync() {
    const isOnline = useOnlineStatus();
    const [pendingCount, setPendingCount] = useState(0);
    const [syncState, setSyncState] = useState('idle'); // idle | syncing | done | error

    // Refresh pending count when sync events fire or on mount
    const refreshCount = useCallback(async () => {
        try {
            const count = await offlineDb.getPendingBillCount();
            setPendingCount(count);
        } catch (_) { /* IndexedDB may fail in some edge cases */ }
    }, []);

    useEffect(() => {
        refreshCount();

        const unsub = onSyncEvent((event) => {
            switch (event.type) {
                case 'sync-start':
                    setSyncState('syncing');
                    break;
                case 'sync-end':
                    setSyncState(event.failed > 0 ? 'error' : 'done');
                    refreshCount();
                    // Reset state after 5s
                    setTimeout(() => setSyncState('idle'), 5000);
                    break;
                case 'online':
                case 'offline':
                    refreshCount();
                    break;
                default:
                    break;
            }
        });

        return unsub;
    }, [refreshCount]);

    // Also re-check when coming back online
    useEffect(() => {
        if (isOnline) refreshCount();
    }, [isOnline, refreshCount]);

    const triggerSync = useCallback(async () => {
        if (!isOnline || syncState === 'syncing') return;
        return syncPendingBills();
    }, [isOnline, syncState]);

    return { isOnline, pendingCount, syncState, triggerSync, refreshCount };
}
