import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Building2, TrendingUp, Wallet, IndianRupee, AlertTriangle, Users, Package, ClipboardList, BarChart3, ArrowUpRight, ArrowDownRight, Brain, Sparkles, ShieldAlert, ShoppingCart, Activity, Printer, UserCheck, RefreshCw, Plus } from 'lucide-react';

import api from '../services/api';
import { formatCurrency as formatCurrencyShared } from '../constants';
import OrderForecastWidget from '../components/OrderForecastWidget';


import BranchSelect from '../components/ui/BranchSelect';
const AIMonitoring = React.lazy(() => import('./AIMonitoring'));
const OrderPredictions = React.lazy(() => import('./OrderPredictions'));

const KpiCard = React.memo(({ title, value, subtitle, icon: Icon, color, trend }) => (
  <div className="kpi-card">
    <div className="kpi-card__header">
      <span className="kpi-card__title">{title}</span>
      <Icon size={18} className="kpi-card__icon" style={{ color: color || 'var(--muted)' }} />
    </div>
    <div className="kpi-card__value">{value}</div>
    {subtitle && <div className="kpi-card__subtitle">{subtitle}</div>}
    {trend && (
      <div className="kpi-card__trend" style={{ color: trend >= 0 ? 'var(--success)' : 'var(--error)' }}>
        {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        <span>{Math.abs(trend)}%</span>
      </div>
    )}
  </div>
));

const EmptyState = React.memo(({ icon: Icon, title, message, actions }) => (
  <div className="empty-state">
    <Icon size={32} className="empty-state__icon" />
    <h3 className="empty-state__title">{title}</h3>
    <p className="empty-state__message">{message}</p>
    {actions && <div className="empty-state__actions">{actions}</div>}
  </div>
));

const Summary = () => {
  useSEO('Summary');

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [statsToday, setStatsToday] = useState(null);
  const [statsOverall, setStatsOverall] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ branch_id: '' });

  useEffect(() => { fetchBranches(); }, []);

  useEffect(() => {
    fetchStatsSplit();
    const handler = () => fetchStatsSplit();
    window.addEventListener('paymentRecorded', handler);
    return () => window.removeEventListener('paymentRecorded', handler);
  }, [filters.branch_id]);

  const fetchBranches = async () => {
    try { setBranches((await api.get('/branches')).data); } catch { /* ignore */ }
  };

  const fetchStatsSplit = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.branch_id) params.append('branch_id', filters.branch_id);
      const today = new Date().toISOString().split('T')[0];
      const todayParams = new URLSearchParams(params);
      todayParams.append('startDate', today);
      todayParams.append('endDate', today);
      const [todayRes, overallRes] = await Promise.all([
        api.get(`/stats/dashboard?${todayParams}`),
        api.get(`/stats/dashboard?${params}`)
      ]);
      setStatsToday(todayRes.data);
      setStatsOverall(overallRes.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters.branch_id]);

  const fmt = (v) => (typeof v === 'number' ? formatCurrencyShared(v, true) : '—');
  const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString() : '—');

  const branchName = useMemo(() => {
    if (!filters.branch_id) return 'All Branches';
    return branches.find(b => b.id.toString() === filters.branch_id.toString())?.name || 'Selected Branch';
  }, [filters.branch_id, branches]);

  const statusColor = useCallback((status) => {
    const map = { Completed: 'var(--color-success)', Delivered: 'var(--color-info)', Processing: 'var(--color-warning)', Pending: 'var(--color-textMuted)', 'Approval Pending': 'var(--color-warning)', Cancelled: 'var(--color-danger)' };
    return map[status] || 'var(--color-surfaceHover)';
  }, []);

  const lowStockItems = useMemo(() => statsOverall?.low_stock || [], [statsOverall]);
  const topCustomers = useMemo(() => statsOverall?.top_customers || [], [statsOverall]);
  const staffProd = useMemo(() => statsOverall?.staff_productivity || [], [statsOverall]);

  const tabs = useMemo(() => [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'ai-monitoring', label: 'AI Monitoring', icon: ShieldAlert },
    { id: 'order-predictions', label: 'Predictions', icon: Sparkles },
  ], []);

  if (loading && !statsToday && !statsOverall) {
    return (
      <div className="summary-page">
        <div className="summary-loading">
          <Loader2 size={24} className="animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-page">
      <div className="summary-topbar">
        <h1 className="summary-topbar__title">Business Summary</h1>
        <div className="summary-topbar__right">
          <div className="branch-selector">
            <Building2 size={16} />
            <BranchSelect value={filters.branch_id} onChange={(e) => setFilters(p => ({ ...p, branch_id: e.target.value }))}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </BranchSelect>
          </div>
          <span className="summary-topbar__date">{branchName} — {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      <div className="summary-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`summary-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* ROW 1: KPI Cards */}
          <div className="kpi-grid">
            <KpiCard title="Sales Today" value={fmt(statsToday?.jobs?.total_sales)} subtitle={`${fmtNum(statsToday?.jobs?.total_count)} jobs`} icon={TrendingUp} color='var(--color-success)' />
            <KpiCard title="Collections" value={fmt(statsToday?.payments?.total_collected_today)} subtitle={`Cash ${fmt(statsToday?.payments?.cash_today)} · UPI ${fmt(statsToday?.payments?.upi_today)}`} icon={Wallet} color='var(--color-info)' />
            <KpiCard title="Expenses" value={fmt(statsToday?.expenses?.today)} subtitle={`Month: ${fmt(statsOverall?.expenses?.month)}`} icon={IndianRupee} color='var(--color-danger)' />
            <KpiCard title="Outstanding" value={fmt(statsOverall?.jobs?.total_balance)} subtitle="Pending receivables" icon={AlertTriangle} color='var(--color-warning)' />
          </div>

          {/* ROW 2: Secondary KPIs */}
          <div className="kpi-grid">
            <KpiCard title="Orders Today" value={`${fmtNum(statsToday?.jobs?.new_today)} / ${fmtNum(statsToday?.jobs?.completed_today)}`} subtitle="New / Completed" icon={ClipboardList} />
            <KpiCard title="In Progress" value={fmtNum(statsOverall?.jobs?.in_progress)} subtitle="Across all stages" icon={Activity} color='var(--color-info)' />
            <KpiCard title="Inventory Value" value={fmt(statsOverall?.inventory?.total_value)} subtitle={`${fmtNum(statsOverall?.inventory?.total_items)} items`} icon={Package} color='var(--color-info)' />
            <KpiCard title="Urgent / Overdue" value={`${fmtNum(statsToday?.jobs?.urgent_today)} / ${fmtNum(statsOverall?.jobs?.overdue)}`} subtitle="Needs attention" icon={ShieldAlert} color='var(--color-danger)' />
          </div>

          {/* Fraud Alert Banner */}
          {statsToday?.monitoring_stats?.active_alerts > 0 && (
            <div className="alert-banner alert-banner--error">
              <ShieldAlert size={20} />
              <div className="alert-banner__content">
                <strong>{statsToday.monitoring_stats.active_alerts} active fraud alerts</strong> — requires immediate attention
              </div>
              <button className="btn btn-sm btn-error" onClick={() => navigate('/dashboard/ai-monitoring')}>Review</button>
            </div>
          )}

          {/* ROW 3: Charts + Work Status */}
          <div className="summary-grid-2col">
            <div className="summary-section-card">
              <div className="summary-section-card__header">
                <h3>Sales Breakdown</h3>
                <BarChart3 size={16} />
              </div>
              {statsToday?.sales ? (
                <div className="data-list">
                  {[
                    { label: 'Offset Printing', value: statsToday.sales.offset },
                    { label: 'Digital Printing', value: statsToday.sales.digital },
                    { label: 'Photocopy', value: statsToday.sales.photocopy },
                    { label: 'Mementos', value: statsToday.sales.mementos },
                    { label: 'Photo Frames', value: statsToday.sales.frames },
                    { label: 'ID Cards', value: statsToday.sales.id_cards },
                    { label: 'Binding & Lamination', value: statsToday.sales.binding },
                  ].map(item => (
                    <div key={item.label} className="data-list__row">
                      <span>{item.label}</span>
                      <span className="data-list__value">{fmt(item.value)}</span>
                    </div>
                  ))}
                  <div className="data-list__total">
                    <span>Month Total</span>
                    <span className="font-bold">{fmt(statsToday.sales.month_total)}</span>
                  </div>
                </div>
              ) : (
                <EmptyState icon={BarChart3} title="No Sales Data" message="Sales data will appear once orders are created." />
              )}
            </div>

            <div className="summary-section-card">
              <div className="summary-section-card__header">
                <h3>Work Status</h3>
                <Activity size={16} />
              </div>
              {statsOverall?.status_counts ? (
                <div className="status-list">
                  {Object.entries(statsOverall.status_counts).filter(([s]) => s !== 'Cancelled').map(([status, count]) => (
                    <div key={status} className="status-list__item">
                      <span className="status-list__dot" style={{ backgroundColor: statusColor(status) }} />
                      <span>{status}</span>
                      <span className="status-list__count">{fmtNum(count)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Activity} title="No Work Status" message="Work status will appear once jobs are created." />
              )}
            </div>
          </div>

          {/* ROW 4: Recent Orders + Low Stock */}
          <div className="summary-grid-2col">
            <div className="summary-section-card">
              <div className="summary-section-card__header">
                <h3>Recent Orders</h3>
                <ClipboardList size={16} />
              </div>
              {statsToday?.recent_jobs?.length > 0 ? (
                <div className="recent-orders">
                  {statsToday.recent_jobs.slice(0, 5).map(job => (
                    <div key={job.id} className="recent-orders__item">
                      <div className="recent-orders__info">
                        <span className="recent-orders__job">#{job.job_number}</span>
                        <span className="recent-orders__customer">{job.customer_name}</span>
                      </div>
                      <span className="badge" style={{ backgroundColor: `${statusColor(job.status)}20`, color: statusColor(job.status) }}>{job.status}</span>
                      <span className="recent-orders__amount">₹{Number(job.total_amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ClipboardList} title="No Orders" message="Recent orders will appear here." actions={<button className="btn btn-sm btn-primary" onClick={() => navigate('/dashboard/sales/orders')}><Plus size={14} /> New Order</button>} />
              )}
            </div>

            <div className="summary-section-card">
              <div className="summary-section-card__header">
                <h3>Low Stock</h3>
                <AlertTriangle size={16} />
              </div>
              {lowStockItems.length > 0 ? (
                <div className="data-list">
                  {lowStockItems.slice(0, 5).map(item => (
                    <div key={item.id} className="data-list__row">
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
                <EmptyState icon={Package} title="All Stock Healthy" message="No low stock items at this time." />
              )}
            </div>
          </div>

          {/* ROW 5: Order Forecast */}
          <OrderForecastWidget branchId={filters.branch_id} />
        </>
      )}

      {activeTab === 'ai-monitoring' && (
        <Suspense fallback={<div className="suspense-loader"><Loader2 className="animate-spin" size={24} /></div>}>
          <AIMonitoring />
        </Suspense>
      )}

      {activeTab === 'order-predictions' && (
        <Suspense fallback={<div className="suspense-loader"><Loader2 className="animate-spin" size={24} /></div>}>
          <OrderPredictions />
        </Suspense>
      )}
    </div>
  );
};

export default React.memo(Summary);
