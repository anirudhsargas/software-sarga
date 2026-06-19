
import React, { Suspense } from 'react';
import { useSEO } from '../hooks/useSEO';
import { ArrowUpRight, ArrowDownRight, Brain, Sparkles, ShieldAlert, IndianRupee, TrendingUp, BarChart3, Activity, ClipboardList, Printer, Wallet, AlertTriangle, UserCheck, Users, Loader2 } from 'lucide-react';

const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));
import PageContainer from '../components/ui/PageContainer';

const forecastSkeletonHeights = ['38%', '54%', '46%', '70%', '58%', '82%', '64%'];

const OrderForecastWidgetSkeleton = () => (
    <section className="summary-section animate-fade-up" style={{ marginTop: 24 }}>
        <div className="summary-section__header">
            <div>
        <div className="skeleton" style={{ width: 220, height: 16, borderRadius: 4, background: 'var(--border)' }} />
                <div className="skeleton" style={{ width: 140, height: 12, borderRadius: 4, background: 'var(--border)', marginTop: 8 }} />
            </div>
        </div>
        <div style={{ display: 'flex', gap: 8, height: 180, alignItems: 'flex-end', padding: '16px 0' }}>
            {forecastSkeletonHeights.map((height, i) => (
                <div key={i} className="skeleton" style={{
                    flex: 1,
                    borderRadius: 4,
                    background: 'var(--border)',
                    height,
                    animation: 'pulse 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.1}s`,
                }} />
            ))}
        </div>
    </section>
);

const SummaryWidgets = React.memo(({ statsToday, statsOverall, navigate, fmt, fmtNum, getStatusColor, filters }) => {
    const lowStockItems = statsOverall?.low_stock || [];
    const topCustomers = statsOverall?.top_customers || [];
    const staffProd = statsOverall?.staff_productivity || [];

    return (
        <PageContainer>
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
                            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 6, fontSize: 13 }}>
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
                                <AlertTriangle size={22} style={{ color: lowStockItems.length > 0 ? 'var(--error)' : 'var(--text-muted)' }} />
                            </div>
                            {lowStockItems.length > 0 ? (
                                <div className="summary-data-list">
                                    {lowStockItems.map(item => (
                                        <div key={item.id} className="summary-data-list__row">
                                            <div>
                                                <span className="font-medium">{item.name}</span>
                                                {item.sku && <span className="text-xs muted" style={{ marginLeft: 6 }}>{item.sku}</span>}
                                            </div>
                                            <span style={{ color: Number(item.quantity) === 0 ? 'var(--error)' : 'var(--warning)', fontWeight: 700 }}>
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

                    {/* ─── Section 7: Order Forecast ─── */}
                    <OrderForecastWidget branchId={filters.branch_id} />
        </PageContainer>
    );
});

export default SummaryWidgets;
