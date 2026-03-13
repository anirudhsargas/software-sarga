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
            <div className="page-header" style={{ marginBottom: 10, paddingTop: 8, paddingBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={22} className="text-accent" style={{ marginRight: 2, marginTop: 1 }} />
                    <h1 className="section-title" style={{ fontSize: 22, margin: 0, fontWeight: 700, letterSpacing: -0.5 }}>
                        Customer Order Predictions
                    </h1>
                </div>
                <p className="section-subtitle" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2, marginLeft: 30 }}>
                    AI analyzes past ordering patterns to predict which customers are likely to place orders soon
                </p>
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                marginBottom: 18,
                alignItems: 'flex-end',
                rowGap: 10
            }}>
                {/* Branch filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 4px 0 10px', height: 36 }}>
                    <Building2 size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <select className="input-field" value={branchId} onChange={e => setBranchId(e.target.value)} style={{ border: 'none', background: 'transparent', boxShadow: 'none', height: 34, padding: '0 28px 0 4px', fontSize: 13, color: 'var(--text)', minWidth: 110 }}>
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>

                {/* Lookahead filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 4px 0 10px', height: 36 }}>
                    <Filter size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <select className="input-field" value={lookahead} onChange={e => setLookahead(Number(e.target.value))} style={{ border: 'none', background: 'transparent', boxShadow: 'none', height: 34, padding: '0 28px 0 4px', fontSize: 13, color: 'var(--text)', minWidth: 110 }}>
                        <option value={30}>Next 30 days</option>
                        <option value={45}>Next 45 days</option>
                        <option value={60}>Next 60 days</option>
                        <option value={90}>Next 90 days</option>
                    </select>
                </div>

                {/* Confidence filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 4px 0 10px', height: 36 }}>
                    <Sparkles size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <select className="input-field" value={confFilter} onChange={e => setConfFilter(e.target.value)} style={{ border: 'none', background: 'transparent', boxShadow: 'none', height: 34, padding: '0 28px 0 4px', fontSize: 13, color: 'var(--text)', minWidth: 100 }}>
                        <option value="all">All levels</option>
                        <option value="High">High only</option>
                        <option value="Medium">Medium+</option>
                        <option value="Low">Low</option>
                    </select>
                </div>

                {/* Search */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200, flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Search size={13} style={{ marginBottom: -2 }} /> Search
                    </label>
                    <input type="text" className="input-field" placeholder="Customer, category..."
                        value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 160, height: 36, padding: '6px 12px', fontSize: 13, color: 'var(--text)' }} />
                </div>
            </div>

            {loading ? <LoadingSpinner /> : !data ? (
                <div className="text-center p-40 muted">Failed to load predictions</div>
            ) : (
                <>
                    {/* Summary KPIs */}
                    <div className="summary-grid summary-grid--tiles mb-20" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 14
                    }}>
                        <SummaryTile icon={<Bell size={20} />} label="Total Predictions" value={summary.total} />
                        <SummaryTile icon={<BellRing size={20} />} label="Overdue (missed window)" value={summary.overdue}
                            color={summary.overdue > 0 ? 'var(--error)' : undefined} />
                        <SummaryTile icon={<TrendingUp size={20} />} label="High Confidence" value={summary.high_confidence}
                            color={summary.high_confidence > 0 ? 'var(--success)' : undefined} />
                        <SummaryTile icon={<IndianRupee size={20} />} label="Est. Revenue" value={fmt(summary.estimated_revenue)} />
                    </div>

                    {/* Predictions list */}
                    {filtered.length === 0 ? (
                        <div style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: 40,
                            textAlign: 'center',
                            color: 'var(--muted)'
                        }}>
                            <Sparkles size={32} style={{ marginBottom: 12, opacity: 0.4, color: 'var(--accent)' }} />
                            <div style={{ fontSize: 14 }}>No predictions match your filters.</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>Try expanding the lookahead window or adjusting your filters.</div>
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
                        <div style={{
                            textAlign: 'center',
                            color: 'var(--muted)',
                            fontSize: 12,
                            marginTop: 16,
                            paddingTop: 16,
                            borderTop: '1px solid var(--border)'
                        }}>
                            <span style={{ fontWeight: 600 }}>{filtered.length}</span> of <span style={{ fontWeight: 600 }}>{summary.total}</span> predictions shown
                            {' '}•{' '}
                            <span style={{ fontSize: 11 }}>Lookahead: {lookahead} days</span>
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
        <div className="card" style={{
            overflow: 'hidden',
            borderLeft: p.is_overdue ? `4px solid var(--error)` : `4px solid transparent`,
            background: p.is_overdue ? 'rgba(176, 58, 46, 0.02)' : undefined,
            transition: 'all 0.2s ease',
            cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--shadow-sm, 0 8px 24px rgba(20, 20, 20, 0.08))';
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '';
        }}>
            <div className="p-16" style={{ cursor: 'pointer' }} onClick={onToggle}>
                <div className="row gap-md items-start">
                    {/* Alert icon */}
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: p.is_overdue ? '#fee2e2' : conf.light,
                        display: 'grid', placeItems: 'center', flexShrink: 0,
                        transition: 'transform 0.2s ease'
                    }}>
                        {p.is_overdue
                            ? <AlertTriangle size={22} style={{ color: 'var(--error)' }} />
                            : <Bell size={22} style={{ color: conf.bg }} />}
                    </div>

                    {/* Main content */}
                    <div className="flex-1" style={{ minWidth: 0 }}>
                        {/* Header row: Customer name + Confidence badge + Expand arrow */}
                        <div className="row gap-md items-start" style={{ marginBottom: 12 }}>
                            <div className="flex-1" style={{ minWidth: 0 }}>
                                <div style={{
                                    fontSize: 15, fontWeight: 700, color: 'var(--text)',
                                    wordBreak: 'break-word'
                                }}>{p.customer_name}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <ConfidenceBadge label={p.confidence_label} score={p.confidence_score} />
                                {isExpanded ? <ChevronUp size={18} className="muted" /> : <ChevronDown size={18} className="muted" />}
                            </div>
                        </div>

                        {/* Prediction statement */}
                        <div style={{
                            background: 'var(--surface-2, #f1efe8)',
                            padding: '10px 12px',
                            borderRadius: 8,
                            fontSize: 13,
                            marginBottom: 12,
                            color: 'var(--text)'
                        }}>
                            <span className="muted">Likely to order </span>
                            <strong>{p.category}</strong>
                            <span className="muted"> in </span>
                            <strong>{p.predicted_month_name}</strong>
                            {p.days_until > 0 && (
                                <span className="muted">
                                    {' '}(<Clock size={11} style={{ display: 'inline', marginRight: 2 }} />{p.days_until}d)
                                </span>
                            )}
                        </div>

                        {/* Metadata grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: 12,
                            fontSize: 12,
                            color: 'var(--muted)',
                            marginBottom: p.sample_jobs?.length > 0 ? 12 : 0
                        }}>
                            <div className="row gap-xs items-center">
                                <CalendarDays size={13} style={{ flexShrink: 0 }} />
                                <span>{p.distinct_years} years ({p.years_ordered.join(', ')})</span>
                            </div>
                            <div className="row gap-xs items-center">
                                <IndianRupee size={13} style={{ flexShrink: 0 }} />
                                <span>Avg {fmt(p.avg_order_value)}</span>
                            </div>
                            {p.customer_mobile && (
                                <div className="row gap-xs items-center">
                                    <Phone size={13} style={{ flexShrink: 0 }} />
                                    <span>{p.customer_mobile}</span>
                                </div>
                            )}
                            {p.branch_name && (
                                <div className="row gap-xs items-center">
                                    <Building2 size={13} style={{ flexShrink: 0 }} />
                                    <span>{p.branch_name}</span>
                                </div>
                            )}
                        </div>

                        {/* Sample jobs */}
                        {p.sample_jobs?.length > 0 && (
                            <div style={{
                                paddingTop: 12,
                                borderTop: '1px solid var(--border)',
                                fontSize: 12
                            }}>
                                <div style={{ color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>Order History:</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {p.sample_jobs.map((j, i) => (
                                        <span key={i} style={{
                                            display: 'inline-block',
                                            background: conf.light,
                                            color: conf.text,
                                            padding: '4px 10px',
                                            borderRadius: 6,
                                            fontSize: 11,
                                            fontWeight: 600
                                        }}>{j}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
                <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: 16,
                    background: 'var(--surface-2, #f1efe8)',
                    transition: 'all 0.2s ease'
                }}>
                    {detailLoading ? (
                        <div className="flex items-center justify-center p-20">
                            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
                        </div>
                    ) : detail?.patterns ? (
                        <CustomerPatternDetail detail={detail} />
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            color: 'var(--muted)',
                            padding: 12,
                            fontSize: 13
                        }}>No detailed pattern data available</div>
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
                <div style={{
                    background: 'var(--surface)',
                    padding: '12px 16px',
                    borderRadius: 8,
                    borderBottom: '1px solid var(--border)',
                    marginBottom: 8
                }}>
                    <div className="row gap-md items-center flex-wrap" style={{ fontSize: 13 }}>
                        <UserCheck size={16} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                        <strong>{customer.name}</strong>
                        <span className="muted">·</span>
                        <span className="muted" style={{ fontSize: 12 }}>{customer.type}</span>
                        {customer.mobile && <span className="muted" style={{ fontSize: 12 }}>· {customer.mobile}</span>}
                        {customer.email && <span className="muted" style={{ fontSize: 12 }}>· {customer.email}</span>}
                    </div>
                </div>
            )}

            {patterns.map(pat => (
                <div key={pat.category} style={{
                    background: 'var(--surface)',
                    padding: '14px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--text)'
                        }}>{pat.category}</div>
                        <div style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            background: 'var(--surface-2)',
                            padding: '4px 10px',
                            borderRadius: 6
                        }}>
                            {pat.totalOrders} orders · {fmt(pat.totalValue)}
                        </div>
                    </div>

                    {/* Month heatmap */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(12, 1fr)',
                        gap: 6
                    }}>
                        {MONTH_SHORT.map((m, idx) => {
                            const monthData = pat.months[idx + 1];
                            const hasOrders = !!monthData;
                            const yearCount = monthData?.years?.length || 0;
                            const intensity = yearCount === 0 ? 0 : Math.min(yearCount / 4, 1);
                            return (
                                <div
                                    key={m}
                                    title={hasOrders
                                        ? `${m}: ${monthData.orders} orders in ${monthData.years.sort().join(', ')} — ${fmt(monthData.value)}`
                                        : `${m}: No orders`}
                                    style={{
                                        textAlign: 'center',
                                        padding: '8px 4px',
                                        borderRadius: 6,
                                        background: hasOrders
                                            ? `rgba(22, 163, 74, ${0.15 + intensity * 0.6})`
                                            : 'var(--surface-2)',
                                        color: hasOrders ? '#166534' : 'var(--muted)',
                                        fontWeight: hasOrders ? 700 : 400,
                                        fontSize: 11,
                                        border: hasOrders ? '1px solid rgba(22, 163, 74, 0.3)' : '1px solid var(--border)',
                                        cursor: 'default',
                                        transition: 'all 0.2s ease'
                                    }}>
                                    <div>{m}</div>
                                    {hasOrders && <div style={{ fontSize: 9, opacity: 0.8, marginTop: 2 }}>{monthData.years.sort().join(',')}</div>}
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
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: conf.light, color: conf.text,
            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
            border: `1px solid ${conf.bg}30`
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: conf.bg }} />
            {label} {score}%
        </span>
    );
};

const SummaryTile = ({ icon, label, value, color }) => (
    <div className="summary-tile" style={{
        background: 'var(--surface)',
        borderRadius: 12,
        padding: '16px',
        border: '1px solid var(--border)',
        transition: 'all 0.2s ease',
        cursor: 'default'
    }}>
        <div className="summary-tile__title" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--muted)',
            marginBottom: 8
        }}>
            {React.cloneElement(icon, { size: 16, style: { flexShrink: 0 } })}
            {label}
        </div>
        <div className="summary-tile__value" style={{
            fontSize: 24,
            fontWeight: 700,
            color: color || 'var(--text)',
            fontFamily: "'Space Grotesk', sans-serif"
        }}>{value ?? '—'}</div>
    </div>
);

const LoadingSpinner = () => (
    <div className="flex items-center justify-center p-40">
        <Loader2 className="animate-spin text-accent" size={36} />
    </div>
);

export default OrderPredictions;
