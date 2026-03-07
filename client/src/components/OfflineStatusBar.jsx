import React from 'react';
import { WifiOff, Wifi, CloudUpload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useOfflineSync } from '../hooks/useOffline';

/**
 * OfflineStatusBar — persistent banner that shows:
 *   • Online / Offline state
 *   • Pending offline bills count
 *   • Sync progress indicator
 *
 * Renders at the top of the app. Hidden when online + no pending bills.
 */
const OfflineStatusBar = () => {
    const { isOnline, pendingCount, syncState, triggerSync } = useOfflineSync();

    // Nothing to show when online with no pending bills and not actively syncing
    if (isOnline && pendingCount === 0 && syncState === 'idle') return null;

    // Determine bar config
    let bg, color, icon, text;

    if (!isOnline) {
        bg = 'linear-gradient(90deg, var(--error), var(--error))';
        color = '#fff';
        icon = <WifiOff size={15} />;
        text = pendingCount > 0
            ? `Offline — ${pendingCount} bill${pendingCount > 1 ? 's' : ''} saved locally`
            : 'Offline — Bills will be saved locally';
    } else if (syncState === 'syncing') {
        bg = 'linear-gradient(90deg, #1d4ed8, var(--accent))';
        color = '#fff';
        icon = <Loader2 size={15} className="animate-spin" />;
        text = `Syncing ${pendingCount} offline bill${pendingCount > 1 ? 's' : ''}…`;
    } else if (syncState === 'done') {
        bg = 'linear-gradient(90deg, #15803d, var(--success))';
        color = '#fff';
        icon = <CheckCircle2 size={15} />;
        text = 'All offline bills synced successfully!';
    } else if (syncState === 'error') {
        bg = 'linear-gradient(90deg, #c2410c, var(--warning))';
        color = '#fff';
        icon = <AlertCircle size={15} />;
        text = 'Some bills failed to sync';
    } else if (pendingCount > 0) {
        // Online with pending bills (auto-sync hasn't started yet)
        bg = 'linear-gradient(90deg, var(--warning), #eab308)';
        color = '#422006';
        icon = <CloudUpload size={15} />;
        text = `${pendingCount} offline bill${pendingCount > 1 ? 's' : ''} ready to sync`;
    } else {
        return null;
    }

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: bg,
            color,
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 9999,
            transition: 'all 0.3s ease',
        }}>
            {icon}
            <span>{text}</span>

            {/* Manual sync button when online + pending */}
            {isOnline && pendingCount > 0 && syncState !== 'syncing' && (
                <button
                    onClick={triggerSync}
                    style={{
                        marginLeft: '8px',
                        padding: '3px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${color}`,
                        background: 'rgba(255,255,255,0.15)',
                        color,
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    <CloudUpload size={13} /> Sync Now
                </button>
            )}

            {/* Online indicator (subtle) */}
            {isOnline && syncState === 'done' && (
                <Wifi size={13} style={{ opacity: 0.6, marginLeft: '4px' }} />
            )}
        </div>
    );
};

export default OfflineStatusBar;
