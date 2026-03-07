import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import {
    AlertTriangle, Clock, RefreshCw, ChevronDown, ChevronUp, Printer,
    ArrowUpDown, Zap, CalendarClock, IndianRupee, Users, Timer, CircleDot,
    TrendingUp, BarChart3, CheckCircle2, XCircle
} from 'lucide-react';

const URGENCY_CONFIG = {
    critical: { label: 'Critical', color: 'var(--error)', bg: 'rgba(176,58,46,0.10)', border: 'rgba(176,58,46,0.25)', icon: '🔴' },
    high: { label: 'High', color: 'var(--warning)', bg: 'rgba(179,107,0,0.10)', border: 'rgba(179,107,0,0.25)', icon: '🟠' },
    medium: { label: 'Medium', color: 'var(--muted)', bg: 'rgba(108,112,119,0.10)', border: 'rgba(108,112,119,0.25)', icon: '🟡' },
    low: { label: 'Low', color: 'var(--success)', bg: 'rgba(47,125,74,0.10)', border: 'rgba(47,125,74,0.25)', icon: '🟢' }
};

const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    const now = new Date();
    const diffHrs = (dt - now) / (1000 * 60 * 60);
    const time = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const date = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    if (diffHrs <= 0) return `Overdue (${date})`;
    if (diffHrs <= 24) return `Today ${time}`;
    if (diffHrs <= 48) return `Tomorrow ${time}`;
    return `${date} ${time}`;
};

const formatCurrency = (v) => {
    const n = Number(v) || 0;
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// ────────────── Summary Cards ──────────────
const SummaryCards = ({ summary }) => {
    const cards = [
        { label: 'Active Jobs', value: summary.total_active_jobs, icon: <Printer size={18} />, color: 'var(--accent)' },
        { label: 'Critical', value: summary.critical, icon: <AlertTriangle size={18} />, color: 'var(--error)' },
        { label: 'High Priority', value: summary.high, icon: <Zap size={18} />, color: 'var(--warning)' },
        { label: 'Overdue', value: summary.overdue, icon: <Clock size={18} />, color: 'var(--error)' },
        { label: 'Unassigned', value: summary.unassigned, icon: <Users size={18} />, color: 'var(--accent)' },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {cards.map(c => (
                <div key={c.label} style={{
                    background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px',
                    border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '13px' }}>
                        <span style={{ color: c.color }}>{c.icon}</span> {c.label}
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: c.value > 0 ? c.color : 'var(--text)', fontFamily: "'Space Grotesk', sans-serif" }}>
                        {c.value}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ────────────── Priority Badge ──────────────
const UrgencyBadge = ({ urgency }) => {
    const config = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.medium;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
            background: config.bg, color: config.color, border: `1px solid ${config.border}`,
            whiteSpace: 'nowrap'
        }}>
            {config.icon} {config.label}
        </span>
    );
};

// ────────────── Score Bar ──────────────
const ScoreBar = ({ score, max = 140 }) => {
    const pct = Math.min((score / max) * 100, 100);
    const color = score >= 100 ? 'var(--error)' : score >= 75 ? 'var(--warning)' : score >= 50 ? 'var(--muted)' : 'var(--success)';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '100px' }}>
            <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--bg-2)' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color, transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color, fontFamily: "'Space Grotesk', sans-serif", minWidth: '24px' }}>{score}</span>
        </div>
    );
};

