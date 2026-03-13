import React, { useState, useEffect, useCallback } from 'react';
import {
    Loader2, Building2, Search, AlertTriangle, Clock, Phone,
    IndianRupee, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ArrowRight, Zap,
    CheckCircle2, Timer, Package, Palette, Printer, Scissors,
    Layers, BookOpen, Settings, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatCurrency as fmt } from '../constants';
import usePolling from '../hooks/usePolling';

const STAGE_CONFIG = {
    Pending:          { icon: Clock,        color: '#9ca3af', bg: '#f3f4f6', label: 'Pending' },
    Designing:        { icon: Palette,      color: '#8b5cf6', bg: '#ede9fe', label: 'Designing' },
    'Approval Pending': { icon: Timer,      color: '#f59e0b', bg: '#fef3c7', label: 'Approval' },
    Printing:         { icon: Printer,      color: '#2563eb', bg: '#dbeafe', label: 'Printing' },
    Cutting:          { icon: Scissors,     color: '#ec4899', bg: '#fce7f3', label: 'Cutting' },
    Lamination:       { icon: Layers,       color: '#14b8a6', bg: '#ccfbf1', label: 'Lamination' },
    Binding:          { icon: BookOpen,     color: '#f97316', bg: '#ffedd5', label: 'Binding' },
    Production:       { icon: Settings,     color: '#6366f1', bg: '#e0e7ff', label: 'Production' },
    Processing:       { icon: RefreshCw,    color: '#0891b2', bg: '#cffafe', label: 'Processing' },
    Completed:        { icon: CheckCircle2, color: '#16a34a', bg: '#dcfce7', label: 'Completed' },
};

const PRIORITY_COLORS = {
    Urgent: '#dc2626', High: '#f59e0b', Medium: '#6b7280', Low: '#d1d5db',
};

