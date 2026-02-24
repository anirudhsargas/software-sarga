import React, { useState, useEffect } from 'react';
import { Filter, Loader2, Building2, Activity, Printer, AlertTriangle, CheckCircle2, Clock, Wallet, Users, Package, TrendingUp, Layers, Sparkles, BarChart3, Target, Gauge, BadgePercent, UserCheck, LineChart, Megaphone, ClipboardList } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';

const Summary = () => {
    const [statsToday, setStatsToday] = useState(null);
    const [statsOverall, setStatsOverall] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ branch_id: '', startDate: '', endDate: '' });

    useEffect(() => {
        fetchBranches();
    }, []);

    useEffect(() => {
        fetchStatsSplit();
    }, [filters.branch_id, filters.startDate, filters.endDate]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches', {
                headers: auth.getAuthHeader()
            });
            setBranches(response.data);
        } catch (err) {
            console.error('Failed to fetch branches');
        }
    };

    // Fetch both today's stats and overall stats
    const fetchStatsSplit = async () => {
        setLoading(true);
        try {
            // Today's stats
            const paramsToday = new URLSearchParams();
            if (filters.branch_id) paramsToday.append('branch_id', filters.branch_id);
            const today = new Date().toISOString().split('T')[0];
            paramsToday.append('startDate', today);
            paramsToday.append('endDate', today);
            const responseToday = await api.get(`/stats/dashboard?${paramsToday.toString()}`, {
                headers: auth.getAuthHeader()
            });
            setStatsToday(responseToday.data);

            // Overall stats
            const paramsOverall = new URLSearchParams();
            if (filters.branch_id) paramsOverall.append('branch_id', filters.branch_id);
            const responseOverall = await api.get(`/stats/dashboard?${paramsOverall.toString()}`, {
                headers: auth.getAuthHeader()
            });
            setStatsOverall(responseOverall.data);
        } catch (err) {
            console.error('Failed to fetch dashboard stats');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value) => (typeof value === 'number' ? `₹${value.toLocaleString()}` : '—');
    const formatCount = (value) => (typeof value === 'number' ? value.toLocaleString() : '—');

    const selectedBranchName = filters.branch_id
        ? (branches.find(b => b.id.toString() === filters.branch_id.toString())?.name || 'Selected Branch')
        : 'All Branches';

    // KPIs for today
    const todayOverview = [
        {
            title: `Today's Sales (${selectedBranchName})`,
            value: formatCurrency(statsToday?.jobs?.total_sales),
            meta: 'Booked sales value'
        },
        {
            title: 'Total Jobs Today',
            value: formatCount(statsToday?.jobs?.total_count),
            meta: 'Active orders'
        },
        {
            title: 'Completed Jobs Today',
            value: formatCount(statsToday?.jobs?.completed_today),
            meta: 'Delivered today'
        },
        {
            title: 'Walk-in Customers',
            value: formatCount(statsToday?.customers?.walk_in_today),
            meta: 'Optional'
        }
    ];

    // KPIs for overall
    const overallKPIs = [
        {
            title: `Pending Payments (${selectedBranchName})`,
            value: formatCurrency(statsOverall?.jobs?.total_balance),
            meta: 'Receivables'
        },
        {
            title: `Jobs In Progress (${selectedBranchName})`,
            value: formatCount(statsOverall?.jobs?.in_progress),
            meta: 'Across shops'
        }
    ];

    const machineStatus = [
        { label: 'Konica 4065', value: formatCount(statsToday?.machines?.konica_4065_pages), note: 'Pages printed today' },
        { label: 'Konica 3070', value: formatCount(statsToday?.machines?.konica_3070_pages), note: 'Pages printed today' },
        { label: 'Offset Machine', value: formatCount(statsToday?.machines?.offset_jobs), note: 'Jobs running' },
        { label: 'Digital Die Cutting', value: formatCount(statsToday?.machines?.die_cutting_pending), note: 'Jobs pending' },
        { label: 'Lamination Machine', value: statsToday?.machines?.lamination_status || '—', note: 'Active / Idle' }
    ];

    const jobStatusList = [
        'Designing',
        'Printing',
        'Cutting',
        'Lamination',
        'Binding',
        'Ready for Delivery'
    ];

    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed': return 'var(--color-ok)';
            case 'Delivered': return 'var(--color-primary)';
            case 'Processing': return 'var(--color-warning)';
            case 'Pending': return 'var(--text-muted)';
            case 'Cancelled': return 'var(--error)';
            default: return 'var(--text-main)';
        }
    };

    const getPaymentStatusColor = (status) => {
        switch (status) {
            case 'Paid': return 'var(--color-ok)';
            case 'Partial': return 'var(--color-warning)';
            case 'Unpaid': return 'var(--error)';
            default: return 'var(--text-muted)';
        }
    };

    const popularServices = [
        'Offset Printing',
        'Digital Printing',
        'Photocopy',
        'ID Cards',
        'Mementos',
        'Photo Frames',
        'Spiral / Wire Binding',
        'Invitations & Wedding Cards'
    ];

    const salesByCategory = [
        { label: 'Offset Printing', value: formatCurrency(statsToday?.sales?.offset) },
        { label: 'Digital Printing', value: formatCurrency(statsToday?.sales?.digital) },
        { label: 'Photocopy', value: formatCurrency(statsToday?.sales?.photocopy) },
        { label: 'Mementos', value: formatCurrency(statsToday?.sales?.mementos) },
        { label: 'Photo Frames', value: formatCurrency(statsToday?.sales?.frames) },
        { label: 'ID Cards', value: formatCurrency(statsToday?.sales?.id_cards) },
        { label: 'Binding & Lamination', value: formatCurrency(statsToday?.sales?.binding) }
    ];

    const profitDrivers = [
        { label: 'Gross Profit by Category', value: formatCurrency(statsToday?.profit?.gross_by_category) },
        { label: 'Paper Cost', value: formatCurrency(statsToday?.costs?.paper) },
        { label: 'Ink / Consumables Cost', value: formatCurrency(statsToday?.costs?.consumables) },
        { label: 'Machine Cost per Job', value: formatCurrency(statsToday?.costs?.machine_per_job) },
        { label: 'Electricity Estimate', value: formatCurrency(statsToday?.costs?.electricity) },
        { label: 'Outsourcing Cost', value: formatCurrency(statsToday?.costs?.outsourcing) }
    ];

    const machineUtilization = [
        { label: 'Konica 4065 Prints', value: formatCount(statsToday?.machines?.konica_4065_pages) },
        { label: 'Konica 3070 Prints', value: formatCount(statsToday?.machines?.konica_3070_pages) },
        { label: 'Color vs B&W Ratio', value: statsToday?.machines?.color_ratio || '—' },
        { label: 'Idle Time', value: statsToday?.machines?.idle_time || '—' },
        { label: 'Paper Size Usage', value: statsToday?.machines?.paper_size_mix || '—' }
    ];

    const jobTypeAnalysis = [
        'Invitation Cards',
        'Bill Books / Receipts',
        'Notices',
        'Posters',
        'ID Cards',
        'Mementos',
        'Photo Frames',
        'Binding Jobs'
    ];

    const customerSegments = [
        'Schools',
        'Colleges',
        'Offices',
        'Shops',
        'Political',
        'Event Management',
        'Wedding Customers',
        'Photographers'
    ];

    const inventoryTracking = [
        'Paper stock by size & GSM',
        'Photo paper',
        'Lamination rolls',
        'Ink / toner',
        'Memento stock',
        'Frame models stock'
    ];

    const pricingTracking = [
        'Discounts given',
        'Manual price overrides',
        'Free jobs'
    ];

    const employeeTracking = [
        'Jobs handled per staff',
        'Design time per job',
        'Machine operator output'
    ];

    const seasonalityInsights = [
        'Monthly sales last 12 months',
        'Wedding season spikes',
        'School reopening demand',
        'Festival peaks'
    ];

    const marketingSignals = [
        'WhatsApp marketing response',
        'Google Maps reviews',
        'Repeat visit %',
        'Referral customers'
    ];

    if (loading && !statsToday && !statsOverall) {
        return (
            <div className="flex items-center justify-center p-40">
                <Loader2 className="animate-spin text-accent" size={48} />
            </div>
        );
    }

    return (
        <div className="summary-page">
            <div className="page-header summary-header">
                <div>
                    <h1 className="section-title">Admin Business Summary</h1>
                    <p className="section-subtitle">Daily operations, revenue, and production health in one place.</p>
                </div>
                <div className="row gap-md items-center summary-filters">
                    <div className="row gap-sm items-center flex-1">
                        <Building2 size={18} className="muted" />
                        <select
                            className="input-field"
                            style={{ flex: 1 }}
                            value={filters.branch_id}
                            onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
                        >
                            <option value="">All Branches</option>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Today's Business Overview</h2>
                        <p className="section-subtitle">Quick read on sales, jobs, and collections.</p>
                    </div>
                    <div className="summary-section__icon">
                        <TrendingUp size={22} />
                    </div>
                </div>
                <div className="summary-grid summary-grid--tiles">
                    {todayOverview.map((card) => (
                        <div key={card.title} className="summary-tile">
                            <div className="summary-tile__title">{card.title}</div>
                            <div className="summary-tile__value">{card.value}</div>
                            <div className="summary-tile__meta">{card.meta}</div>
                        </div>
                    ))}
                </div>
                <div className="summary-grid summary-grid--tiles" style={{ marginTop: 24 }}>
                    {overallKPIs.map((card) => (
                        <div key={card.title} className="summary-tile">
                            <div className="summary-tile__title">{card.title}</div>
                            <div className="summary-tile__value">{card.value}</div>
                            <div className="summary-tile__meta">{card.meta}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Sales Overview ({selectedBranchName})</h2>
                        <p className="section-subtitle">Branch performance and category revenue.</p>
                    </div>
                    <BarChart3 size={22} className="muted" />
                </div>
                <div className="summary-grid summary-grid--split">
                    <div className="summary-card">
                        <div className="summary-card__title">KPIs</div>
                        <div className="summary-kpis">
                            <div>
                                <div className="summary-kpis__label">Total Sales Today</div>
                                <div className="summary-kpis__value">{formatCurrency(statsToday?.jobs?.total_sales)}</div>
                            </div>
                            <div>
                                <div className="summary-kpis__label">Total Sales This Month</div>
                                <div className="summary-kpis__value">{formatCurrency(statsToday?.sales?.month_total)}</div>
                            </div>
                            <div>
                                <div className="summary-kpis__label">Number of Bills / Jobs</div>
                                <div className="summary-kpis__value">{formatCount(statsToday?.sales?.bill_count)}</div>
                            </div>
                            <div>
                                <div className="summary-kpis__label">Average Bill Value</div>
                                <div className="summary-kpis__value">{formatCurrency(statsToday?.sales?.avg_bill)}</div>
                            </div>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Sales by Category ({selectedBranchName})</div>
                        <div className="summary-data-list">
                            {salesByCategory.map((item) => (
                                <div key={item.label} className="summary-data-list__row">
                                    <span>{item.label}</span>
                                    <span className="summary-data-list__value">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="summary-note">
                    <Target size={18} />
                    <span>Action: Push high-margin services (mementos, frames, design work).</span>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Profit & Cost Tracking</h2>
                        <p className="section-subtitle">Visibility into margin and real profitability.</p>
                    </div>
                    <BadgePercent size={22} className="muted" />
                </div>
                <div className="summary-grid summary-grid--split">
                    <div className="summary-card">
                        <div className="summary-card__title">KPIs</div>
                        <div className="summary-data-list">
                            {profitDrivers.map((item) => (
                                <div key={item.label} className="summary-data-list__row">
                                    <span>{item.label}</span>
                                    <span className="summary-data-list__value">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Analysis</div>
                        <ul className="summary-bullets">
                            <li>Identify big jobs with low profit.</li>
                            <li>Spot services with best margins.</li>
                            <li>Raise minimum charges for low-margin jobs.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Machine Utilization</h2>
                        <p className="section-subtitle">Balance workload and plan maintenance.</p>
                    </div>
                    <Gauge size={22} className="muted" />
                </div>
                <div className="summary-grid summary-grid--split">
                    <div className="summary-card">
                        <div className="summary-card__title">KPIs</div>
                        <div className="summary-data-list">
                            {machineUtilization.map((item) => (
                                <div key={item.label} className="summary-data-list__row">
                                    <span>{item.label}</span>
                                    <span className="summary-data-list__value">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Action</div>
                        <ul className="summary-bullets">
                            <li>Route jobs to reduce idle time.</li>
                            <li>Plan maintenance before peak load.</li>
                            <li>Use data for machine upgrade decisions.</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Job Type Analysis</h2>
                        <p className="section-subtitle">Find the most frequent and profitable jobs.</p>
                    </div>
                    <ClipboardList size={22} className="muted" />
                </div>
                <div className="summary-tags">
                    {jobTypeAnalysis.map((job) => (
                        <span key={job} className="summary-tag">{job}</span>
                    ))}
                </div>

                {/* Work Status & Recent Orders */}
                <div className="summary-grid summary-grid--split">
                    <div className="summary-card">
                        <div className="row space-between items-center mb-16">
                            <h3 className="text-lg font-bold row items-center gap-sm">
                                <Activity size={20} className="text-primary" />
                                Work Status
                            </h3>
                        </div>
                        <div className="summary-grid summary-grid--inventory">
                            <div className="row space-between p-12 border-all rounded bg-surface-lowest">
                                <span className="font-medium">Pending / Queue</span>
                                <span className="font-bold">{formatCount(statsOverall?.status_counts?.Pending || 0)}</span>
                            </div>
                            <div className="row space-between p-12 border-all rounded bg-surface-lowest">
                                <span className="font-medium text-warning">Processing</span>
                                <span className="font-bold text-warning">{formatCount(statsOverall?.status_counts?.Processing || 0)}</span>
                            </div>
                            <div className="row space-between p-12 border-all rounded bg-surface-lowest">
                                <span className="font-medium text-ok">Completed</span>
                                <span className="font-bold text-ok">{formatCount(statsOverall?.status_counts?.Completed || 0)}</span>
                            </div>
                            <div className="row space-between p-12 border-all rounded bg-surface-lowest">
                                <span className="font-medium text-primary">Delivered</span>
                                <span className="font-bold text-primary">{formatCount(statsOverall?.status_counts?.Delivered || 0)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="row space-between items-center mb-16">
                            <h3 className="text-lg font-bold row items-center gap-sm">
                                <ClipboardList size={20} className="text-primary" />
                                Recent Orders
                            </h3>
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
                                    {statsToday?.recent_jobs?.length > 0 ? (
                                        statsToday.recent_jobs.map(job => (
                                            <tr key={job.id}>
                                                <td className="font-medium">{job.job_number}</td>
                                                <td>
                                                    <div className="font-medium">{job.customer_name}</div>
                                                    <div className="text-xs muted">{job.job_name}</div>
                                                </td>
                                                <td>
                                                    <span className="badge" style={{
                                                        backgroundColor: `${getStatusColor(job.status)}20`,
                                                        color: getStatusColor(job.status),
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: '600'
                                                    }}>
                                                        {job.status}
                                                    </span>
                                                </td>
                                                <td className="text-right font-bold">₹{Number(job.total_amount).toLocaleString()}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="text-center p-16 muted">No recent orders found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="summary-note">
                    <Target size={18} />
                    <span>Action: Offer combo bundles and standardized pricing for fast-selling jobs.</span>
                </div>
            </section>

            <div className="summary-grid summary-grid--split">
                <section className="summary-section">
                    <div className="summary-section__header">
                        <div>
                            <h2 className="section-title">Machine Status & Usage</h2>
                            <p className="section-subtitle">Track production throughput and downtime.</p>
                        </div>
                        <Printer size={22} className="muted" />
                    </div>
                    <div className="summary-list">
                        {machineStatus.map((machine) => (
                            <div key={machine.label} className="summary-list__item">
                                <div>
                                    <div className="summary-list__title">{machine.label}</div>
                                    <div className="summary-list__meta">{machine.note}</div>
                                </div>
                                <div className="summary-list__value">{machine.value}</div>
                            </div>
                        ))}
                        <div className="summary-alert">
                            <AlertTriangle size={18} />
                            <div>
                                <div className="summary-alert__title">Machine Down / Maintenance</div>
                                <div className="summary-alert__meta">No active alerts</div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="summary-section">
                    <div className="summary-section__header">
                        <div>
                            <h2 className="section-title">Job Order Management</h2>
                            <p className="section-subtitle">Spot urgent and overdue jobs quickly.</p>
                        </div>
                        <Activity size={22} className="muted" />
                    </div>
                    <div className="summary-metrics">
                        <div>
                            <div className="summary-metrics__label">New Orders Today</div>
                            <div className="summary-metrics__value">{formatCount(statsToday?.jobs?.new_today)}</div>
                        </div>
                        <div>
                            <div className="summary-metrics__label">Urgent Jobs (Today delivery)</div>
                            <div className="summary-metrics__value">{formatCount(statsToday?.jobs?.urgent_today)}</div>
                        </div>
                        <div>
                            <div className="summary-metrics__label">Overdue Jobs</div>
                            <div className="summary-metrics__value text-danger">{formatCount(statsOverall?.jobs?.overdue)}</div>
                        </div>
                    </div>
                    <div className="summary-tags">
                        {jobStatusList.map((status) => (
                            <span key={status} className="summary-tag">{status}</span>
                        ))}
                    </div>
                </section>
            </div>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Customer Intelligence</h2>
                        <p className="section-subtitle">Retention and segmentation insights.</p>
                    </div>
                    <UserCheck size={22} className="muted" />
                </div>
                <div className="summary-grid summary-grid--split">
                    <div className="summary-card">
                        <div className="summary-card__title">Repeat Customers</div>
                        <ul className="summary-bullets">
                            <li>Top 50 customers by sales</li>
                            <li>Visit frequency</li>
                            <li>Last visit date</li>
                        </ul>
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Customer Segments</div>
                        <div className="summary-tags">
                            {customerSegments.map((segment) => (
                                <span key={segment} className="summary-tag summary-tag--accent">{segment}</span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="summary-note">
                    <Target size={18} />
                    <span>Action: Target offers per segment (e.g. schools for ID cards, bill books, certificates).</span>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Stock & Inventory Dashboard</h2>
                        <p className="section-subtitle">Fast moving items, dead stock, and alerts.</p>
                    </div>
                    <Package size={22} className="muted" />
                </div>
                <div className="summary-card">
                    <ul className="summary-bullets">
                        {inventoryTracking.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
                <div className="summary-note">
                    <Target size={18} />
                    <span>Action: Auto reorder alerts and clear dead stock with offers.</span>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Pricing & Discount Analysis</h2>
                        <p className="section-subtitle">Control discount leakage and manual overrides.</p>
                    </div>
                    <BadgePercent size={22} className="muted" />
                </div>
                <div className="summary-card">
                    <ul className="summary-bullets">
                        {pricingTracking.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
                <div className="summary-note">
                    <Target size={18} />
                    <span>Action: Set minimum prices and reduce free jobs.</span>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Employee Productivity</h2>
                        <p className="section-subtitle">Spot bottlenecks and training needs.</p>
                    </div>
                    <Users size={22} className="muted" />
                </div>
                <div className="summary-card">
                    <ul className="summary-bullets">
                        {employeeTracking.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Advanced Analytics</h2>
                        <p className="section-subtitle">Seasonality, conversions, and growth levers.</p>
                    </div>
                    <LineChart size={22} className="muted" />
                </div>
                <div className="summary-grid summary-grid--split">
                    <div className="summary-card">
                        <div className="summary-card__title">Seasonality</div>
                        <ul className="summary-bullets">
                            {seasonalityInsights.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Conversion Tracking</div>
                        <ul className="summary-bullets">
                            <li>Enquiry vs Order conversion</li>
                            <li>Walk-ins converted to bills</li>
                            <li>Upsell effectiveness</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Marketing & Sales Growth</h2>
                        <p className="section-subtitle">Lead signals and demand growth ideas.</p>
                    </div>
                    <Megaphone size={22} className="muted" />
                </div>
                <div className="summary-grid summary-grid--split">
                    <div className="summary-card">
                        <div className="summary-card__title">Signals to Track</div>
                        <ul className="summary-bullets">
                            {marketingSignals.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Action Ideas</div>
                        <ul className="summary-bullets">
                            <li>Google Business Profile optimization</li>
                            <li>Wedding package bundles</li>
                            <li>Corporate rate cards</li>
                            <li>School annual contracts</li>
                            <li>Frame + print combo</li>
                            <li>Bulk discounts with minimum order quantity</li>
                            <li>Festival poster templates</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Stock & Inventory</h2>
                        <p className="section-subtitle">Critical materials across both shops.</p>
                    </div>
                    <Package size={22} className="muted" />
                </div>
                <div className="summary-grid summary-grid--inventory">
                    <div className="summary-card">
                        <div className="summary-card__title">Paper Stock</div>
                        <ul className="summary-bullets">
                            <li>A4 70gsm / 80gsm</li>
                            <li>Art Paper 130 / 170 / 250 / 300 gsm</li>
                            <li>Sticker Paper</li>
                            <li>Visiting Card Paper</li>
                            <li>Invitation Card Paper</li>
                        </ul>
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Consumables</div>
                        <ul className="summary-bullets">
                            <li>Toner Levels (Konica 4065, 3070)</li>
                            <li>Ink (Offset)</li>
                            <li>Lamination Rolls</li>
                            <li>Spiral / Wire Binding</li>
                            <li>ID Card Sheets</li>
                            <li>Photo Frame Stock</li>
                            <li>Memento Stock</li>
                        </ul>
                    </div>
                    <div className="summary-card summary-card--alert">
                        <div className="summary-card__title">Low Stock Alerts</div>
                        <div className="summary-card__meta">No alerts configured</div>
                    </div>
                </div>
            </section>

            <div className="summary-grid summary-grid--split">
                <section className="summary-section">
                    <div className="summary-section__header">
                        <div>
                            <h2 className="section-title">Payments & Accounts</h2>
                            <p className="section-subtitle">Cash flow and credit risk.</p>
                        </div>
                        <Wallet size={22} className="muted" />
                    </div>
                    <div className="summary-metrics">
                        <div>
                            <div className="summary-metrics__label">Today Cash Collection</div>
                            <div className="summary-metrics__value">{formatCurrency(statsToday?.payments?.cash_today)}</div>
                        </div>
                        <div>
                            <div className="summary-metrics__label">UPI Collection</div>
                            <div className="summary-metrics__value">{formatCurrency(statsToday?.payments?.upi_today)}</div>
                        </div>
                        <div>
                            <div className="summary-metrics__label">Card Collection</div>
                            <div className="summary-metrics__value">{formatCurrency(statsToday?.payments?.card_today)}</div>
                        </div>
                        <div>
                            <div className="summary-metrics__label">Credit Outstanding</div>
                            <div className="summary-metrics__value text-danger">{formatCurrency(statsToday?.payments?.credit_outstanding)}</div>
                        </div>
                        <div>
                            <div className="summary-metrics__label">Advance Received</div>
                            <div className="summary-metrics__value">{formatCurrency(statsToday?.jobs?.total_collected)}</div>
                        </div>
                        <div>
                            <div className="summary-metrics__label">Pending Bills</div>
                            <div className="summary-metrics__value">{formatCurrency(statsToday?.payments?.pending_bills)}</div>
                        </div>
                    </div>
                </section>

                <section className="summary-section">
                    <div className="summary-section__header">
                        <div>
                            <h2 className="section-title">Customer Insights</h2>
                            <p className="section-subtitle">Retention and high value clients.</p>
                        </div>
                        <Users size={22} className="muted" />
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Highlights</div>
                        <ul className="summary-bullets">
                            <li>Top Customers This Month</li>
                            <li>Repeat Customers</li>
                            <li>Corporate / School / Office Clients</li>
                            <li>Bulk Order Customers</li>
                            <li>Customer Contact List (WhatsApp follow-ups)</li>
                        </ul>
                    </div>
                </section>
            </div>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Branch Comparison (Perambra vs Meppayur)</h2>
                        <p className="section-subtitle">Side-by-side performance snapshot.</p>
                    </div>
                    <Layers size={22} className="muted" />
                </div>
                <div className="summary-grid summary-grid--comparison">
                    <div className="summary-card">
                        <div className="summary-card__title">Perambra</div>
                        <div className="summary-card__meta">Sales, Jobs, Profit, Utilization, Stock</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-card__title">Meppayur</div>
                        <div className="summary-card__meta">Sales, Jobs, Profit, Utilization, Stock</div>
                    </div>
                </div>
            </section>

            <section className="summary-section">
                <div className="summary-section__header">
                    <div>
                        <h2 className="section-title">Popular Services</h2>
                        <p className="section-subtitle">What drives revenue right now.</p>
                    </div>
                    <Sparkles size={22} className="muted" />
                </div>
                <div className="summary-tags">
                    {popularServices.map((service) => (
                        <span key={service} className="summary-tag summary-tag--accent">{service}</span>
                    ))}
                </div>
            </section>

            <div className="summary-grid summary-grid--split">
                <section className="summary-section">
                    <div className="summary-section__header">
                        <div>
                            <h2 className="section-title">Admin / Owner Only</h2>
                            <p className="section-subtitle">Long-range visibility for leadership.</p>
                        </div>
                        <CheckCircle2 size={22} className="muted" />
                    </div>
                    <div className="summary-card">
                        <ul className="summary-bullets">
                            <li>Monthly Sales Trend</li>
                            <li>Profit vs Expense</li>
                            <li>Paper Cost vs Job Revenue</li>
                            <li>Staff Productivity (Jobs handled)</li>
                            <li>Pending Vendor Payments</li>
                            <li>Toner & Paper Purchase History</li>
                        </ul>
                    </div>
                </section>

                <section className="summary-section">
                    <div className="summary-section__header">
                        <div>
                            <h2 className="section-title">Smart Alerts</h2>
                            <p className="section-subtitle">Automated warnings for action.</p>
                        </div>
                        <Clock size={22} className="muted" />
                    </div>
                    <div className="summary-alerts">
                        <div className="summary-alerts__item">
                            <AlertTriangle size={16} /> Low Paper Stock
                        </div>
                        <div className="summary-alerts__item">
                            <AlertTriangle size={16} /> Low Toner
                        </div>
                        <div className="summary-alerts__item">
                            <AlertTriangle size={16} /> Big Customer Pending Payment
                        </div>
                        <div className="summary-alerts__item">
                            <AlertTriangle size={16} /> Machine Service Due
                        </div>
                        <div className="summary-alerts__item">
                            <AlertTriangle size={16} /> High Credit Outstanding
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Summary;
