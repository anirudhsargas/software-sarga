import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Receipt, IndianRupee, TrendingUp,
  TrendingDown, AlertTriangle, Loader2, Calendar,
  CreditCard, Building2, Wallet, Clock, CheckCircle,
  ArrowUpRight, ArrowDownRight, Zap, Plus
} from 'lucide-react';
import api from '../../services/api';
import { fmt, fmtDate, thisMonth } from './constants';

const DashboardTab = ({ branches, onPayment }) => {
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [month, setMonth] = useState(thisMonth());
  const [branchFilter, setBranchFilter] = useState('');
  const [cashVsBank, setCashVsBank] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      // Calculate last day of month properly
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const [dashRes, cashRes] = await Promise.all([
        api.get('/expense-dashboard', { params: { month, branch_id: branchFilter || undefined } }),
        api.get('/reports/cash-vs-bank', { params: { start_date: `${month}-01`, end_date: `${month}-${String(lastDay).padStart(2, '0')}` } }).catch(() => null)
      ]);
      setDashboard(dashRes.data);
      if (cashRes) setCashVsBank(cashRes.data?.rows?.[0] || null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [month, branchFilter]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  /* ── Helper: percentage change indicator ── */
  const TrendBadge = ({ current, previous }) => {
    if (!previous || !current) return null;
    const pct = ((current - previous) / (previous || 1) * 100).toFixed(1);
    const up = pct > 0;
    return (
      <span className={`em-trend-badge ${up ? 'em-trend-badge--up' : 'em-trend-badge--down'}`}>
        {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {Math.abs(pct)}%
      </span>
    );
  };

  /* ── Empty State ── */
  if (!loading && !dashboard) {
    return (
      <div className="em-section">
        <div className="em-filter-row">
          <label className="em-filter-label">Month:</label>
          <input type="month" className="em-input em-input--sm" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <div className="em-empty-state">
          <div className="em-empty-state__icon"><IndianRupee size={48} strokeWidth={1.5} /></div>
          <h3 className="em-empty-state__title">No Financial Data Yet</h3>
          <p className="em-empty-state__desc">Record your first payment to see the financial dashboard.</p>
          <div className="em-empty-state__actions">
            <button className="btn btn-primary" onClick={() => onPayment()}><Plus size={16} /> Record First Payment</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="em-loading"><Loader2 className="spin" size={20} /> Loading dashboard...</div>;

  const d = dashboard;
  const prevMonthTotal = d.monthly_trend?.length >= 2 ? d.monthly_trend[d.monthly_trend.length - 2]?.total : null;
  const cashTotal = Number(cashVsBank?.cash_total || 0);
  const upiTotal = Number(cashVsBank?.upi_total || 0);
  const bankTotal = Number(cashVsBank?.bank_total || 0);
  const otherTotal = Number(cashVsBank?.other_total || 0);
  const paymentTotal = cashTotal + upiTotal + bankTotal + otherTotal || 1;

  return (
    <div className="em-section">
      {/* Filters */}
      <div className="em-filter-row">
        <label className="em-filter-label">Month:</label>
        <input type="month" className="em-input em-input--sm" value={month} onChange={e => setMonth(e.target.value)} />
        {branches.length > 1 && (
          <>
            <label className="em-filter-label">Branch:</label>
            <select className="em-input em-input--sm" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </>
        )}
      </div>

      {/* ═══════ Primary KPI Row ═══════ */}
      <div className="em-kpi-grid em-kpi-grid--4">
        <div className="em-kpi-card em-kpi-card--red">
          <div className="em-kpi-card__icon"><IndianRupee size={22} /></div>
          <div className="em-kpi-card__body">
            <div className="em-kpi-card__label">Total Expenses</div>
            <div className="em-kpi-card__value">₹{fmt(d.total_expenses)}</div>
            <TrendBadge current={d.total_expenses} previous={prevMonthTotal} />
          </div>
        </div>
        <div className="em-kpi-card em-kpi-card--green">
          <div className="em-kpi-card__icon"><TrendingUp size={22} /></div>
          <div className="em-kpi-card__body">
            <div className="em-kpi-card__label">Revenue Collected</div>
            <div className="em-kpi-card__value">₹{fmt(d.revenue_collected)}</div>
          </div>
        </div>
        <div className="em-kpi-card em-kpi-card--blue">
          <div className="em-kpi-card__icon"><TrendingDown size={22} /></div>
          <div className="em-kpi-card__body">
            <div className="em-kpi-card__label">Net Profit</div>
            <div className="em-kpi-card__value">₹{fmt(d.net_profit)}</div>
            {d.revenue_collected > 0 && <div className="em-kpi-card__sub">Margin: {((d.net_profit / d.revenue_collected) * 100).toFixed(1)}%</div>}
          </div>
        </div>
        <div className="em-kpi-card em-kpi-card--amber">
          <div className="em-kpi-card__icon"><AlertTriangle size={22} /></div>
          <div className="em-kpi-card__body">
            <div className="em-kpi-card__label">Vendor Payable</div>
            <div className="em-kpi-card__value">₹{fmt(d.vendor?.total_payable)}</div>
            {d.overdue_vendors?.length > 0 && <div className="em-kpi-card__sub em-kpi-card__sub--warn">{d.overdue_vendors.length} overdue</div>}
          </div>
        </div>
      </div>

      {/* ═══════ Secondary KPI Row ═══════ */}
      <div className="em-kpi-grid em-kpi-grid--4">
        <div className="em-kpi-card em-kpi-card--purple">
          <div className="em-kpi-card__icon"><Receipt size={22} /></div>
          <div className="em-kpi-card__body">
            <div className="em-kpi-card__label">Vendor Purchases</div>
            <div className="em-kpi-card__value">₹{fmt(d.vendor?.purchases_this_month)}</div>
          </div>
        </div>
        <div className="em-kpi-card em-kpi-card--teal">
          <div className="em-kpi-card__icon"><CheckCircle size={22} /></div>
          <div className="em-kpi-card__body">
            <div className="em-kpi-card__label">Vendor Paid</div>
            <div className="em-kpi-card__value">₹{fmt(d.vendor?.payments_this_month)}</div>
          </div>
        </div>
        <div className="em-kpi-card em-kpi-card--cyan">
          <div className="em-kpi-card__icon"><Zap size={22} /></div>
          <div className="em-kpi-card__body">
            <div className="em-kpi-card__label">Utility Payable</div>
            <div className="em-kpi-card__value">₹{fmt(d.utility?.total_payable)}</div>
            {Number(d.utility?.bills_this_month) > 0 && <div className="em-kpi-card__sub">Bills: ₹{fmt(d.utility?.bills_this_month)} | Paid: ₹{fmt(d.utility?.payments_this_month)}</div>}
          </div>
        </div>
        <div className="em-kpi-card em-kpi-card--indigo">
          <div className="em-kpi-card__icon"><Calendar size={22} /></div>
          <div className="em-kpi-card__body">
            <div className="em-kpi-card__label">Rent Locations</div>
            <div className="em-kpi-card__value">{d.rent_locations?.length || 0}</div>
            {d.rent_locations?.some(r => Number(r.remaining) > 0) && <div className="em-kpi-card__sub em-kpi-card__sub--warn">{d.rent_locations.filter(r => Number(r.remaining) > 0).length} pending</div>}
          </div>
        </div>
      </div>

      {/* ═══════ Upcoming Payment Alerts (Color Coded) ═══════ */}
      {d.alerts && (d.alerts.due_emis?.length > 0 || d.alerts.due_kuris?.length > 0 || d.alerts.overdue_utilities?.length > 0) && (
        <div className="em-card em-alerts-panel">
          <div className="em-card__title"><AlertTriangle size={16} color="#dc2626" /> Upcoming & Overdue Payments</div>
          <div className="em-alerts-grid">
            {d.alerts.overdue_utilities?.map((u, i) => (
              <div key={`u-${i}`} className="em-alert-card em-alert-card--red">
                <div className="em-alert-card__badge">OVERDUE</div>
                <div className="em-alert-card__icon"><Zap size={20} /></div>
                <div className="em-alert-card__title">{u.name}</div>
                <div className="em-alert-card__desc">Utility not paid this month</div>
                {u.last_amount > 0 && <div className="em-alert-card__amount">Last: ₹{fmt(u.last_amount)}</div>}
                <button className="btn btn-sm btn-primary" onClick={() => onPayment({ type: 'Utility', payee_name: u.name, amount: String(u.last_amount || '') })}>Quick Pay</button>
              </div>
            ))}
            {d.alerts.due_emis?.map((e, i) => (
              <div key={`e-${i}`} className="em-alert-card em-alert-card--amber">
                <div className="em-alert-card__badge">EMI DUE</div>
                <div className="em-alert-card__icon"><CreditCard size={20} /></div>
                <div className="em-alert-card__title">{e.name}</div>
                <div className="em-alert-card__desc">Due on {e.due_day}th of every month</div>
                <div className="em-alert-card__amount">₹{fmt(e.amount)}</div>
              </div>
            ))}
            {d.alerts.due_kuris?.map((k, i) => (
              <div key={`k-${i}`} className="em-alert-card em-alert-card--yellow">
                <div className="em-alert-card__badge">KURI DUE</div>
                <div className="em-alert-card__icon"><Wallet size={20} /></div>
                <div className="em-alert-card__title">{k.name}</div>
                <div className="em-alert-card__desc">Remaining this month</div>
                <div className="em-alert-card__amount">₹{fmt(k.remaining)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ Category Breakdown + Recent Payments ═══════ */}
      <div className="em-two-col">
        <div className="em-card">
          <div className="em-card__title"><BarChart3 size={16} /> Expense Category Breakdown</div>
          {d.by_category && Object.keys(d.by_category).length > 0 ? (
            <>
              <div className="em-donut-legend">
                {Object.entries(d.by_category).sort((a, b) => b[1] - a[1]).map(([cat, val], i) => {
                  const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
                  const pct = ((val / d.total_expenses) * 100).toFixed(1);
                  return (
                    <div key={cat} className="em-donut-legend__item">
                      <span className="em-donut-legend__dot" style={{ background: colors[i % colors.length] }} />
                      <span className="em-donut-legend__cat">{cat}</span>
                      <span className="em-donut-legend__pct">{pct}%</span>
                      <span className="em-donut-legend__amt">₹{fmt(val)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="em-breakdown" style={{ marginTop: 14 }}>
                {Object.entries(d.by_category).sort((a, b) => b[1] - a[1]).map(([cat, val], i) => {
                  const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
                  return (
                    <div key={cat} className="em-breakdown__row">
                      <div className="em-breakdown__cat">{cat}</div>
                      <div className="em-breakdown__bar-wrap"><div className="em-breakdown__bar" style={{ width: `${Math.max((val / d.total_expenses) * 100, 4)}%`, background: colors[i % colors.length] }} /></div>
                      <div className="em-breakdown__amt">₹{fmt(val)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <div className="em-empty-text">No expense categories yet</div>}
        </div>

        <div className="em-card">
          <div className="em-card__title"><Receipt size={16} /> Recent Payments</div>
          {d.recent_payments?.length > 0 ? (
            <div className="em-recent-list">
              {d.recent_payments.map(p => (
                <div key={p.id} className="em-recent-item">
                  <div className="em-recent-item__type"><span className={`em-type-badge em-type-badge--${(p.type || 'other').toLowerCase()}`}>{p.type}</span></div>
                  <div className="em-recent-item__info"><div className="em-recent-item__name">{p.payee_name || '—'}</div><div className="em-recent-item__desc">{p.description || ''}</div></div>
                  <div className="em-recent-item__date">{fmtDate(p.payment_date)}</div>
                  <div className="em-recent-item__amount">₹{fmt(p.amount)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="em-empty-inline">
              <Receipt size={32} strokeWidth={1} />
              <p>No payments recorded this month</p>
              <button className="btn btn-primary btn-sm" onClick={() => onPayment()}><Plus size={14} /> Add Payment</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ Monthly Trend + Payment Mode ═══════ */}
      <div className="em-two-col">
        <div className="em-card">
          <div className="em-card__title"><TrendingUp size={16} /> Monthly Expense Trend</div>
          {d.monthly_trend?.length > 0 ? (
            <div className="em-trend-chart">
              {d.monthly_trend.map(t => {
                const max = Math.max(...d.monthly_trend.map(x => x.total), 1);
                return (
                  <div key={t.month} className="em-trend-bar-wrap">
                    <div className="em-trend-bar" style={{ height: `${(t.total / max) * 100}%` }}>
                      <span className="em-trend-value">₹{fmt(t.total)}</span>
                    </div>
                    <span className="em-trend-label">{t.month}</span>
                  </div>
                );
              })}
            </div>
          ) : <div className="em-empty-text">Not enough data for trends</div>}
        </div>

        <div className="em-card">
          <div className="em-card__title"><CreditCard size={16} /> Payment Mode Analysis</div>
          {cashVsBank ? (
            <div className="em-payment-modes">
              {[
                { label: 'Cash', value: cashTotal, color: '#10b981', icon: '💵' },
                { label: 'UPI', value: upiTotal, color: '#3b82f6', icon: '📱' },
                { label: 'Bank Transfer', value: bankTotal, color: '#8b5cf6', icon: '🏦' },
                { label: 'Other', value: otherTotal, color: '#f59e0b', icon: '💳' },
              ].filter(m => m.value > 0).map(mode => (
                <div key={mode.label} className="em-payment-mode">
                  <div className="em-payment-mode__header">
                    <span className="em-payment-mode__icon">{mode.icon}</span>
                    <span className="em-payment-mode__label">{mode.label}</span>
                    <span className="em-payment-mode__pct">{((mode.value / paymentTotal) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="em-payment-mode__bar-bg">
                    <div className="em-payment-mode__bar" style={{ width: `${(mode.value / paymentTotal) * 100}%`, background: mode.color }} />
                  </div>
                  <div className="em-payment-mode__amount">₹{fmt(mode.value)}</div>
                </div>
              ))}
              {paymentTotal <= 1 && <div className="em-empty-text">No payment data for this period</div>}
            </div>
          ) : <div className="em-empty-text">Payment mode data not available</div>}
        </div>
      </div>

      {/* ═══════ Branch Wise Expenses (Admin with multiple branches) ═══════ */}
      {d.branch_expenses?.length > 1 && (
        <div className="em-card">
          <div className="em-card__title"><Building2 size={16} /> Branch Wise Expenses</div>
          <div className="em-branch-comparison">
            {(() => {
              const maxBranch = Math.max(...d.branch_expenses.map(b => Number(b.total)), 1);
              const totalAll = d.branch_expenses.reduce((s, b) => s + Number(b.total), 0);
              return d.branch_expenses.map(b => (
                <div key={b.branch} className="em-branch-bar">
                  <div className="em-branch-bar__label"><Building2 size={14} /> {b.branch}</div>
                  <div className="em-branch-bar__track">
                    <div className="em-branch-bar__fill" style={{ width: `${(Number(b.total) / maxBranch) * 100}%` }} />
                  </div>
                  <div className="em-branch-bar__info">
                    <span className="em-branch-bar__amount">₹{fmt(b.total)}</span>
                    <span className="em-branch-bar__pct">{((Number(b.total) / totalAll) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ═══════ Overdue Vendors ═══════ */}
      {d.overdue_vendors?.length > 0 && (
        <div className="em-card">
          <div className="em-card__title"><AlertTriangle size={16} color="#dc2626" /> Overdue Vendors</div>
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>Vendor</th><th>Total Purchases</th><th>Total Paid</th><th>Balance Due</th><th>Action</th></tr></thead>
              <tbody>
                {d.overdue_vendors.map(v => (
                  <tr key={v.id}>
                    <td><strong>{v.name}</strong></td>
                    <td>₹{fmt(v.total_purchases)}</td>
                    <td>₹{fmt(v.total_paid)}</td>
                    <td className="em-amount-cell em-amount--red">₹{fmt(v.balance)}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => onPayment({ type: 'Vendor', vendor_id: v.id, payee_name: v.name, amount: String(v.balance) })}>
                        <IndianRupee size={14} /> Pay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardTab;
