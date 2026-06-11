import React, { useState, useEffect, Suspense, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Building2, Activity, Printer, AlertTriangle, Clock, Wallet, Users, Package, TrendingUp, BarChart3, Target, ClipboardList, IndianRupee, ShoppingCart, UserCheck, ArrowUpRight, ArrowDownRight, Brain, Sparkles, ShieldAlert, LineChart } from 'lucide-react';

import api from '../services/api';
import { formatCurrency as formatCurrencyShared } from '../constants';
import OrderForecastWidget from '../components/OrderForecastWidget';
import HeroBg3D from '../components/ui/HeroBg3D';
import Marquee from '../components/ui/Marquee';
import Card3DStack from '../components/ui/Card3DStack';

const AIMonitoring = React.lazy(() => import('./AIMonitoring'));
const OrderPredictions = React.lazy(() => import('./OrderPredictions'));

const SummaryTile = React.memo(({ title, value, meta, valueColor }) => (
    <div className="summary-tile">
        <div className="summary-tile__title">{title}</div>
        <div className="summary-tile__value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
        {meta && <div className="summary-tile__meta">{meta}</div>}
    </div>
));

const SummarySectionHeader = React.memo(({ title, subtitle, icon: Icon }) => (
    <div className="summary-section__header">
        <div>
            <h2 className="section-title">{title}</h2>
            {subtitle && <p className="section-subtitle">{subtitle}</p>}
        </div>
        {Icon && <Icon size={22} className="muted" />}
    </div>
));

const TabButton = React.memo(({ tab, activeTab, onSelect }) => (
    <button onClick={() => onSelect(tab.id)} style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400, whiteSpace: 'nowrap',
        background: activeTab === tab.id ? 'var(--surface)' : 'transparent',
        color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
        boxShadow: activeTab === tab.id ? 'var(--shadow-sm)' : 'none',
        transition: 'all 0.2s'
    }}>
        {tab.icon} {tab.label}
    </button>
));

const SummaryDataRow = React.memo(({ children }) => (
    <div className="summary-data-list__row">{children}</div>
));

