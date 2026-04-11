import { useState, useEffect } from 'react';
import { syncManager } from '../services/syncWorkerManager';

export const useSyncStatus = () => {
  const [status, setStatus] = useState('idle');
  const [lastSync, setLastSync] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handleStatusChange = (data) => {
      setStatus(data.status);
      if (data.timestamp) setLastSync(data.timestamp);
      if (typeof data.pendingCount === 'number') setPendingCount(data.pendingCount);
    };

    syncManager.on('status_change', handleStatusChange);
    return () => syncManager.off('status_change', handleStatusChange);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const syncNow = () => syncManager.syncNow();

  const lastSyncText = lastSync
    ? `Synced ${Math.round((now - lastSync) / 60000)}m ago`
    : 'Not synced yet';

  return { status, lastSync, lastSyncText, pendingCount, syncNow };
};