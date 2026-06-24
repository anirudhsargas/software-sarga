import { memo, useState, useEffect } from 'react';
import { Monitor, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import api from '../services/api';

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
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
};

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

const MachineCounterCard = ({ machine, onChange }) => {
    const { id, machine_name, location, opening_count, error, previous_count } = machine;
    const [healthData, setHealthData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);

    const fetchHealth = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await api.get(`/machines/${id}/live-count`);
            setHealthData(res.data);
        } catch (err) {
            setFetchError(err.response?.data?.error || 'Failed to load');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHealth();
    }, [id]);

    const prev = Number(previous_count) || 0;
    const curr = Number(opening_count) || 0;
    const diff = prev > 0 && curr > 0 ? curr - prev : null;
    const isInvalid = prev > 0 && curr > 0 && curr < prev;

    if (loading && !healthData) {
        return (
            <div className="os-machine-card os-machine-card--loading">
                <div className="os-machine-card__header">
                    <div className="skeleton-box" style={{ width: 16, height: 16, borderRadius: '50%' }} />
                    <div className="os-machine-card__info" style={{ flex: 1 }}>
                        <div className="skeleton-box" style={{ height: 14, width: '60%', marginBottom: 4 }} />
                        <div className="skeleton-box" style={{ height: 10, width: '40%' }} />
                    </div>
                </div>
                <div className="os-machine-card__readings">
                    <div className="skeleton-box" style={{ height: 32, width: '100%', borderRadius: 6 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <div className="skeleton-box" style={{ width: 8, height: 8, borderRadius: '50%' }} />
                    <div className="skeleton-box" style={{ height: 10, width: 80 }} />
                </div>
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className="os-machine-card os-machine-card--error">
                <div className="os-machine-card__header">
                    <div className="os-machine-card__icon">
                        <Monitor size={16} />
                    </div>
                    <div className="os-machine-card__info">
                        <span className="os-machine-card__name">{machine_name}</span>
                        {location && <span className="os-machine-card__location">{location}</span>}
                    </div>
                </div>
                <div className="os-machine-card__error">
                    <AlertCircle size={14} />
                    <span>{fetchError}</span>
                    <button
                        onClick={fetchHealth}
                        style={{
                            marginLeft: 8,
                            background: 'none',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            padding: '2px 8px',
                            cursor: 'pointer',
                            fontSize: 11,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                        }}
                    >
                        <RefreshCw size={12} />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const healthStatus = healthData?.health_status || 'unknown';
    const lastSync = formatRelativeTime(healthData?.last_sync_time);

    return (
        <div className={`os-machine-card ${error ? 'os-machine-card--error' : ''} ${isInvalid ? 'os-machine-card--invalid' : ''}`}>
            <div className="os-machine-card__header">
                <div className="os-machine-card__icon">
                    <Monitor size={16} />
                </div>
                <div className="os-machine-card__info">
                    <span className="os-machine-card__name">{machine_name}</span>
                    {location && <span className="os-machine-card__location">{location}</span>}
                </div>
                <HealthDot status={healthStatus} />
            </div>

            <div className="os-machine-card__readings">
                {prev > 0 && (
                    <div className="os-machine-card__prev">
                        <span className="os-machine-card__prev-label">Previous</span>
                        <span className="os-machine-card__prev-value">{prev.toLocaleString('en-IN')}</span>
                    </div>
                )}
                <div className="os-machine-card__input-group">
                    <span className="os-machine-card__input-label">Current</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        className={`os-machine-card__input ${error ? 'os-machine-card__input--error' : ''} ${isInvalid ? 'os-machine-card__input--invalid' : ''}`}
                        value={opening_count}
                        onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            onChange(id, raw);
                        }}
                        placeholder="Enter reading"
                    />
                </div>
            </div>

            {diff !== null && !isInvalid && (
                <div className="os-machine-card__diff os-machine-card__diff--positive">
                    +{diff.toLocaleString('en-IN')}
                </div>
            )}
            {isInvalid && (
                <div className="os-machine-card__diff os-machine-card__diff--negative">
                    <AlertCircle size={12} /> Cannot be less than previous
                </div>
            )}
            {error && (
                <div className="os-machine-card__error">{error}</div>
            )}

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                fontSize: 11,
                color: 'var(--text-muted)'
            }}>
                <HealthDot status={healthStatus} />
                {lastSync && <span>Synced {lastSync}</span>}
                {!lastSync && healthData && <span>No sync data</span>}
                {loading && <Loader2 size={11} className="animate-spin" />}
            </div>
        </div>
    );
};

export default memo(MachineCounterCard);