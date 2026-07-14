import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Building2, TrendingUp, Wallet, IndianRupee, AlertTriangle, Users, Package, ClipboardList, BarChart3, ArrowUpRight, ArrowDownRight, Brain, Sparkles, ShieldAlert, ShoppingCart, Activity, Printer, UserCheck, RefreshCw, Plus } from 'lucide-react';

import api from '../services/api';
import { formatCurrency as formatCurrencyShared } from '../constants';
import { useBranches } from '../contexts/BranchContext';
import LazyViewport from '../components/LazyViewport';

const OrderForecastWidget = React.lazy(() => import('../components/OrderForecastWidget'));

import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
const AIMonitoring = React.lazy(() => import('./AIMonitoring'));
const OrderPredictions = React.lazy(() => import('./OrderPredictions'));

// Cache variable outside component for immediate render on revisit
let cachedStats = null;

const KpiCard = React.memo(({ title, value, subtitle, icon: _Icon, color, trend }) => (
  <div className="kpi-card">
    <div className="kpi-card__header">
      <span className="kpi-card__title">{title}</span>
      {_Icon && <_Icon size={18} className={`kpi-card__icon ${color ? `kpi-card__icon--${color.replace('var(--', '').replace(')', '')}` : ''}`} />}
    </div>
    <div className="kpi-card__value">{value}</div>
    {subtitle && <div className="kpi-card__subtitle">{subtitle}</div>}
    {trend && (
      <div className={`kpi-card__trend ${trend >= 0 ? 'kpi-card__trend--up' : 'kpi-card__trend--down'}`}>
        {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        <span>{Math.abs(trend)}%</span>
      </div>
    )}
  </div>
));

const EmptyState = React.memo(({ icon: _Icon, title, message, actions }) => (
  <div className="empty-state">
    {_Icon && <_Icon size={32} className="empty-state__icon" />}
    <h3 className="empty-state__title">{title}</h3>
    <p className="empty-state__message">{message}</p>
    {actions && <div className="empty-state__actions">{actions}</div>}
  </div>
));

const Summary = () => {
  usePageTitle('Dashboard');

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(cachedStats);
  const { branches, selectedBranchId, selectBranch } = useBranches();
  const [loading, setLoading] = useState(!cachedStats);
  const [error, setError] = useState(false);
  const [showOutstandingDetail, setShowOutstandingDetail] = useState(false);

  const fetchStats = useCallback(async (signal, isRefresh = false) => {
    if (isRefresh || !cachedStats) {
      setLoading(true);
    }
    setError(false);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId) params.append('branch_id', selectedBranchId);

      const res = await api.get(`/stats/dashboard?${params}`, { signal, timeout: 10000 });
      if (res?.data) {
        setStats(res.data);
        cachedStats = res.data;
      }
      setError(false);
    } catch (err) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
        console.error('Failed to load dashboard stats:', err);
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal);
    const handler = () => {
      const freshController = new AbortController();
      fetchStats(freshController.signal, true);
    };
    window.addEventListener('paymentRecorded', handler);
    return () => {
      controller.abort();
      window.removeEventListener('paymentRecorded', handler);
    };
  }, [selectedBranchId, fetchStats]);

  const handleRetry = useCallback(() => {
    const controller = new AbortController();
    fetchStats(controller.signal, true);
  }, [fetchStats]);

  const fmt = (v) => (typeof v === 'number' ? formatCurrencyShared(v, true) : '—');
  const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString() : '—');

  const branchName = useMemo(() => {
    if (!selectedBranchId) return 'All Branches';
    return branches.find(b => b.id.toString() === selectedBranchId.toString())?.name || 'Selected Branch';
  }, [selectedBranchId, branches]);

  const statusColor = useCallback((status) => {
    const map = { Completed: 'var(--success)', Delivered: 'var(--accent)', Processing: 'var(--warning)', Pending: 'var(--muted-foreground)', 'Approval Pending': 'var(--warning)', Cancelled: 'var(--destructive)' };
    return map[status] || 'var(--secondary)';
  }, []);

  const lowStockItems = useMemo(() => stats?.low_stock || [], [stats]);
  const _topCustomers = useMemo(() => stats?.top_customers || [], [stats]);
  const _staffProd = useMemo(() => stats?.staff_productivity || [], [stats]);

  const tabs = useMemo(() => [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'ai-monitoring', label: 'AI Monitoring', icon: ShieldAlert },
    { id: 'order-predictions', label: 'Predictions', icon: Sparkles },
  ], []);

  if (error && !stats) {
    return (
      <PageContainer>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '80px 24px', textAlign: 'center', background: 'var(--card)',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', margin: '40px auto',
          maxWidth: '500px', gap: '16px', boxShadow: 'var(--shadow-sm)'
        }}>
          <AlertTriangle size={48} style={{ color: 'var(--danger)' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Dashboard failed to load
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: '1.5' }}>
            There was an error communicating with the server. Please check your connection and try again.
          </p>
          <button
            onClick={handleRetry}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </PageContainer>
    );
  }

  if (loading && !stats) {
    return (
      <PageContainer>
        {/* Skeleton Topbar */}
        <div className="summary-topbar">
          <div className="skeleton-box" style={{ height: 32, width: 220, borderRadius: 8 }}></div>
          <div className="summary-topbar__right">
            <div className="skeleton-box" style={{ height: 36, width: 140, borderRadius: 8 }}></div>
          </div>
        </div>

        {/* Skeleton Tabs */}
        <div className="summary-tabs">
          <div className="skeleton-box" style={{ height: 34, width: '100%', borderRadius: 10 }}></div>
        </div>

        {/* Skeleton KPI Grid */}
        <div className="kpi-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card">
              <div className="kpi-card__header" style={{ marginBottom: 12 }}>
                <div className="skeleton-box" style={{ height: 14, width: '60%' }}></div>
                <div className="skeleton-box" style={{ height: 18, width: 18, borderRadius: '50%' }}></div>
              </div>
              <div className="skeleton-box" style={{ height: 28, width: '80%', marginBottom: 12 }}></div>
              <div className="skeleton-box" style={{ height: 12, width: '50%' }}></div>
            </div>
          ))}
        </div>

        {/* Skeleton KPI Grid 2 */}
        <div className="kpi-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card">
              <div className="kpi-card__header" style={{ marginBottom: 12 }}>
                <div className="skeleton-box" style={{ height: 14, width: '60%' }}></div>
                <div className="skeleton-box" style={{ height: 18, width: 18, borderRadius: '50%' }}></div>
              </div>
              <div className="skeleton-box" style={{ height: 28, width: '80%', marginBottom: 12 }}></div>
              <div className="skeleton-box" style={{ height: 12, width: '50%' }}></div>
            </div>
          ))}
        </div>

        {/* Skeleton Charts/Lists */}
        <div className="summary-grid-2col">
          <div className="summary-section-card">
            <div className="summary-section-card__header">
              <div className="skeleton-box" style={{ height: 18, width: 120 }}></div>
              <div className="skeleton-box" style={{ height: 16, width: 16 }}></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                  <div className="skeleton-box" style={{ height: 14, width: 100 }}></div>
                  <div className="skeleton-box" style={{ height: 14, width: 60 }}></div>
                </div>
              ))}
            </div>
          </div>
          <div className="summary-section-card">
            <div className="summary-section-card__header">
              <div className="skeleton-box" style={{ height: 18, width: 120 }}></div>
              <div className="skeleton-box" style={{ height: 16, width: 16 }}></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <div className="skeleton-box" style={{ height: 8, width: 8, borderRadius: '50%' }}></div>
                  <div className="skeleton-box" style={{ height: 14, width: 120 }}></div>
                  <div style={{ flex: 1 }}></div>
                  <div className="skeleton-box" style={{ height: 14, width: 30 }}></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="summary-topbar">
        <h1 className="summary-topbar__title">Business Summary</h1>
        <div className="summary-topbar__right">
          <div className="branch-selector">
            <Building2 size={16} />
            <BranchSelect value={selectedBranchId} onChange={(e) => selectBranch(e.target.value)}>
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
            <KpiCard title="Sales Today" value={fmt(stats?.jobs?.total_sales_today)} subtitle={`${fmtNum(stats?.jobs?.new_today)} jobs`} icon={TrendingUp} color='var(--success)' />
            <KpiCard title="Collections" value={fmt(stats?.payments?.total_collected_today)} subtitle={`Cash ${fmt(stats?.payments?.cash_today)} · UPI ${fmt(stats?.payments?.upi_today)}`} icon={Wallet} color='var(--accent)' />
            <KpiCard title="Expenses" value={fmt(stats?.expenses?.today)} subtitle={`Month: ${fmt(stats?.expenses?.month)}`} icon={IndianRupee} color='var(--destructive)' />
            <div style={{ cursor: 'pointer' }} onClick={() => setShowOutstandingDetail(v => !v)} title="Click to see breakdown">
              <KpiCard title="Outstanding" value={fmt(stats?.jobs?.total_balance)} subtitle={showOutstandingDetail ? 'Hide breakdown' : 'Click for details'} icon={AlertTriangle} color='var(--warning)' />
            </div>
          </div>

          {/* ROW 2: Secondary KPIs */}
          <div className="kpi-grid">
            <KpiCard title="Orders Today" value={`${fmtNum(stats?.jobs?.new_today)} / ${fmtNum(stats?.jobs?.completed_today)}`} subtitle="New / Completed" icon={ClipboardList} />
            <KpiCard title="In Progress" value={fmtNum(stats?.jobs?.in_progress)} subtitle="Across all stages" icon={Activity} color='var(--accent)' />
            <KpiCard title="Inventory Value" value={fmt(stats?.inventory?.total_value)} subtitle={`${fmtNum(stats?.inventory?.total_items)} items`} icon={Package} color='var(--accent)' />
            <KpiCard title="Urgent / Overdue" value={`${fmtNum(stats?.jobs?.urgent_today)} / ${fmtNum(stats?.jobs?.overdue)}`} subtitle="Needs attention" icon={ShieldAlert} color='var(--destructive)' />
          </div>

          {/* Outstanding Breakdown */}
          {showOutstandingDetail && stats?.outstanding_jobs?.length > 0 && (
            <div className="summary-section-card">
              <div className="summary-section-card__header">
                <h3>Outstanding Breakdown ({stats.outstanding_jobs.length} jobs)</h3>
                <button className="btn btn-ghost btn-icon" onClick={() => setShowOutstandingDetail(false)} style={{ width: 28, height: 28 }}><X size={14} /></button>
              </div>
              <div className="data-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {stats.outstanding_jobs.map(job => (
                  <div key={job.id} className="data-list__row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/dashboard/jobs/${job.id}`)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>#{job.job_number} — {job.customer_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{job.job_name || ''} · {job.status}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--warning)' }}>{fmt(job.balance)}</span>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>of {fmt(job.total_amount)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="data-list__total" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border-subtle)', fontWeight: 700 }}>
                <span>Total Outstanding</span>
                <span style={{ color: 'var(--warning)' }}>{fmt(stats?.jobs?.total_balance)}</span>
              </div>
            </div>
          )}

          {/* Fraud Alert Banner */}
          {stats?.monitoring_stats?.active_alerts > 0 && (
            <div className="alert-banner alert-banner--error">
              <ShieldAlert size={20} />
              <div className="alert-banner__content">
                <strong>{stats.monitoring_stats.active_alerts} active fraud alerts</strong> — requires immediate attention
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
              {stats?.sales ? (
                <div className="data-list">
                  {[
                    { label: 'Offset Printing', value: stats.sales.offset },
                    { label: 'Digital Printing', value: stats.sales.digital },
                    { label: 'Photocopy', value: stats.sales.photocopy },
                    { label: 'Mementos', value: stats.sales.mementos },
                    { label: 'Photo Frames', value: stats.sales.frames },
                    { label: 'ID Cards', value: stats.sales.id_cards },
                    { label: 'Binding & Lamination', value: stats.sales.binding },
                  ].map(item => (
                    <div key={item.label} className="data-list__row">
                      <span>{item.label}</span>
                      <span className="data-list__value">{fmt(item.value)}</span>
                    </div>
                  ))}
                  <div className="data-list__total">
                    <span>Month Total</span>
                    <span className="font-bold">{fmt(stats.sales.month_total)}</span>
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
              {stats?.status_counts ? (
                <div className="status-list">
                  {Object.entries(stats.status_counts).filter(([s]) => s !== 'Cancelled').map(([status, count]) => (
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
              {stats?.recent_jobs?.length > 0 ? (
                <div className="recent-orders">
                  {stats.recent_jobs.slice(0, 5).map(job => (
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
          <LazyViewport minHeight="300px" fallback={<div className="summary-section" style={{ height: 300, background: 'var(--border)', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />}>
            <Suspense fallback={<div className="summary-section" style={{ height: 300, background: 'var(--border)', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />}>
              <OrderForecastWidget branchId={selectedBranchId} />
            </Suspense>
          </LazyViewport>
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
    </PageContainer>
  );
};

export default React.memo(Summary);
