import { useSyncStatus } from '../hooks/useSyncStatus';
import { RefreshCw, Wifi, WifiOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const SyncStatusBar = () => {
  const { status, lastSyncText, pendingCount, syncNow } = useSyncStatus();
  const isOnline = navigator.onLine;

  const configs = {
    idle:    { icon: Wifi,         color: 'var(--text-muted)', label: 'Ready' },
    syncing: { icon: Loader2,      color: 'var(--color-warning)', label: 'Syncing...', spin: true },
    synced:  { icon: CheckCircle,  color: 'var(--color-success)', label: lastSyncText },
    error:   { icon: AlertCircle,  color: 'var(--color-danger)', label: 'Sync failed' },
  };

  const config = configs[status] || configs.idle;
  const Icon = config.icon;

  if (!isOnline) {
    return (
      <div className="sync-bar sync-bar--offline">
        <WifiOff size={13} />
        <span>Offline mode</span>
        {pendingCount > 0 && (
          <span className="sync-bar__badge">{pendingCount} pending</span>
        )}
      </div>
    );
  }

  return (
    <div role="button" tabIndex={0} className={`sync-bar sync-bar--${status}`}
      onClick={status !== 'syncing' ? syncNow : undefined}
      title="Click to sync now"
      style={{ cursor: status !== 'syncing' ? 'pointer' : 'default' }}
    >
      <Icon
        size={13}
        style={{ color: config.color }}
        className={config.spin ? 'spin' : ''}
      />
      <span style={{ color: config.color }}>{config.label}</span>
      {pendingCount > 0 && (
        <span className="sync-bar__badge">{pendingCount}</span>
      )}
    </div>
  );
};