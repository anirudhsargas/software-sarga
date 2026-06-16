import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  TrendingUp, TrendingDown, DollarSign, FileText, CheckSquare, 
  Wallet, RefreshCw, Download, AlertTriangle, ShieldAlert,
  Package, CheckCircle2, AlertCircle, Building2, Image as ImageIcon
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { useVirtualizer } from '@tanstack/react-virtual';
import './AccountantDashboard.css';

/* ─── Helpers ─── */
const fmtCur = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const getTodayString = () => new Date().toISOString().split('T')[0];
const getThisMonth = () => getTodayString().slice(0, 7);

/* ─── Sub-components ─── */
const KpiCard = ({ title, value, icon: Icon, color, growth }) => {
  const IconComponent = Icon;
  return (
  <div className="acc-card acc-kpi-card">
    <div className="acc-kpi-header">
      <span className="acc-kpi-title">{title}</span>
      <div className={`acc-kpi-icon ${color}`}>
        {IconComponent && <IconComponent size={20} />}
      </div>
    </div>
    <div className="acc-kpi-value">{value}</div>
    {growth && (
      <div className={`acc-kpi-growth ${growth.startsWith('+') ? 'positive' : 'negative'}`}>
        {growth} vs last month
      </div>
    )}
  </div>
)};

const AlertItem = ({ icon: Icon, title, desc, actionColor }) => {
  const IconComponent = Icon;
  return (
  <div className="acc-alert-item" style={{ borderLeftColor: actionColor }}>
    <div className="acc-alert-icon" style={{ color: actionColor }}>{IconComponent && <IconComponent size={18} />}</div>
    <div className="acc-alert-content">
      <div className="acc-alert-title">{title}</div>
      <div className="acc-alert-desc">{desc}</div>
    </div>
  </div>
)};

