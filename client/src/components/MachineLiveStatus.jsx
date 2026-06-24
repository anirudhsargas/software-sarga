import { useState, useEffect, useCallback } from 'react';
import { Loader2, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import api from '../services/api';

const POLL_INTERVAL = 30000;

const HealthDot = ({ status }) => {
    const colors = {
        healthy: 'var(--success, #22c55e)',
        warning: 'var(--warning, #f59e0b)',
        critical: 'var(--danger, #ef4444)',
        unknown: 'var(--text-muted, #94a3b8)'
    };
    return (
        <span
            style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: colors[status] || colors.unknown,
                flexShrink: 0
            }}
            title={`Health: ${status}`}
        />
    );
};

const formatRelativeTime = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
};

const MachineLiveStatus = ({ machineId, machineName, compact }) => {
    const [healthData, setHealthData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchHealth = useCallback(async () => {
        try {
            setError(null);
            const res = await api.get(`/machines/${machineId}/live-count`, { _noCache: true });
            setHealthData(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Connection failed');
        } finally {
            setLoading(false);
        }
    }, [machineId]);

    useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchHealth]);

    if (loading && !healthData) {
        return (
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: compact ? '4px 8px' : '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                fontSize: 12,
                color: 'var(--text-muted)'
            }}>
                <Loader2 size={14} className="animate-spin" />
                <span>{machineName || 'Loading...'}</span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: compact ? '4px 8px' : '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--danger, #ef4444)',
                background: 'var(--card)',
                fontSize: 12,
                color: 'var(--danger, #ef4444)'
            }}>
                <WifiOff size={14} />
                <span>{machineName ? `${machineName} offline` : 'Offline'}</span>
                <button
                    onClick={fetchHealth}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--danger, #ef4444)',
                        display: 'inline-flex',
                        alignItems: 'center'
                    }}
                    title="Retry"
                >
                    <RefreshCw size={12} />
                </button>
            </div>
        );
    }

    const status = healthData?.health_status || 'unknown';
    const lastSync = formatRelativeTime(healthData?.last_sync_time);
    const isLive = status === 'healthy';
    const isWarning = status === 'warning';
    const manualEntry = healthData?.manual_entry;
    const meterData = healthData?.meter_data;

    let statusText = 'Offline';
    let StatusIcon = WifiOff;
    if (loading) {
        statusText = 'Syncing...';
        StatusIcon = Loader2;
    } else if (isLive) {
        statusText = 'Live';
        StatusIcon = Wifi;
    } else if (isWarning) {
        statusText = 'Delayed';
        StatusIcon = Wifi;
    }

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: compact ? '4px 10px' : '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            fontSize: 12,
            cursor: 'default'
        }}>
            <HealthDot status={status} />
            <StatusIcon
                size={14}
                className={loading ? 'animate-spin' : ''}
                style={{
                    color: isLive ? 'var(--success, #22c55e)' : isWarning ? 'var(--warning, #f59e0b)' : 'var(--text-muted, #94a3b8)'
                }}
            />
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {machineName || `Machine #${machineId}`}
            </span>
            <span style={{
                color: isLive ? 'var(--success, #22c55e)' : isWarning ? 'var(--warning, #f59e0b)' : 'var(--text-muted, #94a3b8)',
                fontWeight: 600
            }}>
                {statusText}
            </span>
            {lastSync && (
                <span style={{ color: 'var(--text-muted)' }}>
                    {lastSync}
                </span>
            )}
            {manualEntry != null && (
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {manualEntry.toLocaleString()}
                </span>
            )}
            {!compact && meterData != null && manualEntry != null && manualEntry !== meterData && (
                <span style={{ color: 'var(--warning, #f59e0b)', fontSize: 11 }}>
                    Δ{Math.abs(manualEntry - meterData).toLocaleString()}
                </span>
            )}
        </div>
    );
};

export default MachineLiveStatus;