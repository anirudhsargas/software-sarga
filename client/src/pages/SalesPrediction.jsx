import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import {
    TrendingUp, TrendingDown, RefreshCw, BarChart3, ShoppingBag,
    CalendarDays, Package, AlertTriangle, ChevronDown, ChevronUp,
    Sparkles, IndianRupee, ArrowUpRight, ArrowDownRight, Minus,
    Sun, CloudSun, Snowflake, Loader2, XCircle, Boxes, LineChart
} from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const GrowthBadge = ({ pct }) => {
    const isUp = pct > 0;
    const isDown = pct < 0;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
            background: isUp ? 'rgba(47,125,74,0.08)' : isDown ? 'rgba(176,58,46,0.08)' : 'var(--bg-2)',
            color: isUp ? 'var(--success)' : isDown ? 'var(--error)' : 'var(--muted)'
        }}>
            {isUp ? <ArrowUpRight size={13} /> : isDown ? <ArrowDownRight size={13} /> : <Minus size={13} />}
            {Math.abs(pct)}%
        </span>
    );
};

const DemandBadge = ({ level }) => {
    const config = {
        High: { bg: 'rgba(176,58,46,0.08)', color: 'var(--error)', border: 'rgba(176,58,46,0.2)' },
        Medium: { bg: 'rgba(108,112,119,0.08)', color: 'var(--warning)', border: 'rgba(108,112,119,0.2)' },
        Low: { bg: 'rgba(47,125,74,0.08)', color: 'var(--success)', border: 'rgba(47,125,74,0.2)' }
    };
    const c = config[level] || config.Low;
    return (
        <span style={{
            padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
            background: c.bg, color: c.color, border: `1px solid ${c.border}`
        }}>
            {level}
        </span>
    );
};

const ConfidenceDot = ({ level }) => {
    const colors = { high: 'var(--success)', medium: 'var(--warning)', low: 'var(--muted)' };
    return (
        <span title={`${level} confidence`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: colors[level] || 'var(--muted)'
        }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors[level] || 'var(--muted)' }} />
            {level}
        </span>
    );
};

// ──────────────── Mini Bar Chart (pure CSS) ────────────────
const MiniBarChart = ({ data, height = 80, color = 'var(--accent)' }) => {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height, padding: '0 2px' }}>
            {data.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{
                        width: '100%', maxWidth: '28px',
                        height: `${Math.max((d.value / max) * 100, 4)}%`,
                        borderRadius: '3px 3px 0 0',
                        background: d.predicted ? `repeating-linear-gradient(45deg, ${color}, ${color} 2px, transparent 2px, transparent 4px)` : color,
                        opacity: d.predicted ? 0.6 : 0.85,
                        transition: 'height 0.4s ease'
                    }} title={`${d.label}: ${d.value}`} />
                    <span style={{ fontSize: '9px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {d.label?.substring(0, 3)}
                    </span>
                </div>
            ))}
        </div>
    );
};

// ──────────────── Seasonal Heatmap (pure CSS) ────────────────
const SeasonalHeatmap = ({ data }) => {
    if (!data || data.length === 0) return null;
    const maxIdx = Math.max(...data.map(d => d.index), 1);
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px' }}>
            {data.map((d, i) => {
                const intensity = d.index / maxIdx;
                const bg = d.label === 'Peak'
                    ? `rgba(176, 58, 46, ${0.15 + intensity * 0.35})`
                    : d.label === 'Slow'
                        ? `rgba(59, 130, 246, ${0.1 + intensity * 0.2})`
                        : `rgba(108, 112, 119, ${0.05 + intensity * 0.25})`;
                return (
                    <div key={i} style={{
                        textAlign: 'center', padding: '8px 4px', borderRadius: '8px',
                        background: bg, border: '1px solid var(--border)'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>{d.month}</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '2px' }}>
                            {d.avg_orders}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 600, marginTop: '2px',
                            color: d.label === 'Peak' ? 'var(--error)' : d.label === 'Slow' ? 'var(--accent-2)' : 'var(--warning)'
                        }}>
                            {d.label === 'Peak' ? '🔥' : d.label === 'Slow' ? '❄️' : '☀️'} {d.label}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ──────────────── Insight Card ────────────────
const InsightCard = ({ insight }) => (
    <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px',
        background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)'
    }}>
        <span style={{ fontSize: '24px', lineHeight: 1 }}>{insight.icon}</span>
        <div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{insight.title}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{insight.detail}</div>
        </div>
    </div>
);

