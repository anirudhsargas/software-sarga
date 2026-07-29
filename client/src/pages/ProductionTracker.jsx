import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Loader2, Building2, Search, AlertTriangle, Clock,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ArrowRight, Zap,
    CheckCircle2, Timer, Package, Palette, Printer, Scissors,
    Layers, BookOpen, User, Calendar, Settings, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatCurrency as fmt } from '../constants';
import usePolling from '../hooks/usePolling';

import BranchSelect from '../components/ui/BranchSelect';
import './ProductionTracker.css';
import PageContainer from '../components/ui/PageContainer';
const STAGE_CONFIG = {
    Pending:          { icon: Clock,        color: 'var(--text-muted)', bg: 'var(--surface-2)', label: 'Pending' },
    Designing:        { icon: Palette,      color: '#4361ee', bg: 'rgba(67,97,238,0.08)', label: 'Designing' },
    'Approval Pending': { icon: Timer,      color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Approval' },
    Printing:         { icon: Printer,      color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', label: 'Printing' },
    Cutting:          { icon: Scissors,     color: '#06b6d4', bg: 'rgba(6,182,212,0.08)', label: 'Cutting' },
    Lamination:       { icon: Layers,       color: '#0891b2', bg: 'rgba(8,145,178,0.08)', label: 'Lamination' },
    Binding:          { icon: BookOpen,     color: '#d97706', bg: 'rgba(217,119,6,0.1)', label: 'Binding' },
    Production:       { icon: Settings,     color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: 'Production' },
    Processing:       { icon: RefreshCw,    color: '#6366f1', bg: 'rgba(99,102,241,0.08)', label: 'Processing' },
    Completed:        { icon: CheckCircle2, color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Completed' },
};

const PRIORITY_COLORS = {
    Urgent: '#dc2626', High: '#f59e0b', Medium: '#9ca3af', Low: '#d1d5db',
};

const ProductionTracker = () => {
    useSEO('Production Tracker');

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState('');
    const [search, setSearch] = useState('');
    const [collapsedStages, setCollapsedStages] = useState(new Set());
    const [stagePage, setStagePage] = useState({});
    const [activePipelineStage, setActivePipelineStage] = useState(null);
    const STAGE_PAGE_SIZE = 20;
    const navigate = useNavigate();
    const pipelineRef = useRef(null);

    useEffect(() => {
        api.get('/branches').then(r => setBranches(r.data || [])).catch(() => {});
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

    usePolling(fetchData, 30000, true);

    const toggleStage = (stage) => {
        setCollapsedStages(prev => {
            const next = new Set(prev);
            if (next.has(stage)) next.delete(stage); else next.add(stage);
            return next;
        });
    };

    const scrollToStage = (stage) => {
        const el = document.getElementById(`stage-${stage.replace(/\s+/g, '-')}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActivePipelineStage(stage);
            setTimeout(() => setActivePipelineStage(null), 2000);
        }
    };

    const summary = data?.summary || {};
    const stageOrder = data?.stage_order || [];
    const hasData = !!(stageOrder.length > 0);

    // Count active jobs across non-completed stages
    const activeJobCount = useMemo(() => {
        return stageOrder.filter(s => s !== 'Completed').reduce((sum, s) => sum + ((data?.stages?.[s]?.length) || 0), 0);
    }, [stageOrder, data]);

    return (
        <PageContainer>
            <div className="page-header">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(67,97,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={20} style={{ color: '#4361ee' }} />
                        </div>
                        Production Tracker
                    </h1>
                    <p className="section-subtitle" style={{ marginTop: 4 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            Live production status
                            {hasData && <><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block' }} />
                            <strong>{activeJobCount}</strong> active jobs across <strong>{stageOrder.length}</strong> stages</>}
                        </span>
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="filter-bar" style={{ marginBottom: 20 }}>
                <div className="filter-group">
                    <Building2 size={15} className="filter-icon" />
                    <BranchSelect value={branchId} onChange={e => setBranchId(e.target.value)}>
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </BranchSelect>
                </div>
                <div className="filter-group" style={{ marginLeft: 'auto' }}>
                    <Search size={16} className="filter-icon" />
                    <input type="text" placeholder="Search job / customer..."
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>

            {loading && !data ? <LoadingSpinner /> : !data ? (
                <div className="text-center p-40 muted">Failed to load production data</div>
            ) : (
                <>
                    {/* Summary bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                        <SummaryChip label="Active Jobs" value={summary.total_active} />
                        {summary.overdue > 0 && (
                            <SummaryChip label="Overdue" value={summary.overdue} variant="overdue" icon={<AlertTriangle size={12} />} />
                        )}
                        {summary.urgent > 0 && (
                            <SummaryChip label="Urgent/High" value={summary.urgent} variant="urgent" icon={<Zap size={12} />} />
                        )}
                        <div className="live-indicator" style={{ marginLeft: 'auto' }}>
                            <span className="live-dot" />
                            Auto-refreshes
                        </div>
                    </div>

                    {/* Stage pipeline mini-bar */}
                    <div className="production-pipeline" ref={pipelineRef} style={{ marginBottom: 20 }}>
                        {stageOrder.map((stage, i) => {
                            const conf = STAGE_CONFIG[stage] || STAGE_CONFIG.Processing;
                            const count = summary.stage_counts?.[stage] || 0;
                            const isActive = activePipelineStage === stage;
                            return (
                                <React.Fragment key={stage}>
                                    {i > 0 && <ArrowRight size={13} style={{ flexShrink: 0, opacity: 0.3, color: 'var(--text-muted)' }} />}
                                    <button
                                        className={`production-stage-chip${isActive ? ' production-stage-chip--active' : ''}`}
                                        style={{ background: conf.bg, color: conf.color, borderColor: conf.color }}
                                        onClick={() => scrollToStage(stage)}
                                    >
                                        <conf.icon size={13} />
                                        <span>{conf.label}</span>
                                        {count > 0 && <span className="production-stage-count">{count}</span>}
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Stage sections */}
                    {stageOrder.map(stage => {
                        const conf = STAGE_CONFIG[stage] || STAGE_CONFIG.Processing;
                        const jobs = data.stages[stage] || [];
                        const isCollapsed = collapsedStages.has(stage);
                        const page = stagePage[stage] || 1;
                        const totalPages = Math.ceil(jobs.length / STAGE_PAGE_SIZE);
                        const pagedJobs = jobs.slice((page - 1) * STAGE_PAGE_SIZE, page * STAGE_PAGE_SIZE);
                        const stageId = `stage-${stage.replace(/\s+/g, '-')}`;
                        return (
                            <div key={stage} id={stageId} className="production-stage-section" style={{ marginBottom: 14 }}>
                                <button className="production-stage-header" onClick={() => toggleStage(stage)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="production-stage-dot" style={{ background: conf.color }} />
                                        <conf.icon size={18} style={{ color: conf.color }} />
                                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{conf.label}</span>
                                        {jobs.length > 0 && (
                                            <span className="production-stage-badge" style={{ background: conf.bg, color: conf.color }}>
                                                {jobs.length}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {!isCollapsed && jobs.length > STAGE_PAGE_SIZE && (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                                                {jobs.length} total
                                            </span>
                                        )}
                                        {isCollapsed ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} />}
                                    </div>
                                </button>

                                {!isCollapsed && (
                                    <>
                                        <div className="production-jobs-grid">
                                            {pagedJobs.map((job, idx) => (
                                                <JobCard key={job.id} job={job} stageColor={conf.color} onNavigate={() => navigate(`/dashboard/jobs/${job.id}`)} index={idx} />
                                            ))}
                                        </div>
                                        {jobs.length > STAGE_PAGE_SIZE && (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '8px 18px 14px' }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                                                    {(page - 1) * STAGE_PAGE_SIZE + 1}–{Math.min(page * STAGE_PAGE_SIZE, jobs.length)} of {jobs.length}
                                                </span>
                                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setStagePage(p => ({ ...p, [stage]: Math.max(1, (p[stage] || 1) - 1) }))} disabled={page <= 1}><ChevronLeft size={14} /></button>
                                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setStagePage(p => ({ ...p, [stage]: Math.min(totalPages, (p[stage] || 1) + 1) }))} disabled={page >= totalPages}><ChevronRight size={14} /></button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {!hasData && (
                        <div className="production-empty">
                            <CheckCircle2 size={44} className="production-empty-icon" />
                            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>No active jobs in production</div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>All jobs have been completed or delivered.</div>
                        </div>
                    )}
                </>
            )}
        </PageContainer>
    );
};

/* ─── Job Card ─── */
const JobCard = React.memo(({ job, onNavigate, stageColor, index = 0 }) => {
    const priColor = PRIORITY_COLORS[job.priority] || PRIORITY_COLORS.Medium;
    const balance = Number(job.balance_amount) || 0;
    const total = Number(job.total_amount) || 0;
    const isFullyPaid = balance <= 0;

    const stageHours = Number(job.hours_in_stage) || 0;
    const stageDays = Math.round(stageHours / 24);
    const stageDisplay = stageHours >= 24 ? `${stageDays}d` : `${stageHours}h`;
    const timerPercent = Math.min((stageHours / 72) * 100, 100);
    const timerUrgent = stageHours > 48;

    const deliveryLabel = job.delivery_date
        ? new Date(job.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : null;

    const staffName = job.assigned_staff || '';
    const staffInitials = staffName ? staffName.split(',').map(s => s.trim()[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() : '';

    return (
        <div
            className="production-job-card"
            onClick={onNavigate}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(); } }}
            style={{ animationDelay: `${(index % 10) * 30}ms` }}
        >
            <div className="production-job-priority" style={{ background: priColor }} title={`${job.priority} priority`} />

            <div className="production-job-content">
                {/* Header row */}
                <div className="production-job-header">
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="production-job-name">{job.job_name}</div>
                        <div className="production-job-number">{job.job_number}</div>
                    </div>
                    {job.is_overdue && (
                        <span className="production-overdue-badge">
                            <AlertTriangle size={10} /> OVERDUE
                        </span>
                    )}
                </div>

                {/* Customer */}
                <div className="production-customer">
                    <User size={11} />
                    {job.customer_name}
                    {job.customer_mobile && (
                        <span style={{ color: 'var(--text-muted)' }}>
                            · {job.customer_mobile}
                        </span>
                    )}
                </div>

                {/* Tags */}
                <div className="production-tags">
                    {job.category && <span className="production-tag">{job.category}</span>}
                    {job.quantity > 1 && <span className="production-tag"><Package size={10} /> Qty: {job.quantity}</span>}
                    {job.branch_name && <span className="production-tag"><Building2 size={10} /> {job.branch_name}</span>}
                    {stageDisplay && <span className="production-tag" style={timerUrgent ? { color: 'var(--error)', background: 'color-mix(in srgb, var(--error), transparent 88%)' } : {}}>
                        <Timer size={10} /> {stageDisplay}
                    </span>}
                </div>

                {/* Stage timer bar */}
                {stageHours > 0 && (
                    <div className="production-stage-timer">
                        <div className="production-stage-timer-bar">
                            <div
                                className="production-stage-timer-fill"
                                style={{
                                    width: `${timerPercent}%`,
                                    background: timerUrgent ? 'var(--error)' : stageColor || 'var(--accent)',
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Bottom: delivery + amount */}
                <div className="production-amount">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {deliveryLabel && (
                            <span className={`production-timing-item${job.is_overdue ? '--urgent' : ''}`}>
                                <Calendar size={11} />
                                {deliveryLabel}
                                {job.days_until_delivery !== null && (
                                    <span style={{ fontWeight: 600 }}>
                                        {job.days_until_delivery >= 0 ? ` (${job.days_until_delivery}d)` : ` (-${Math.abs(job.days_until_delivery)}d)`}
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div className={`production-amount-value ${isFullyPaid ? 'production-amount-paid' : 'production-amount-due'}`}>
                            {fmt(total)}
                        </div>
                        {!isFullyPaid && (
                            <div className="production-amount-balance">
                                Due: {fmt(balance)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Staff */}
                {staffName && (
                    <div className="production-staff">
                        {staffInitials && <span className="production-staff-avatar">{staffInitials}</span>}
                        <span>{staffName}</span>
                    </div>
                )}
            </div>
        </div>
    );
});

/* ─── Small Components ─── */
const SummaryChip = ({ label, value, variant, icon }) => {
    const cls = variant === 'overdue' ? 'summary-chip summary-chip--overdue'
        : variant === 'urgent' ? 'summary-chip summary-chip--urgent'
        : 'summary-chip';
    return (
        <span className={cls}>
            {icon} {label}: <span className="summary-chip-value">{value}</span>
        </span>
    );
};

const LoadingSpinner = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 56 }}>
        <Loader2 className="spin" size={32} style={{ color: 'var(--accent)' }} />
    </div>
);

export default ProductionTracker;
