import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Building2, Activity, Printer, AlertTriangle, Clock, Wallet, Users, Package, TrendingUp, BarChart3, Target, ClipboardList, IndianRupee, ShoppingCart, UserCheck, ArrowUpRight, ArrowDownRight, Brain, Sparkles, ShieldAlert, LineChart } from 'lucide-react';

import api from '../services/api';
import { formatCurrency as formatCurrencyShared } from '../constants';

const AIMonitoring = React.lazy(() => import('./AIMonitoring'));
const SalesPrediction = React.lazy(() => import('./SalesPrediction'));
const OrderPredictions = React.lazy(() => import('./OrderPredictions'));

const Summary = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [statsToday, setStatsToday] = useState(null);
    const [statsOverall, setStatsOverall] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ branch_id: '' });

    useEffect(() => {
        fetchBranches();
    }, []);

    useEffect(() => {
        fetchStatsSplit();
        const handlePaymentUpdate = () => fetchStatsSplit();
        window.addEventListener('paymentRecorded', handlePaymentUpdate);
        return () => window.removeEventListener('paymentRecorded', handlePaymentUpdate);
    }, [filters.branch_id]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches');
            setBranches(response.data);
        } catch (err) {
            console.error('Failed to fetch branches');
        }
    };

    const fetchStatsSplit = async () => {
        setLoading(true);
        try {
            const paramsToday = new URLSearchParams();
            if (filters.branch_id) paramsToday.append('branch_id', filters.branch_id);
            const today = new Date().toISOString().split('T')[0];
            paramsToday.append('startDate', today);
            paramsToday.append('endDate', today);
            const responseToday = await api.get(`/stats/dashboard?${paramsToday.toString()}`);
            setStatsToday(responseToday.data);

            const paramsOverall = new URLSearchParams();
            if (filters.branch_id) paramsOverall.append('branch_id', filters.branch_id);
            const responseOverall = await api.get(`/stats/dashboard?${paramsOverall.toString()}`);
            setStatsOverall(responseOverall.data);
        } catch (err) {
            console.error('Failed to fetch dashboard stats');
        } finally {
            setLoading(false);
        }
    };

    const fmt = (value) => (typeof value === 'number' ? formatCurrencyShared(value, true) : '—');
    const fmtNum = (value) => (typeof value === 'number' ? value.toLocaleString() : '—');

    const selectedBranchName = filters.branch_id
        ? (branches.find(b => b.id.toString() === filters.branch_id.toString())?.name || 'Selected Branch')
        : 'All Branches';

    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed': return 'var(--color-ok, #16a34a)';
            case 'Delivered': return 'var(--color-primary, #2563eb)';
            case 'Processing': return 'var(--color-warning, #f59e0b)';
            case 'Pending': return 'var(--text-muted, #9ca3af)';
            case 'Cancelled': return 'var(--error, #dc2626)';
            default: return 'var(--text-main, #333)';
        }
    };

    if (loading && !statsToday && !statsOverall) {
        return (
            <div className="flex items-center justify-center p-40">
                <Loader2 className="animate-spin text-accent" size={48} />
            </div>
        );
    }

    const lowStockItems = statsOverall?.low_stock || [];
    const topCustomers = statsOverall?.top_customers || [];
    const staffProd = statsOverall?.staff_productivity || [];

    return (
        <div className="summary-page">
            {/* Header */}
            <div className="page-header summary-header">
                <div>
                    <h1 className="section-title">Business Summary</h1>
                    <p className="section-subtitle">{selectedBranchName} — {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <div className="row gap-md items-center summary-filters">
                    <Building2 size={18} className="muted" />
                    <select
                        className="input-field"
                        value={filters.branch_id}
                        onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
                    >
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Top Navigation Tabs */}
            <div style={{
                display: 'flex', gap: '4px', marginBottom: '24px', padding: '4px',
                borderRadius: '12px', background: 'var(--bg-2)', overflowX: 'auto'
            }}>
                {[
                    { id: 'overview', label: 'Summary Overview', icon: <BarChart3 size={15} /> },
                    { id: 'ai-monitoring', label: 'AI Fraud Monitoring', icon: <ShieldAlert size={15} /> },
                    { id: 'sales-prediction', label: 'Sales Prediction', icon: <TrendingUp size={15} /> },
                    { id: 'order-predictions', label: 'Order Predictions', icon: <Sparkles size={15} /> }
                ].map(t => (
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

            {activeTab === 'overview' && (
                <>
                    {/* ─── Section 1: Today's KPIs ─── */}
                    <section className="summary-section">
                        <div className="summary-section__header">
                            <div>
                                <h2 className="section-title">Today's Overview</h2>
                                <p className="section-subtitle">Sales, orders and collections today</p>
                            </div>
                            <TrendingUp size={22} className="muted" />
                        </div>
                        <div className="summary-grid summary-grid--tiles">
                            <div className="summary-tile">
                                <div className="summary-tile__title">Today's Sales</div>
                                <div className="summary-tile__value">{fmt(statsToday?.jobs?.total_sales)}</div>
                                <div className="summary-tile__meta">{fmtNum(statsToday?.jobs?.total_count)} jobs</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">Collected Today</div>
                                <div className="summary-tile__value">{fmt(statsToday?.payments?.total_collected_today)}</div>
                                <div className="summary-tile__meta">Cash: {fmt(statsToday?.payments?.cash_today)} · UPI: {fmt(statsToday?.payments?.upi_today)}</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">Expenses Today</div>
                                <div className="summary-tile__value" style={{ color: 'var(--error, #dc2626)' }}>{fmt(statsToday?.expenses?.today)}</div>
                                <div className="summary-tile__meta">This month: {fmt(statsOverall?.expenses?.month)}</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">Completed / New</div>
                                <div className="summary-tile__value">{fmtNum(statsToday?.jobs?.completed_today)} / {fmtNum(statsToday?.jobs?.new_today)}</div>
                                <div className="summary-tile__meta">Walk-ins: {fmtNum(statsToday?.customers?.walk_in_today)}</div>
                            </div>
                        </div>

                        {/* Overall pending */}
                        <div className="summary-grid summary-grid--tiles" style={{ marginTop: 16 }}>
                            <div className="summary-tile">
                                <div className="summary-tile__title">Total Outstanding</div>
                                <div className="summary-tile__value" style={{ color: 'var(--error, #dc2626)' }}>{fmt(statsOverall?.jobs?.total_balance)}</div>
                                <div className="summary-tile__meta">Pending receivables</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">In Progress</div>
                                <div className="summary-tile__value">{fmtNum(statsOverall?.jobs?.in_progress)}</div>
                                <div className="summary-tile__meta">Across all stages</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">Urgent / Overdue</div>
                                <div className="summary-tile__value" style={{ color: Number(statsOverall?.jobs?.overdue) > 0 ? 'var(--error, #dc2626)' : undefined }}>
                                    {fmtNum(statsToday?.jobs?.urgent_today)} / {fmtNum(statsOverall?.jobs?.overdue)}
                                </div>
                                <div className="summary-tile__meta">Needs attention</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">Inventory Value</div>
                                <div className="summary-tile__value">{fmt(statsOverall?.inventory?.total_value)}</div>
                                <div className="summary-tile__meta">{fmtNum(statsOverall?.inventory?.total_items)} items · {fmtNum(statsOverall?.inventory?.low_stock_count)} low stock</div>
                            </div>
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
                                <div className="row space-between p-12 bg-surface-lowest rounded border-all">
                                    <span className="font-medium muted">EMI Commitments</span>
                                    <span className="font-bold">{fmt(statsToday?.financial_roadmap?.emi_total)}</span>
                                </div>
                                <div className="row space-between p-12 bg-surface-lowest rounded border-all">
                                    <span className="font-medium muted">Kuri Installments</span>
                                    <span className="font-bold">{fmt(statsToday?.financial_roadmap?.kuri_total)}</span>
                                </div>
                                <div className="row space-between p-12 bg-primary text-white rounded shadow-md mt-4">
                                    <span className="font-bold">Total Monthly Fixed</span>
                                    <span className="font-black text-lg">{fmt(statsToday?.financial_roadmap?.total_monthly_commitment)}</span>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Fraud / System Health Banner */}
                    {statsToday?.monitoring_stats?.active_alerts > 0 && (
                        <div className="row items-center gap-md p-16 rounded border-all mb-24 bg-error-light" style={{ borderColor: 'var(--error)', background: '#fef2f2' }}>
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
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title">Sales by Category</h2>
                                    <p className="section-subtitle">Today's revenue breakdown</p>
                                </div>
                                <BarChart3 size={22} className="muted" />
                            </div>
                            <div className="summary-data-list">
                                {[
                                    { label: 'Offset Printing', value: statsToday?.sales?.offset },
                                    { label: 'Digital Printing', value: statsToday?.sales?.digital },
                                    { label: 'Photocopy', value: statsToday?.sales?.photocopy },
                                    { label: 'Mementos', value: statsToday?.sales?.mementos },
                                    { label: 'Photo Frames', value: statsToday?.sales?.frames },
                                    { label: 'ID Cards', value: statsToday?.sales?.id_cards },
                                    { label: 'Binding & Lamination', value: statsToday?.sales?.binding },
                                ].map(item => (
                                    <div key={item.label} className="summary-data-list__row">
                                        <span>{item.label}</span>
                                        <span className="summary-data-list__value">{fmt(item.value)}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--surface-lowest, #f8fafc)', borderRadius: 6, fontSize: 13 }}>
                                <strong>This Month:</strong> {fmt(statsToday?.sales?.month_total)} · {fmtNum(statsToday?.sales?.bill_count)} bills · Avg: {fmt(statsToday?.sales?.avg_bill)}
                            </div>
                        </section>

                        <section className="summary-section">
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title">Work Status</h2>
                                    <p className="section-subtitle">Current job pipeline</p>
                                </div>
                                <Activity size={22} className="muted" />
                            </div>
                            <div className="summary-grid summary-grid--inventory">
                                {Object.entries(statsOverall?.status_counts || {}).filter(([s]) => s !== 'Cancelled').map(([status, count]) => (
                                    <div key={status} className="row space-between p-12 border-all rounded bg-surface-lowest">
                                        <span className="font-medium" style={{ color: getStatusColor(status) }}>{status}</span>
                                        <span className="font-bold">{fmtNum(count)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* ─── Section 3: Recent Orders + Machine Status ─── */}
                    <div className="summary-grid summary-grid--split">
                        <section className="summary-section">
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title">Recent Orders</h2>
                                </div>
                                <ClipboardList size={22} className="muted" />
                            </div>
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
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title">Machine Status</h2>
                                    <p className="section-subtitle">Today's production</p>
                                </div>
                                <Printer size={22} className="muted" />
                            </div>
                            <div className="summary-list">
                                <div className="summary-list__item">
                                    <div><div className="summary-list__title">Konica 4065</div><div className="summary-list__meta">Pages printed today</div></div>
                                    <div className="summary-list__value">{fmtNum(statsToday?.machines?.konica_4065_pages)}</div>
                                </div>
                                <div className="summary-list__item">
                                    <div><div className="summary-list__title">Konica 3070</div><div className="summary-list__meta">Pages printed today</div></div>
                                    <div className="summary-list__value">{fmtNum(statsToday?.machines?.konica_3070_pages)}</div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* ─── Section 4: Payments & Collections ─── */}
                    <section className="summary-section">
                        <div className="summary-section__header">
                            <div>
                                <h2 className="section-title">Payments & Collections</h2>
                                <p className="section-subtitle">Cash flow breakdown</p>
                            </div>
                            <Wallet size={22} className="muted" />
                        </div>
                        <div className="summary-grid summary-grid--tiles">
                            <div className="summary-tile">
                                <div className="summary-tile__title">Cash Collected</div>
                                <div className="summary-tile__value">{fmt(statsToday?.payments?.cash_today)}</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">UPI Collected</div>
                                <div className="summary-tile__value">{fmt(statsToday?.payments?.upi_today)}</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">Cheque / Transfer</div>
                                <div className="summary-tile__value">{fmt(statsToday?.payments?.cheque_today)}</div>
                            </div>
                            <div className="summary-tile">
                                <div className="summary-tile__title">Total Advance Received</div>
                                <div className="summary-tile__value">{fmt(statsOverall?.payments?.total_amount)}</div>
                            </div>
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
                                        <div key={item.id} className="summary-data-list__row">
                                            <div>
                                                <span className="font-medium">{item.name}</span>
                                                {item.sku && <span className="text-xs muted" style={{ marginLeft: 6 }}>{item.sku}</span>}
                                            </div>
                                            <span style={{ color: Number(item.quantity) === 0 ? 'var(--error, #dc2626)' : 'var(--color-warning, #f59e0b)', fontWeight: 700 }}>
                                                {item.quantity} left
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center p-24 muted">All stock levels are healthy</div>
                            )}
                        </section>

                        <section className="summary-section">
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title">Top Customers (Month)</h2>
                                </div>
                                <UserCheck size={22} className="muted" />
                            </div>
                            {topCustomers.length > 0 ? (
                                <div className="summary-data-list">
                                    {topCustomers.map((c, i) => (
                                        <div key={i} className="summary-data-list__row">
                                            <div>
                                                <span className="font-medium">{c.name}</span>
                                                <span className="text-xs muted" style={{ marginLeft: 6 }}>{c.job_count} jobs</span>
                                            </div>
                                            <span className="font-bold">{fmt(Number(c.total_spent))}</span>
                                        </div>
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
                            <div className="summary-section__header">
                                <div>
                                    <h2 className="section-title">Staff Productivity (Month)</h2>
                                    <p className="section-subtitle">Jobs handled this month by staff</p>
                                </div>
                                <Users size={22} className="muted" />
                            </div>
                            <div className="summary-data-list">
                                {staffProd.map((s, i) => (
                                    <div key={i} className="summary-data-list__row">
                                        <div>
                                            <span className="font-medium">{s.name}</span>
                                            <span className="text-xs muted" style={{ marginLeft: 6 }}>{s.role}</span>
                                        </div>
                                        <span className="font-bold">{s.jobs_handled} jobs</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            {activeTab === 'ai-monitoring' && (
                <Suspense fallback={<div className="flex items-center justify-center p-40"><Loader2 className="animate-spin text-accent" size={32} /></div>}>
                    <AIMonitoring />
                </Suspense>
            )}

            {activeTab === 'sales-prediction' && (
                <Suspense fallback={<div className="flex items-center justify-center p-40"><Loader2 className="animate-spin text-accent" size={32} /></div>}>
                    <SalesPrediction />
                </Suspense>
            )}

            {activeTab === 'order-predictions' && (
                <Suspense fallback={<div className="flex items-center justify-center p-40"><Loader2 className="animate-spin text-accent" size={32} /></div>}>
                    <OrderPredictions />
                </Suspense>
            )}
        </div>
    );
};

export default Summary;
