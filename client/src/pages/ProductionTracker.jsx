import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2, Building2, Search, AlertTriangle, Clock,
    ChevronDown, ChevronUp, ChevronRight, ArrowRight, Zap,
    CheckCircle2, Timer, Package, Palette, Printer, Scissors,
    Layers, BookOpen, User, Calendar, Settings, RefreshCw,
    Kanban, Table, LayoutGrid, DollarSign, X, ExternalLink,
    Filter, Activity, Phone
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatCurrency as fmt } from '../constants';
import usePolling from '../hooks/usePolling';

import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
import './ProductionTracker.css';

const STAGE_CONFIG = {
    Pending:            { icon: Clock,        color: '#64748b', bg: 'rgba(100,116,139,0.08)', label: 'Pending' },
    Designing:          { icon: Palette,      color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  label: 'Designing' },
    'Approval Pending': { icon: Timer,        color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   label: 'Approval' },
    Printing:           { icon: Printer,      color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', label: 'Printing' },
    Cutting:            { icon: Scissors,     color: '#06b6d4', bg: 'rgba(6,182,212,0.08)',  label: 'Cutting' },
    Lamination:         { icon: Layers,       color: '#0891b2', bg: 'rgba(8,145,178,0.08)',  label: 'Lamination' },
    Binding:            { icon: BookOpen,     color: '#d97706', bg: 'rgba(217,119,6,0.1)',   label: 'Binding' },
    Production:         { icon: Settings,     color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: 'Production' },
    Processing:         { icon: RefreshCw,    color: '#6366f1', bg: 'rgba(99,102,241,0.08)', label: 'Processing' },
    Completed:          { icon: CheckCircle2, color: '#10b981', bg: 'rgba(16,185,129,0.1)',  label: 'Completed' },
};

const STAGE_FLOW = [
    'Pending',
    'Designing',
    'Approval Pending',
    'Printing',
    'Cutting',
    'Lamination',
    'Binding',
    'Production',
    'Processing',
    'Completed'
];

const PRIORITY_COLORS = {
    Urgent: '#dc2626', High: '#f59e0b', Medium: '#64748b', Low: '#94a3b8',
};

const ProductionTracker = () => {
    useSEO('Production Tracker');

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState('');
    const [search, setSearch] = useState('');
    
    // View modes: 'kanban' | 'accordion' | 'table'
    const [viewMode, setViewMode] = useState('kanban');
    
    // KPI Filter toggles: 'all' | 'overdue' | 'urgent' | 'unpaid'
    const [activeKpiFilter, setActiveKpiFilter] = useState('all');
    
    // Job Inspector Drawer state
    const [inspectedJob, setInspectedJob] = useState(null);
    const [updatingJobId, setUpdatingJobId] = useState(null);
    
    // Accordion state
    const [collapsedStages, setCollapsedStages] = useState(new Set());

    const navigate = useNavigate();

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
        } catch { 
            setData(null); 
        } finally { 
            setLoading(false); 
        }
    }, [branchId, search]);

    useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
    usePolling(fetchData, 30000, true);

    // 1-Click Quick Stage Advance / Update
    const handleStageAdvance = async (job, targetStage) => {
        setUpdatingJobId(job.id);
        try {
            const res = await api.patch(`/production-tracker/${job.id}/status`, { status: targetStage });
            if (res.data?.success) {
                // Optimistic UI update
                setData(prev => {
                    if (!prev) return prev;
                    const newStages = { ...prev.stages };
                    const currentStage = job.status || 'Processing';
                    
                    // Remove from old stage
                    if (newStages[currentStage]) {
                        newStages[currentStage] = newStages[currentStage].filter(j => j.id !== job.id);
                    }
                    
                    // Add to target stage
                    const updatedJob = { ...job, status: targetStage, hours_in_stage: 0 };
                    if (!newStages[targetStage]) newStages[targetStage] = [];
                    newStages[targetStage] = [updatedJob, ...newStages[targetStage]];

                    return { ...prev, stages: newStages };
                });

                if (inspectedJob?.id === job.id) {
                    setInspectedJob(prev => prev ? { ...prev, status: targetStage } : null);
                }
            }
        } catch (err) {
            console.error('Failed to update stage:', err);
        } finally {
            setUpdatingJobId(null);
        }
    };

    const toggleStageAccordion = (stage) => {
        setCollapsedStages(prev => {
            const next = new Set(prev);
            if (next.has(stage)) next.delete(stage); else next.add(stage);
            return next;
        });
    };

    const summary = data?.summary || {};
    const allStages = data?.all_stages || STAGE_FLOW;

    // Filter jobs based on active KPI filter
    const filteredStagesData = useMemo(() => {
        if (!data?.stages) return {};
        const result = {};
        for (const stage of allStages) {
            let jobs = data.stages[stage] || [];
            if (activeKpiFilter === 'overdue') {
                jobs = jobs.filter(j => j.is_overdue);
            } else if (activeKpiFilter === 'urgent') {
                jobs = jobs.filter(j => j.priority === 'Urgent' || j.priority === 'High');
            } else if (activeKpiFilter === 'unpaid') {
                jobs = jobs.filter(j => (Number(j.balance_amount) || 0) > 0);
            }
            result[stage] = jobs;
        }
        return result;
    }, [data, allStages, activeKpiFilter]);

    // Flatten all jobs for Table view
    const allFilteredJobsList = useMemo(() => {
        const list = [];
        for (const stage of allStages) {
            const jobs = filteredStagesData[stage] || [];
            list.push(...jobs);
        }
        return list;
    }, [filteredStagesData, allStages]);

    return (
        <PageContainer>
            {/* Header Title Bar */}
            <div className="page-header" style={{ marginBottom: 16 }}>
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(67,97,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={22} style={{ color: 'var(--accent, #4361ee)' }} />
                        </div>
                        Production Control Hub
                    </h1>
                    <p className="section-subtitle" style={{ marginTop: 4 }}>
                        Live shop floor pipeline, stage automation & SLA tracking
                    </p>
                </div>
            </div>

            {/* Hero Analytics KPI Grid */}
            <div className="production-kpi-grid">
                <div 
                    className={`production-kpi-card ${activeKpiFilter === 'all' ? 'production-kpi-card--active' : ''}`}
                    onClick={() => setActiveKpiFilter('all')}
                >
                    <div className="production-kpi-icon-box" style={{ background: 'rgba(67,97,238,0.12)', color: '#4361ee' }}>
                        <Activity size={22} />
                    </div>
                    <div className="production-kpi-content">
                        <div className="production-kpi-label">Active Jobs</div>
                        <div className="production-kpi-value">{summary.total_active || 0}</div>
                        <div className="production-kpi-sub">
                            Across shop floor
                        </div>
                    </div>
                </div>

                <div 
                    className={`production-kpi-card production-kpi-card--overdue ${activeKpiFilter === 'overdue' ? 'production-kpi-card--active' : ''}`}
                    onClick={() => setActiveKpiFilter(prev => prev === 'overdue' ? 'all' : 'overdue')}
                >
                    <div className="production-kpi-icon-box">
                        <AlertTriangle size={22} />
                    </div>
                    <div className="production-kpi-content">
                        <div className="production-kpi-label">Overdue Risk</div>
                        <div className="production-kpi-value" style={{ color: '#ef4444' }}>{summary.overdue || 0}</div>
                        <div className="production-kpi-sub" style={{ color: '#ef4444' }}>
                            Past delivery SLA
                        </div>
                    </div>
                </div>

                <div 
                    className={`production-kpi-card production-kpi-card--urgent ${activeKpiFilter === 'urgent' ? 'production-kpi-card--active' : ''}`}
                    onClick={() => setActiveKpiFilter(prev => prev === 'urgent' ? 'all' : 'urgent')}
                >
                    <div className="production-kpi-icon-box">
                        <Zap size={22} />
                    </div>
                    <div className="production-kpi-content">
                        <div className="production-kpi-label">Urgent / High</div>
                        <div className="production-kpi-value" style={{ color: '#f59e0b' }}>{summary.urgent || 0}</div>
                        <div className="production-kpi-sub">
                            Priority jobs
                        </div>
                    </div>
                </div>

                <div className="production-kpi-card production-kpi-card--bottleneck">
                    <div className="production-kpi-icon-box">
                        <Timer size={22} />
                    </div>
                    <div className="production-kpi-content">
                        <div className="production-kpi-label">Bottleneck Stage</div>
                        <div className="production-kpi-value" style={{ fontSize: 16 }}>
                            {summary.bottleneck_stage || 'None'}
                        </div>
                        <div className="production-kpi-sub">
                            {summary.bottleneck_avg_hours > 0 ? `Avg ${summary.bottleneck_avg_hours}h in stage` : 'Optimal flow'}
                        </div>
                    </div>
                </div>

                <div 
                    className={`production-kpi-card production-kpi-card--revenue ${activeKpiFilter === 'unpaid' ? 'production-kpi-card--active' : ''}`}
                    onClick={() => setActiveKpiFilter(prev => prev === 'unpaid' ? 'all' : 'unpaid')}
                >
                    <div className="production-kpi-icon-box">
                        <DollarSign size={22} />
                    </div>
                    <div className="production-kpi-content">
                        <div className="production-kpi-label">Pipeline Value</div>
                        <div className="production-kpi-value" style={{ color: '#10b981' }}>{fmt(summary.total_revenue || 0)}</div>
                        <div className="production-kpi-sub">
                            Unpaid: {fmt(summary.total_unpaid || 0)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls Bar & View Switcher */}
            <div className="production-controls-bar">
                <div className="production-filters-wrapper">
                    {/* View mode buttons */}
                    <div className="view-switcher-group">
                        <button 
                            className={`view-btn ${viewMode === 'kanban' ? 'view-btn--active' : ''}`}
                            onClick={() => setViewMode('kanban')}
                        >
                            <Kanban size={15} /> Kanban
                        </button>
                        <button 
                            className={`view-btn ${viewMode === 'accordion' ? 'view-btn--active' : ''}`}
                            onClick={() => setViewMode('accordion')}
                        >
                            <LayoutGrid size={15} /> Accordion
                        </button>
                        <button 
                            className={`view-btn ${viewMode === 'table' ? 'view-btn--active' : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            <Table size={15} /> Table
                        </button>
                    </div>

                    {/* Branch Select */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={16} style={{ color: 'var(--text-muted)' }} />
                        <BranchSelect 
                            className="production-select-box"
                            value={branchId} 
                            onChange={e => setBranchId(e.target.value)}
                        >
                            <option value="">All Branches</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </BranchSelect>
                    </div>

                    {/* Search box */}
                    <div className="production-search-box">
                        <Search size={15} style={{ color: 'var(--text-muted)' }} />
                        <input 
                            type="text" 
                            placeholder="Search job #, customer, title..."
                            value={search} 
                            onChange={e => setSearch(e.target.value)} 
                        />
                    </div>
                </div>

                {/* Auto Refresh status */}
                <div className="live-indicator">
                    <span className="live-dot" />
                    Live Sync
                </div>
            </div>

            {/* Main Content Area */}
            {loading && !data ? <LoadingSpinner /> : !data ? (
                <div className="text-center p-40 muted">Failed to load production pipeline data</div>
            ) : (
                <>
                    {/* 1. KANBAN BOARD VIEW */}
                    {viewMode === 'kanban' && (
                        <div className="production-kanban-board">
                            {allStages.map(stage => {
                                const conf = STAGE_CONFIG[stage] || STAGE_CONFIG.Processing;
                                const jobs = filteredStagesData[stage] || [];
                                const StageIcon = conf.icon;
                                return (
                                    <div key={stage} className="kanban-column">
                                        <div className="kanban-column-header">
                                            <div className="kanban-column-title">
                                                <StageIcon size={16} style={{ color: conf.color }} />
                                                <span>{conf.label}</span>
                                            </div>
                                            <span className="kanban-column-count" style={{ background: conf.bg, color: conf.color }}>
                                                {jobs.length}
                                            </span>
                                        </div>
                                        <div className="kanban-column-body">
                                            {jobs.length === 0 ? (
                                                <div className="kanban-column-empty">
                                                    No jobs in {conf.label}
                                                </div>
                                            ) : (
                                                jobs.map((job, idx) => (
                                                    <JobCardSupreme 
                                                        key={job.id} 
                                                        job={job} 
                                                        stageColor={conf.color} 
                                                        onInspect={() => setInspectedJob(job)}
                                                        onAdvanceStage={handleStageAdvance}
                                                        isUpdating={updatingJobId === job.id}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 2. ACCORDION GROUPED VIEW */}
                    {viewMode === 'accordion' && (
                        <div>
                            {allStages.map(stage => {
                                const conf = STAGE_CONFIG[stage] || STAGE_CONFIG.Processing;
                                const jobs = filteredStagesData[stage] || [];
                                const isCollapsed = collapsedStages.has(stage);
                                const StageIcon = conf.icon;

                                if (jobs.length === 0 && activeKpiFilter !== 'all') return null;

                                return (
                                    <div key={stage} className="production-stage-section" style={{ marginBottom: 14 }}>
                                        <button className="production-stage-header" onClick={() => toggleStageAccordion(stage)}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span className="production-stage-dot" style={{ background: conf.color }} />
                                                <StageIcon size={18} style={{ color: conf.color }} />
                                                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{conf.label}</span>
                                                <span className="production-stage-badge" style={{ background: conf.bg, color: conf.color }}>
                                                    {jobs.length}
                                                </span>
                                            </div>
                                            <div>
                                                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                            </div>
                                        </button>

                                        {!isCollapsed && (
                                            <div className="production-jobs-grid">
                                                {jobs.map(job => (
                                                    <JobCardSupreme 
                                                        key={job.id} 
                                                        job={job} 
                                                        stageColor={conf.color} 
                                                        onInspect={() => setInspectedJob(job)}
                                                        onAdvanceStage={handleStageAdvance}
                                                        isUpdating={updatingJobId === job.id}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 3. HIGH-DENSITY TABLE VIEW */}
                    {viewMode === 'table' && (
                        <div className="production-table-container">
                            <table className="production-table">
                                <thead>
                                    <tr>
                                        <th>Job # / Name</th>
                                        <th>Customer</th>
                                        <th>Stage</th>
                                        <th>Priority</th>
                                        <th>Stage SLA</th>
                                        <th>Delivery</th>
                                        <th>Financial Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allFilteredJobsList.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="text-center p-20 muted">No production jobs found</td>
                                        </tr>
                                    ) : (
                                        allFilteredJobsList.map(job => {
                                            const conf = STAGE_CONFIG[job.status] || STAGE_CONFIG.Processing;
                                            const priColor = PRIORITY_COLORS[job.priority] || PRIORITY_COLORS.Medium;
                                            const isPaid = (Number(job.balance_amount) || 0) <= 0;
                                            const nextStage = getNextStage(job.status);
                                            return (
                                                <tr key={job.id} onClick={() => setInspectedJob(job)}>
                                                    <td>
                                                        <div style={{ fontWeight: 700 }}>{job.job_name}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'monospace' }}>{job.job_number}</div>
                                                    </td>
                                                    <td>
                                                        <div>{job.customer_name}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{job.customer_mobile}</div>
                                                    </td>
                                                    <td>
                                                        <span className="production-tag" style={{ background: conf.bg, color: conf.color, fontWeight: 700 }}>
                                                            {conf.label}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`priority-pill priority-pill--${(job.priority || 'medium').toLowerCase()}`}>
                                                            {job.priority}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: 12, fontWeight: 600 }}>{job.hours_in_stage || 0}h</span>
                                                    </td>
                                                    <td>
                                                        {job.delivery_date ? (
                                                            <span style={job.is_overdue ? { color: 'var(--error)', fontWeight: 700 } : {}}>
                                                                {new Date(job.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td>
                                                        <div style={{ fontWeight: 700, color: isPaid ? '#10b981' : '#ef4444' }}>
                                                            {fmt(job.total_amount)}
                                                        </div>
                                                        {!isPaid && (
                                                            <div style={{ fontSize: 10, color: '#ef4444' }}>Due: {fmt(job.balance_amount)}</div>
                                                        )}
                                                    </td>
                                                    <td onClick={e => e.stopPropagation()}>
                                                        {nextStage && (
                                                            <button 
                                                                className="quick-advance-btn"
                                                                onClick={() => handleStageAdvance(job, nextStage)}
                                                                disabled={updatingJobId === job.id}
                                                            >
                                                                Next: {nextStage} <ArrowRight size={12} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Slide-Out Job Inspector Drawer */}
            {inspectedJob && (
                <JobInspectorModal 
                    job={inspectedJob}
                    onClose={() => setInspectedJob(null)}
                    onAdvanceStage={handleStageAdvance}
                    onNavigate={() => navigate(`/dashboard/jobs/${inspectedJob.id}`)}
                    isUpdating={updatingJobId === inspectedJob.id}
                />
            )}
        </PageContainer>
    );
};

/* Helper function to get next workflow stage */
function getNextStage(currentStage) {
    const idx = STAGE_FLOW.indexOf(currentStage);
    if (idx !== -1 && idx < STAGE_FLOW.length - 1) {
        return STAGE_FLOW[idx + 1];
    }
    return null;
}

/* ─── Supreme Job Card ─── */
const JobCardSupreme = React.memo(({ job, stageColor, onInspect, onAdvanceStage, isUpdating }) => {
    const priColor = PRIORITY_COLORS[job.priority] || PRIORITY_COLORS.Medium;
    const balance = Number(job.balance_amount) || 0;
    const total = Number(job.total_amount) || 0;
    const isFullyPaid = balance <= 0;

    const nextStage = getNextStage(job.status);
    const currentStageIdx = STAGE_FLOW.indexOf(job.status);

    return (
        <div 
            className="production-job-card-supreme"
            onClick={onInspect}
        >
            <div className="card-top-bar">
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="card-job-title">{job.job_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span className="card-job-number">{job.job_number}</span>
                        <span className={`priority-pill priority-pill--${(job.priority || 'medium').toLowerCase()}`}>
                            {job.priority}
                        </span>
                    </div>
                </div>

                {job.is_overdue && (
                    <span className="production-overdue-badge">
                        <AlertTriangle size={10} /> OVERDUE
                    </span>
                )}
            </div>

            {/* Customer */}
            <div className="production-customer" style={{ marginTop: 6 }}>
                <User size={11} />
                <strong style={{ color: 'var(--text)' }}>{job.customer_name}</strong>
                {job.customer_mobile && <span>· {job.customer_mobile}</span>}
            </div>

            {/* Tags */}
            <div className="production-tags" style={{ marginTop: 8 }}>
                {job.category && <span className="production-tag">{job.category}</span>}
                {job.quantity > 1 && <span className="production-tag"><Package size={10} /> Qty: {job.quantity}</span>}
                {job.hours_in_stage > 0 && (
                    <span className="production-tag" style={job.hours_in_stage > 48 ? { color: '#ef4444', background: 'rgba(239,68,68,0.1)' } : {}}>
                        <Timer size={10} /> {job.hours_in_stage}h in stage
                    </span>
                )}
            </div>

            {/* Mini Stage Step Bar */}
            <div className="mini-stage-tracker">
                {STAGE_FLOW.slice(0, 7).map((st, i) => (
                    <div 
                        key={st}
                        className={`mini-stage-dot ${i < currentStageIdx ? 'mini-stage-dot--completed' : i === currentStageIdx ? 'mini-stage-dot--current' : ''}`}
                        title={st}
                    />
                ))}
            </div>

            {/* Quick Actions & Finance Row */}
            <div className="card-quick-actions">
                <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: isFullyPaid ? '#10b981' : '#ef4444' }}>
                        {fmt(total)}
                    </div>
                    {!isFullyPaid && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Due: {fmt(balance)}</div>
                    )}
                </div>

                {nextStage && (
                    <button 
                        className="quick-advance-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAdvanceStage(job, nextStage);
                        }}
                        disabled={isUpdating}
                    >
                        {isUpdating ? <Loader2 size={12} className="spin" /> : <>Next: {nextStage} <ArrowRight size={12} /></>}
                    </button>
                )}
            </div>
        </div>
    );
});

/* ─── Slide-Out Job Inspector Drawer ─── */
const JobInspectorModal = ({ job, onClose, onAdvanceStage, onNavigate, isUpdating }) => {
    const currentStageConf = STAGE_CONFIG[job.status] || STAGE_CONFIG.Processing;
    const isPaid = (Number(job.balance_amount) || 0) <= 0;

    return (
        <div className="job-inspector-overlay" onClick={onClose}>
            <div className="job-inspector-drawer" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="drawer-header">
                    <div>
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>
                            {job.job_number}
                        </div>
                        <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: 'var(--text)' }}>
                            {job.job_name}
                        </h2>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="drawer-body">
                    {/* Stage & Progress Action */}
                    <div className="drawer-section">
                        <div className="drawer-section-title">
                            <Activity size={14} /> Current Stage & Progression
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <span className="production-tag" style={{ background: currentStageConf.bg, color: currentStageConf.color, fontSize: 13, padding: '4px 12px', fontWeight: 800 }}>
                                {currentStageConf.label}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Time in stage: <strong>{job.hours_in_stage || 0} hours</strong>
                            </span>
                        </div>

                        {/* Direct Stage Switcher buttons */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {STAGE_FLOW.map(stage => {
                                const isCurrent = job.status === stage;
                                return (
                                    <button
                                        key={stage}
                                        className="btn btn-sm"
                                        style={{
                                            fontSize: 11,
                                            padding: '4px 10px',
                                            background: isCurrent ? currentStageConf.color : 'var(--surface-2)',
                                            color: isCurrent ? '#ffffff' : 'var(--text)',
                                            border: isCurrent ? 'none' : '1px solid var(--border)'
                                        }}
                                        onClick={() => onAdvanceStage(job, stage)}
                                        disabled={isUpdating}
                                    >
                                        {stage}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Customer Info */}
                    <div className="drawer-section">
                        <div className="drawer-section-title">
                            <User size={14} /> Customer Information
                        </div>
                        <div className="spec-grid">
                            <div>
                                <div className="spec-item-label">Customer Name</div>
                                <div className="spec-item-value">{job.customer_name}</div>
                            </div>
                            <div>
                                <div className="spec-item-label">Mobile Number</div>
                                <div className="spec-item-value">
                                    {job.customer_mobile ? (
                                        <a href={`tel:${job.customer_mobile}`} style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <Phone size={12} /> {job.customer_mobile}
                                        </a>
                                    ) : 'N/A'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Specifications */}
                    <div className="drawer-section">
                        <div className="drawer-section-title">
                            <Package size={14} /> Job Specifications
                        </div>
                        <div className="spec-grid">
                            <div>
                                <div className="spec-item-label">Category</div>
                                <div className="spec-item-value">{job.category || 'General'}</div>
                            </div>
                            <div>
                                <div className="spec-item-label">Quantity</div>
                                <div className="spec-item-value">{job.quantity || 1}</div>
                            </div>
                            <div>
                                <div className="spec-item-label">Priority</div>
                                <div className="spec-item-value" style={{ color: PRIORITY_COLORS[job.priority] }}>
                                    {job.priority}
                                </div>
                            </div>
                            <div>
                                <div className="spec-item-label">Target Delivery</div>
                                <div className="spec-item-value" style={job.is_overdue ? { color: '#ef4444' } : {}}>
                                    {job.delivery_date ? new Date(job.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="drawer-section">
                        <div className="drawer-section-title">
                            <DollarSign size={14} /> Financial Summary
                        </div>
                        <div className="spec-grid">
                            <div>
                                <div className="spec-item-label">Total Amount</div>
                                <div className="spec-item-value" style={{ fontSize: 16 }}>{fmt(job.total_amount)}</div>
                            </div>
                            <div>
                                <div className="spec-item-label">Balance Due</div>
                                <div className="spec-item-value" style={{ fontSize: 16, color: isPaid ? '#10b981' : '#ef4444' }}>
                                    {fmt(job.balance_amount)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Open Full Job Link */}
                    <button 
                        className="btn btn-primary"
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 'auto' }}
                        onClick={onNavigate}
                    >
                        View Full Job Order <ExternalLink size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const LoadingSpinner = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 56 }}>
        <Loader2 className="spin" size={32} style={{ color: 'var(--accent)' }} />
    </div>
);

export default ProductionTracker;
