import { useState, useEffect } from 'react';
import { syncManager } from '../services/syncWorkerManager';

export const useSyncStatus = () => {
  const [status, setStatus] = useState('idle');
  const [lastSync, setLastSync] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleStatusChange = (data) => {
      setStatus(data.status);
      if (data.timestamp) setLastSync(data.timestamp);
    };

    syncManager.on('status_change', handleStatusChange);
    return () => syncManager.off('status_change', handleStatusChange);
  }, []);

  const syncNow = () => syncManager.syncNow();

  const lastSyncText = lastSync
    ? `Synced ${Math.round((Date.now() - lastSync) / 60000)}m ago`
    : 'Not synced yet';

  return { status, lastSync, lastSyncText, pendingCount, syncNow };
};