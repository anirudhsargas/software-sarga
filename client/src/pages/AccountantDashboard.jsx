import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IndianRupee, TrendingUp, TrendingDown, Loader2, Building2,
  Receipt, Wallet, BarChart3, Users, CreditCard, AlertTriangle,
  CheckCircle2, Clock, ArrowUpRight, ArrowDownRight, RefreshCw,
  ShieldAlert, FileText, CalendarDays, ChevronRight, Package,
  PieChart, ArrowRight, Banknote, CircleDollarSign,
  AlertCircle, Target
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { fmt, thisMonth, fmtDate } from './expense-manager/constants';
import './AccountantDashboard.css';

/* ─── Helpers ─── */
const fmtCur = (n) => `₹${fmt(n)}`;
const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`;
const monthLabel = (m) => {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/* ─── KPI Card ─── */
const KpiCard = ({ label, value, sub, color = '', icon: Icon, onClick }) => (
  <div className={`acc-kpi ${color} ${onClick ? 'acc-kpi--clickable' : ''}`} onClick={onClick}>
    <div className="acc-kpi__icon">{Icon && <Icon size={20} />}</div>
    <div className="acc-kpi__body">
      <div className="acc-kpi__label">{label}</div>
      <div className="acc-kpi__value">{value}</div>
      {sub && <div className="acc-kpi__sub">{sub}</div>}
    </div>
  </div>
);

/* ─── Section ─── */
const Section = ({ title, icon: Icon, action, children }) => (
  <div className="acc-section">
    <div className="acc-section__header">
      <h2 className="acc-section__title">
        {Icon && <Icon size={17} />} {title}
      </h2>
      {action}
    </div>
    {children}
  </div>
);

/* ─── Alert Card ─── */
const AlertCard = ({ icon: Icon, color, bg, title, desc, onAction }) => (
  <div className="acc-alert" style={{ background: bg, borderColor: `${color}22` }}>
    <div className="acc-alert__icon-wrap" style={{ background: `${color}18` }}>
      <Icon size={18} style={{ color }} />
    </div>
    <div className="acc-alert__content">
      <div className="acc-alert__title" style={{ color }}>{title}</div>
      <div className="acc-alert__desc">{desc}</div>
    </div>
    {onAction && (
      <button className="acc-alert__action" onClick={onAction}><ArrowRight size={14} /></button>
    )}
  </div>
);

/* ─── Progress Bar ─── */
const ProgressBar = ({ pct, color = 'var(--accent)', height = 6 }) => (
  <div className="acc-progress" style={{ height, background: 'var(--bg-2, #e5e7eb)' }}>
    <div className="acc-progress__fill" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color, height }} />
  </div>
);

/* ══════════════════════════════════════════════════════════════
   ACCOUNTANT DASHBOARD
   ══════════════════════════════════════════════════════════════ */
const AccountantDashboard = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const branchDropdownRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const [expDash, setExpDash] = useState(null);
  const [salesStats, setSalesStats] = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [cashVsBank, setCashVsBank] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      const branchParam = selectedBranches.length > 0 ? { branch_id: selectedBranches.join(',') } : {};
      const todayStr = new Date().toISOString().split('T')[0];

      const [expRes, salesRes, todayRes, cashRes, reqRes] = await Promise.allSettled([
        api.get('/expense-dashboard', { params: { month, ...branchParam } }),
        api.get('/stats/dashboard', { params: { startDate, endDate, ...branchParam } }),
        api.get('/stats/dashboard', { params: { startDate: todayStr, endDate: todayStr, ...branchParam } }),
        api.get('/reports/cash-vs-bank', { params: { start_date: startDate, end_date: endDate } }),
        api.get('/requests/discount').catch(() => ({ data: [] })),
      ]);

      if (expRes.status === 'fulfilled') setExpDash(expRes.value.data);
      if (salesRes.status === 'fulfilled') {
        setSalesStats(salesRes.value.data);
        setRecentJobs(salesRes.value.data?.recent_jobs || []);
      }
      if (todayRes.status === 'fulfilled') setTodayStats(todayRes.value.data);
      if (cashRes.status === 'fulfilled') setCashVsBank(cashRes.value.data?.rows?.[0] || null);
      if (reqRes.status === 'fulfilled') setPendingRequests(reqRes.value.data || []);
    } catch (err) {
      console.error('AccountantDashboard fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [month, selectedBranches]);

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data)).catch(() => {});
  }, []);

  /* ─── Close branch dropdown on outside click ─── */
  useEffect(() => {
    const handleClick = (e) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target)) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleBranch = (id) => {
    setSelectedBranches(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const clearBranches = () => setSelectedBranches([]);
  const selectAllBranches = () => setSelectedBranches(branches.map(b => String(b.id)));

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ─── Derived ─── */
  const totalRevenue = Number(salesStats?.jobs?.total_sales || 0);
  const totalCollected = Number(salesStats?.payments?.total_amount || salesStats?.payments?.total_collected || 0);
  const totalExpenses = Number(expDash?.total_expenses || 0);
  const netProfit = Number(expDash?.net_profit ?? (totalRevenue - totalExpenses));
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const revenueCollected = Number(expDash?.revenue_collected || totalCollected);

  const cashTotal = Number(cashVsBank?.cash_total || 0);
  const upiTotal = Number(cashVsBank?.upi_total || 0);
  const bankTotal = Number(cashVsBank?.bank_total || 0);
  const otherTotal = Number(cashVsBank?.other_total || 0);
  const paymentTotal = cashTotal + upiTotal + bankTotal + otherTotal || 1;

  const vendorPayable = Number(expDash?.vendor?.total_payable || 0);
  const utilityPayable = Number(expDash?.utility?.total_payable || 0);

  const todayRevenue = Number(todayStats?.jobs?.total_sales || 0);
  const todayCollected = Number(todayStats?.payments?.total_collected_today || todayStats?.payments?.total_amount || 0);
  const todayJobs = Number(todayStats?.jobs?.total_count || 0);
  const todayCompleted = Number(todayStats?.jobs?.completed_today || 0);
  const overdueJobs = Number(salesStats?.jobs?.overdue || 0);
  const inProgressJobs = Number(salesStats?.jobs?.in_progress || 0);
  const totalBalance = Number(salesStats?.jobs?.total_balance || 0);

  const catBreakdown = (expDash?.by_category ? Object.entries(expDash.by_category) : [])
    .map(([cat, total]) => ({ category: cat, total: Number(total) }))
    .sort((a, b) => b.total - a.total);
  const maxCatTotal = catBreakdown.length > 0 ? catBreakdown[0].total : 1;

  const overdueVendors = expDash?.overdue_vendors || [];
  const alerts = expDash?.alerts || {};
  const dueEmis = alerts.due_emis || [];
  const dueKuris = alerts.due_kuris || [];
  const overdueUtilities = alerts.overdue_utilities || [];
  const rentLocations = expDash?.rent_locations || [];
  const unpaidRents = rentLocations.filter(r => Number(r.remaining) > 0);
  const totalAlerts = pendingRequests.length + overdueVendors.length + dueEmis.length + dueKuris.length + overdueUtilities.length + unpaidRents.length;

  const payMethods = [
    { label: 'Cash', value: cashTotal, color: 'var(--success)' },
    { label: 'UPI', value: upiTotal, color: 'var(--accent)' },
    { label: 'Bank', value: bankTotal, color: 'var(--accent)' },
    { label: 'Other', value: otherTotal, color: 'var(--warning)' },
  ].filter(p => p.value > 0);

  const monthlyTrend = expDash?.monthly_trend || [];

  const branchLabel = selectedBranches.length === 0
    ? 'All Branches'
    : selectedBranches.length === 1
      ? (branches.find(b => String(b.id) === selectedBranches[0])?.name || 'Branch')
      : `${selectedBranches.length} Branches`;

  const selectedBranchNames = selectedBranches.length === 0
    ? 'All Branches'
    : selectedBranches.map(id => branches.find(b => String(b.id) === id)?.name || id).join(', ');

  const CAT_COLORS = ['var(--accent)', 'var(--error)', 'var(--success)', 'var(--accent)', 'var(--warning)', '#0d9488', 'var(--warning)', 'var(--accent)'];

  return (
    <div className="acc-dash">
      {/* ═══ Header ═══ */}
      <div className="acc-header">
        <div>
          <h1 className="acc-header__title">
            <BarChart3 size={24} /> Accountant Dashboard
          </h1>
          <p className="acc-header__sub">
            Financial overview — {selectedBranchNames} — {monthLabel(month)}
            {totalAlerts > 0 && (
              <span className="acc-alert-badge">
                <AlertCircle size={12} /> {totalAlerts} alert{totalAlerts > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="acc-header__controls">
          <div className="acc-filter-group">
            <CalendarDays size={14} />
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <div className="acc-branch-picker" ref={branchDropdownRef}>
            <button
              className="acc-branch-picker__trigger"
              onClick={() => setBranchDropdownOpen(v => !v)}
              type="button"
            >
              <Building2 size={14} />
              <span className="acc-branch-picker__label">{branchLabel}</span>
              <ChevronRight size={14} className={`acc-branch-picker__chevron ${branchDropdownOpen ? 'acc-branch-picker__chevron--open' : ''}`} />
            </button>
            {selectedBranches.length > 0 && (
              <div className="acc-branch-chips">
                {selectedBranches.map(id => {
                  const b = branches.find(br => String(br.id) === id);
                  return b ? (
                    <span key={id} className="acc-branch-chip">
                      {b.name}
                      <button onClick={() => toggleBranch(String(b.id))} className="acc-branch-chip__x">&times;</button>
                    </span>
                  ) : null;
                })}
                <button className="acc-branch-chip acc-branch-chip--clear" onClick={clearBranches}>Clear all</button>
              </div>
            )}
            {branchDropdownOpen && (
              <div className="acc-branch-dropdown">
                <div className="acc-branch-dropdown__actions">
                  <button onClick={selectAllBranches} className="acc-branch-dropdown__action-btn">Select All</button>
                  <button onClick={clearBranches} className="acc-branch-dropdown__action-btn">Clear</button>
                </div>
                {branches.map(b => (
                  <label key={b.id} className="acc-branch-dropdown__item">
                    <input
                      type="checkbox"
                      checked={selectedBranches.includes(String(b.id))}
                      onChange={() => toggleBranch(String(b.id))}
                    />
                    <span>{b.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button className="acc-btn-refresh" onClick={fetchAll} title="Refresh" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="acc-loading">
          <Loader2 size={20} className="animate-spin" /> Loading financial data…
        </div>
      ) : (
        <>
          {/* ═══ Today's Snapshot ═══ */}
          <Section title="Today's Snapshot" icon={Clock}>
            <div className="acc-kpi-grid acc-kpi-grid--4">
              <KpiCard label="Today's Revenue" value={fmtCur(todayRevenue)} sub={`${todayJobs} job${todayJobs !== 1 ? 's' : ''} booked`} color="acc-kpi--blue" icon={TrendingUp} />
              <KpiCard label="Today's Collection" value={fmtCur(todayCollected)} sub="Payments received" color="acc-kpi--green" icon={IndianRupee} />
              <KpiCard label="Completed Today" value={todayCompleted} sub="Jobs delivered" color="acc-kpi--teal" icon={CheckCircle2} />
              <KpiCard label="Walk-in Customers" value={todayStats?.customers?.walk_in_today || 0} sub="New walk-ins" color="acc-kpi--purple" icon={Users} />
            </div>
          </Section>

          {/* ═══ Monthly P&L ═══ */}
          <Section title={`Profit & Loss — ${monthLabel(month)}`} icon={BarChart3}>
            <div className="acc-kpi-grid acc-kpi-grid--4">
              <KpiCard label="Total Revenue" value={fmtCur(totalRevenue)} sub={`${salesStats?.jobs?.total_count || 0} jobs`} color="acc-kpi--blue" icon={TrendingUp} />
              <KpiCard label="Collections" value={fmtCur(revenueCollected)} sub={totalRevenue > 0 ? `${fmtPct((revenueCollected / totalRevenue) * 100)} of revenue` : '—'} color="acc-kpi--green" icon={Wallet} />
              <KpiCard label="Total Expenses" value={fmtCur(totalExpenses)} sub={`${catBreakdown.length} categories`} color="acc-kpi--red" icon={TrendingDown} onClick={() => navigate('/dashboard/expenses')} />
              <KpiCard label="Net Profit" value={fmtCur(netProfit)} sub={`Margin: ${fmtPct(profitMargin)}`} color={netProfit >= 0 ? 'acc-kpi--green' : 'acc-kpi--red'} icon={Target} />
            </div>
          </Section>

          {/* ═══ Alerts & Actions ═══ */}
          {totalAlerts > 0 && (
            <Section title="Alerts & Action Items" icon={AlertTriangle}>
              <div style={{ display: 'grid', gap: 10 }}>
                {pendingRequests.length > 0 && (
                  <AlertCard icon={ShieldAlert} color="var(--warning)" bg="rgba(249,115,22,0.06)"
                    title={`${pendingRequests.length} Discount Request${pendingRequests.length > 1 ? 's' : ''} Pending`}
                    desc="Review and approve/reject discount requests"
                    onAction={() => navigate('/dashboard/requests')}
                  />
                )}
                {overdueVendors.length > 0 && (
                  <AlertCard icon={AlertTriangle} color="var(--error)" bg="rgba(176,58,46,0.05)"
                    title={`${overdueVendors.length} Vendor${overdueVendors.length > 1 ? 's' : ''} with Outstanding Balance`}
                    desc={`Total vendor payable: ${fmtCur(vendorPayable)}`}
                    onAction={() => navigate('/dashboard/expenses')}
                  />
                )}
                {dueEmis.length > 0 && (
                  <AlertCard icon={Banknote} color="var(--accent)" bg="rgba(124,58,237,0.05)"
                    title={`${dueEmis.length} EMI${dueEmis.length > 1 ? 's' : ''} Due This Month`}
                    desc={dueEmis.map(e => `${e.name} — ${fmtCur(e.amount)} (due day ${e.due_day})`).join(' · ')}
                  />
                )}
                {dueKuris.length > 0 && (
                  <AlertCard icon={CircleDollarSign} color="var(--warning)" bg="rgba(108,112,119,0.05)"
                    title={`${dueKuris.length} Kuri${dueKuris.length > 1 ? 's' : ''} Pending`}
                    desc={dueKuris.map(k => `${k.name} — ${fmtCur(k.remaining)} remaining`).join(' · ')}
                  />
                )}
                {overdueUtilities.length > 0 && (
                  <AlertCard icon={AlertCircle} color="var(--warning)" bg="rgba(179,107,0,0.05)"
                    title={`${overdueUtilities.length} Utility Bill${overdueUtilities.length > 1 ? 's' : ''} Unpaid`}
                    desc={overdueUtilities.map(u => u.name).join(', ')}
                    onAction={() => navigate('/dashboard/expenses')}
                  />
                )}
                {unpaidRents.length > 0 && (
                  <AlertCard icon={Building2} color="#0891b2" bg="rgba(8,145,178,0.05)"
                    title={`${unpaidRents.length} Rent${unpaidRents.length > 1 ? 's' : ''} Pending`}
                    desc={unpaidRents.map(r => `${r.property_name} — ${fmtCur(r.remaining)}`).join(' · ')}
                  />
                )}
              </div>
            </Section>
          )}

          {/* ═══ Two-column: Expense Breakdown + Payment Methods ═══ */}
          <div className="acc-two-col">
            {/* ── Expense Breakdown ── */}
            <div className="acc-panel">
              <Section title="Expense Breakdown" icon={PieChart}>
                {catBreakdown.length === 0 ? (
                  <p className="acc-empty">No expenses this month</p>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {catBreakdown.map((cat, i) => {
                      const pct = totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0;
                      const c = CAT_COLORS[i % CAT_COLORS.length];
                      return (
                        <div className="acc-cat-item" key={cat.category}>
                          <div className="acc-cat-item__head">
                            <span className="acc-cat-item__name">{cat.category}</span>
                            <span className="acc-cat-item__val" style={{ color: c }}>{fmtCur(cat.total)}</span>
                          </div>
                          <div className="acc-cat-item__bar">
                            <div style={{ flex: 1 }}><ProgressBar pct={(cat.total / maxCatTotal) * 100} color={c} /></div>
                            <span className="acc-cat-item__pct">{fmtPct(pct)}</span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="acc-total-row">
                      <span className="acc-total-row__label">Total</span>
                      <span className="acc-total-row__value">{fmtCur(totalExpenses)}</span>
                    </div>
                  </div>
                )}
              </Section>
            </div>

            {/* ── Payment Methods ── */}
            <div className="acc-panel">
              <Section title="Payment Methods" icon={CreditCard}>
                {payMethods.length === 0 ? (
                  <p className="acc-empty">No payment data</p>
                ) : (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div className="acc-stacked-bar">
                      {payMethods.map((pm, i) => (
                        <div key={i} className="acc-stacked-bar__segment" title={`${pm.label}: ${fmtCur(pm.value)}`}
                          style={{ width: `${(pm.value / paymentTotal) * 100}%`, background: pm.color }} />
                      ))}
                    </div>
                    <div>
                      {payMethods.map((pm, i) => (
                        <div key={i} className="acc-legend-row">
                          <div className="acc-legend-row__left">
                            <div className="acc-legend-dot" style={{ background: pm.color }} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{pm.label}</span>
                          </div>
                          <div className="acc-legend-row__right">
                            <span className="acc-legend-val">{fmtCur(pm.value)}</span>
                            <span className="acc-legend-pct">{fmtPct((pm.value / paymentTotal) * 100)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="acc-total-row">
                      <span className="acc-total-row__label">Total Collected</span>
                      <span className="acc-total-row__value">{fmtCur(paymentTotal)}</span>
                    </div>
                  </div>
                )}
              </Section>
            </div>
          </div>

          {/* ═══ Outstanding & Payables ═══ */}
          <Section title="Outstanding & Payables" icon={Wallet}>
            <div className="acc-kpi-grid acc-kpi-grid--4">
              <KpiCard label="Customer Balance" value={fmtCur(totalBalance)} sub={overdueJobs > 0 ? `${overdueJobs} overdue jobs` : `${inProgressJobs} in progress`} color={totalBalance > 0 ? 'acc-kpi--amber' : 'acc-kpi--green'} icon={Users} />
              <KpiCard label="Vendor Payable" value={fmtCur(vendorPayable)} sub={`${overdueVendors.length} vendor${overdueVendors.length !== 1 ? 's' : ''} with balance`} color={vendorPayable > 0 ? 'acc-kpi--red' : 'acc-kpi--green'} icon={Package} onClick={() => navigate('/dashboard/expenses')} />
              <KpiCard label="Utility Payable" value={fmtCur(utilityPayable)} sub={`${overdueUtilities.length} unpaid this month`} color={utilityPayable > 0 ? 'acc-kpi--amber' : 'acc-kpi--green'} icon={Receipt} />
              <KpiCard label="Rent Pending" value={fmtCur(unpaidRents.reduce((s, r) => s + Number(r.remaining), 0))} sub={`${unpaidRents.length} of ${rentLocations.length} locations`} color={unpaidRents.length > 0 ? 'acc-kpi--amber' : 'acc-kpi--green'} icon={Building2} />
            </div>
          </Section>

          {/* ═══ Two-column: Recent Jobs + Vendor Payables ═══ */}
          <div className="acc-two-col">
            {/* ── Recent Jobs ── */}
            <div className="acc-panel">
              <Section title="Recent Jobs" icon={FileText}
                action={<button className="acc-section__action" onClick={() => navigate('/dashboard/jobs')}>View All <ChevronRight size={13} /></button>}>
                {recentJobs.length === 0 ? (
                  <p className="acc-empty">No recent jobs</p>
                ) : (
                  <div>
                    {recentJobs.slice(0, 5).map((j) => {
                      const badgeClass = j.payment_status === 'Paid' ? 'acc-badge--paid' : j.payment_status === 'Partial' ? 'acc-badge--partial' : 'acc-badge--unpaid';
                      return (
                        <div key={j.id} className="acc-list-item acc-list-item--clickable"
                          onClick={() => navigate(`/dashboard/jobs/${j.id}`)}>
                          <div className="acc-list-item__left">
                            <div className="acc-list-item__primary">
                              <span style={{ color: 'var(--accent, var(--accent))', marginRight: 6 }}>#{j.job_number}</span>
                              {j.job_name}
                            </div>
                            <div className="acc-list-item__secondary">{j.customer_name}</div>
                          </div>
                          <div className="acc-list-item__right">
                            <div className="acc-list-item__amount">{fmtCur(j.total_amount)}</div>
                            <span className={`acc-list-item__badge ${badgeClass}`}>{j.payment_status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>

            {/* ── Top Vendor Payables ── */}
            <div className="acc-panel">
              <Section title="Top Vendor Payables" icon={Package}
                action={<button className="acc-section__action" onClick={() => navigate('/dashboard/expenses')}>View All <ChevronRight size={13} /></button>}>
                {overdueVendors.length === 0 ? (
                  <div className="acc-success-empty">
                    <CheckCircle2 size={28} />
                    <div className="acc-success-empty__text">All vendors paid up!</div>
                  </div>
                ) : (
                  <div>
                    {overdueVendors.slice(0, 5).map((v) => (
                      <div key={v.id} className="acc-list-item">
                        <div className="acc-list-item__left">
                          <div className="acc-list-item__primary">{v.name}</div>
                          <div className="acc-list-item__secondary">{v.vendor_category || 'Vendor'} · {v.phone || '—'}</div>
                        </div>
                        <div className="acc-list-item__right">
                          <div className="acc-list-item__amount" style={{ color: 'var(--error)' }}>{fmtCur(v.balance)}</div>
                          <div className="acc-list-item__secondary">of {fmtCur(v.total_purchases)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </div>

          {/* ═══ Expense Trend ═══ */}
          {monthlyTrend.length > 1 && (
            <div className="acc-panel">
              <Section title="Monthly Expense Trend" icon={TrendingUp}>
                <div className="acc-bar-chart">
                  {(() => {
                    const maxVal = Math.max(...monthlyTrend.map(t => t.total), 1);
                    return monthlyTrend.map((t, i) => {
                      const h = (t.total / maxVal) * 100;
                      const isActive = t.month === month;
                      return (
                        <div key={i} className="acc-bar-chart__col">
                          <span className="acc-bar-chart__val">{fmt(t.total)}</span>
                          <div className={`acc-bar-chart__bar ${isActive ? 'acc-bar-chart__bar--active' : 'acc-bar-chart__bar--default'}`}
                            style={{ height: `${Math.max(h, 4)}%` }} />
                          <span className={`acc-bar-chart__label ${isActive ? 'acc-bar-chart__label--active' : ''}`}>
                            {new Date(t.month + '-01').toLocaleDateString('en-IN', { month: 'short' })}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
                {/* Trend detail grid */}
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                  {[...monthlyTrend].reverse().map((t, i, arr) => {
                    const prev = arr[i + 1]?.total;
                    const pct = prev ? ((t.total - prev) / prev) * 100 : null;
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 8px', borderRadius: 6, background: 'var(--bg)' }}>
                        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{t.month}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>{fmtCur(t.total)}</span>
                          {pct !== null && (
                            <span className={`acc-trend-tag ${pct > 0 ? 'acc-trend-tag--up' : 'acc-trend-tag--down'}`}>
                              {pct > 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </div>
          )}

          {/* ═══ Branch Details ═══ */}
          {expDash?.branch_expenses?.length > 0 && (
            <div className="acc-panel">
              <Section title={`Branch Details — ${monthLabel(month)}`} icon={Building2}>
                {/* Branch comparison cards */}
                <div className="acc-branch-grid">
                  {expDash.branch_expenses.map((b, i) => {
                    const branchColors = ['var(--accent)', 'var(--accent)', '#0d9488', 'var(--warning)', 'var(--error)'];
                    const color = branchColors[i % branchColors.length];
                    const isSelected = selectedBranches.length === 0 || selectedBranches.includes(String(b.branch_id));
                    return (
                      <div key={i} className={`acc-branch-card ${!isSelected ? 'acc-branch-card--dim' : ''}`}
                        style={{ borderTopColor: color }}>
                        <div className="acc-branch-card__header">
                          <Building2 size={16} style={{ color }} />
                          <span className="acc-branch-card__name">{b.branch}</span>
                        </div>
                        <div className="acc-branch-card__metrics">
                          <div className="acc-branch-card__metric">
                            <span className="acc-branch-card__metric-label">Revenue</span>
                            <span className="acc-branch-card__metric-value" style={{ color: 'var(--accent)' }}>{fmtCur(b.revenue || 0)}</span>
                          </div>
                          <div className="acc-branch-card__metric">
                            <span className="acc-branch-card__metric-label">Expenses</span>
                            <span className="acc-branch-card__metric-value" style={{ color: 'var(--error)' }}>{fmtCur(b.total)}</span>
                          </div>
                          <div className="acc-branch-card__metric">
                            <span className="acc-branch-card__metric-label">Profit</span>
                            <span className="acc-branch-card__metric-value" style={{ color: (b.profit || 0) >= 0 ? 'var(--success)' : 'var(--error)' }}>
                              {fmtCur(b.profit || 0)}
                            </span>
                          </div>
                          <div className="acc-branch-card__metric">
                            <span className="acc-branch-card__metric-label">Jobs</span>
                            <span className="acc-branch-card__metric-value">{b.job_count || 0}</span>
                          </div>
                        </div>
                        {(b.revenue || 0) > 0 && (
                          <div className="acc-branch-card__bar-wrap">
                            <ProgressBar pct={b.total > 0 ? Math.min((b.total / b.revenue) * 100, 100) : 0} color={color} height={4} />
                            <span className="acc-branch-card__bar-label">
                              Expense ratio: {b.revenue > 0 ? fmtPct((b.total / b.revenue) * 100) : '—'}
                            </span>
                          </div>
                        )}
                        {(b.balance || 0) > 0 && (
                          <div className="acc-branch-card__footer">
                            <span className="acc-branch-card__footer-label">Outstanding</span>
                            <span className="acc-branch-card__footer-value">{fmtCur(b.balance)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Summary comparison table */}
                {expDash.branch_expenses.length > 1 && (
                  <div style={{ marginTop: 16, overflowX: 'auto' }}>
                    <table className="acc-table">
                      <thead>
                        <tr>
                          <th>Branch</th>
                          <th className="text-right">Revenue</th>
                          <th className="text-right">Expenses</th>
                          <th className="text-right">Profit</th>
                          <th className="text-right">Jobs</th>
                          <th className="text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expDash.branch_expenses.map((b, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{b.branch}</td>
                            <td className="text-right font-mono" style={{ color: 'var(--accent)' }}>{fmtCur(b.revenue || 0)}</td>
                            <td className="text-right font-mono" style={{ color: 'var(--error)' }}>{fmtCur(b.total)}</td>
                            <td className="text-right font-mono" style={{ color: (b.profit || 0) >= 0 ? 'var(--success)' : 'var(--error)' }}>{fmtCur(b.profit || 0)}</td>
                            <td className="text-right font-mono">{b.job_count || 0}</td>
                            <td className="text-right font-mono" style={{ color: (b.balance || 0) > 0 ? 'var(--warning)' : 'var(--muted)' }}>{fmtCur(b.balance || 0)}</td>
                          </tr>
                        ))}
                        <tr className="acc-total-row">
                          <td><strong>Total</strong></td>
                          <td className="text-right font-mono"><strong>{fmtCur(expDash.branch_expenses.reduce((s, b) => s + (b.revenue || 0), 0))}</strong></td>
                          <td className="text-right font-mono"><strong>{fmtCur(expDash.branch_expenses.reduce((s, b) => s + b.total, 0))}</strong></td>
                          <td className="text-right font-mono"><strong>{fmtCur(expDash.branch_expenses.reduce((s, b) => s + (b.profit || 0), 0))}</strong></td>
                          <td className="text-right font-mono"><strong>{expDash.branch_expenses.reduce((s, b) => s + (b.job_count || 0), 0)}</strong></td>
                          <td className="text-right font-mono"><strong>{fmtCur(expDash.branch_expenses.reduce((s, b) => s + (b.balance || 0), 0))}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </div>
          )}

          {/* ═══ Recent Payments ═══ */}
          {expDash?.recent_payments?.length > 0 && (
            <div className="acc-panel">
              <Section title="Recent Expense Payments" icon={Receipt}
                action={<button className="acc-section__action" onClick={() => navigate('/dashboard/expenses')}>View All <ChevronRight size={13} /></button>}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="acc-table">
                    <thead>
                      <tr>
                        <th>Payee</th>
                        <th>Type</th>
                        <th>Method</th>
                        <th className="text-right">Amount</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expDash.recent_payments.slice(0, 8).map((p, i) => (
                        <tr key={i}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.payee_name}</div>
                            {p.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                          </td>
                          <td><span className="acc-list-item__badge acc-badge--pending">{p.type}</span></td>
                          <td style={{ color: 'var(--muted)' }}>{p.payment_method}</td>
                          <td className="text-right font-mono">{fmtCur(p.amount)}</td>
                          <td style={{ color: 'var(--muted)' }}>{fmtDate(p.payment_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          )}

          {/* ═══ Rent Status ═══ */}
          {rentLocations.length > 0 && (
            <div className="acc-panel">
              <Section title={`Rent Status — ${monthLabel(month)}`} icon={Building2}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="acc-table">
                    <thead>
                      <tr>
                        <th>Property</th>
                        <th>Owner</th>
                        <th className="text-right">Monthly Rent</th>
                        <th className="text-right">Paid</th>
                        <th className="text-right">Remaining</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rentLocations.map((r, i) => {
                        const remaining = Number(r.remaining);
                        const paid = Number(r.paid_this_month);
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{r.property_name}</td>
                            <td style={{ color: 'var(--muted)' }}>{r.owner_name || '—'}</td>
                            <td className="text-right font-mono">{fmtCur(r.monthly_rent)}</td>
                            <td className="text-right font-mono" style={{ color: 'var(--success)' }}>{fmtCur(paid)}</td>
                            <td className="text-right font-mono" style={{ color: remaining > 0 ? 'var(--error)' : 'var(--success)' }}>{fmtCur(remaining)}</td>
                            <td>
                              <span className={`acc-list-item__badge ${remaining > 0 ? 'acc-badge--unpaid' : 'acc-badge--paid'}`}>
                                {remaining > 0 ? 'Pending' : 'Paid'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AccountantDashboard;