const ProductionTracker = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState('');
    const [search, setSearch] = useState('');
    const [collapsedStages, setCollapsedStages] = useState(new Set());
    const [stagePage, setStagePage] = useState({});
    const STAGE_PAGE_SIZE = 20;
    const navigate = useNavigate();

    useEffect(() => {
        api.get('/branches').then(r => setBranches(r.data)).catch(() => {});
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (branchId) params.append('branch_id', branchId);
            if (search) params.append('search', search);
            const res = await api.get(`/production-tracker?${params}`);
            setData(res.data);
            setStagePage({});
        } catch { setData(null); }
        finally { setLoading(false); }
    }, [branchId, search]);

    useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

    // Auto-refresh every 30 seconds
    usePolling(fetchData, 30000, true);

    const toggleStage = (stage) => {
        setCollapsedStages(prev => {
            const next = new Set(prev);
            if (next.has(stage)) next.delete(stage); else next.add(stage);
            return next;
        });
    };

    const summary = data?.summary || {};

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Package size={24} className="text-accent" />
                        Production Tracker
                    </h1>
                    <p className="section-subtitle">Live production status across all stages · Auto-refreshes every 30s</p>
                </div>
            </div>

            {/* Filters */}
            <div className="row gap-sm items-center flex-wrap mb-16">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px' }}>
                    <Building2 size={15} className="muted" style={{ flexShrink: 0 }} />
                    <select className="input-field" value={branchId} onChange={e => setBranchId(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', minWidth: 130 }}>
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
                <div className="row gap-xs items-center" style={{ marginLeft: 'auto' }}>
                    <Search size={16} className="muted" />
                    <input type="text" className="input-field" placeholder="Search job / customer..."
                        value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 220 }} />
                </div>
            </div>

            {loading && !data ? <LoadingSpinner /> : !data ? (
                <div className="text-center p-40 muted">Failed to load production data</div>
            ) : (
                <>
                    {/* Summary bar */}
                    <div className="row gap-sm items-center flex-wrap mb-16" style={{ fontSize: 13 }}>
                        <SummaryChip label="Active Jobs" value={summary.total_active} />
                        {summary.overdue > 0 && (
                            <SummaryChip label="Overdue" value={summary.overdue} color="var(--error, #dc2626)" icon={<AlertTriangle size={13} />} />
                        )}
                        {summary.urgent > 0 && (
                            <SummaryChip label="Urgent/High" value={summary.urgent} color="var(--color-warning, #f59e0b)" icon={<Zap size={13} />} />
                        )}
                        <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
                            <RefreshCw size={11} style={{ marginRight: 4 }} />
                            Live · {Object.keys(summary.stage_counts || {}).length} active stages
                        </span>
                    </div>

                    {/* Stage pipeline mini-bar */}
                    <div className="production-pipeline mb-20">
                        {(data.stage_order || []).map((stage, i) => {
                            const conf = STAGE_CONFIG[stage] || STAGE_CONFIG.Processing;
                            const count = summary.stage_counts?.[stage] || 0;
                            return (
                                <React.Fragment key={stage}>
                                    {i > 0 && <ArrowRight size={14} className="muted" style={{ flexShrink: 0, opacity: 0.4 }} />}
                                    <button
                                        className="production-stage-chip"
                                        style={{ background: conf.bg, color: conf.color, borderColor: conf.color }}
                                        onClick={() => {
                                            const el = document.getElementById(`stage-${stage}`);
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }}
                                    >
                                        <conf.icon size={14} />
                                        <span>{conf.label}</span>
                                        <span className="production-stage-count">{count}</span>
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Stage columns */}
                    {(data.stage_order || []).map(stage => {
                        const conf = STAGE_CONFIG[stage] || STAGE_CONFIG.Processing;
                        const jobs = data.stages[stage] || [];
                        const isCollapsed = collapsedStages.has(stage);
                        const page = stagePage[stage] || 1;
                        const totalPages = Math.ceil(jobs.length / STAGE_PAGE_SIZE);
                        const pagedJobs = jobs.slice((page - 1) * STAGE_PAGE_SIZE, page * STAGE_PAGE_SIZE);
                        return (
                            <div key={stage} id={`stage-${stage}`} className="production-stage-section mb-16">
                                <button className="production-stage-header" onClick={() => toggleStage(stage)}>
                                    <div className="row gap-sm items-center">
                                        <div className="production-stage-dot" style={{ background: conf.color }} />
                                        <conf.icon size={18} style={{ color: conf.color }} />
                                        <span className="font-bold">{conf.label}</span>
                                        <span className="production-stage-badge" style={{ background: conf.bg, color: conf.color }}>{jobs.length}</span>
                                    </div>
                                    {isCollapsed ? <ChevronDown size={16} className="muted" /> : <ChevronUp size={16} className="muted" />}
                                </button>

                                {!isCollapsed && (
                                    <>
                                        <div className="production-jobs-grid">
                                            {pagedJobs.map(job => (
                                                <JobCard key={job.id} job={job} stageColor={conf.color} onNavigate={() => navigate(`/dashboard/jobs/${job.id}`)} />
                                            ))}
                                        </div>
                                        {jobs.length > STAGE_PAGE_SIZE && (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '8px 4px 4px' }}>
                                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                                    {(page - 1) * STAGE_PAGE_SIZE + 1}–{Math.min(page * STAGE_PAGE_SIZE, jobs.length)} of {jobs.length}
                                                </span>
                                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setStagePage(p => ({ ...p, [stage]: Math.max(1, (p[stage] || 1) - 1) }))} disabled={page <= 1}><ChevronLeft size={15} /></button>
                                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setStagePage(p => ({ ...p, [stage]: Math.min(totalPages, (p[stage] || 1) + 1) }))} disabled={page >= totalPages}><ChevronRight size={15} /></button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {(data.stage_order || []).length === 0 && (
                        <div className="card p-40 text-center muted">
                            <CheckCircle2 size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                            <div>No active jobs in any production stage</div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

/* ─── Job Card ─── */
const JobCard = ({ job, stageColor, onNavigate }) => {
    const priColor = PRIORITY_COLORS[job.priority] || PRIORITY_COLORS.Medium;

    return (
        <div className="production-job-card" onClick={onNavigate} role="button" tabIndex={0}>
            {/* Priority indicator */}
            <div className="production-job-priority" style={{ background: priColor }}
                 title={`${job.priority} priority`} />

            <div className="production-job-content">
                {/* Header */}
                <div className="row space-between items-start mb-4">
                    <div>
                        <div className="font-bold text-sm" style={{ lineHeight: 1.3 }}>{job.job_name}</div>
                        <div className="text-xs muted">{job.job_number}</div>
                    </div>
                    {job.is_overdue && (
                        <span className="production-overdue-badge">
                            <AlertTriangle size={11} /> OVERDUE
                        </span>
                    )}
                </div>

                {/* Customer */}
                <div className="text-xs mb-4" style={{ color: 'var(--text-main)' }}>
                    {job.customer_name}
                    {job.customer_mobile && (
                        <span className="muted"> · <Phone size={10} style={{ verticalAlign: 'middle' }} /> {job.customer_mobile}</span>
                    )}
                </div>

                {/* Meta */}
                <div className="row gap-sm items-center flex-wrap" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {job.category && <span className="production-tag">{job.category}</span>}
                    {job.quantity > 1 && <span>Qty: {job.quantity}</span>}
                    {job.branch_name && <span>{job.branch_name}</span>}
                </div>

                {/* Bottom row */}
                <div className="row space-between items-center mt-6" style={{ fontSize: 11 }}>
                    <div className="row gap-sm items-center">
                        {job.delivery_date && (
                            <span className={job.is_overdue ? 'text-error font-bold' : 'muted'}>
                                <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                                {new Date(job.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                {job.days_until_delivery !== null && (
                                    <span> ({job.days_until_delivery >= 0 ? `${job.days_until_delivery}d` : `${Math.abs(job.days_until_delivery)}d late`})</span>
                                )}
                            </span>
                        )}
                        {job.hours_in_stage > 0 && (
                            <span className="muted" title="Time in current stage">
                                <Timer size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                                {job.hours_in_stage >= 24 ? `${Math.round(job.hours_in_stage / 24)}d` : `${job.hours_in_stage}h`}
                            </span>
                        )}
                    </div>
                    <span className="font-bold" style={{ color: Number(job.balance_amount) > 0 ? 'var(--error)' : 'var(--color-ok)' }}>
                        {fmt(job.total_amount)}
                    </span>
                </div>

                {/* Staff */}
                {job.assigned_staff && (
                    <div className="text-xs muted mt-4" style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 4 }}>
                        {job.assigned_staff}
                    </div>
                )}
            </div>
        </div>
    );
};

/* ─── Small Components ─── */
const SummaryChip = ({ label, value, color, icon }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: color ? `${color}15` : 'var(--surface-2)',
        color: color || 'var(--text-main)',
        padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    }}>
        {icon} {label}: {value}
    </span>
);

const LoadingSpinner = () => (
    <div className="flex items-center justify-center p-40">
        <Loader2 className="animate-spin text-accent" size={36} />
    </div>
);

export default ProductionTracker;
