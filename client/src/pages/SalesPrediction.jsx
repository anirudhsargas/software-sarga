import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import Pagination from '../components/Pagination';
import ForecastChart from '../components/ForecastChart';
import './SalesPrediction.css';
import {
    TrendingUp, TrendingDown, RefreshCw, BarChart3, ShoppingBag,
    CalendarDays, Package, AlertTriangle, ChevronDown, ChevronUp,
    Sparkles, IndianRupee, ArrowUpRight, ArrowDownRight, Minus,
    Sun, CloudSun, Snowflake, Loader2, XCircle, Boxes, LineChart,
    ShoppingCart, Truck, ExternalLink, Info
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import PageContainer from '../components/ui/PageContainer';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = formatCurrency;

const GrowthBadge = ({ pct }) => {
    const isUp = pct > 0;
    const isDown = pct < 0;
    return (
        <span className={`sp-growth-badge ${isUp ? 'sp-growth-badge--up' : isDown ? 'sp-growth-badge--down' : 'sp-growth-badge--neutral'}`}>
            {isUp ? <ArrowUpRight size={13} /> : isDown ? <ArrowDownRight size={13} /> : <Minus size={13} />}
            {Math.abs(pct)}%
        </span>
    );
};

const DemandBadge = ({ level }) => {
    const levelClass = level === 'High' ? 'sp-demand-badge--high' : level === 'Medium' ? 'sp-demand-badge--medium' : 'sp-demand-badge--low';
    return (
        <span className={`sp-demand-badge ${levelClass}`}>
            {level}
        </span>
    );
};

const ConfidenceDot = ({ level }) => {
    const levelClass = level === 'high' ? 'sp-confidence-dot--high' : level === 'medium' ? 'sp-confidence-dot--medium' : 'sp-confidence-dot--low';
    return (
        <span title={`${level} confidence`} className={`sp-confidence-dot ${levelClass}`}>
            <span className="sp-confidence-dot-dot" style={{ background: level === 'high' ? 'var(--success)' : level === 'medium' ? 'var(--warning)' : 'var(--muted)' }} />
            {level}
        </span>
    );
};

// ──────────────── Mini Bar Chart (pure CSS) ────────────────
const MiniBarChart = ({ data, height = 80, color = 'var(--accent)' }) => {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data.map(d => d.value), 1);
    return (
        <div className="sp-mini-bar-chart" style={{ height }}>
            {data.map((d, i) => (
                <div key={i} className="sp-mini-bar-chart-item">
                    <div className="sp-mini-bar-chart-bar"
                        style={{
                            height: `${Math.max((d.value / max) * 100, 4)}%`,
                            background: d.predicted ? `repeating-linear-gradient(45deg, ${color}, ${color} 2px, transparent 2px, transparent 4px)` : color,
                            opacity: d.predicted ? 0.6 : 0.85
                        }}
                        title={`${d.label}: ${d.value}`} />
                    <span className="sp-mini-bar-chart-label">
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

    const formatCellValue = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return String(v ?? '');
        if (Math.abs(n) >= 1000) return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
        if (Math.abs(n) >= 100) return n.toFixed(0);
        if (Math.abs(n) >= 10) return n.toFixed(1);
        return n.toFixed(2);
    };

    return (
        <div className="sp-seasonal-heatmap">
            {data.map((d, i) => {
                const intensity = d.index / maxIdx;
                const bg = d.label === 'Peak'
                    ? `rgba(176, 58, 46, ${0.15 + intensity * 0.35})`
                    : d.label === 'Slow'
                        ? `rgba(59, 130, 246, ${0.1 + intensity * 0.2})`
                        : `rgba(108, 112, 119, ${0.05 + intensity * 0.25})`;
                const labelClass = d.label === 'Peak' ? 'sp-seasonal-cell-label--peak' : d.label === 'Slow' ? 'sp-seasonal-cell-label--slow' : 'sp-seasonal-cell-label--normal';
                return (
                    <div key={i} className="sp-seasonal-cell" style={{ background: bg }}>
                        <div className="sp-seasonal-cell-month">
                            {String(d.month || '').slice(0, 3)}
                        </div>
                        <div className="sp-seasonal-cell-value">
                            {formatCellValue(d.avg_orders)}
                        </div>
                        <div className={`sp-seasonal-cell-label ${labelClass}`}>
                            {d.label === 'Peak' ? '🔥' : d.label === 'Slow' ? '❄️' : '☀️'} {d.label}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ──────────────── Insight Card ────────────────
const InsightCard = React.memo(({ insight }) => (
    <div className="sp-insight-card">
        <span className="sp-insight-card-icon">{insight.icon}</span>
        <div>
            <div className="sp-insight-card-title">{insight.title}</div>
            <div className="sp-insight-card-detail">{insight.detail}</div>
        </div>
    </div>
));

// ──────────────── Stock Alert Row ────────────────
const StockRow = ({ item }) => {
    const urgencyClass = item.urgency === 'critical' ? 'sp-stock-row--critical' : item.urgency === 'low_stock' ? 'sp-stock-row--low-stock' : item.urgency === 'reorder' ? 'sp-stock-row--reorder' : '';
    const urgencyBadgeClass = item.urgency === 'critical' ? 'sp-stock-urgency-badge--critical' : item.urgency === 'low_stock' ? 'sp-stock-urgency-badge--low-stock' : item.urgency === 'reorder' ? 'sp-stock-urgency-badge--reorder' : 'sp-stock-urgency-badge--ok';
    const suggestionClass = item.suggested_order_qty > 0 ? 'sp-stock-suggestion--warning' : 'sp-stock-suggestion--muted';

    return (
        <div className={`sp-stock-row ${urgencyClass}`}>
            <div>
                <div className="sp-stock-name">{item.item_name}</div>
                <div className="sp-stock-category">{item.category || '—'}</div>
            </div>
            <div className="sp-stock-value">
                {item.current_stock} {item.unit}
            </div>
            <div className="sp-stock-value sp-stock-value--muted">
                {item.avg_monthly_usage}/mo
            </div>
            <div className="sp-stock-value">
                {item.months_of_stock !== null ? `${item.months_of_stock} mo` : '—'}
            </div>
            <div className="text-right">
                <span className={`sp-stock-urgency-badge ${urgencyBadgeClass}`}>
                    {item.urgency === 'critical' ? 'Critical' : item.urgency === 'low_stock' ? 'Low Stock' : item.urgency === 'reorder' ? 'Reorder' : 'OK'}
                </span>
            </div>
            <div className={`sp-stock-suggestion ${suggestionClass}`}>
                {item.suggested_order_qty > 0 ? `Order ${item.suggested_order_qty}` : '—'}
            </div>
        </div>
    );
};

// ──────────────── Purchase Row ────────────────
const urgencyConfig = {
    critical: { label: 'Critical',   color: 'var(--error)',   bg: 'var(--destructive)',  border: 'var(--destructive)' },
    low_stock:{ label: 'Low Stock',  color: 'var(--warning)', bg: 'var(--warning)',  border: 'var(--warning)' },
    reorder:  { label: 'Reorder',    color: 'var(--warning)', bg: 'var(--muted-foreground)',border: 'var(--muted-foreground)' },
    plan:     { label: 'Plan Ahead', color: 'var(--accent)',  bg: 'var(--primary)',  border: 'var(--primary)' },
    ok:       { label: 'OK',         color: 'var(--success)', bg: 'var(--muted-foreground)',  border: 'var(--border)' }
};

const PurchaseCard = React.memo(({ item, _index }) => {
    const cardClass = item.urgency === 'critical' ? 'sp-purchase-card--critical' : item.urgency === 'low_stock' ? 'sp-purchase-card--low-stock' : item.urgency === 'reorder' ? 'sp-purchase-card--reorder' : item.urgency === 'plan' ? 'sp-purchase-card--plan' : '';
    const badgeClass = item.urgency === 'critical' ? 'sp-purchase-urgency-badge--critical' : item.urgency === 'low_stock' ? 'sp-purchase-urgency-badge--low-stock' : item.urgency === 'reorder' ? 'sp-purchase-urgency-badge--reorder' : item.urgency === 'plan' ? 'sp-purchase-urgency-badge--plan' : 'sp-purchase-urgency-badge--ok';
    const stockValueClass = item.current_stock === 0 ? 'sp-purchase-metric-value--error' : item.current_stock <= item.reorder_level ? 'sp-purchase-metric-value--warning' : '';
    const buyValueClass = item.suggested_buy_qty > 0 ? 'sp-purchase-metric-value--warning' : 'sp-purchase-metric-value--success';

    return (
        <div className={`sp-purchase-card ${cardClass}`}>
            {/* Header row */}
            <div className="sp-purchase-header">
                <div className="sp-purchase-name-wrapper">
                    <div className="sp-purchase-name-row">
                        <span className="sp-purchase-name">{item.item_name}</span>
                        {item.sku && (
                            <span className="sp-purchase-sku">{item.sku}</span>
                        )}
                    </div>
                    <div className="sp-purchase-category">
                        {item.category || 'Uncategorized'}{item.vendor_name ? ` · ${item.vendor_name}` : ''}
                    </div>
                </div>
                <div className="sp-purchase-badges">
                    <span className={`sp-purchase-urgency-badge ${badgeClass}`}>{item.urgency === 'critical' ? 'Critical' : item.urgency === 'low_stock' ? 'Low Stock' : item.urgency === 'reorder' ? 'Reorder' : item.urgency === 'plan' ? 'Plan Ahead' : 'OK'}</span>
                    <ConfidenceDot level={item.confidence} />
                </div>
            </div>

            {/* Metrics row */}
            <div className="sp-purchase-metrics">
                {item.has_inventory && item.current_stock !== null && (
                    <div className="sp-purchase-metric">
                        <div className="sp-purchase-metric-label">Current Stock</div>
                        <div className={`sp-purchase-metric-value ${stockValueClass}`}>
                            {item.current_stock}
                        </div>
                        <div className="sp-purchase-metric-unit">{item.unit}</div>
                    </div>
                )}
                <div className="sp-purchase-metric">
                    <div className="sp-purchase-metric-label">Avg/Month</div>
                    <div className="sp-purchase-metric-value">
                        {item.avg_monthly_sales}
                    </div>
                    <div className="sp-purchase-metric-unit">{item.unit}</div>
                </div>
                <div className="sp-purchase-metric">
                    <div className="sp-purchase-metric-label">Predicted Demand</div>
                    <div className="sp-purchase-metric-value sp-purchase-metric-value--accent">
                        {item.predicted_demand}
                    </div>
                    <div className="sp-purchase-metric-unit">{item.unit}</div>
                </div>
                {item.suggested_buy_qty !== null && (
                    <div className="sp-purchase-metric">
                        <div className="sp-purchase-metric-label">Suggested Buy</div>
                        <div className={`sp-purchase-metric-value ${buyValueClass}`}>
                            {item.suggested_buy_qty > 0 ? item.suggested_buy_qty : '—'}
                        </div>
                        <div className="sp-purchase-metric-unit">{item.suggested_buy_qty > 0 ? item.unit : 'sufficient'}</div>
                    </div>
                )}
                {item.estimated_cost > 0 && (
                    <div className="sp-purchase-metric">
                        <div className="sp-purchase-metric-label">Est. Cost</div>
                        <div className="sp-purchase-metric-value">
                            ₹{Number(item.estimated_cost).toLocaleString('en-IN')}
                        </div>
                        <div className="sp-purchase-metric-unit">approx</div>
                    </div>
                )}
            </div>

            {/* Vendor / Action row */}
            {(item.vendor_contact || item.purchase_link) && (
                <div className="sp-purchase-vendor-row">
                    {item.vendor_contact && (
                        <span className="sp-purchase-vendor-contact">
                            <Truck size={12} /> {item.vendor_contact}
                        </span>
                    )}
                    {item.purchase_link && (
                        <a href={item.purchase_link} target="_blank" rel="noopener noreferrer" className="sp-purchase-link">
                            <ExternalLink size={12} /> Buy / Order Link
                        </a>
                    )}
                </div>
            )}

            {/* Non-inventory note */}
            {!item.has_inventory && (
                <div className="sp-purchase-non-inventory-note">
                    <Info size={11} /> High-demand service — link to inventory to track stock &amp; cost
                </div>
            )}
        </div>
    );
});

// ════════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════════
const SalesPrediction = () => {
    useSEO('Sales Prediction');

    const [forecast, setForecast] = useState(null);
    const [insights, setInsights] = useState(null);
    const [stock, setStock] = useState(null);
    const [seasonal, setSeasonal] = useState(null);
    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('overview');
    const [showAllProducts, setShowAllProducts] = useState(false);
    const [purchaseFilter, setPurchaseFilter] = useState('all');
    // Pagination for stock table
    const [stockPage, setStockPage] = useState(1);
    const stockLimit = 10;

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [fRes, iRes, sRes, seRes, pRes] = await Promise.allSettled([
                api.get('/ai/sales-prediction/forecast?months_back=12&months_ahead=3'),
                api.get('/ai/sales-prediction/insights'),
                api.get('/ai/sales-prediction/stock-recommendations'),
                api.get('/ai/sales-prediction/seasonal'),
                api.get('/ai/sales-prediction/purchase-suggestions?months_back=6&months_ahead=2&buffer_pct=20')
            ]);
            if (fRes.status === 'fulfilled') setForecast(fRes.value.data);
            if (iRes.status === 'fulfilled') setInsights(iRes.value.data);
            if (sRes.status === 'fulfilled') setStock(sRes.value.data);
            if (seRes.status === 'fulfilled') setSeasonal(seRes.value.data);
            if (pRes.status === 'fulfilled') setPurchase(pRes.value.data);

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

    const stockRecommendations = stock?.recommendations || [];
    const stockTotalPages = Math.max(1, Math.ceil(stockRecommendations.length / stockLimit));

    const _paginatedStockRecommendations = useMemo(() => {
        const start = (stockPage - 1) * stockLimit;
        return stockRecommendations.slice(start, start + stockLimit);
    }, [stockRecommendations, stockPage, stockLimit]);

    useEffect(() => {
        if (stockPage > stockTotalPages) {
            setStockPage(stockTotalPages);
        }
    }, [stockPage, stockTotalPages]);

    const tabs = [
        { id: 'overview', label: 'AI Insights', icon: <Sparkles size={15} /> },
        { id: 'forecast', label: 'Forecast', icon: <LineChart size={15} /> },
        { id: 'seasonal', label: 'Seasonal', icon: <CalendarDays size={15} /> },
        { id: 'purchase', label: 'Purchase List', icon: <ShoppingCart size={15} /> }
    ];

    // ── Filtered purchase suggestions ──
    const allSuggestions = purchase?.suggestions || [];
    const filteredSuggestions = useMemo(() => {
        if (purchaseFilter === 'all') return allSuggestions;
        if (purchaseFilter === 'buy') return allSuggestions.filter(s => s.suggested_buy_qty > 0);
        if (purchaseFilter === 'critical') return allSuggestions.filter(s => s.urgency === 'critical' || s.urgency === 'low_stock');
        if (purchaseFilter === 'plan') return allSuggestions.filter(s => !s.has_inventory);
        return allSuggestions;
    }, [allSuggestions, purchaseFilter]);

    if (forecast?.enabled === false || insights?.enabled === false) {
        return (
            <PageContainer>
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                        AI Sales Prediction
                    </h1>
                    <p style={{ fontSize: '14px' }}>AI features temporarily unavailable</p>
                </div>
            </PageContainer>
        );
    }

    if (loading) {
        return (
            <div className="sp-loading">
                <Loader2 size={18} className="animate-spin" /> Analyzing sales data...
            </div>
        );
    }

    return (
        <PageContainer>

            {/* ─── Header ─── */}
            <div className="sp-header">
                <div>
                    <h1 className="sp-header-title">
                        <TrendingUp size={22} color="var(--accent)" /> AI Sales Prediction
                    </h1>
                    <p className="sp-header-subtitle">
                        Demand forecasting, seasonal trends & stock planning powered by historical data
                    </p>
                </div>
                <button onClick={fetchAll} className="sp-refresh-btn">
                    <RefreshCw size={15} /> Refresh
                </button>
            </div>

            {error && (
                <div className="sp-error-alert">
                    <XCircle size={16} /> {error}
                </div>
            )}

            {/* ─── Tabs ─── */}
            <div className="sp-tabs">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} className={`sp-tab ${activeTab === t.id ? 'sp-tab--active' : ''}`}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* ═══════════════  TAB: AI Insights  ═══════════════ */}
            {activeTab === 'overview' && insights && (
                <div>
                    {/* KPI Cards */}
                    <div className="sp-kpi-grid">
                        <div className="sp-kpi-card">
                            <div className="sp-kpi-label">
                                <ShoppingBag size={14} /> Orders This Month
                            </div>
                            <div className="sp-kpi-value">
                                {insights.current_month?.orders || 0}
                            </div>
                            <GrowthBadge pct={insights.growth?.orders_pct || 0} />
                        </div>

                        <div className="sp-kpi-card">
                            <div className="sp-kpi-label">
                                <IndianRupee size={14} /> Revenue This Month
                            </div>
                            <div className="sp-kpi-value">
                                {fmt(insights.current_month?.revenue)}
                            </div>
                            <GrowthBadge pct={insights.growth?.revenue_pct || 0} />
                        </div>

                        <div className="sp-kpi-card">
                            <div className="sp-kpi-label">
                                <BarChart3 size={14} /> Last Month
                            </div>
                            <div className="sp-kpi-value sp-kpi-value--muted">
                                {insights.last_month?.orders || 0}
                            </div>
                            <span className="sp-kpi-subtext">{fmt(insights.last_month?.revenue)}</span>
                        </div>
                    </div>

                    {/* AI Insights */}
                    {insights.insights?.length > 0 && (
                        <div className="sp-insights-section">
                            <h3 className="sp-section-header">
                                <Sparkles size={16} color="var(--accent)" /> AI Insights
                            </h3>
                            <div className="sp-insights-grid">
                                {insights.insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
                            </div>
                        </div>
                    )}

                    {/* Top Products + Customer Mix side by side */}
                    <div className="sp-two-col-grid">
                        {/* Top Products */}
                        <div className="sp-panel">
                            <h3 className="sp-panel-header">
                                <ShoppingBag size={15} color="var(--warning)" /> Top Products
                            </h3>
                            {(insights.top_products || []).map((p, i) => (
                                <div key={i} className="sp-product-item">
                                    <div className="row gap-sm items-center">
                                        <span className={`sp-product-rank ${i === 0 ? 'sp-product-rank--top' : ''}`}>{i + 1}</span>
                                        <div>
                                            <div className="sp-product-name">{p.product_name}</div>
                                            <div className="sp-product-category">{p.category || '—'}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="sp-product-orders">{p.order_count} orders</div>
                                        <div className="sp-product-revenue">{fmt(p.revenue)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Customer Mix */}
                        <div className="sp-panel">
                            <h3 className="sp-panel-header">
                                👥 Customer Mix (3 months)
                            </h3>
                            {(insights.customer_mix || []).map((c, i) => {
                                const totalOrders = insights.customer_mix.reduce((s, x) => s + x.orders, 0);
                                const pct = totalOrders > 0 ? Math.round((c.orders / totalOrders) * 100) : 0;
                                const colors = ['var(--accent)', 'var(--accent-2)', 'var(--warning)', 'var(--success)', 'var(--warning)'];
                                return (
                                    <div key={i} className="sp-customer-item">
                                        <div className="sp-customer-header">
                                            <span className="sp-customer-type">{c.customer_type}</span>
                                            <span className="sp-customer-count">{c.orders} ({pct}%)</span>
                                        </div>
                                        <div className="sp-customer-bar-bg">
                                            <div className="sp-customer-bar-fill" style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Weekday Pattern */}
                            {insights.weekday_pattern?.length > 0 && (
                                <div className="sp-weekday-section">
                                    <h4 className="sp-weekday-title">📅 Weekday Pattern</h4>
                                    <div className="sp-weekday-chart">
                                        {insights.weekday_pattern.map((d, i) => {
                                            const max = Math.max(...insights.weekday_pattern.map(x => x.orders), 1);
                                            return (
                                                <div key={i} className="sp-weekday-bar-wrapper">
                                                    <div className={`sp-weekday-bar ${d.orders === max ? 'sp-weekday-bar--max' : 'sp-weekday-bar--normal'}`} style={{ height: `${Math.max((d.orders / max) * 50, 4)}px` }} />
                                                    <div className="sp-weekday-day">{d.day}</div>
                                                    <div className="sp-weekday-orders">{d.orders}</div>
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
                    {/* ML Revenue Forecast (recharts) */}
                    <ForecastChart />

                    {/* Overall Chart */}
                    <div className="sp-forecast-chart-panel">
                        <div className="sp-forecast-chart-header">
                            <h3 className="sp-section-header">
                                <LineChart size={16} color="var(--accent)" /> Monthly Orders — History + Forecast
                            </h3>
                            <div className="sp-forecast-chart-legend">
                                <span className="sp-forecast-legend-item">
                                    <span className="sp-forecast-legend-swatch sp-forecast-legend-swatch--actual" /> Actual
                                </span>
                                <span className="sp-forecast-legend-item">
                                    <span className="sp-forecast-legend-swatch sp-forecast-legend-swatch--predicted" /> Predicted
                                </span>
                            </div>
                        </div>
                        <MiniBarChart data={overallChartData} height={120} color="var(--accent)" />

                        {forecast.overall?.revenue_trend && (
                            <div className="sp-forecast-trend-box">
                                {forecast.overall.revenue_trend.direction === 'up'
                                    ? <TrendingUp size={16} color="var(--success)" />
                                    : <TrendingDown size={16} color="var(--error)" />}
                                <span>Revenue trend: <strong>{forecast.overall.revenue_trend.direction === 'up' ? 'Growing' : 'Declining'}</strong></span>
                                <span className="sp-forecast-trend-text">
                                    {fmt(Math.abs(forecast.overall.revenue_trend.monthly_change))}/month avg change
                                    · R² = {forecast.overall.revenue_trend.r2}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Category Forecasts */}
                    <h3 className="sp-section-header">
                        <BarChart3 size={16} color="var(--warning)" /> Next Month Forecast by Category
                    </h3>
                    <div className="sp-forecast-table-panel">
                        {/* Header */}
                        <div className="sp-forecast-table-header">
                            <span>Category</span>
                            <span className="sp-forecast-table-header-cell--right">Last Month</span>
                            <span className="sp-forecast-table-header-cell--right">Predicted</span>
                            <span className="sp-forecast-table-header-cell--right">Growth</span>
                            <span className="sp-forecast-table-header-cell--center">Demand</span>
                            <span className="sp-forecast-table-header-cell--center">Conf.</span>
                        </div>
                        {(forecast.categories || []).map((cat, i) => (
                            <div key={i} className="sp-forecast-table-row">
                                <div className="sp-forecast-table-category">{cat.category}</div>
                                <div className="sp-forecast-table-cell--right sp-forecast-table-value">
                                    {cat.last_month_orders}
                                </div>
                                <div className="sp-forecast-table-cell--right sp-forecast-table-value sp-forecast-table-value--bold">
                                    {cat.forecast[0]?.predicted || 0}
                                </div>
                                <div className="sp-forecast-table-cell--right">
                                    <GrowthBadge pct={cat.growth_pct} />
                                </div>
                                <div className="sp-forecast-table-cell--center">
                                    <DemandBadge level={cat.demand_level} />
                                </div>
                                <div className="sp-forecast-table-cell--center">
                                    <ConfidenceDot level={cat.forecast[0]?.confidence || 'low'} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Top Products */}
                    <h3 className="sp-section-header">
                        <Package size={16} color="var(--success)" /> Product-Level Forecast
                    </h3>
                    <div className="sp-forecast-table-panel">
                        <div className={`sp-forecast-table-header sp-product-forecast-table-header`}>
                            <span>Product</span>
                            <span className="sp-forecast-table-header-cell--right">Category</span>
                            <span className="sp-forecast-table-header-cell--right">Last Mo</span>
                            <span className="sp-forecast-table-header-cell--right">Predicted</span>
                            <span className="sp-forecast-table-header-cell--right">Growth</span>
                            <span className="sp-forecast-table-header-cell--center">Conf.</span>
                        </div>
                        {(showAllProducts ? forecast.top_products : (forecast.top_products || []).slice(0, 8)).map((p, i) => (
                            <div key={i} className={`sp-forecast-table-row sp-product-forecast-table-row`}>
                                <div className="sp-product-forecast-table-name">{p.product_name}</div>
                                <div className="sp-forecast-table-cell--right sp-product-forecast-table-category">{p.category}</div>
                                <div className="sp-forecast-table-cell--right sp-forecast-table-value">{p.last_month}</div>
                                <div className="sp-forecast-table-cell--right sp-forecast-table-value sp-forecast-table-value--bold">
                                    {p.next_month_predicted}
                                </div>
                                <div className="sp-forecast-table-cell--right"><GrowthBadge pct={p.growth_pct} /></div>
                                <div className="sp-forecast-table-cell--center"><ConfidenceDot level={p.confidence} /></div>
                            </div>
                        ))}
                        {(forecast.top_products || []).length > 8 && (
                            <button onClick={() => setShowAllProducts(p => !p)} className="sp-show-more-btn">
                                {showAllProducts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {showAllProducts ? 'Show less' : `Show all ${forecast.top_products.length}`}
                            </button>
                        )}
                    </div>

                    {/* Rising & Declining side by side */}
                    <div className="sp-rising-declining-grid">
                        {forecast.rising_products?.length > 0 && (
                            <div className="sp-panel sp-rising-panel">
                                <h4 className="sp-panel-header">
                                    <TrendingUp size={15} /> Rising Products
                                </h4>
                                {forecast.rising_products.map((p, i) => (
                                    <div key={i} className="sp-trend-item">
                                        <span>{p.product_name}</span>
                                        <GrowthBadge pct={p.growth_pct} />
                                    </div>
                                ))}
                            </div>
                        )}
                        {forecast.declining_products?.length > 0 && (
                            <div className="sp-panel sp-declining-panel">
                                <h4 className="sp-panel-header">
                                    <TrendingDown size={15} /> Declining Products
                                </h4>
                                {forecast.declining_products.map((p, i) => (
                                    <div key={i} className="sp-trend-item">
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
                    <div className="sp-yoy-grid">
                        <div className="sp-yoy-card">
                            <div className="sp-yoy-label">This Year</div>
                            <div className="sp-yoy-value">
                                {seasonal.yoy?.this_year || 0}
                            </div>
                            <span className="sp-yoy-subtext">orders</span>
                        </div>
                        <div className="sp-yoy-card">
                            <div className="sp-yoy-label">Last Year</div>
                            <div className="sp-yoy-value sp-kpi-value--muted">
                                {seasonal.yoy?.last_year || 0}
                            </div>
                            <span className="sp-yoy-subtext">orders</span>
                        </div>
                    </div>

                    {/* Seasonal Heatmap */}
                    <div className="sp-forecast-chart-panel">
                        <h3 className="sp-section-header">
                            <CalendarDays size={16} color="var(--accent)" /> Seasonal Index
                        </h3>
                        <p className="sp-header-subtitle">
                            Average monthly orders relative to the year. 🔥 Peak months = highest demand, ❄️ Slow months = lowest.
                        </p>
                        <SeasonalHeatmap data={seasonal.seasonal_index} />
                    </div>

                    {/* Monthly History Chart */}
                    <div className="sp-forecast-chart-panel">
                        <h3 className="sp-section-header">
                            <BarChart3 size={16} color="var(--accent-2)" /> Monthly History (24 months)
                        </h3>
                        <MiniBarChart
                            data={(seasonal.monthly_data || []).map(d => ({ label: d.label, value: d.orders }))}
                            height={130}
                            color="var(--accent-2)"
                        />
                        <div className="sp-weekday-section sp-weekday-section--mt-12">
                            <MiniBarChart
                                data={(seasonal.monthly_data || []).map(d => ({ label: d.label, value: d.revenue }))}
                                height={90}
                                color="var(--success)"
                            />
                            <div className="sp-weekday-title sp-weekday-title--mt-6">
                                Revenue trend (green)
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════  TAB: Purchase List  ═══════════════ */}
            {activeTab === 'purchase' && (
                <div>
                    {/* Purchase Summary KPI Cards */}
                    {purchase && (
                        <div className="sp-purchase-summary-grid">
                            <div className="sp-purchase-summary-card">
                                <div className="sp-purchase-summary-label">
                                    <ShoppingCart size={14} /> Total Suggestions
                                </div>
                                <div className="sp-purchase-summary-value">
                                    {purchase.summary?.total_suggestions || 0}
                                </div>
                            </div>
                            <div className="sp-purchase-summary-card sp-purchase-summary-card--error">
                                <div className="sp-purchase-summary-label sp-purchase-summary-label--error">
                                    <AlertTriangle size={14} /> Critical / Low Stock
                                </div>
                                <div className="sp-purchase-summary-value sp-purchase-summary-value--error">
                                    {(purchase.summary?.critical || 0) + (purchase.summary?.low_stock || 0)}
                                </div>
                            </div>
                            <div className="sp-purchase-summary-card sp-purchase-summary-card--warning">
                                <div className="sp-purchase-summary-label sp-purchase-summary-label--warning">
                                    <Truck size={14} /> Need to Buy Now
                                </div>
                                <div className="sp-purchase-summary-value sp-purchase-summary-value--warning">
                                    {purchase.summary?.needs_purchase || 0}
                                </div>
                            </div>
                            <div className="sp-purchase-summary-card">
                                <div className="sp-purchase-summary-label">
                                    <IndianRupee size={14} /> Est. Purchase Cost
                                </div>
                                <div className="sp-purchase-summary-value sp-purchase-summary-value--small">
                                    {purchase.summary?.estimated_total_cost > 0
                                        ? `₹${Number(purchase.summary.estimated_total_cost).toLocaleString('en-IN')}`
                                        : '—'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Filter Pills */}
                    <div className="sp-filter-pills">
                        {[
                            { key: 'all',      label: 'All' },
                            { key: 'buy',      label: 'Buy Now' },
                            { key: 'critical', label: '🔴 Critical / Low' },
                            { key: 'plan',     label: '📋 Plan Ahead' }
                        ].map(f => (
                            <button key={f.key} onClick={() => setPurchaseFilter(f.key)} className={`sp-filter-pill ${purchaseFilter === f.key ? 'sp-filter-pill--active' : ''}`}>
                                {f.label} {f.key === 'all' ? `(${allSuggestions.length})` : ''}
                            </button>
                        ))}
                    </div>

                    {/* How it works banner */}
                    <div className="sp-info-banner">
                        <Sparkles size={13} color="var(--accent)" />
                        AI analyses the last 6 months of sales, forecasts demand for the next 2 months (+20% safety buffer), compares to current stock, and recommends how much to purchase for each item.
                    </div>

                    {/* Purchase Suggestion Cards */}
                    {filteredSuggestions.length === 0 ? (
                        <div className="sp-empty-state">
                            <ShoppingCart size={36} color="var(--muted)" className="sp-empty-icon" />
                            <div className="sp-empty-title">No purchase suggestions</div>
                            <div className="sp-empty-text">
                                Link your products to inventory items and process some orders — the AI will suggest what to buy next.
                            </div>
                        </div>
                    ) : (
                        <div className="sp-purchase-grid">
                            {filteredSuggestions.map((item, i) => (
                                <PurchaseCard key={i} item={item} index={i} />
                            ))}
                        </div>
                    )}

                    {/* Print / summary table for buy-now items */}
                    {filteredSuggestions.filter(s => s.suggested_buy_qty > 0).length > 0 && (
                        <div className="sp-summary-table-section">
                            <h3 className="sp-section-header">
                                <Truck size={16} color="var(--warning)" /> Consolidated Purchase Order
                            </h3>
                            <div className="sp-summary-table-panel">
                                {/* Table header */}
                                <div className="sp-summary-table-header">
                                    <span>Item / Product</span>
                                    <span className="sp-summary-table-header-cell--right">Current Stock</span>
                                    <span className="sp-summary-table-header-cell--right">Forecast Demand</span>
                                    <span className="sp-summary-table-header-cell--right">Buy Qty</span>
                                    <span className="sp-summary-table-header-cell--right">Unit Cost</span>
                                    <span className="sp-summary-table-header-cell--right">Total Cost</span>
                                </div>
                                {filteredSuggestions
                                    .filter(s => s.suggested_buy_qty > 0)
                                    .map((item, i, _arr) => {
                                    const uc = urgencyConfig[item.urgency] || urgencyConfig.ok;
                                    return (
                                    <div key={i} className="sp-summary-table-row" style={{ borderLeft: `3px solid ${uc.color}` }}>
                                        <div>
                                            <div className="sp-summary-table-item-name">{item.item_name}</div>
                                            <div className="sp-summary-table-item-vendor">
                                                {item.vendor_name ? `Vendor: ${item.vendor_name}` : item.category || ''}
                                            </div>
                                        </div>
                                        <div className="sp-summary-table-value">
                                            {item.current_stock !== null ? `${item.current_stock} ${item.unit}` : '—'}
                                        </div>
                                        <div className="sp-summary-table-value sp-summary-table-value--accent">
                                            {item.buffered_demand} {item.unit}
                                        </div>
                                        <div className="sp-summary-table-value sp-summary-table-value--warning">
                                            {item.suggested_buy_qty}
                                        </div>
                                        <div className="sp-summary-table-value sp-summary-table-value--muted">
                                            {item.cost_price > 0 ? `₹${item.cost_price.toLocaleString('en-IN')}` : '—'}
                                        </div>
                                        <div className="sp-summary-table-value sp-summary-table-value--bold">
                                            {item.estimated_cost > 0 ? `₹${Number(item.estimated_cost).toLocaleString('en-IN')}` : '—'}
                                        </div>
                                    </div>
                                    );
                                })}
                                {/* Total row */}
                                {(() => {
                                    const totalCost = filteredSuggestions
                                        .filter(s => s.suggested_buy_qty > 0 && s.estimated_cost > 0)
                                        .reduce((sum, s) => sum + s.estimated_cost, 0);
                                    return totalCost > 0 ? (
                                        <div className="sp-summary-total-row">
                                            Total: ₹{totalCost.toLocaleString('en-IN')}
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* No data fallback */}
            {!forecast && !insights && !seasonal && !stock && !purchase && !error && (
                <div className="sp-no-data-state">
                    <BarChart3 size={40} color="var(--muted)" className="sp-no-data-icon" />
                    <div className="sp-no-data-title">No Sales Data Yet</div>
                    <div className="sp-no-data-text">
                        Start creating jobs and bills — predictions will appear once there's enough historical data.
                    </div>
                </div>
            )}
        </PageContainer>
    );
};

export default SalesPrediction;
