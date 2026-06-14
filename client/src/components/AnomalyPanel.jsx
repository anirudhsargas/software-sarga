import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Shield } from 'lucide-react';
import api from '../services/api';

const SEVERITY_CONFIG = {
    high: { color: 'var(--error)', bg: 'var(--error-bg)', label: 'High' },
    medium: { color: 'var(--warning)', bg: 'var(--warning-bg)', label: 'Medium' },
    low: { color: 'var(--accent)', bg: 'var(--accent-light)', label: 'Low' },
};

const TYPE_LABELS = {
    high_discount: 'High Discount',
    expense_spike: 'Expense Spike',
    staff_not_present: 'Absent Staff',
    duplicate_payment: 'Duplicate Payment',
    zero_jobs_gap: 'Activity Gap',
    duplicate_salary: 'Duplicate Salary',
    isolation_forest_job: 'ML Outlier (Job)',
    isolation_forest_expense: 'ML Outlier (Expense)',
    isolation_forest_transaction: 'ML Outlier (Txn)',
    zscore_job: 'Z-Score (Job)',
    zscore_expense: 'Z-Score (Expense)',
    zscore_transaction: 'Z-Score (Txn)',
};

function getRecordLink(a) {
    if (!a.record_id) return null;
    if (a.type.includes('job') || a.type === 'high_discount' || a.type === 'staff_not_present' || a.type === 'zero_jobs_gap') {
        return `/dashboard/jobs/${a.record_id}`;
    }
    if (a.type.includes('expense')) {
        return '/dashboard/expenses';
    }
    if (a.type === 'duplicate_payment' || a.type.includes('transaction')) {
        return '/dashboard/customer-payments';
    }
    return null;
}

export default function AnomalyPanel() {
    const [data, setData] = useState({ anomalies: [], checkedAt: null });
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);

    const fetchAnomalies = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('ai/anomalies');
            setData(res.data || { anomalies: [], checkedAt: null });
        } catch {
            // keep stale data
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAnomalies();
        const interval = setInterval(fetchAnomalies, 5 * 60 * 1000); // refresh every 5 min
        return () => clearInterval(interval);
    }, [fetchAnomalies]);

    const count = data.anomalies?.length || 0;
    const highCount = data.anomalies?.filter(a => a.severity === 'high').length || 0;

    if (count === 0 && !loading) return null;

    return (
        <div style={{ margin: '0 0 16px', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
            {/* Header bar */}
            <div role="button"
                tabIndex={0}
                onClick={() => setExpanded(e => !e)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x); } }}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 16px', cursor: 'pointer',
                    background: highCount > 0 ? '#fef2f2' : '#fffbeb',
                    color: highCount > 0 ? '#b91c1c' : '#92400e',
                    fontWeight: 600, fontSize: '14px',
                    border: '0'
                }}
            >
                <Shield size={18} />
                <span style={{ flex: 1, textAlign: 'left' }}>
                    {count} anomal{count === 1 ? 'y' : 'ies'} detected
                    {highCount > 0 && <span style={{ color: '#ef4444', marginLeft: 6 }}>({highCount} high)</span>}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); fetchAnomalies(); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'inherit', display: 'flex' }}
                    title="Refresh"
                    disabled={loading}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>

            {/* Anomaly list */}
            {expanded && (
                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                    {data.anomalies.map((a, i) => {
                        const sev = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.low;
                        const link = getRecordLink(a);
                        return (
                            <div
                                key={`${a.type}-${a.record_id}-${i}`}
                                style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                                    padding: '10px 16px',
                                    borderTop: '1px solid var(--border)',
                                    fontSize: '13px',
                                }}
                            >
                                <span style={{
                                    display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
                                    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                                    background: sev.bg, color: sev.color, whiteSpace: 'nowrap',
                                    marginTop: '2px',
                                }}>
                                    {sev.label}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                                        {TYPE_LABELS[a.type] || a.type}
                                    </div>
                                    <div style={{ color: 'var(--text-muted, var(--muted))', marginTop: '2px', lineHeight: 1.4 }}>
                                        {a.description}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted, var(--muted))', marginTop: '3px' }}>
                                        {a.branch_id ? `Branch #${a.branch_id}` : ''}
                                    </div>
                                </div>
                                {link && (
                                    <a href={link} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} title="View record">
                                        <ExternalLink size={14} />
                                    </a>
                                )}
                            </div>
                        );
                    })}
                    {data.checkedAt && (
                        <div style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--text-muted, var(--muted))', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                            Last checked: {new Date(data.checkedAt).toLocaleTimeString()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