// ──────────────── Stock Alert Row ────────────────
const StockRow = ({ item }) => {
    const urgencyConfig = {
        critical: { label: 'Critical', color: 'var(--error)', bg: 'rgba(176,58,46,0.08)' },
        low_stock: { label: 'Low Stock', color: 'var(--warning)', bg: 'rgba(179,107,0,0.08)' },
        reorder: { label: 'Reorder', color: 'var(--warning)', bg: 'rgba(108,112,119,0.08)' },
        ok: { label: 'OK', color: 'var(--success)', bg: 'rgba(47,125,74,0.08)' }
    };
    const uc = urgencyConfig[item.urgency] || urgencyConfig.ok;

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 100px 90px',
            alignItems: 'center', gap: '12px', padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            borderLeft: `3px solid ${uc.color}`,
            background: item.urgency === 'critical' ? 'rgba(176,58,46,0.02)' : 'transparent'
        }}>
            <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.item_name}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{item.category || '—'}</div>
            </div>
            <div style={{ fontSize: '13px', fontFamily: "'Space Grotesk', sans-serif", textAlign: 'right' }}>
                {item.current_stock} {item.unit}
            </div>
            <div style={{ fontSize: '13px', fontFamily: "'Space Grotesk', sans-serif", textAlign: 'right', color: 'var(--muted)' }}>
                {item.avg_monthly_usage}/mo
            </div>
            <div style={{ fontSize: '13px', fontFamily: "'Space Grotesk', sans-serif", textAlign: 'right' }}>
                {item.months_of_stock !== null ? `${item.months_of_stock} mo` : '—'}
            </div>
            <div style={{ textAlign: 'right' }}>
                <span style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                    background: uc.bg, color: uc.color
                }}>
                    {uc.label}
                </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, textAlign: 'right',
                color: item.suggested_order_qty > 0 ? 'var(--warning)' : 'var(--muted)' }}>
                {item.suggested_order_qty > 0 ? `Order ${item.suggested_order_qty}` : '—'}
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════════
const SalesPrediction = () => {
    const [forecast, setForecast] = useState(null);
    const [insights, setInsights] = useState(null);
    const [stock, setStock] = useState(null);
    const [seasonal, setSeasonal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('overview');
    const [showAllProducts, setShowAllProducts] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [fRes, iRes, sRes, seRes] = await Promise.allSettled([
                api.get('/ai/sales-prediction/forecast?months_back=12&months_ahead=3'),
                api.get('/ai/sales-prediction/insights'),
                api.get('/ai/sales-prediction/stock-recommendations'),
                api.get('/ai/sales-prediction/seasonal')
            ]);
            if (fRes.status === 'fulfilled') setForecast(fRes.value.data);
            if (iRes.status === 'fulfilled') setInsights(iRes.value.data);
            if (sRes.status === 'fulfilled') setStock(sRes.value.data);
            if (seRes.status === 'fulfilled') setSeasonal(seRes.value.data);

            if (fRes.status === 'rejected' && iRes.status === 'rejected') {
                setError('Failed to load prediction data');
            }
        } catch (err) {
            setError(err.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Build chart data for overall forecast
    const overallChartData = useMemo(() => {
        if (!forecast) return [];
        const hist = (forecast.overall?.history || []).map(h => ({ label: h.label, value: h.value, predicted: false }));
        const pred = (forecast.overall?.forecast || []).map(f => ({ label: f.label, value: f.predicted, predicted: true }));
        return [...hist, ...pred];
    }, [forecast]);

    const tabs = [
        { id: 'overview', label: 'AI Insights', icon: <Sparkles size={15} /> },
        { id: 'forecast', label: 'Forecast', icon: <LineChart size={15} /> },
        { id: 'seasonal', label: 'Seasonal', icon: <CalendarDays size={15} /> },
        { id: 'stock', label: 'Stock Planning', icon: <Boxes size={15} /> }
    ];

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: '8px', color: 'var(--muted)' }}>
                <Loader2 size={18} className="animate-spin" /> Analyzing sales data...
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

            {/* ─── Header ─── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <TrendingUp size={22} color="var(--accent)" /> AI Sales Prediction
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                        Demand forecasting, seasonal trends & stock planning powered by historical data
                    </p>
                </div>
                <button onClick={fetchAll} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                    borderRadius: '10px', border: 'none', background: 'var(--accent)', color: 'white',
                    fontSize: '13px', fontWeight: 500, cursor: 'pointer'
                }}>
                    <RefreshCw size={15} /> Refresh
                </button>
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

            {/* ─── Tabs ─── */}
            <div style={{
                display: 'flex', gap: '4px', marginBottom: '20px', padding: '4px',
                borderRadius: '12px', background: 'var(--bg-2)', overflow: 'auto'
            }}>
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        fontSize: '13px', fontWeight: activeTab === t.id ? 600 : 400, whiteSpace: 'nowrap',
                        background: activeTab === t.id ? 'var(--surface)' : 'transparent',
                        color: activeTab === t.id ? 'var(--text)' : 'var(--muted)',
                        boxShadow: activeTab === t.id ? 'var(--shadow-sm)' : 'none',
                        transition: 'all 0.2s'
                    }}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* ═══════════════  TAB: AI Insights  ═══════════════ */}
            {activeTab === 'overview' && insights && (
                <div>
                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShoppingBag size={14} /> Orders This Month
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '6px' }}>
                                {insights.current_month?.orders || 0}
                            </div>
                            <GrowthBadge pct={insights.growth?.orders_pct || 0} />
                        </div>

                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <IndianRupee size={14} /> Revenue This Month
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '6px' }}>
                                {fmt(insights.current_month?.revenue)}
                            </div>
                            <GrowthBadge pct={insights.growth?.revenue_pct || 0} />
                        </div>

                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <BarChart3 size={14} /> Last Month
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '6px', color: 'var(--muted)' }}>
                                {insights.last_month?.orders || 0}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{fmt(insights.last_month?.revenue)}</span>
                        </div>
                    </div>

                    {/* AI Insights */}
                    {insights.insights?.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={16} color="var(--accent)" /> AI Insights
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                                {insights.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
                            </div>
                        </div>
                    )}

                    {/* Top Products + Customer Mix side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                        {/* Top Products */}
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShoppingBag size={15} color="var(--warning)" /> Top Products
                            </h3>
                            {(insights.top_products || []).map((p, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 0', borderBottom: i < insights.top_products.length - 1 ? '1px solid var(--border)' : 'none'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            width: '22px', height: '22px', borderRadius: '6px', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
                                            background: i === 0 ? 'rgba(179,107,0,0.12)' : 'var(--bg-2)',
                                            color: i === 0 ? 'var(--warning)' : 'var(--muted)',
                                            fontFamily: "'Space Grotesk', sans-serif"
                                        }}>{i + 1}</span>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{p.product_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.category || '—'}</div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
                                            {p.order_count} orders
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmt(p.revenue)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Customer Mix */}
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                👥 Customer Mix (3 months)
                            </h3>
                            {(insights.customer_mix || []).map((c, i) => {
                                const totalOrders = insights.customer_mix.reduce((s, x) => s + x.orders, 0);
                                const pct = totalOrders > 0 ? Math.round((c.orders / totalOrders) * 100) : 0;
                                const colors = ['var(--accent)', 'var(--accent-2)', 'var(--warning)', 'var(--success)', 'var(--warning)'];
                                return (
                                    <div key={i} style={{ marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 500 }}>{c.customer_type}</span>
                                            <span style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{c.orders} ({pct}%)</span>
                                        </div>
                                        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-2)' }}>
                                            <div style={{
                                                width: `${pct}%`, height: '100%', borderRadius: '3px',
                                                background: colors[i % colors.length], transition: 'width 0.5s ease'
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Weekday Pattern */}
                            {insights.weekday_pattern?.length > 0 && (
                                <div style={{ marginTop: '20px' }}>
                                    <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: 'var(--muted)' }}>📅 Weekday Pattern</h4>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end' }}>
                                        {insights.weekday_pattern.map((d, i) => {
                                            const max = Math.max(...insights.weekday_pattern.map(x => x.orders), 1);
                                            return (
                                                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                                                    <div style={{
                                                        height: `${Math.max((d.orders / max) * 50, 4)}px`,
                                                        borderRadius: '3px 3px 0 0', margin: '0 auto', width: '80%',
                                                        background: d.orders === max ? 'var(--accent)' : 'var(--accent-soft)',
                                                        transition: 'height 0.4s ease'
                                                    }} />
                                                    <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>{d.day}</div>
                                                    <div style={{ fontSize: '10px', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>{d.orders}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════  TAB: Forecast  ═══════════════ */}
            {activeTab === 'forecast' && forecast && (
                <div>
                    {/* Overall Chart */}
                    <div style={{
                        background: 'var(--surface)', borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)', padding: '20px', marginBottom: '20px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <LineChart size={16} color="var(--accent)" /> Monthly Orders — History + Forecast
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--muted)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: 12, height: 8, borderRadius: 2, background: 'var(--accent)' }} /> Actual
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: 12, height: 8, borderRadius: 2, background: 'repeating-linear-gradient(45deg, var(--accent), var(--accent) 2px, transparent 2px, transparent 4px)', opacity: 0.6 }} /> Predicted
                                </span>
                            </div>
                        </div>
                        <MiniBarChart data={overallChartData} height={120} color="var(--accent)" />

                        {forecast.overall?.revenue_trend && (
                            <div style={{
                                marginTop: '16px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg)',
                                display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px'
                            }}>
                                {forecast.overall.revenue_trend.direction === 'up'
                                    ? <TrendingUp size={16} color="var(--success)" />
                                    : <TrendingDown size={16} color="var(--error)" />}
                                <span>Revenue trend: <strong>{forecast.overall.revenue_trend.direction === 'up' ? 'Growing' : 'Declining'}</strong></span>
                                <span style={{ color: 'var(--muted)' }}>
                                    {fmt(Math.abs(forecast.overall.revenue_trend.monthly_change))}/month avg change
                                    · R² = {forecast.overall.revenue_trend.r2}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Category Forecasts */}
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BarChart3 size={16} color="var(--warning)" /> Next Month Forecast by Category
                    </h3>
                    <div style={{
                        background: 'var(--surface)', borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '20px'
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 80px 70px',
                            gap: '12px', padding: '10px 16px', fontSize: '11px', fontWeight: 600,
                            color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
                            borderBottom: '1px solid var(--border)', background: 'var(--bg)'
                        }}>
                            <span>Category</span>
                            <span style={{ textAlign: 'right' }}>Last Month</span>
                            <span style={{ textAlign: 'right' }}>Predicted</span>
                            <span style={{ textAlign: 'right' }}>Growth</span>
                            <span style={{ textAlign: 'center' }}>Demand</span>
                            <span style={{ textAlign: 'center' }}>Conf.</span>
                        </div>
                        {(forecast.categories || []).map((cat, i) => (
                            <div key={i} style={{
                                display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 80px 70px',
                                gap: '12px', padding: '12px 16px', alignItems: 'center',
                                borderBottom: i < forecast.categories.length - 1 ? '1px solid var(--border)' : 'none'
                            }}>
                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{cat.category}</div>
                                <div style={{ textAlign: 'right', fontSize: '13px', fontFamily: "'Space Grotesk', sans-serif" }}>
                                    {cat.last_month_orders}
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
                                    {cat.forecast[0]?.predicted || 0}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <GrowthBadge pct={cat.growth_pct} />
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <DemandBadge level={cat.demand_level} />
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <ConfidenceDot level={cat.forecast[0]?.confidence || 'low'} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Top Products */}
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Package size={16} color="var(--success)" /> Product-Level Forecast
                    </h3>
                    <div style={{
                        background: 'var(--surface)', borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '20px'
                    }}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 100px 80px 90px 80px 70px',
                            gap: '12px', padding: '10px 16px', fontSize: '11px', fontWeight: 600,
                            color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
                            borderBottom: '1px solid var(--border)', background: 'var(--bg)'
                        }}>
                            <span>Product</span>
                            <span style={{ textAlign: 'right' }}>Category</span>
                            <span style={{ textAlign: 'right' }}>Last Mo</span>
                            <span style={{ textAlign: 'right' }}>Predicted</span>
                            <span style={{ textAlign: 'right' }}>Growth</span>
                            <span style={{ textAlign: 'center' }}>Conf.</span>
                        </div>
                        {(showAllProducts ? forecast.top_products : (forecast.top_products || []).slice(0, 8)).map((p, i) => (
                            <div key={i} style={{
                                display: 'grid', gridTemplateColumns: '1fr 100px 80px 90px 80px 70px',
                                gap: '12px', padding: '10px 16px', alignItems: 'center',
                                borderBottom: '1px solid var(--border)'
                            }}>
                                <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {p.product_name}
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--muted)' }}>{p.category}</div>
                                <div style={{ textAlign: 'right', fontSize: '13px', fontFamily: "'Space Grotesk', sans-serif" }}>{p.last_month}</div>
                                <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
                                    {p.next_month_predicted}
                                </div>
                                <div style={{ textAlign: 'right' }}><GrowthBadge pct={p.growth_pct} /></div>
                                <div style={{ textAlign: 'center' }}><ConfidenceDot level={p.confidence} /></div>
                            </div>
                        ))}
                        {(forecast.top_products || []).length > 8 && (
                            <button onClick={() => setShowAllProducts(p => !p)} style={{
                                width: '100%', padding: '10px', border: 'none', background: 'var(--bg)',
                                color: 'var(--muted)', fontSize: '12px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                            }}>
                                {showAllProducts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {showAllProducts ? 'Show less' : `Show all ${forecast.top_products.length}`}
                            </button>
                        )}
                    </div>

                    {/* Rising & Declining side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {forecast.rising_products?.length > 0 && (
                            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px' }}>
                                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <TrendingUp size={15} /> Rising Products
                                </h4>
                                {forecast.rising_products.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', borderBottom: i < forecast.rising_products.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                        <span>{p.product_name}</span>
                                        <GrowthBadge pct={p.growth_pct} />
                                    </div>
                                ))}
                            </div>
                        )}
                        {forecast.declining_products?.length > 0 && (
                            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px' }}>
                                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <TrendingDown size={15} /> Declining Products
                                </h4>
                                {forecast.declining_products.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', borderBottom: i < forecast.declining_products.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                        <span>{p.product_name}</span>
                                        <GrowthBadge pct={p.growth_pct} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════  TAB: Seasonal  ═══════════════ */}
            {activeTab === 'seasonal' && seasonal && (
                <div>
                    {/* YoY Comparison */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>This Year</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '4px' }}>
                                {seasonal.yoy?.this_year || 0}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>orders</span>
                        </div>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Last Year</div>
                            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '4px', color: 'var(--muted)' }}>
                                {seasonal.yoy?.last_year || 0}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>orders</span>
                        </div>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>YoY Growth</div>
                            <div style={{ marginTop: '4px' }}>
                                <GrowthBadge pct={seasonal.yoy?.growth_pct || 0} />
                            </div>
                        </div>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Revenue Trend</div>
                            <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {seasonal.trends?.revenue?.direction === 'growing'
                                    ? <><TrendingUp size={16} color="var(--success)" /> Growing</>
                                    : <><TrendingDown size={16} color="var(--error)" /> Declining</>}
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                R² = {seasonal.trends?.revenue?.r2 || 0}%
                            </span>
                        </div>
                    </div>

                    {/* Seasonal Heatmap */}
                    <div style={{
                        background: 'var(--surface)', borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)', padding: '20px', marginBottom: '20px'
                    }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CalendarDays size={16} color="var(--accent)" /> Seasonal Index
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>
                            Average monthly orders relative to the year. 🔥 Peak months = highest demand, ❄️ Slow months = lowest.
                        </p>
                        <SeasonalHeatmap data={seasonal.seasonal_index} />
                    </div>

                    {/* Monthly History Chart */}
                    <div style={{
                        background: 'var(--surface)', borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)', padding: '20px'
                    }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BarChart3 size={16} color="var(--accent-2)" /> Monthly History (24 months)
                        </h3>
                        <MiniBarChart
                            data={(seasonal.monthly_data || []).map(d => ({ label: d.label, value: d.orders }))}
                            height={130}
                            color="var(--accent-2)"
                        />
                        <div style={{ marginTop: '12px' }}>
                            <MiniBarChart
                                data={(seasonal.monthly_data || []).map(d => ({ label: d.label, value: d.revenue }))}
                                height={90}
                                color="var(--success)"
                            />
                            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px', textAlign: 'center' }}>
                                Revenue trend (green)
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════  TAB: Stock Planning  ═══════════════ */}
            {activeTab === 'stock' && stock && (
                <div>
                    {/* Stock Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Package size={14} /> Total Items
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '4px' }}>
                                {stock.summary?.total_items || 0}
                            </div>
                        </div>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(176,58,46,0.2)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle size={14} /> Critical
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '4px', color: 'var(--error)' }}>
                                {stock.summary?.critical || 0}
                            </div>
                        </div>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(179,107,0,0.2)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Boxes size={14} /> Low Stock
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '4px', color: 'var(--warning)' }}>
                                {stock.summary?.low_stock || 0}
                            </div>
                        </div>
                        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(108,112,119,0.2)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShoppingBag size={14} /> Need Reorder
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: '4px', color: 'var(--warning)' }}>
                                {stock.summary?.need_reorder || 0}
                            </div>
                        </div>
                    </div>

                    {/* Stock Table */}
                    <div style={{
                        background: 'var(--surface)', borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)', overflow: 'hidden'
                    }}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 100px 90px',
                            gap: '12px', padding: '10px 16px', fontSize: '11px', fontWeight: 600,
                            color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
                            borderBottom: '1px solid var(--border)', background: 'var(--bg)'
                        }}>
                            <span>Item</span>
                            <span style={{ textAlign: 'right' }}>Stock</span>
                            <span style={{ textAlign: 'right' }}>Usage</span>
                            <span style={{ textAlign: 'right' }}>Runway</span>
                            <span style={{ textAlign: 'right' }}>Status</span>
                            <span style={{ textAlign: 'right' }}>Action</span>
                        </div>
                        {(stock.recommendations || []).map((item, i) => (
                            <StockRow key={i} item={item} />
                        ))}
                        {(!stock.recommendations || stock.recommendations.length === 0) && (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                                No inventory items with usage data found.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* No data fallback */}
            {!forecast && !insights && !seasonal && !stock && !error && (
                <div style={{
                    textAlign: 'center', padding: '48px 24px',
                    background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)'
                }}>
                    <BarChart3 size={40} color="var(--muted)" style={{ marginBottom: '12px', opacity: 0.4 }} />
                    <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>No Sales Data Yet</div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                        Start creating jobs and bills — predictions will appear once there's enough historical data.
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesPrediction;
