import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { RefreshCw, Search, IndianRupee, AlertTriangle, AlertCircle, Users, FileText, ChevronRight, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import './VendorPayables.css';

const VendorPayables = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('balance_desc');

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/vendors/payables/summary');
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load payables summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const rows = data?.vendors || [];
  const summary = data?.summary || {};

  const agingBuckets = useMemo(() => {
    let o0_30 = 0, o31_60 = 0, o60plus = 0;
    rows.forEach(v => {
      o0_30 += Number(v.overdue_0_30 || 0);
      o31_60 += Number(v.overdue_31_60 || 0);
      o60plus += Number(v.overdue_60_plus || 0);
    });
    return { overdue_0_30: o0_30, overdue_31_60: o31_60, overdue_60_plus: o60plus };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = rows;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(v =>
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.phone && v.phone.includes(q))
      );
    }

    const [field, dir] = sortBy.split('_');
    result = [...result].sort((a, b) => {
      const va = Number(a[field] || 0);
      const vb = Number(b[field] || 0);
      return dir === 'asc' ? va - vb : vb - va;
    });

    return result;
  }, [rows, searchTerm, sortBy]);

  const getRowClass = (v) => {
    if (Number(v.overdue_60_plus) > 0) return 'vp-row--dark-red';
    if (Number(v.overdue_31_60) > 0) return 'vp-row--red';
    if (Number(v.overdue_0_30) > 0) return 'vp-row--orange';
    return '';
  };

  const agingTotal = Number(summary.total_payable || 0);
  const currentPct = agingTotal > 0 ? ((Number(summary.total_payable || 0) - Number(summary.total_overdue || 0)) / agingTotal * 100) : 0;
  const overduePct = agingTotal > 0 ? (Number(summary.total_overdue || 0) / agingTotal * 100) : 0;

  if (loading && !data) {
    return (
      <div className="vp-page">
        <div className="vp-header">
          <h1 className="vp-title">Vendor Payables Dashboard</h1>
        </div>
        <div className="vp-skeleton-grid">
          {[1, 2, 3, 4].map(i => <div key={i} className="vp-skeleton-card"><div className="vp-skeleton-shimmer" /></div>)}
        </div>
        <div className="vp-skeleton-table">
          <div className="vp-skeleton-shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div className="vp-page">
      <div className="vp-header">
        <div>
          <h1 className="vp-title">Payables Dashboard</h1>
          <p className="vp-subtitle">
            Track outstanding vendor payments and aging summary
          </p>
        </div>
        <div className="vp-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'vp-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="vp-summary-cards">
        <div className="vp-summary-card vp-summary-card--total">
          <div className="vp-card-icon-wrap vp-card-icon-wrap--accent">
            <IndianRupee size={20} />
          </div>
          <div className="vp-card-body">
            <span className="vp-summary-label">Total Payable</span>
            <span className="vp-summary-value">₹{Number(summary.total_payable || 0).toLocaleString('en-IN')}</span>
            <span className="vp-summary-trend">{rows.length} vendors</span>
          </div>
        </div>
        <div className="vp-summary-card vp-summary-card--overdue">
          <div className="vp-card-icon-wrap vp-card-icon-wrap--error">
            <AlertTriangle size={20} />
          </div>
          <div className="vp-card-body">
            <span className="vp-summary-label">Overdue Amount</span>
            <span className="vp-summary-value vp-overdue">₹{Number(summary.total_overdue || 0).toLocaleString('en-IN')}</span>
            <span className="vp-summary-trend vp-summary-trend--error">
              {overduePct.toFixed(0)}% of total
            </span>
          </div>
        </div>
        <div className="vp-summary-card">
          <div className="vp-card-icon-wrap vp-card-icon-wrap--warning">
            <AlertCircle size={20} />
          </div>
          <div className="vp-card-body">
            <span className="vp-summary-label">Over Limit</span>
            <span className="vp-summary-value">{summary.vendors_over_limit || 0}</span>
            <span className="vp-summary-trend">vendors exceeding credit</span>
          </div>
        </div>
        <div className="vp-summary-card">
          <div className="vp-card-icon-wrap vp-card-icon-wrap--info">
            <Users size={20} />
          </div>
          <div className="vp-card-body">
            <span className="vp-summary-label">Active Vendors</span>
            <span className="vp-summary-value">{summary.vendors_count || 0}</span>
            <span className="vp-summary-trend">with outstanding balance</span>
          </div>
        </div>
      </div>

      <div className="vp-insights-row">
        <div className="vp-aging-bar-wrap">
          <div className="vp-aging-bar-label">
            <span>Aging Distribution</span>
            <span className="vp-aging-bar-total">₹{agingTotal.toLocaleString('en-IN')}</span>
          </div>
          <div className="vp-aging-bar">
            <div className="vp-aging-bar-segment vp-aging-bar--current" style={{ flex: currentPct || 1 }} title="Current" />
            <div className="vp-aging-bar-segment vp-aging-bar--orange" style={{ flex: Math.max(1, Number(agingBuckets.overdue_0_30 || 0) / agingTotal * 100 || 1) }} title="0-30 Days" />
            <div className="vp-aging-bar-segment vp-aging-bar--red" style={{ flex: Math.max(1, Number(agingBuckets.overdue_31_60 || 0) / agingTotal * 100 || 1) }} title="31-60 Days" />
            <div className="vp-aging-bar-segment vp-aging-bar--dark-red" style={{ flex: Math.max(1, Number(agingBuckets.overdue_60_plus || 0) / agingTotal * 100 || 1) }} title="60+ Days" />
          </div>
          <div className="vp-aging-bar-legend">
            <span><span className="vp-dot vp-dot--current" /> Current</span>
            <span><span className="vp-dot vp-dot--orange" /> 0-30d</span>
            <span><span className="vp-dot vp-dot--red" /> 31-60d</span>
            <span><span className="vp-dot vp-dot--dark-red" /> 60d+</span>
          </div>
        </div>
      </div>

      <div className="vp-table-container">
        <div className="vp-table-toolbar">
          <div className="vp-search-wrapper">
            <Search size={16} className="vp-search-icon" />
            <input
              type="text"
              className="vp-search-input"
              placeholder="Search vendors by name or phone..."
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
            <span className="vp-row-count">{filteredRows.length} of {rows.length} vendors</span>
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
                <th>Vendor</th>
                <th className="vp-text-right">Balance</th>
                <th className="vp-text-right">Current</th>
                <th className="vp-text-right vp-col-overdue">0-30d</th>
                <th className="vp-text-right vp-col-overdue">31-60d</th>
                <th className="vp-text-right vp-col-overdue">60d+</th>
                <th className="vp-text-center">Credit</th>
                <th className="vp-text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="vp-empty">
                      <FileText size={40} />
                      <h3>No vendors found</h3>
                      <p>{searchTerm ? 'Try adjusting your search' : 'No vendors with outstanding balances'}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.map(v => {
                const limit = Number(v.credit_limit);
                const balance = Number(v.current_balance);
                const utilPct = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0;
                const isOverLimit = limit > 0 && balance > limit;

                return (
                  <tr key={v.id} className={getRowClass(v)}>
                    <td>
                      <div className="vp-vendor-cell">
                        <span className="vp-vendor-link" onClick={() => navigate(`/vendors/${v.id}/ledger`)}>
                          {v.name}
                          <ChevronRight size={12} className="vp-vendor-arrow" />
                        </span>
                        {v.phone && <span className="vp-vendor-phone">{v.phone}</span>}
                      </div>
                    </td>
                    <td className="vp-text-right vp-balance">
                      ₹{balance.toLocaleString('en-IN')}
                      {isOverLimit && <span className="vp-over-limit-badge">Over</span>}
                    </td>
                    <td className="vp-text-right">₹{Number(v.current_due).toLocaleString('en-IN')}</td>
                    <td className="vp-text-right vp-cell-overdue">₹{Number(v.overdue_0_30).toLocaleString('en-IN')}</td>
                    <td className="vp-text-right vp-cell-overdue">₹{Number(v.overdue_31_60).toLocaleString('en-IN')}</td>
                    <td className="vp-text-right vp-cell-overdue">₹{Number(v.overdue_60_plus).toLocaleString('en-IN')}</td>
                    <td className="vp-text-center">
                      {limit > 0 ? (
                        <div className="vp-credit-cell">
                          <div className="vp-credit-bar-bg">
                            <div
                              className={`vp-credit-bar-fill ${utilPct >= 90 ? 'vp-credit-bar--danger' : utilPct >= 70 ? 'vp-credit-bar--warn' : 'vp-credit-bar--safe'}`}
                              style={{ width: `${utilPct}%` }}
                            />
                          </div>
                          <span className="vp-credit-text">{utilPct.toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span className="vp-muted">—</span>
                      )}
                    </td>
                    <td className="vp-text-center">
                      <button
                        className="vp-pay-btn"
                        onClick={() => navigate(`/vendors/${v.id}/ledger`)}
                        title="View ledger & make payment"
                      >
                        <Send size={13} /> Pay
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="vp-footer-legend">
        <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--current" /> Current</span>
        <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--orange" /> Overdue &lt;30d</span>
        <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--red" /> 31-60d</span>
        <span className="vp-legend-item"><span className="vp-legend-dot vp-legend-dot--dark-red" /> 60d+</span>
      </div>
    </div>
  );
};

export default VendorPayables;
