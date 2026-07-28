import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  RefreshCw, Search, IndianRupee, AlertTriangle, AlertCircle,
  Users, FileText, ChevronRight, Send, X, TrendingUp, TrendingDown,
  Clock, DollarSign, CreditCard, Eye, List, ChevronDown, Zap,
  Calendar, Phone, Building, Filter, ArrowUpDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import './VendorPayables.css';

const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const miniFormat = (n) => {
  const v = Number(n || 0);
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v}`;
};

const statusConfig = {
  critical: { label: 'Critical', icon: AlertCircle, class: 'vp-status--critical' },
  warning: { label: 'At Risk', icon: AlertTriangle, class: 'vp-status--warning' },
  normal: { label: 'On Track', icon: TrendingUp, class: 'vp-status--normal' },
  paid: { label: 'Settled', icon: Clock, class: 'vp-status--paid' },
};

function getVendorStatus(v) {
  if (Number(v.overdue_60_plus) > 0) return 'critical';
  if (Number(v.overdue_31_60) > 0) return 'warning';
  if (Number(v.overdue_0_30) > 0) return 'normal';
  return 'paid';
}

const AnimatedCounter = ({ value, suffix = '' }) => {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const animated = useRef(false);

  useEffect(() => {
    if (animated.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !animated.current) {
        animated.current = true;
        const target = Number(value);
        const duration = 800;
        const steps = 30;
        const increment = target / steps;
        let current = 0;
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) {
            setDisplay(target);
            clearInterval(timer);
          } else {
            setDisplay(current);
          }
        }, duration / steps);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{display.toLocaleString('en-IN', { maximumFractionDigits: 0 })}{suffix}</span>;
};

const VendorPayables = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('balance_desc');
  const [typeFilter, setTypeFilter] = useState('all');
  const [openActionId, setOpenActionId] = useState(null);
  const actionRef = useRef(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/vendors/payables/summary');
      setData(res.data);
    } catch {
      toast.error('Failed to load payables summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (actionRef.current && !actionRef.current.contains(e.target)) {
        setOpenActionId(null);
      }
    };
    if (openActionId) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openActionId]);

  const rows = useMemo(() => data?.vendors || [], [data]);
  const summary = useMemo(() => data?.summary || {}, [data]);

  const agingBuckets = useMemo(() => {
    let o0_30 = 0, o31_60 = 0, o60plus = 0, current = 0;
    rows.forEach(v => {
      current += Number(v.current_due || 0);
      o0_30 += Number(v.overdue_0_30 || 0);
      o31_60 += Number(v.overdue_31_60 || 0);
      o60plus += Number(v.overdue_60_plus || 0);
    });
    return { current, overdue_0_30: o0_30, overdue_31_60: o31_60, overdue_60_plus: o60plus };
  }, [rows]);

  const vendorTypes = useMemo(() => {
    const types = {};
    rows.forEach(v => {
      const t = v.vendor_type || v.type || 'other';
      types[t] = (types[t] || 0) + 1;
    });
    return Object.entries(types).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(v =>
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.phone && v.phone.includes(q)) ||
        (v.vendor_type && v.vendor_type.toLowerCase().includes(q))
      );
    }
    if (typeFilter !== 'all') {
      result = result.filter(v => (v.vendor_type || v.type || 'other') === typeFilter);
    }
    const [field, dir] = sortBy.split('_');
    result = [...result].sort((a, b) => {
      const va = Number(a[field] || 0);
      const vb = Number(b[field] || 0);
      return dir === 'asc' ? va - vb : vb - va;
    });
    return result;
  }, [rows, searchTerm, sortBy, typeFilter]);

  const agingTotal = Number(summary.total_payable || 0) || 1;

  const getActiveFilters = () => {
    const f = [];
    if (searchTerm) f.push(`search: "${searchTerm}"`);
    if (typeFilter !== 'all') f.push(`type: ${typeFilter}`);
    return f;
  };

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setSortBy('balance_desc');
  };

  if (loading && !data) {
    return (
      <div className="vp-page">
        <div className="vp-header">
          <div>
            <h1 className="vp-title">Payables Dashboard</h1>
            <p className="vp-subtitle">Track outstanding vendor payments and aging summary</p>
          </div>
        </div>
        <div className="vp-loading-state">
          <div className="vp-loading-pulse">
            {[1, 2, 3, 4].map(i => <div key={i} className="vp-pulse-card" />)}
          </div>
          <div className="vp-pulse-table" />
        </div>
      </div>
    );
  }

  return (
    <div className="vp-page">
      {/* Header */}
      <div className="vp-header">
        <div>
          <h1 className="vp-title">Vendor Payables</h1>
          <p className="vp-subtitle">
            <Clock size={13} /> {summary.as_of_date ? `As of ${new Date(summary.as_of_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}` : 'Real-time overview'}
            &nbsp;&middot;&nbsp;{rows.length} active vendors
          </p>
        </div>
        <div className="vp-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'vp-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="vp-kpi-grid">
        <div className="vp-kpi vp-kpi--total">
          <div className="vp-kpi-bg" />
          <div className="vp-kpi-icon"><IndianRupee size={22} /></div>
          <div className="vp-kpi-body">
            <span className="vp-kpi-label">Total Payable</span>
            <span className="vp-kpi-value">{formatINR(summary.total_payable)}</span>
            <span className="vp-kpi-sub">{rows.length} vendors with balance</span>
          </div>
        </div>

        <div className="vp-kpi vp-kpi--overdue">
          <div className="vp-kpi-bg" />
          <div className="vp-kpi-icon"><AlertTriangle size={22} /></div>
          <div className="vp-kpi-body">
            <span className="vp-kpi-label">Overdue</span>
            <span className="vp-kpi-value">{formatINR(summary.total_overdue)}</span>
            <span className="vp-kpi-sub">
              {agingTotal ? ((Number(summary.total_overdue || 0) / agingTotal) * 100).toFixed(0) : 0}% of total payable
            </span>
          </div>
        </div>

        <div className="vp-kpi vp-kpi--limit">
          <div className="vp-kpi-bg" />
          <div className="vp-kpi-icon"><CreditCard size={22} /></div>
          <div className="vp-kpi-body">
            <span className="vp-kpi-label">Over Limit</span>
            <span className="vp-kpi-value">{summary.vendors_over_limit || 0}</span>
            <span className="vp-kpi-sub">vendors exceeding credit limit</span>
          </div>
          <div className="vp-kpi-badge vp-kpi-badge--warn">Action Needed</div>
        </div>

        <div className="vp-kpi vp-kpi--vendors">
          <div className="vp-kpi-bg" />
          <div className="vp-kpi-icon"><Building size={22} /></div>
          <div className="vp-kpi-body">
            <span className="vp-kpi-label">Vendors</span>
            <span className="vp-kpi-value">{summary.vendors_count || 0}</span>
            <span className="vp-kpi-sub">{vendorTypes.length} categories</span>
          </div>
        </div>
      </div>

      {/* Aging & Category Row */}
      <div className="vp-insights-row">
        <div className="vp-insights-grid">
          {/* Aging Distribution */}
          <div className="vp-insight-card vp-insight-card--aging">
            <div className="vp-insight-card-header">
              <span><Clock size={15} /> Aging Distribution</span>
              <span className="vp-insight-total">{formatINR(agingTotal)}</span>
            </div>
            <div className="vp-aging-bar-track">
              <div className="vp-aging-segments">
                {[
                  { key: 'current', label: 'Current', amount: agingBuckets.current, color: 'var(--accent)', pct: (agingBuckets.current / agingTotal) * 100 },
                  { key: '0-30d', label: '0-30 Days', amount: agingBuckets.overdue_0_30, color: '#f59e0b', pct: (agingBuckets.overdue_0_30 / agingTotal) * 100 },
                  { key: '31-60d', label: '31-60 Days', amount: agingBuckets.overdue_31_60, color: '#ef4444', pct: (agingBuckets.overdue_31_60 / agingTotal) * 100 },
                  { key: '60d+', label: '60+ Days', amount: agingBuckets.overdue_60_plus, color: '#991b1b', pct: (agingBuckets.overdue_60_plus / agingTotal) * 100 },
                ].map(s => (
                  s.pct > 0 && (
                    <div
                      key={s.key}
                      className="vp-aging-seg"
                      style={{
                        flex: Math.max(s.pct, 1),
                        background: s.color,
                        opacity: s.key === 'current' ? 0.2 : s.key === '0-30d' ? 0.5 : s.key === '31-60d' ? 0.65 : 0.8,
                        border: s.key === 'current' ? '2px dashed var(--border)' : 'none',
                      }}
                      title={`${s.label}: ${formatINR(s.amount)}`}
                    >
                      {s.pct > 8 && <span className="vp-aging-seg-label">{miniFormat(s.amount)}</span>}
                    </div>
                  )
                ))}
              </div>
            </div>
            <div className="vp-aging-legend">
              {[
                { key: 'current', label: 'Current', amount: agingBuckets.current, dotClass: 'vp-legend-dot--current' },
                { key: '0-30d', label: '0-30d', amount: agingBuckets.overdue_0_30, dotClass: 'vp-legend-dot--orange' },
                { key: '31-60d', label: '31-60d', amount: agingBuckets.overdue_31_60, dotClass: 'vp-legend-dot--red' },
                { key: '60d+', label: '60d+', amount: agingBuckets.overdue_60_plus, dotClass: 'vp-legend-dot--dark' },
              ].map(s => (
                <span key={s.key} className="vp-legend-chip">
                  <span className={`vp-legend-dot ${s.dotClass}`} />
                  <span className="vp-legend-chip-label">{s.label}</span>
                  <span className="vp-legend-chip-amt">{formatINR(s.amount)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Vendor Type Breakdown */}
          {vendorTypes.length > 0 && (
            <div className="vp-insight-card vp-insight-card--types">
              <div className="vp-insight-card-header">
                <span><Building size={15} /> By Category</span>
                <span className="vp-insight-total">{rows.length} vendors</span>
              </div>
              <div className="vp-types-list">
                {vendorTypes.slice(0, 6).map(([type, count]) => {
                  const typeRows = rows.filter(v => (v.vendor_type || v.type || 'other') === type);
                  const typeBalance = typeRows.reduce((s, v) => s + Number(v.current_balance || 0), 0);
                  const pct = (count / rows.length) * 100;
                  return (
                    <div key={type} className="vp-type-row" onClick={() => setTypeFilter(type)}>
                      <div className="vp-type-info">
                        <span className="vp-type-name">{type.replace(/_/g, ' ')}</span>
                        <span className="vp-type-count">{count}</span>
                      </div>
                      <div className="vp-type-bar-bg">
                        <div className="vp-type-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="vp-type-amt">{formatINR(typeBalance)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="vp-table-container">
        <div className="vp-table-toolbar">
          <div className="vp-search-wrapper">
            <Search size={15} className="vp-search-icon" />
            <input
              type="text"
              className="vp-search-input"
              placeholder="Search vendors, phone, or type..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="vp-search-clear" onClick={() => setSearchTerm('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="vp-table-meta">
            <div className="vp-filter-chips">
              {getActiveFilters().length > 0 && (
                <button className="vp-clear-filters" onClick={clearFilters}>
                  <X size={12} /> Clear filters
                </button>
              )}
            </div>
            <span className="vp-row-count">{filteredRows.length} of {rows.length}</span>
            <select className="vp-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="balance_desc">Balance: High to Low</option>
              <option value="balance_asc">Balance: Low to High</option>
              <option value="name_asc">Name: A-Z</option>
              <option value="name_desc">Name: Z-A</option>
            </select>
          </div>
        </div>

        <div className="vp-table-wrap">
          <table className="vp-table">
            <thead>
              <tr>
                <th className="vp-th-vendor">Vendor</th>
                <th className="vp-text-right vp-th-num">Balance</th>
                <th className="vp-text-right vp-th-num vp-col-overdue">Current</th>
                <th className="vp-text-right vp-th-num vp-col-overdue">0-30d</th>
                <th className="vp-text-right vp-th-num vp-col-overdue">31-60d</th>
                <th className="vp-text-right vp-th-num vp-col-overdue">60d+</th>
                <th className="vp-text-center vp-th-credit">Credit</th>
                <th className="vp-text-center vp-th-action"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="vp-empty">
                      <FileText size={44} strokeWidth={1.2} />
                      <h3>No vendors found</h3>
                      <p>{searchTerm || typeFilter !== 'all' ? 'Try adjusting your filters' : 'No vendors with outstanding balances yet'}</p>
                      {(searchTerm || typeFilter !== 'all') && (
                        <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                          <X size={14} /> Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : filteredRows.map(v => {
                const limit = Number(v.credit_limit);
                const balance = Number(v.current_balance);
                const utilPct = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0;
                const isOverLimit = limit > 0 && balance > limit;
                const status = getVendorStatus(v);
                const StatusIcon = statusConfig[status].icon;

                return (
                  <tr key={v.id} className={`vp-row vp-row--${status}`}>
                    <td>
                      <div className="vp-vendor-cell">
                        <div className="vp-vendor-top">
                          <span
                            className="vp-vendor-name"
                            onClick={() => navigate(`/vendors/${v.id}/ledger`)}
                          >
                            {v.name}
                            <ChevronRight size={12} className="vp-vendor-arrow" />
                          </span>
                          <span className={`vp-status-indicator vp-status--${status}`}>
                            <StatusIcon size={10} />
                            {statusConfig[status].label}
                          </span>
                        </div>
                        <div className="vp-vendor-meta">
                          {v.phone && <span className="vp-vendor-tag"><Phone size={10} /> {v.phone}</span>}
                          {(v.vendor_type || v.type) && (
                            <span className="vp-vendor-tag vp-vendor-tag--type">
                              {v.vendor_type || v.type}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="vp-text-right vp-balance">
                      <span className={`vp-balance-amt ${isOverLimit ? 'vp-balance--over' : ''}`}>
                        {formatINR(balance)}
                      </span>
                      {isOverLimit && <span className="vp-over-limit-chip">Over</span>}
                    </td>
                    <td className="vp-text-right vp-cell-num">{formatINR(v.current_due)}</td>
                    <td className={`vp-text-right vp-cell-num ${Number(v.overdue_0_30) > 0 ? 'vp-cell--warn' : ''}`}>
                      {formatINR(v.overdue_0_30)}
                    </td>
                    <td className={`vp-text-right vp-cell-num ${Number(v.overdue_31_60) > 0 ? 'vp-cell--danger' : ''}`}>
                      {formatINR(v.overdue_31_60)}
                    </td>
                    <td className={`vp-text-right vp-cell-num ${Number(v.overdue_60_plus) > 0 ? 'vp-cell--critical' : ''}`}>
                      {formatINR(v.overdue_60_plus)}
                    </td>
                    <td className="vp-text-center">
                      {limit > 0 ? (
                        <div className="vp-credit-cell">
                          <div className="vp-credit-bar-bg">
                            <div
                              className={`vp-credit-bar-fill ${utilPct >= 90 ? 'vp-credit-bar--danger' : utilPct >= 70 ? 'vp-credit-bar--warn' : 'vp-credit-bar--safe'}`}
                              style={{ width: `${utilPct}%` }}
                            />
                          </div>
                          <span className="vp-credit-text">{miniFormat(balance)} / {miniFormat(limit)}</span>
                        </div>
                      ) : (
                        <span className="vp-muted">—</span>
                      )}
                    </td>
                    <td className="vp-text-center">
                      <div className="vp-actions-cell" ref={openActionId === v.id ? actionRef : null}>
                        <button
                          className="vp-action-trigger"
                          onClick={() => setOpenActionId(openActionId === v.id ? null : v.id)}
                        >
                          <ChevronDown size={14} />
                        </button>
                        {openActionId === v.id && (
                          <div className="vp-action-dropdown">
                            <button onClick={() => { setOpenActionId(null); navigate(`/vendors/${v.id}/ledger`); }}>
                              <Eye size={13} /> View Ledger
                            </button>
                            <button onClick={() => { setOpenActionId(null); navigate(`/vendors/${v.id}/ledger?tab=invoices`); }}>
                              <List size={13} /> View Invoices
                            </button>
                            <button
                              className="vp-action-pay"
                              onClick={() => { setOpenActionId(null); navigate(`/vendors/${v.id}/ledger`); }}
                            >
                              <Send size={13} /> Make Payment
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="vp-footer">
        <div className="vp-footer-legend">
          <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--current" /> Current</span>
          <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--orange" /> 0-30 Days</span>
          <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--red" /> 31-60 Days</span>
          <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--dark" /> 60+ Days</span>
        </div>
        <div className="vp-footer-actions">
          <button className="btn btn-ghost btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'vp-spin' : ''} /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

export default VendorPayables;
