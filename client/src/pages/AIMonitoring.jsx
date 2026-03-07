import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
    ShieldAlert, AlertTriangle, Clock, Users, TrendingUp,
    CheckCircle2, XCircle, Eye, RefreshCw, ChevronRight, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

const SEVERITY_STYLE = {
    HIGH: { bg: 'rgba(176,58,46,0.10)', border: 'rgba(176,58,46,0.30)', color: 'var(--error)', label: 'High' },
    MEDIUM: { bg: 'rgba(179,107,0,0.10)', border: 'rgba(179,107,0,0.30)', color: 'var(--warning)', label: 'Medium' },
    LOW: { bg: 'rgba(47,125,74,0.10)', border: 'rgba(47,125,74,0.30)', color: 'var(--success)', label: 'Low' }
};

const AIMonitoring = () => {
    const [dashboard, setDashboard] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [filter, setFilter] = useState('all');

    const fetchData = async () => {
        try {
            const [dashRes, alertRes] = await Promise.all([
                api.get('/ai/monitoring/dashboard'),
                api.get(`/ai/monitoring/alerts?status=${filter === 'all' ? '' : filter}`)
            ]);
            setDashboard(dashRes.data);
            setAlerts(alertRes.data.alerts || []);
        } catch (err) {
            toast.error('Failed to load monitoring data');
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, [filter]);

    const runAnalysis = async () => {
        setAnalyzing(true);
        try {
            const res = await api.post('/ai/monitoring/analyze');
            toast.success(`Analysis complete — ${res.data.new_alerts || 0} new alert(s)`);
            fetchData();
        } catch { toast.error('Analysis failed'); }
        finally { setAnalyzing(false); }
    };

    const handleResolve = async (alertId, action) => {
        try {
            await api.put(`/ai/monitoring/alerts/${alertId}/resolve`, { status: action });
            toast.success(`Alert ${action.toLowerCase()}`);
            setSelectedAlert(null);
            fetchData();
        } catch { toast.error('Failed to update alert'); }
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: 8, color: 'var(--muted)' }}>
            <Loader2 size={20} className="animate-spin" /> Loading monitoring data...
        </div>
    );

    const stats = dashboard?.totals || {};
    const riskyStaff = dashboard?.risky_staff || [];

    return (
        <div className="stack-lg">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldAlert size={24} /> AI Fraud Monitoring
                    </h1>
                    <p className="section-subtitle">Anomaly detection for staff activity</p>
                </div>
                <button className="btn btn-primary" onClick={runAnalysis} disabled={analyzing}>
                    {analyzing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {analyzing ? 'Analyzing...' : 'Run Analysis'}
                </button>
            </div>

            {/* KPI Cards */}
            <div className="summary-grid summary-grid--tiles">
                {[
                    { label: 'Total Alerts', value: stats.total_alerts || 0, icon: AlertTriangle, accent: 'var(--error)' },
                    { label: 'Active', value: stats.active_alerts || 0, icon: Clock, accent: 'var(--warning)' },
                    { label: 'Staff Monitored', value: riskyStaff.length || 0, icon: Users, accent: 'var(--accent)' },
                    { label: 'Resolved', value: stats.resolved_alerts || 0, icon: CheckCircle2, accent: 'var(--success)' }
                ].map((item, i) => (
                    <div key={i} className="summary-tile">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: item.accent }}>
                                <item.icon size={18} />
                            </div>
                            <span className="summary-tile__title">{item.label}</span>
                        </div>
                        <div className="summary-tile__value" style={{ color: item.accent }}>{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="ai-grid ai-grid--sidebar">
                {/* Alerts List */}
                <div className="panel">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>Alerts</h2>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {['all', 'ACTIVE', 'RESOLVED', 'DISMISSED'].map(f => (
                                <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setFilter(f)}>
                                    {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {alerts.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted)' }}>
                            <ShieldAlert size={36} style={{ opacity: 0.2, marginBottom: 8 }} />
                            <p>No alerts found</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {alerts.map(alert => {
                                const sev = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.LOW;
                                return (
                                    <div key={alert.id}
                                        onClick={() => setSelectedAlert(alert)}
                                        style={{
                                            padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                                            background: sev.bg, border: `1px solid ${sev.border}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            transition: 'transform 0.15s',
                                        }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                                            <AlertTriangle size={18} style={{ color: sev.color, flexShrink: 0 }} />
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {alert.alert_type?.replace(/_/g, ' ')}
                                                </div>
                                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                                    {alert.staff_name || 'Unknown'} • {new Date(alert.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}>
                                                {sev.label}
                                            </span>
                                            <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Risky Staff Panel */}
                <div className="panel" style={{ alignSelf: 'start' }}>
                    <h3 className="ai-section-heading">
                        <TrendingUp size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                        Staff Risk Profile
                    </h3>
                    {riskyStaff.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>No risky staff detected</p>
                    ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {riskyStaff.slice(0, 8).map((staff, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{staff.staff_name || `Staff #${staff.user_id}`}</div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{staff.alert_count} alert{staff.alert_count > 1 ? 's' : ''}</div>
                                    </div>
                                    <span style={{
                                        padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                                        background: staff.alert_count >= 3 ? 'rgba(176,58,46,0.12)' : 'rgba(179,107,0,0.12)',
                                        color: staff.alert_count >= 3 ? 'var(--error)' : 'var(--warning)'
                                    }}>
                                        {staff.alert_count >= 3 ? 'HIGH' : 'MED'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Alert Detail Modal */}
            {selectedAlert && (
                <div className="modal-backdrop" onClick={() => setSelectedAlert(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <button className="modal-close" onClick={() => setSelectedAlert(null)}><XCircle size={18} /></button>
                        <h2 className="section-title mb-16">{selectedAlert.alert_type?.replace(/_/g, ' ')}</h2>

                        <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                            {[
                                ['Staff', selectedAlert.staff_name || 'Unknown'],
                                ['Severity', selectedAlert.severity],
                                ['Status', selectedAlert.status],
                                ['Time', new Date(selectedAlert.created_at).toLocaleString('en-IN')],
                            ].map(([label, value]) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: 'var(--surface-2)', fontSize: 13 }}>
                                    <span style={{ color: 'var(--muted)' }}>{label}</span>
                                    <strong>{value}</strong>
                                </div>
                            ))}
                        </div>

                        {selectedAlert.details && (
                            <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13, marginBottom: 20, wordBreak: 'break-word' }}>
                                {typeof selectedAlert.details === 'string' ? selectedAlert.details : JSON.stringify(selectedAlert.details, null, 2)}
                            </div>
                        )}

                        {selectedAlert.status === 'ACTIVE' && (
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button className="btn btn-ghost" onClick={() => handleResolve(selectedAlert.id, 'DISMISSED')}>
                                    <Eye size={16} /> Dismiss
                                </button>
                                <button className="btn btn-primary" onClick={() => handleResolve(selectedAlert.id, 'RESOLVED')}>
                                    <CheckCircle2 size={16} /> Resolve
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @media (max-width: 900px) {
                    .ai-grid--sidebar { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    );
};

export default AIMonitoring;