// ────────────── Job Row ──────────────
const JobRow = ({ job, position, onPriorityChange }) => {
    const [changing, setChanging] = useState(false);

    const handlePriorityChange = async (newPriority) => {
        setChanging(true);
        try {
            await api.post('/job-priority/override', { job_id: job.id, priority: newPriority });
            onPriorityChange();
        } catch { /* ignore */ }
        setChanging(false);
    };

    const urgencyConfig = URGENCY_CONFIG[job.urgency] || URGENCY_CONFIG.medium;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 120px 100px 90px 110px 100px',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            borderLeft: `3px solid ${urgencyConfig.color}`,
            background: job.urgency === 'critical' ? 'rgba(176,58,46,0.03)' : 'transparent',
            transition: 'background 0.2s',
        }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = job.urgency === 'critical' ? 'rgba(176,58,46,0.03)' : 'transparent'}
        >
            {/* Position */}
            <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
                background: position <= 3 ? urgencyConfig.bg : 'var(--bg-2)',
                color: position <= 3 ? urgencyConfig.color : 'var(--muted)',
                fontFamily: "'Space Grotesk', sans-serif"
            }}>
                {position}
            </div>

            {/* Job info */}
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>#{job.job_number || job.id}</span>
                    <UrgencyBadge urgency={job.urgency} />
                    <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{job.status}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.job_name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '1px' }}>
                    {job.customer_name}{job.category ? ` · ${job.category}` : ''}
                </div>
            </div>

            {/* Delivery */}
            <div style={{ fontSize: '12px', color: job.urgency === 'critical' ? 'var(--error)' : 'var(--muted)', fontWeight: job.urgency === 'critical' ? 600 : 400 }}>
                <CalendarClock size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />
                {formatDate(job.delivery_date)}
            </div>

            {/* Amount */}
            <div style={{ fontSize: '13px', fontWeight: 500, fontFamily: "'Space Grotesk', sans-serif" }}>
                {formatCurrency(job.total_amount)}
            </div>

            {/* Quantity */}
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {job.quantity} pcs
            </div>

            {/* Score */}
            <ScoreBar score={job.priority_score} />

            {/* Priority Override */}
            <select
                value={job.priority || 'Medium'}
                onChange={e => handlePriorityChange(e.target.value)}
                disabled={changing}
                style={{
                    fontSize: '12px', padding: '4px 8px', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text)', cursor: 'pointer', opacity: changing ? 0.5 : 1
                }}
            >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
            </select>
        </div>
    );
};

// ────────────── Machine Queue Card ──────────────
const MachineQueueCard = ({ queue, onRefresh }) => {
    const [expanded, setExpanded] = useState(true);
    const jobCount = queue.jobs.length;
    const criticalCount = queue.jobs.filter(j => j.urgency === 'critical').length;
    const highCount = queue.jobs.filter(j => j.urgency === 'high').length;

    const typeColors = {
        'Digital': 'var(--accent)', 'Offset': 'var(--accent-2)', 'Binding': 'var(--success)',
        'Lamination': 'var(--warning)', 'Cutting': 'var(--error)', 'Other': 'var(--muted)'
    };
    const machineColor = typeColors[queue.machine_type] || 'var(--muted)';

    return (
        <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '16px'
        }}>
            {/* Machine Header */}
            <div
                onClick={() => setExpanded(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', cursor: 'pointer', borderBottom: expanded ? '1px solid var(--border)' : 'none',
                    background: jobCount === 0 ? 'transparent' : 'var(--surface)',
                    transition: 'background 0.15s'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: `${machineColor}15`, color: machineColor
                    }}>
                        <Printer size={18} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{queue.machine_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            {queue.machine_type} · {jobCount} job{jobCount !== 1 ? 's' : ''} in queue
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {criticalCount > 0 && (
                        <span style={{
                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            background: 'rgba(176,58,46,0.10)', color: 'var(--error)'
                        }}>
                            {criticalCount} critical
                        </span>
                    )}
                    {highCount > 0 && (
                        <span style={{
                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            background: 'rgba(179,107,0,0.10)', color: 'var(--warning)'
                        }}>
                            {highCount} high
                        </span>
                    )}
                    {expanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
                </div>
            </div>

            {/* Jobs List */}
            {expanded && (
                jobCount > 0 ? (
                    <div>
                        {/* Column headers */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '36px 1fr 120px 100px 90px 110px 100px',
                            gap: '12px', padding: '8px 16px',
                            fontSize: '11px', fontWeight: 600, color: 'var(--muted)',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                            borderBottom: '1px solid var(--border)', background: 'var(--bg)'
                        }}>
                            <span>#</span>
                            <span>Job</span>
                            <span>Delivery</span>
                            <span>Amount</span>
                            <span>Qty</span>
                            <span>AI Score</span>
                            <span>Priority</span>
                        </div>
                        {queue.jobs.map((job, idx) => (
                            <JobRow key={job.id} job={job} position={idx + 1} onPriorityChange={onRefresh} />
                        ))}
                    </div>
                ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                        <CircleDot size={20} style={{ marginBottom: '6px', opacity: 0.4 }} /><br />
                        No active jobs in queue
                    </div>
                )
            )}
        </div>
    );
};