export default function AccountantDashboard() {
  const [month, setMonth] = useState(getThisMonth());

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['expense-dashboard', month],
    queryFn: async () => {
      const res = await api.get('/expense-dashboard', { params: { month } });
      return res.data;
    },
    staleTime: 30000,
  });

  const isEmpty = data?.empty;

  // Virtualizer for Recent Transactions
  const parentRef = React.useRef(null);
  const transactions = data?.recentTransactions || [];
  const rowVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  const handleExport = () => {
    // Dummy export logic
    alert('Exporting data...');
  };

  if (isLoading) {
    return (
      <div className="acc-loading-state">
        <RefreshCw size={32} className="acc-spin" />
        <p>Loading Accountant Data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="acc-error-state">
        <AlertTriangle size={32} color="var(--error)" />
        <p>Failed to load dashboard.</p>
        <button onClick={refetch} className="acc-btn secondary">Retry</button>
      </div>
    );
  }

  return (
    <div className="acc-dash-container">
      {/* ─── Header ─── */}
      <header className="acc-dash-header">
        <div>
          <h1 className="acc-dash-title">Good Morning Accountant</h1>
          <p className="acc-dash-subtitle">Today: {new Date().toLocaleDateString('en-IN')}</p>
        </div>
        <div className="acc-dash-actions">
          <input 
            type="month" 
            value={month} 
            onChange={(e) => setMonth(e.target.value)} 
            className="acc-month-input"
          />
          <button 
            className="acc-btn secondary icon-only" 
            onClick={() => refetch()} 
            disabled={isRefetching}
            title="Refresh"
          >
            <RefreshCw size={16} className={isRefetching ? 'acc-spin' : ''} />
          </button>
          <button className="acc-btn outline" onClick={handleExport}>
            <Download size={16} /> Export
          </button>
        </div>
      </header>

      {/* ─── Empty State ─── */}
      {isEmpty ? (
        <div className="acc-empty-state">
          <div className="acc-empty-illus">
            <ImageIcon size={64} color="var(--border)" />
          </div>
          <h2>No accounting activity found.</h2>
          <p>There are no transactions, expenses, or bills for {month}.</p>
          <div className="acc-empty-actions">
            <button className="acc-btn primary">Add Expense</button>
            <button className="acc-btn outline">Upload Bill</button>
            <button className="acc-btn outline">Create Vendor</button>
          </div>
        </div>
      ) : (
        <>
          {/* ─── KPIs ─── */}
          <div className="acc-kpi-grid">
            <KpiCard 
              title="Total Income" 
              value={fmtCur(data?.summary?.income)} 
              icon={TrendingUp} 
              color="green" 
            />
            <KpiCard 
              title="Total Expense" 
              value={fmtCur(data?.summary?.expense)} 
              icon={TrendingDown} 
              color="red" 
            />
            <KpiCard 
              title="Net Profit" 
              value={fmtCur(data?.summary?.profit)} 
              icon={DollarSign} 
              color={data?.summary?.profit >= 0 ? 'green' : 'red'} 
            />
            <KpiCard 
              title="Pending Bills" 
              value={data?.pendingBills?.length || 0} 
              icon={FileText} 
              color="blue" 
            />
            <KpiCard 
              title="Pending Approvals" 
              value={data?.pendingApprovals?.length || 0} 
              icon={CheckSquare} 
              color="orange" 
            />
            <KpiCard 
              title="Today's Collections" 
              value={fmtCur(0)} // Mapped if available
              icon={Wallet} 
              color="purple" 
            />
          </div>

          <div className="acc-main-grid">
            <div className="acc-grid-left">
              {/* ─── Cashflow Chart ─── */}
              <div className="acc-card acc-chart-card">
                <div className="acc-card-header">
                  <h3>Cashflow Overview</h3>
                </div>
                <div className="acc-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.charts || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{fontSize: 12, fill: 'var(--muted)'}} tickLine={false} axisLine={false} />
                      <YAxis tick={{fontSize: 12, fill: 'var(--muted)'}} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val/1000}k`} />
                      <Tooltip 
                        cursor={{fill: 'var(--bg-hover)'}}
                        contentStyle={{borderRadius: '8px', border: '1px solid var(--border)'}}
                        formatter={(val) => fmtCur(val)}
                      />
                      <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                      <Bar dataKey="income" name="Income" fill="var(--success)" radius={[4,4,0,0]} barSize={8} />
                      <Bar dataKey="expense" name="Expense" fill="var(--error)" radius={[4,4,0,0]} barSize={8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ─── Recent Transactions Virtualized ─── */}
              <div className="acc-card">
                <div className="acc-card-header">
                  <h3>Recent Transactions</h3>
                </div>
                <div className="acc-table-container" ref={parentRef} style={{ height: '300px', overflow: 'auto' }}>
                  <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px)` }}>
                      <table className="acc-data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Party</th>
                            <th>Type</th>
                            <th>Ref</th>
                            <th className="text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const t = transactions[virtualRow.index];
                            return (
                              <tr key={virtualRow.key} ref={rowVirtualizer.measureElement} data-index={virtualRow.index}>
                                <td>{t.date?.slice(0, 10)}</td>
                                <td>{t.party}</td>
                                <td><span className="acc-tag">{t.type}</span></td>
                                <td className="text-muted">{t.reference || '—'}</td>
                                <td className="text-right font-mono">{fmtCur(t.amount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── Bills Queue ─── */}
              <div className="acc-card">
                <div className="acc-card-header">
                  <h3>Bills Queue</h3>
                </div>
                <div className="acc-table-container">
                  <table className="acc-data-table">
                    <thead>
                      <tr>
                        <th>Bill ID</th>
                        <th>Vendor</th>
                        <th>Date</th>
                        <th className="text-right">Amount</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.pendingBills || []).slice(0, 5).map(b => (
                        <tr key={b.id}>
                          <td>#{b.id}</td>
                          <td>{b.vendor_name}</td>
                          <td>{b.date?.slice(0, 10)}</td>
                          <td className="text-right font-mono">{fmtCur(b.amount)}</td>
                          <td><span className="acc-tag pending">{b.status}</span></td>
                          <td>
                            <div className="acc-row-actions">
                              <button className="acc-btn-text text-success">Approve</button>
                              <button className="acc-btn-text text-error">Reject</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!data?.pendingBills || data.pendingBills.length === 0) && (
                        <tr><td colSpan="6" className="text-center text-muted py-4">No pending bills</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="acc-grid-right">
              {/* ─── Alerts Panel ─── */}
              <div className="acc-card">
                <div className="acc-card-header">
                  <h3>Alerts & Action Items</h3>
                </div>
                <div className="acc-alerts-list">
                  {(data?.pendingApprovals?.length > 0) && (
                    <AlertItem 
                      icon={ShieldAlert} 
                      title={`${data.pendingApprovals.length} Pending Approvals`}
                      desc="Vendor requests require your review."
                      actionColor="var(--warning)"
                    />
                  )}
                  {data?.pendingBills?.length > 0 && (
                    <AlertItem 
                      icon={AlertCircle} 
                      title={`${data.pendingBills.length} Payment${data.pendingBills.length>1?'s':''} Due`}
                      desc="Pending bills ready for payment."
                      actionColor="var(--error)"
                    />
                  )}
                  {(!data?.pendingApprovals?.length && !data?.pendingBills?.length) && (
                    <div className="acc-alerts-all-clear">
                      <CheckCircle2 size={32} color="var(--success)" />
                      <span>All clear! No pending actions.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Vendor Analytics ─── */}
              <div className="acc-card">
                <div className="acc-card-header">
                  <h3>Vendor Overview</h3>
                </div>
                <div className="acc-vendor-stats">
                  <div className="acc-v-stat">
                    <span>Top Vendors</span>
                    <strong>{data?.recentTransactions?.filter(t => t.type==='Vendor').length || 0} active</strong>
                  </div>
                  <div className="acc-v-stat">
                    <span>Monthly Trend</span>
                    <strong>Stable</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
