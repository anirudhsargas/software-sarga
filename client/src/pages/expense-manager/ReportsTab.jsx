import React, { useState, useCallback, useEffect } from 'react';
import {
  BarChart3, Download, CreditCard, Loader2, FileText, TrendingUp,
  Building2, Users, Zap, Home, Banknote, PieChart
} from 'lucide-react';
import api from '../../services/api';
import { fmt, fmtDate, REPORT_TYPES, exportRowsToCsv } from './constants';

const REPORT_ICONS = {
  'monthly-expenses': TrendingUp, 'category-wise': PieChart, 'branch-wise': Building2,
  'vendor-ledger': Users, 'utility-statement': Zap, 'rent-statement': Home,
  'emi-statement': Banknote, 'kuri-statement': Banknote, 'cash-vs-bank': CreditCard
};

const CATEGORY_COLORS = ['var(--accent-2)', 'var(--success)', 'var(--warning)', 'var(--error)', '#8b5cf6', '#ec4899', '#06b6d4', 'var(--warning)', '#84cc16', '#64748b'];

const ReportsTab = ({ branches, onError }) => {
  const [reportType, setReportType] = useState('monthly-expenses');
  const [filters, setFilters] = useState({ start_date: '', end_date: '', branch_id: '', vendor_id: '', vendor_name: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.branch_id) params.branch_id = filters.branch_id;
      if (filters.vendor_id) params.vendor_id = filters.vendor_id;
      if (filters.vendor_name) params.vendor_name = filters.vendor_name;
      const r = await api.get(`/reports/${reportType}`, { params });
      setData(r.data);
    } catch { onError('Failed to load report'); }
    finally { setLoading(false); }
  }, [reportType, filters, onError]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const grandTotal = data?.rows?.reduce((s, r) => s + Number(r.total || r.amount || r.cash_total || 0), 0) || 0;
  const RIcon = REPORT_ICONS[reportType] || FileText;

  return (
    <div className="em-section">
      <div className="em-section-title"><BarChart3 size={18} /> Reports & Analytics</div>

      {/* Report Type Cards */}
      <div className="em-report-types">
        {REPORT_TYPES.map(r => {
          const Icon = REPORT_ICONS[r.key] || FileText;
          return (
            <button key={r.key} className={`em-report-type-card ${reportType === r.key ? 'em-report-type-card--active' : ''}`}
              onClick={() => { setReportType(r.key); setData(null); }}>
              <Icon size={18} />
              <span>{r.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="em-filter-row">
        <input type="date" className="em-input em-input--sm" placeholder="From" value={filters.start_date} onChange={e => setFilters(p => ({ ...p, start_date: e.target.value }))} />
        <input type="date" className="em-input em-input--sm" placeholder="To" value={filters.end_date} onChange={e => setFilters(p => ({ ...p, end_date: e.target.value }))} />
        {branches?.length > 1 && (
          <select className="em-input em-input--sm" value={filters.branch_id} onChange={e => setFilters(p => ({ ...p, branch_id: e.target.value }))}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {reportType === 'vendor-ledger' && <input className="em-input em-input--sm" placeholder="Vendor name" value={filters.vendor_name} onChange={e => setFilters(p => ({ ...p, vendor_name: e.target.value }))} />}
        <button className="btn btn-primary btn-sm" onClick={fetchReport}><BarChart3 size={14} /> Generate</button>
      </div>

      {loading ? (
        <div className="em-loading"><Loader2 className="spin" size={20} /> Generating report...</div>
      ) : !data ? (
        <div className="em-empty-state">
          <div className="em-empty-state__icon"><RIcon size={48} strokeWidth={1.5} /></div>
          <h3 className="em-empty-state__title">Select a Report</h3>
          <p className="em-empty-state__desc">Choose a report type above and click Generate to view analytics.</p>
        </div>
      ) : (
        <>
          {/* Summary Bar */}
          {data.rows?.length > 0 && reportType !== 'cash-vs-bank' && (
            <div className="em-report-summary">
              <div className="em-report-summary__item">
                <RIcon size={18} />
                <span>{REPORT_TYPES.find(r => r.key === reportType)?.label}</span>
              </div>
              <div className="em-report-summary__item">
                <strong>{data.rows.length}</strong> <span>records</span>
              </div>
              {grandTotal > 0 && (
                <div className="em-report-summary__item em-report-summary__item--total">
                  <strong>₹{fmt(grandTotal)}</strong> <span>total</span>
                </div>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
                onClick={() => exportRowsToCsv(data.rows, `${reportType}.csv`)}>
                <Download size={14} /> Export CSV
              </button>
            </div>
          )}

          {/* Monthly Expenses with bars */}
          {reportType === 'monthly-expenses' && data.rows?.length > 0 && (() => {
            const maxVal = Math.max(...data.rows.map(r => Number(r.total || 0)));
            return (
              <div className="em-card">
                <div className="em-card__title">Monthly Expense Trend</div>
                <div className="em-report-bars">
                  {data.rows.map((r, i) => (
                    <div key={i} className="em-report-bar-row">
                      <span className="em-report-bar-row__label">{r.month}</span>
                      <div className="em-report-bar-row__track">
                        <div className="em-report-bar-row__fill" style={{ width: `${maxVal > 0 ? (Number(r.total) / maxVal * 100) : 0}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      </div>
                      <span className="em-report-bar-row__value">₹{fmt(r.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Category Wise with visual bars */}
          {reportType === 'category-wise' && data.rows?.length > 0 && (() => {
            const maxVal = Math.max(...data.rows.map(r => Number(r.total || 0)));
            return (
              <div className="em-card">
                <div className="em-card__title">Category Breakdown</div>
                <div className="em-report-bars">
                  {data.rows.map((r, i) => (
                    <div key={i} className="em-report-bar-row">
                      <span className="em-report-bar-row__label">
                        <span className="em-report-bar-row__dot" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        {r.category}
                      </span>
                      <div className="em-report-bar-row__track">
                        <div className="em-report-bar-row__fill" style={{ width: `${maxVal > 0 ? (Number(r.total) / maxVal * 100) : 0}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      </div>
                      <span className="em-report-bar-row__value">₹{fmt(r.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Branch Wise with grouped display */}
          {reportType === 'branch-wise' && data.rows?.length > 0 && (() => {
            const grouped = {};
            data.rows.forEach(r => {
              if (!grouped[r.branch_name]) grouped[r.branch_name] = [];
              grouped[r.branch_name].push(r);
            });
            return Object.entries(grouped).map(([branch, rows]) => {
              const branchTotal = rows.reduce((s, r) => s + Number(r.total || 0), 0);
              const maxVal = Math.max(...rows.map(r => Number(r.total || 0)));
              return (
                <div className="em-card" key={branch}>
                  <div className="em-card__title">
                    <Building2 size={16} /> {branch}
                    <span className="em-card__title-badge">₹{fmt(branchTotal)}</span>
                  </div>
                  <div className="em-report-bars">
                    {rows.map((r, i) => (
                      <div key={i} className="em-report-bar-row">
                        <span className="em-report-bar-row__label">
                          <span className="em-report-bar-row__dot" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                          {r.category}
                        </span>
                        <div className="em-report-bar-row__track">
                          <div className="em-report-bar-row__fill" style={{ width: `${maxVal > 0 ? (Number(r.total) / maxVal * 100) : 0}%`, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        </div>
                        <span className="em-report-bar-row__value">₹{fmt(r.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}

          {/* Statement Reports (Vendor / Utility / Rent / EMI / Kuri) */}
          {['vendor-ledger', 'utility-statement', 'rent-statement', 'emi-statement', 'kuri-statement'].includes(reportType) && data.rows?.length > 0 && (
            <div className="em-card">
              <div className="em-card__title">{REPORT_TYPES.find(r => r.key === reportType)?.label}</div>
              <div className="em-table-wrap">
                <table className="em-table">
                  <thead><tr>{Object.keys(data.rows[0]).map(k => <th key={k} style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</th>)}</tr></thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i}>
                        {Object.entries(r).map(([k, v], j) => (
                          <td key={j} className={typeof v === 'number' && v > 0 ? 'em-amount-cell' : ''}>
                            {typeof v === 'number' ? `₹${fmt(v)}` : (k.includes('date') ? fmtDate(v) : v || '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cash vs Bank — visual KPI + bars */}
          {reportType === 'cash-vs-bank' && data.rows?.length > 0 && (() => {
            const r = data.rows[0] || {};
            const modes = [
              { label: 'Cash', value: r.cash_total, color: 'var(--success)', icon: '💵' },
              { label: 'UPI', value: r.upi_total, color: 'var(--accent-2)', icon: '📱' },
              { label: 'Bank Transfer', value: r.bank_total, color: 'var(--warning)', icon: '🏦' },
              { label: 'Other', value: r.other_total, color: '#64748b', icon: '📋' },
            ];
            const total = modes.reduce((s, m) => s + Number(m.value || 0), 0);
            return (
              <div className="em-card">
                <div className="em-card__title">Payment Mode Breakdown</div>
                <div className="em-kpi-grid em-kpi-grid--4">
                  {modes.map(m => (
                    <div key={m.label} className="em-kpi-card" style={{ borderLeft: `4px solid ${m.color}` }}>
                      <div className="em-kpi-card__icon" style={{ fontSize: 22 }}>{m.icon}</div>
                      <div className="em-kpi-card__body">
                        <div className="em-kpi-card__label">{m.label}</div>
                        <div className="em-kpi-card__value">₹{fmt(m.value)}</div>
                        <div className="em-kpi-card__sub">{total > 0 ? Math.round(Number(m.value || 0) / total * 100) : 0}%</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="em-report-bars" style={{ marginTop: 16 }}>
                  {modes.filter(m => Number(m.value || 0) > 0).map(m => (
                    <div key={m.label} className="em-report-bar-row">
                      <span className="em-report-bar-row__label">{m.icon} {m.label}</span>
                      <div className="em-report-bar-row__track">
                        <div className="em-report-bar-row__fill" style={{ width: `${total > 0 ? (Number(m.value) / total * 100) : 0}%`, background: m.color }} />
                      </div>
                      <span className="em-report-bar-row__value">₹{fmt(m.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {data.rows?.length === 0 && (
            <div className="em-empty-state">
              <div className="em-empty-state__icon"><FileText size={48} strokeWidth={1.5} /></div>
              <h3 className="em-empty-state__title">No Data Found</h3>
              <p className="em-empty-state__desc">Try adjusting the date range or filters to find matching records.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReportsTab;
