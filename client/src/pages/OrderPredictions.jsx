import React, { useState, useEffect, useCallback } from 'react';
import {
    Loader2, Building2, Search, Bell, BellRing, UserCheck, CalendarDays,
    IndianRupee, TrendingUp, ChevronRight, Phone, AlertTriangle,
    Sparkles, Clock, ArrowUpRight, Filter, ChevronDown, ChevronUp, X
} from 'lucide-react';
import api from '../services/api';
import { formatCurrency as fmt } from '../constants';

const CONFIDENCE_COLORS = {
    High: { bg: 'var(--color-ok, #16a34a)', light: '#dcfce7', text: '#166534' },
    Medium: { bg: 'var(--color-warning, #f59e0b)', light: '#fef9c3', text: '#854d0e' },
    Low: { bg: 'var(--text-muted, #9ca3af)', light: '#f3f4f6', text: '#4b5563' },
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OrderPredictions = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState('');
    const [lookahead, setLookahead] = useState(45);
    const [search, setSearch] = useState('');
    const [confFilter, setConfFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);
    const [customerDetail, setCustomerDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        api.get('/branches').then(r => setBranches(r.data)).catch(() => {});
    }, []);

    const fetchPredictions = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ lookahead_days: lookahead });
            if (branchId) params.append('branch_id', branchId);
            const res = await api.get(`/ai/order-predictions/predictions?${params}`);
            setData(res.data);
        } catch { setData(null); }
        finally { setLoading(false); }
    }, [branchId, lookahead]);

    useEffect(() => { fetchPredictions(); }, [fetchPredictions]);

    const openCustomerDetail = async (customerId) => {
        if (expandedId === customerId) { setExpandedId(null); return; }
        setExpandedId(customerId);
        setDetailLoading(true);
        try {
            const res = await api.get(`/ai/order-predictions/predictions/customer/${customerId}`);
            setCustomerDetail(res.data);
        } catch { setCustomerDetail(null); }
        finally { setDetailLoading(false); }
    };

    // Filter predictions
    const filtered = (data?.predictions || []).filter(p => {
        if (confFilter !== 'all' && p.confidence_label !== confFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            return p.customer_name.toLowerCase().includes(q) ||
                   p.category.toLowerCase().includes(q) ||
                   (p.customer_mobile || '').includes(q);
        }
        return true;
    });

    const summary = data?.summary || {};

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={24} className="text-accent" />
                        Customer Order Predictions
                    </h1>
                    <p className="section-subtitle">AI analyzes past orders to predict which customers will order soon</p>
                </div>
            </div>

            {/* Filters */}
            <div className="row gap-sm items-center flex-wrap mb-20">
                <Building2 size={16} className="muted" />
                <select className="input-field" value={branchId} onChange={e => setBranchId(e.target.value)} style={{ minWidth: 140 }}>
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>

                <Filter size={16} className="muted" style={{ marginLeft: 8 }} />
                <select className="input-field" value={lookahead} onChange={e => setLookahead(Number(e.target.value))} style={{ minWidth: 120 }}>
                    <option value={30}>Next 30 days</option>
                    <option value={45}>Next 45 days</option>
                    <option value={60}>Next 60 days</option>
                    <option value={90}>Next 90 days</option>
                </select>

                <select className="input-field" value={confFilter} onChange={e => setConfFilter(e.target.value)} style={{ minWidth: 120 }}>
                    <option value="all">All confidence</option>
                    <option value="High">High only</option>
                    <option value="Medium">Medium+</option>
                    <option value="Low">Low</option>
                </select>

                <div className="row gap-xs items-center" style={{ marginLeft: 'auto' }}>
                    <Search size={16} className="muted" />
                    <input type="text" className="input-field" placeholder="Search customer / category..."
                        value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 200 }} />
                </div>
            </div>

            {loading ? <LoadingSpinner /> : !data ? (
                <div className="text-center p-40 muted">Failed to load predictions</div>
            ) : (
                <>
                    {/* Summary KPIs */}
                    <div className="summary-grid summary-grid--tiles mb-20">
                        <SummaryTile icon={<Bell size={20} />} label="Total Predictions" value={summary.total} />
                        <SummaryTile icon={<BellRing size={20} className="text-error" />} label="Overdue (missed window)" value={summary.overdue}
                            color={summary.overdue > 0 ? 'var(--error)' : undefined} />
                        <SummaryTile icon={<TrendingUp size={20} className="text-ok" />} label="High Confidence" value={summary.high_confidence} />
                        <SummaryTile icon={<IndianRupee size={20} />} label="Est. Revenue" value={fmt(summary.estimated_revenue)} />
                    </div>

                    {/* Predictions list */}
                    {filtered.length === 0 ? (
                        <div className="card p-40 text-center muted">
                            <Sparkles size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                            <div>No predictions match your filters. Try expanding the lookahead window or reducing filters.</div>
                        </div>
                    ) : (
                        <div className="stack-sm">
                            {filtered.map(p => (
                                <PredictionCard
                                    key={`${p.customer_id}-${p.category}-${p.predicted_month}`}
                                    prediction={p}
                                    isExpanded={expandedId === p.customer_id}
                                    onToggle={() => openCustomerDetail(p.customer_id)}
                                    detail={expandedId === p.customer_id ? customerDetail : null}
                                    detailLoading={expandedId === p.customer_id && detailLoading}
                                />
                            ))}
                        </div>
                    )}

                    {filtered.length > 0 && (
                        <div className="text-center muted text-xs mt-16">
                            Showing {filtered.length} of {summary.total} predictions
                            {' · '}Lookahead: {lookahead} days
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

/* ─── Prediction Card ─── */
const PredictionCard = ({ prediction: p, isExpanded, onToggle, detail, detailLoading }) => {
    const conf = CONFIDENCE_COLORS[p.confidence_label] || CONFIDENCE_COLORS.Low;

    return (
        <div className="card" style={{ overflow: 'hidden' }}>
            <div className="p-16" style={{ cursor: 'pointer' }} onClick={onToggle}>
                <div className="row gap-md items-start">
                    {/* Alert icon */}
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: p.is_overdue ? '#fee2e2' : conf.light,
                        display: 'grid', placeItems: 'center', flexShrink: 0
                    }}>
                        {p.is_overdue
                            ? <AlertTriangle size={22} style={{ color: 'var(--error)' }} />
                            : <Bell size={22} style={{ color: conf.bg }} />}
                    </div>

                    {/* Main content */}
                    <div className="flex-1">
                        <div className="row gap-sm items-center flex-wrap">
                            <span className="font-bold text-base">{p.customer_name}</span>
                            <ConfidenceBadge label={p.confidence_label} score={p.confidence_score} />
                            {p.is_overdue && (
                                <span style={{
                                    background: '#fee2e2', color: 'var(--error)',
                                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700
                                }}>OVERDUE</span>
                            )}
                        </div>

                        <div className="mt-4 text-sm">
                            <span className="muted">may order</span>{' '}
                            <strong>{p.category}</strong>{' '}
                            <span className="muted">in</span>{' '}
                            <strong>{p.predicted_month_name}</strong>
                            {p.days_until > 0 && (
                                <span className="muted"> ({p.days_until} days from now)</span>
                            )}
                        </div>

                        {/* Meta row */}
                        <div className="row gap-md items-center flex-wrap mt-8" style={{ fontSize: 12, color: 'var(--muted)' }}>
                            <span className="row gap-xs items-center">
                                <CalendarDays size={13} /> Ordered {p.distinct_years} years ({p.years_ordered.join(', ')})
                            </span>
                            <span className="row gap-xs items-center">
                                <IndianRupee size={13} /> Avg {fmt(p.avg_order_value)}
                            </span>
                            {p.customer_mobile && (
                                <span className="row gap-xs items-center">
                                    <Phone size={13} /> {p.customer_mobile}
                                </span>
                            )}
                            {p.branch_name && (
                                <span className="muted">{p.branch_name}</span>
                            )}
                        </div>

                        {/* Sample jobs */}
                        {p.sample_jobs?.length > 0 && (
                            <div className="mt-6" style={{ fontSize: 12 }}>
                                <span className="muted">Previous: </span>
                                {p.sample_jobs.map((j, i) => (
                                    <span key={i} style={{
                                        display: 'inline-block', background: 'var(--surface-2, #f1f5f9)',
                                        padding: '2px 8px', borderRadius: 4, marginRight: 4, marginTop: 2, fontSize: 11
                                    }}>{j}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Expand arrow */}
                    <div className="muted" style={{ flexShrink: 0, paddingTop: 4 }}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border, #e5e7eb)', padding: 16, background: 'var(--surface-lowest, #f8fafc)' }}>
                    {detailLoading ? (
                        <div className="flex items-center justify-center p-20"><Loader2 size={20} className="animate-spin muted" /></div>
                    ) : detail?.patterns ? (
                        <CustomerPatternDetail detail={detail} />
                    ) : (
                        <div className="text-center muted p-12">No detailed pattern data available</div>
                    )}
                </div>
            )}
        </div>
    );
};

/* ─── Customer Pattern Detail (expanded view) ─── */
const CustomerPatternDetail = ({ detail }) => {
    const { customer, patterns } = detail;
    return (
        <div className="stack-md">
            {customer && (
                <div className="row gap-md items-center text-sm">
                    <UserCheck size={16} className="muted" />
                    <strong>{customer.name}</strong>
                    <span className="muted">{customer.type}</span>
                    {customer.mobile && <span className="muted">· {customer.mobile}</span>}
                    {customer.email && <span className="muted">· {customer.email}</span>}
                </div>
            )}

            {patterns.map(pat => (
                <div key={pat.category} className="card p-12">
                    <div className="font-bold text-sm mb-8">{pat.category}</div>
                    <div className="text-xs muted mb-4">
                        {pat.totalOrders} orders · Total: {fmt(pat.totalValue)}
                    </div>

                    {/* Month heatmap */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4
                    }}>
                        {MONTH_SHORT.map((m, idx) => {
                            const monthData = pat.months[idx + 1];
                            const hasOrders = !!monthData;
                            const yearCount = monthData?.years?.length || 0;
                            const intensity = yearCount === 0 ? 0 : Math.min(yearCount / 4, 1);
                            return (
                                <div key={m} title={hasOrders
                                    ? `${m}: ${monthData.orders} orders in ${monthData.years.sort().join(', ')} — ${fmt(monthData.value)}`
                                    : `${m}: No orders`}
                                    style={{
                                        textAlign: 'center', fontSize: 10, padding: '6px 2px',
                                        borderRadius: 6,
                                        background: hasOrders
                                            ? `rgba(22, 163, 74, ${0.15 + intensity * 0.6})`
                                            : 'var(--surface-2, #f1f5f9)',
                                        color: hasOrders ? '#166534' : 'var(--text-muted)',
                                        fontWeight: hasOrders ? 700 : 400,
                                        cursor: 'default',
                                    }}>
                                    <div>{m}</div>
                                    {hasOrders && <div style={{ fontSize: 9, opacity: 0.8 }}>{monthData.years.sort().join(',')}</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

/* ─── Shared Components ─── */
const ConfidenceBadge = ({ label, score }) => {
    const conf = CONFIDENCE_COLORS[label] || CONFIDENCE_COLORS.Low;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: conf.light, color: conf.text,
            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: conf.bg }} />
            {label} ({score}%)
        </span>
    );
};

const SummaryTile = ({ icon, label, value, color }) => (
    <div className="summary-tile">
        <div className="summary-tile__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {icon} {label}
        </div>
        <div className="summary-tile__value" style={color ? { color } : undefined}>{value ?? '—'}</div>
    </div>
);

const LoadingSpinner = () => (
    <div className="flex items-center justify-center p-40">
        <Loader2 className="animate-spin text-accent" size={36} />
    </div>
);

export default OrderPredictions;