const Summary = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [statsToday, setStatsToday] = useState(null);
    const [statsOverall, setStatsOverall] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ branch_id: '' });
    const statsRef = useRef({ today: null, overall: null });

    const fetchBranches = useCallback(async () => {
        try {
            const response = await api.get('/branches');
            setBranches(response.data);
        } catch {
            console.error('Failed to fetch branches');
        }
    }, []);

    const getStatusColor = useCallback((status) => {
        switch (status) {
            case 'Completed': return 'var(--color-ok, #22c55e)';
            case 'Delivered': return 'var(--color-primary, #60a5fa)';
            case 'Processing': return 'var(--color-warning, #fbbf24)';
            case 'Pending': return 'var(--text-muted, #94a3b8)';
            case 'Approval Pending': return 'var(--color-warning, #fbbf24)';
            case 'Cancelled': return 'var(--error, #ef4444)';
            default: return 'var(--text-main, #e2e8f0)';
        }
    }, []);

    useEffect(() => {
        fetchBranches();
    }, [fetchBranches]);

    useEffect(() => {
        fetchStatsSplit();
        const handlePaymentUpdate = () => fetchStatsSplit();
        window.addEventListener('paymentRecorded', handlePaymentUpdate);
        return () => window.removeEventListener('paymentRecorded', handlePaymentUpdate);
    }, [filters.branch_id]);

    const fetchStatsSplit = async () => {
        setLoading(true);
        try {
            const paramsToday = new URLSearchParams();
            if (filters.branch_id) paramsToday.append('branch_id', filters.branch_id);
            const today = new Date().toISOString().split('T')[0];
            paramsToday.append('startDate', today);
            paramsToday.append('endDate', today);

            const paramsOverall = new URLSearchParams();
            if (filters.branch_id) paramsOverall.append('branch_id', filters.branch_id);

            const [todayRes, overallRes] = await Promise.all([
                api.get(`/stats/dashboard?${paramsToday.toString()}`),
                api.get(`/stats/dashboard?${paramsOverall.toString()}`),
            ]);

            if (JSON.stringify(todayRes.data) !== JSON.stringify(statsRef.current.today)) {
                setStatsToday(todayRes.data);
                statsRef.current.today = todayRes.data;
            }
            if (JSON.stringify(overallRes.data) !== JSON.stringify(statsRef.current.overall)) {
                setStatsOverall(overallRes.data);
                statsRef.current.overall = overallRes.data;
            }
        } catch {
            console.error('Failed to fetch dashboard stats');
        } finally {
            setLoading(false);
        }
    };

    const fmt = (value) => (typeof value === 'number' ? formatCurrencyShared(value, true) : '—');
    const fmtNum = (value) => (typeof value === 'number' ? value.toLocaleString() : '—');

    const selectedBranchName = useMemo(() => filters.branch_id
        ? (branches.find(b => b.id.toString() === filters.branch_id.toString())?.name || 'Selected Branch')
        : 'All Branches',
    [filters.branch_id, branches]);

    const showLoader = loading && !statsToday && !statsOverall;

    const lowStockItems = statsOverall?.low_stock || [];
    const topCustomers = statsOverall?.top_customers || [];
    const staffProd = statsOverall?.staff_productivity || [];

    const tabItems = useMemo(() => [
        { id: 'overview', label: 'Summary Overview', icon: <BarChart3 size={15} /> },
        { id: 'ai-monitoring', label: 'AI Fraud Monitoring', icon: <ShieldAlert size={15} /> },
        { id: 'order-predictions', label: 'Order Predictions', icon: <Sparkles size={15} /> }
    ], []);

    const salesCategoriesData = useMemo(() => [
        { label: 'Offset Printing', value: statsToday?.sales?.offset },
        { label: 'Digital Printing', value: statsToday?.sales?.digital },
        { label: 'Photocopy', value: statsToday?.sales?.photocopy },
        { label: 'Mementos', value: statsToday?.sales?.mementos },
        { label: 'Photo Frames', value: statsToday?.sales?.frames },
        { label: 'ID Cards', value: statsToday?.sales?.id_cards },
        { label: 'Binding & Lamination', value: statsToday?.sales?.binding },
    ], [statsToday?.sales]);

    const marqueeItems = useMemo(() => ['Visiting Cards', 'Wedding Invitations', 'Annual Reports', 'Posters', 'Menus', 'Brochures'], []);

    return (
        <div className="summary-page">
            {showLoader ? (
                <div className="flex items-center justify-center p-40" style={{ minHeight: '60vh' }}>
                    <Loader2 className="animate-spin text-accent" size={48} />
                </div>
            ) : (
                <>
                    <div style={{position:'relative'}}>
                        <HeroBg3D />
                    </div>
            {/* Header */}
            <div className="page-header summary-header">
                <div>
                    <h1 className="section-title">Business Summary</h1>
                    <p className="section-subtitle">{selectedBranchName} — {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <div className="row gap-md items-center summary-filters">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px' }}>
                        <Building2 size={16} className="muted" style={{ flexShrink: 0 }} />
                        <select
                            className="input-field"
                            value={filters.branch_id}
                            onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
                            style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', minWidth: 130 }}
                        >
                            <option value="">All Branches</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Top Navigation Tabs */}
            <div style={{
                display: 'flex', gap: '4px', marginBottom: '24px', padding: '4px',
                borderRadius: '12px', background: 'var(--bg-2)', overflowX: 'auto'
            }}>
                {tabItems.map(t => (
                    <TabButton key={t.id} tab={t} activeTab={activeTab} onSelect={setActiveTab} />
                ))}
            </div>

            {activeTab === 'overview' && (
                <>
                    <div style={{marginTop:12, marginBottom:18}}>
                        <Marquee items={marqueeItems} />
                    </div>
                    {/* ─── Section 1: Today's KPIs ─── */}
                    <section className="summary-section">
                        <SummarySectionHeader title="Today's Overview" subtitle="Sales, orders and collections today" icon={TrendingUp} />
                        <div className="summary-grid summary-grid--tiles">
                            <SummaryTile title="Today's Sales" value={fmt(statsToday?.jobs?.total_sales)} meta={`${fmtNum(statsToday?.jobs?.total_count)} jobs`} />
                            <SummaryTile title="Collected Today" value={fmt(statsToday?.payments?.total_collected_today)} meta={`Cash: ${fmt(statsToday?.payments?.cash_today)} · UPI: ${fmt(statsToday?.payments?.upi_today)}`} />
                            <SummaryTile title="Expenses Today" value={fmt(statsToday?.expenses?.today)} meta={`This month: ${fmt(statsOverall?.expenses?.month)}`} valueColor="var(--error, #dc2626)" />
                            <SummaryTile title="Completed / New" value={`${fmtNum(statsToday?.jobs?.completed_today)} / ${fmtNum(statsToday?.jobs?.new_today)}`} meta={`Walk-ins: ${fmtNum(statsToday?.customers?.walk_in_today)}`} />
                        </div>

                        {/* Overall pending */}
                        <div className="summary-grid summary-grid--tiles" style={{ marginTop: 16 }}>
                            <SummaryTile title="Total Outstanding" value={fmt(statsOverall?.jobs?.total_balance)} meta="Pending receivables" valueColor="var(--error, #dc2626)" />
                            <SummaryTile title="In Progress" value={fmtNum(statsOverall?.jobs?.in_progress)} meta="Across all stages" />
                            <SummaryTile title="Urgent / Overdue" value={`${fmtNum(statsToday?.jobs?.urgent_today)} / ${fmtNum(statsOverall?.jobs?.overdue)}`} meta="Needs attention" valueColor={Number(statsOverall?.jobs?.overdue) > 0 ? 'var(--error, #dc2626)' : undefined} />
                            <SummaryTile title="Inventory Value" value={fmt(statsOverall?.inventory?.total_value)} meta={`${fmtNum(statsOverall?.inventory?.total_items)} items · ${fmtNum(statsOverall?.inventory?.low_stock_count)} low stock`} />
                        </div>
                    </section>

                    {/* Product showcase */}
                    <section className="summary-section" style={{marginTop:18}}>
                        <h3 className="section-title">Featured Prints</h3>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
                            <Card3DStack />
                        </div>
                    </section>

                    {/* ─── Section 1.5: AI Insights & Roadmap (New) ─── */}
                    <div className="summary-grid summary-grid--split mb-24">
                        <section className="summary-section ai-insights-card" style={{ border: '1px solid var(--border)' }}>
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title row items-center gap-xs">
                                        <Brain size={20} className="text-accent" /> AI Business Insights
                                    </h2>
                                    <p className="section-subtitle">Growth patterns and predictions</p>
                                </div>
                                <Sparkles size={20} className="text-accent animate-pulse" />
                            </div>
                            <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                                <div style={{ padding: 16, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                    <div className="text-xs muted mb-4" style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Revenue Growth</div>
                                    <div className="row items-center gap-xs" style={{ fontSize: 22, fontWeight: 700, color: (statsToday?.ai_insights?.revenue_growth ?? 0) >= 0 ? 'var(--success)' : 'var(--error)' }}>
                                        {(statsToday?.ai_insights?.revenue_growth ?? 0) >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                                        {Math.abs(statsToday?.ai_insights?.revenue_growth || 0)}%
                                    </div>
                                    <div className="text-xs muted mt-4">vs. last month</div>
                                </div>
                                <div style={{ padding: 16, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                    <div className="text-xs muted mb-4" style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Peak Demand</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{statsToday?.ai_insights?.peak_day || '—'}</div>
                                    <div className="text-xs muted mt-4">Busiest day locally</div>
                                </div>
                                <div style={{ padding: 16, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                    <div className="text-xs muted mb-4" style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Next Month Forecast</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{fmt(statsToday?.ai_insights?.predicted_revenue_next_month)}</div>
                                    <div className="text-xs muted mt-4">AI prediction</div>
                                </div>
                            </div>
                        </section>

                        <section className="summary-section financial-roadmap-card">
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title row items-center gap-xs">
                                        <IndianRupee size={20} className="text-primary" /> Financial Roadmap
                                    </h2>
                                    <p className="section-subtitle">Upcoming monthly commitments</p>
                                </div>
                                <TrendingUp size={20} className="muted" />
                            </div>
                            <div className="stack-sm">
                                <div className="row space-between p-16 bg-surface-lowest rounded border-all mb-3" style={{marginBottom: 16}}>
                                    <span className="font-medium muted">EMI Commitments</span>
                                    <span className="font-bold">{fmt(statsToday?.financial_roadmap?.emi_total)}</span>
                                </div>
                                <div className="row space-between p-16 bg-surface-lowest rounded border-all mb-3" style={{marginBottom: 16}}>
                                    <span className="font-medium muted">Kuri Installments</span>
                                    <span className="font-bold">{fmt(statsToday?.financial_roadmap?.kuri_total)}</span>
                                </div>
                                <div className="row space-between p-20 bg-primary rounded shadow-md mt-4" style={{marginTop: 24, marginBottom: 8, color: 'var(--on-accent)'}}>
                                    <span className="font-bold">Total Monthly Fixed</span>
                                    <span className="font-black text-lg">{fmt(statsToday?.financial_roadmap?.total_monthly_commitment)}</span>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Fraud / System Health Banner */}
                    {statsToday?.monitoring_stats?.active_alerts > 0 && (
                        <div className="row items-center gap-md p-16 rounded border-all mb-24 bg-error-light" style={{ borderColor: 'var(--error)', background: 'var(--error-bg)' }}>
                            <ShieldAlert size={28} className="text-error" />
                            <div className="flex-1">
                                <div className="font-bold text-error">AI Monitoring Alert</div>
                                <div className="text-sm">There are <strong>{statsToday.monitoring_stats.active_alerts} active fraud alerts</strong> that require your immediate attention.</div>
                            </div>
                            <button className="btn btn-error btn-sm" onClick={() => navigate('/dashboard/ai-monitoring')}>Review Now</button>
                        </div>
                    )}

                    {/* ─── Section 2: Sales + Work Status (side by side) ─── */}
                    <div className="summary-grid summary-grid--split">
                        <section className="summary-section">
                            <SummarySectionHeader title="Sales by Category" subtitle="Today's revenue breakdown" icon={BarChart3} />
                            <div className="summary-data-list">
                                {salesCategoriesData.map(item => (
                                    <SummaryDataRow key={item.label}>
                                        <span>{item.label}</span>
                                        <span className="summary-data-list__value">{fmt(item.value)}</span>
                                    </SummaryDataRow>
                                ))}
                            </div>
                            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--surface-lowest, #f8fafc)', borderRadius: 6, fontSize: 13 }}>
                                <strong>This Month:</strong> {fmt(statsToday?.sales?.month_total)} · {fmtNum(statsToday?.sales?.bill_count)} bills · Avg: {fmt(statsToday?.sales?.avg_bill)}
                            </div>
                        </section>

                        <section className="summary-section">
                            <SummarySectionHeader title="Work Status" subtitle="Current job pipeline" icon={Activity} />
                            <div className="summary-grid summary-grid--inventory" style={{gap: 18}}>
                                {Object.entries(statsOverall?.status_counts || {}).filter(([s]) => s !== 'Cancelled').map(([status, count]) => (
                                    <div key={status} className="row p-16 border-all rounded bg-surface-lowest mb-2" style={{marginBottom: 14, gap: '16px'}}>
                                        <span className="font-medium" style={{ color: getStatusColor(status), minWidth: '140px' }}>{status}:</span>
                                        <span className="font-bold">{fmtNum(count)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* ─── Section 3: Recent Orders + Machine Status ─── */}
                    <div className="summary-grid summary-grid--split">
                        <section className="summary-section">
                            <SummarySectionHeader title="Recent Orders" icon={ClipboardList} />
                            <div className="overflow-x-auto">
                                <table className="table w-full text-sm">
                                    <thead>
                                        <tr>
                                            <th>Job No</th>
                                            <th>Customer</th>
                                            <th>Status</th>
                                            <th className="text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {statsToday?.recent_jobs?.length > 0 ? statsToday.recent_jobs.map(job => (
                                            <tr key={job.id}>
                                                <td className="font-medium">{job.job_number}</td>
                                                <td>
                                                    <div className="font-medium">{job.customer_name}</div>
                                                    <div className="text-xs muted">{job.job_name}</div>
                                                </td>
                                                <td>
                                                    <span className="badge" style={{ backgroundColor: `${getStatusColor(job.status)}20`, color: getStatusColor(job.status), padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                                        {job.status}
                                                    </span>
                                                </td>
                                                <td className="text-right font-bold">₹{Number(job.total_amount).toLocaleString()}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" className="text-center p-16 muted">No recent orders</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="summary-section">
                            <SummarySectionHeader title="Machine Status" subtitle="Today's production" icon={Printer} />
                            <div className="summary-list">
                                {Array.isArray(statsToday?.machines) && statsToday.machines.length > 0 ? (
                                    statsToday.machines.map(machine => (
                                        <div key={machine.id || machine.name} className="summary-list__item">
                                            <div>
                                                <div className="summary-list__title">{machine.name}</div>
                                                <div className="summary-list__meta">Pages printed today</div>
                                            </div>
                                            <div className="summary-list__value">{fmtNum(machine.pages)}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center p-16 muted">No machine readings today</div>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* ─── Section 4: Payments & Collections ─── */}
                    <section className="summary-section">
                        <SummarySectionHeader title="Payments & Collections" subtitle="Cash flow breakdown" icon={Wallet} />
                        <div className="summary-grid summary-grid--tiles">
                            <SummaryTile title="Cash Collected" value={fmt(statsToday?.payments?.cash_today)} />
                            <SummaryTile title="UPI Collected" value={fmt(statsToday?.payments?.upi_today)} />
                            <SummaryTile title="Cheque / Transfer" value={fmt(statsToday?.payments?.cheque_today)} />
                            <SummaryTile title="Total Advance Received" value={fmt(statsOverall?.payments?.total_amount)} />
                        </div>
                    </section>

                    {/* ─── Section 5: Low Stock Alerts + Top Customers (side by side) ─── */}
                    <div className="summary-grid summary-grid--split">
                        <section className="summary-section">
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title">Low Stock Alerts</h2>
                                    <p className="section-subtitle">{lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need attention</p>
                                </div>
                                <AlertTriangle size={22} style={{ color: lowStockItems.length > 0 ? 'var(--error, #dc2626)' : 'var(--text-muted)' }} />
                            </div>
                            {lowStockItems.length > 0 ? (
                                <div className="summary-data-list">
                                    {lowStockItems.map(item => (
                                        <SummaryDataRow key={item.id}>
                                            <div>
                                                <span className="font-medium">{item.name}</span>
                                                {item.sku && <span className="text-xs muted" style={{ marginLeft: 6 }}>{item.sku}</span>}
                                            </div>
                                            <span style={{ color: Number(item.quantity) === 0 ? 'var(--error, #dc2626)' : 'var(--color-warning, #f59e0b)', fontWeight: 700 }}>
                                                {item.quantity} left
                                            </span>
                                        </SummaryDataRow>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center p-24 muted">All stock levels are healthy</div>
                            )}
                        </section>

                        <section className="summary-section">
                            <SummarySectionHeader title="Top Customers (Month)" icon={UserCheck} />
                            {topCustomers.length > 0 ? (
                                <div className="summary-data-list">
                                    {topCustomers.map((c, i) => (
                                        <SummaryDataRow key={i}>
                                            <div>
                                                <span className="font-medium">{c.name}</span>
                                                <span className="text-xs muted" style={{ marginLeft: 6 }}>{c.job_count} jobs</span>
                                            </div>
                                            <span className="font-bold">{fmt(Number(c.total_spent))}</span>
                                        </SummaryDataRow>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center p-24 muted">No customer data this month</div>
                            )}
                        </section>
                    </div>

                    {/* ─── Section 6: Staff Productivity ─── */}
                    {staffProd.length > 0 && (
                        <section className="summary-section">
                            <SummarySectionHeader title="Staff Productivity (Month)" subtitle="Jobs handled this month by staff" icon={Users} />
                            <div className="summary-data-list">
                                {staffProd.map((s, i) => (
                                    <SummaryDataRow key={i}>
                                        <div>
                                            <span className="font-medium">{s.name}</span>
                                            <span className="text-xs muted" style={{ marginLeft: 6 }}>{s.role}</span>
                                        </div>
                                        <span className="font-bold">{s.jobs_handled} jobs</span>
                                    </SummaryDataRow>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ─── Section 7: Order Forecast ─── */}
                    <OrderForecastWidget branchId={filters.branch_id} />
                </>
            )}

            {activeTab === 'ai-monitoring' && (
                <Suspense fallback={<div className="flex items-center justify-center p-40"><Loader2 className="animate-spin text-accent" size={32} /></div>}>
                    <AIMonitoring />
                </Suspense>
            )}

            {activeTab === 'order-predictions' && (
                <Suspense fallback={<div className="flex items-center justify-center p-40"><Loader2 className="animate-spin text-accent" size={32} /></div>}>
                    <OrderPredictions />
                </Suspense>
            )}
                </>
            )}
        </div>
    );
};

export default React.memo(Summary);