// ────────────── Performance Stats Panel ──────────────
const StatsPanel = ({ stats }) => {
    if (!stats) return null;
    const perf = stats.delivery_performance || {};
    const onTimePct = perf.total_delivered > 0 ? Math.round((perf.on_time / perf.total_delivered) * 100) : 0;

    return (
        <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', padding: '20px', marginBottom: '24px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <BarChart3 size={18} color="var(--accent)" />
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Performance (Last {stats.period_days} Days)</h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                {/* On-time Delivery */}
                <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>On-Time Delivery</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ fontSize: '24px', fontWeight: 700, color: onTimePct >= 80 ? 'var(--success)' : 'var(--warning)', fontFamily: "'Space Grotesk', sans-serif" }}>
                            {onTimePct}%
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            ({perf.on_time || 0}/{perf.total_delivered || 0})
                        </span>
                    </div>
                </div>

                {/* Avg Completion by Machine Type */}
                {(stats.avg_completion_by_type || []).map(m => (
                    <div key={m.machine_type} style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>{m.machine_type} Avg</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span style={{ fontSize: '24px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                                {m.avg_hours_to_complete || 0}h
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                {m.completed_jobs} jobs
                            </span>
                        </div>
                    </div>
                ))}

                {/* Machine Load */}
                {(stats.machine_load || []).slice(0, 4).map(m => (
                    <div key={m.machine_id} style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg)' }}>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>{m.machine_name}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span style={{ fontSize: '24px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                                {m.jobs_completed}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                jobs · {formatCurrency(m.revenue)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ────────────── Main Component ──────────────
const JobPriority = () => {
    const [data, setData] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showStats, setShowStats] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);

    const fetchQueue = useCallback(async () => {
        try {
            setError('');
            const res = await api.get('/job-priority/queue');
            setData(res.data);
            setLastUpdate(new Date());
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load priority queue');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await api.get('/job-priority/stats?days=30');
            setStats(res.data);
        } catch { /* non-critical */ }
    }, []);

    useEffect(() => {
        fetchQueue();
        fetchStats();
    }, [fetchQueue, fetchStats]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchQueue, 30000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchQueue]);

    const allJobs = useMemo(() => {
        if (!data) return [];
        const fromQueues = data.queues?.flatMap(q => q.jobs) || [];
        return [...fromQueues, ...(data.unassigned || [])].sort((a, b) => b.priority_score - a.priority_score);
    }, [data]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: '8px', color: 'var(--muted)' }}>
                <RefreshCw size={18} className="animate-spin" /> Loading AI Priority Queue...
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Zap size={22} color="var(--warning)" /> AI Job Priority
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                        Smart scheduling based on delivery urgency, order value, customer type & more
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {lastUpdate && (
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            Updated {lastUpdate.toLocaleTimeString('en-IN')}
                        </span>
                    )}

                    <label style={{
                        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
                        color: 'var(--muted)', cursor: 'pointer', padding: '6px 10px',
                        borderRadius: '8px', background: autoRefresh ? 'rgba(47,125,74,0.08)' : 'var(--bg-2)',
                        border: `1px solid ${autoRefresh ? 'rgba(47,125,74,0.2)' : 'var(--border)'}`
                    }}>
                        <input type="checkbox" checked={autoRefresh} onChange={() => setAutoRefresh(p => !p)}
                            style={{ accentColor: 'var(--success)' }} />
                        Auto-refresh
                    </label>

                    <button onClick={() => setShowStats(p => !p)} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                        borderRadius: '10px', border: '1px solid var(--border)', background: showStats ? 'var(--accent-soft)' : 'var(--surface)',
                        color: 'var(--text)', fontSize: '13px', fontWeight: 500, cursor: 'pointer'
                    }}>
                        <BarChart3 size={15} /> Stats
                    </button>

                    <button onClick={() => { setLoading(true); fetchQueue(); fetchStats(); }} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                        borderRadius: '10px', border: 'none', background: 'var(--accent)', color: 'white',
                        fontSize: '13px', fontWeight: 500, cursor: 'pointer'
                    }}>
                        <RefreshCw size={15} /> Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div style={{
                    padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                    background: 'rgba(176,58,46,0.08)', border: '1px solid rgba(176,58,46,0.2)',
                    color: 'var(--error)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <XCircle size={16} /> {error}
                </div>
            )}

            {/* Summary Cards */}
            {data?.summary && <SummaryCards summary={data.summary} />}

            {/* Performance Stats */}
            {showStats && <StatsPanel stats={stats} />}

            {/* Score Legend */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
                padding: '10px 16px', borderRadius: '10px', background: 'var(--surface)',
                border: '1px solid var(--border)', marginBottom: '20px', fontSize: '12px'
            }}>
                <span style={{ fontWeight: 600, color: 'var(--muted)', marginRight: '4px' }}>
                    <ArrowUpDown size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                    AI Score Factors:
                </span>
                <span style={{ color: 'var(--muted)' }}>
                    <Timer size={12} style={{ verticalAlign: '-1px', marginRight: '2px' }} /> Delivery Urgency (0-60)
                </span>
                <span style={{ color: 'var(--muted)' }}>
                    <IndianRupee size={12} style={{ verticalAlign: '-1px', marginRight: '2px' }} /> Order Value (0-20)
                </span>
                <span style={{ color: 'var(--muted)' }}>
                    <Users size={12} style={{ verticalAlign: '-1px', marginRight: '2px' }} /> Customer Type (0-15)
                </span>
                <span style={{ color: 'var(--muted)' }}>
                    <Zap size={12} style={{ verticalAlign: '-1px', marginRight: '2px' }} /> Priority (0-25)
                </span>
                <span style={{ color: 'var(--muted)' }}>
                    <CheckCircle2 size={12} style={{ verticalAlign: '-1px', marginRight: '2px' }} /> Payment (0-10)
                </span>
                <span style={{ color: 'var(--muted)' }}>
                    <TrendingUp size={12} style={{ verticalAlign: '-1px', marginRight: '2px' }} /> Age (0-10)
                </span>
            </div>

            {/* Machine Queues */}
            {(data?.queues || []).map(q => (
                <MachineQueueCard key={q.machine_id} queue={q} onRefresh={fetchQueue} />
            ))}

            {/* Unassigned Jobs */}
            {data?.unassigned?.length > 0 && (
                <div style={{
                    background: 'var(--surface)', borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '16px'
                }}>
                    <div style={{
                        padding: '14px 16px', borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', gap: '10px'
                    }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'var(--accent-soft)', color: 'var(--accent)'
                        }}>
                            <AlertTriangle size={18} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>Unassigned Jobs</div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                {data.unassigned.length} job{data.unassigned.length !== 1 ? 's' : ''} need machine assignment
                            </div>
                        </div>
                    </div>
                    <div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '36px 1fr 120px 100px 90px 110px 100px',
                            gap: '12px', padding: '8px 16px',
                            fontSize: '11px', fontWeight: 600, color: 'var(--muted)',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                            borderBottom: '1px solid var(--border)', background: 'var(--bg)'
                        }}>
                            <span>#</span>
                            <span>Job</span>
                            <span>Delivery</span>
                            <span>Amount</span>
                            <span>Qty</span>
                            <span>AI Score</span>
                            <span>Priority</span>
                        </div>
                        {data.unassigned.map((job, idx) => (
                            <JobRow key={job.id} job={job} position={idx + 1} onPriorityChange={fetchQueue} />
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {allJobs.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '48px 24px',
                    background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)'
                }}>
                    <CheckCircle2 size={40} color="var(--success)" style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>All Clear!</div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>No active jobs in the queue right now.</div>
                </div>
            )}
        </div>
    );
};

export default JobPriority;
