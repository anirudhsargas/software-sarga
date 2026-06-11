import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { 
  TrendingUp, TrendingDown, Users, DollarSign, 
  AlertCircle, FileText, CreditCard, ArrowUpRight,
  ArrowDownRight, Calendar, ChevronRight, Package
} from 'lucide-react';
import '../pages/Vendors.css';

const VendorDashboard = React.memo(({ refreshKey = 0 }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    loadDashboardStats();
  }, [refreshKey]);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/vendors/dashboard/stats');
      setStats(response.data.data);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to load dashboard statistics';
      setError(errorMsg);
      if (retryCount === 0) {
        toast.error(`Analytics Error: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(retryCount + 1);
    loadDashboardStats();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', gap: '16px' }}>
        <div className="spinner-premium"></div>
        <p style={{ color: 'var(--muted)', fontWeight: 500 }}>Synthesizing analytics...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="glass-card" style={{ padding: '40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
          <AlertCircle size={64} style={{ color: 'var(--error)', opacity: 0.3 }} />
          <div style={{ textAlign: 'center', maxWidth: '500px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Analytics Unavailable</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '4px' }}>
              {error ? `${error}` : 'We encountered an issue while retrieving dashboard data.'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '24px' }}>
              This usually means there are no vendors in the system yet, or the database tables are not properly initialized.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={handleRetry}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <TrendingUp size={16} />
              Retry
            </button>
            <a
              href="/dashboard/vendors"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = '/dashboard/vendors?view=list';
              }}
              className="btn btn-primary"
            >
              Open Directory
            </a>
          </div>
          {retryCount > 2 && (
            <div style={{ padding: '16px', backgroundColor: 'var(--warning-bg)', borderRadius: '12px', border: '1px solid var(--warning)', width: '100%' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warning)' }}>
                💡 Tip: Start by adding vendors in the Directory view, then return to Analytics.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const metrics = [
    { label: 'Total Vendors', value: stats.total_vendors, icon: Users, color: 'accent', trend: '+12%', isPositive: true },
    { label: 'Month Spend', value: formatCurrency(stats.this_month_spend), icon: TrendingUp, color: 'success', trend: '-8%', isPositive: true },
    { label: 'Total Payable', value: formatCurrency(stats.pending_amount), icon: DollarSign, color: 'warning', trend: '+5%', isPositive: false },
    { label: 'Overdue Bills', value: formatCurrency(stats.overdue_amount), icon: AlertCircle, color: 'error', trend: '+2%', isPositive: false },
  ];

  return (
    <div className="dashboard-wrapper">
      {/* Metrics Row */}
      <div className="metrics-grid" style={{ marginBottom: '32px' }}>
        {metrics.map((m, idx) => (
          <div key={idx} className="metric-card">
            <div className={`metric-icon-box metric-icon-box--${m.color}`}>
              <m.icon size={24} />
            </div>
            <div className="metric-info">
              <span className="metric-label">{m.label}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <h2 className="metric-value">{m.value}</h2>
                <span className="metric-trend" style={{ color: m.isPositive ? 'var(--success)' : 'var(--error)' }}>
                  {m.isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {m.trend}
                </span>
              </div>
            </div>
            <div className="metric-glow"></div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px', marginBottom: '32px' }}>
        {/* Trend Chart */}
        <div style={{ gridColumn: 'span 12 / span 8', padding: '24px' }} className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Spending Velocity</h3>
              <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Monthly procurement trends across branches</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', fontWeight: 600 }}>
               <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3B82F6' }}></div> Perambra</span>
               <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }}></div> Meppayur</span>
            </div>
          </div>
          <div style={{ width: '100%', height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: 'var(--muted)' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: 'var(--muted)' }}
                  tickFormatter={(v) => `₹${v/1000}k`}
                />
                <Tooltip
                  contentStyle={{ 
                    background: 'var(--surface)', 
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-md)'
                  }}
                  itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="perambra"
                  stroke="#3B82F6"
                  strokeWidth={4}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  name="Perambra"
                />
                <Line
                  type="monotone"
                  dataKey="meppayur"
                  stroke="#10B981"
                  strokeWidth={4}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  name="Meppayur"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Vendors */}
        <div style={{ gridColumn: 'span 12 / span 4', padding: '24px' }} className="glass-card">
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Top Partners</h3>
          <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '24px' }}>Strategic vendors by volume this month</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {stats.top_vendors?.slice(0, 5).map((vendor, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--surface-2)', borderRadius: '16px', border: '1px solid var(--border-subtle)', transition: 'border-color 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.01em' }}>{vendor.name}</p>
                      {vendor.vendor_code && (
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent)', backgroundColor: 'var(--accent-soft)', padding: '0 4px', borderRadius: '4px' }}>{vendor.vendor_code}</span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>High Volume</p>
                  </div>
                </div>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(vendor.spend)}</p>
              </div>
            ))}
            {(!stats.top_vendors || stats.top_vendors.length === 0) && (
              <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.4 }}>
                <Package size={32} style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: '12px' }}>No significant volume</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pending Invoices */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(241, 239, 232, 0.3)' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Priority Liabilities</h3>
            <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Awaiting settlement or verification</p>
          </div>
          <button style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'none' }}>
            Full Ledger <ChevronRight size={14} />
          </button>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(241, 239, 232, 0.5)', textAlign: 'left' }}>
                <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Invoice Details</th>
                <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Vendor Entity</th>
                <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Maturity Date</th>
                <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Balance Due</th>
                <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Priority</th>
              </tr>
            </thead>
            <tbody style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {stats.pending_invoices?.map((inv) => (
                <tr key={inv.id} style={{ transition: 'background-color 0.2s' }}>
                  <td style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{inv.invoice_number || `INV-${inv.id}`}</p>
                    <p style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '-0.05em', marginTop: '2px' }}>{inv.branch}</p>
                  </td>
                  <td style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '14px', fontWeight: 600 }}>{inv.vendor_name}</p>
                      {inv.vendor_code && (
                        <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--accent)', backgroundColor: 'var(--accent-soft)', padding: '0 3px', borderRadius: '4px' }}>{inv.vendor_code}</span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--muted)' }}>{new Date(inv.invoice_date).toLocaleDateString()}</p>
                  </td>
                  <td style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                       <Calendar size={12} style={{ color: new Date(inv.due_date) < new Date() ? 'var(--error)' : 'var(--muted)' }} />
                       <span style={{ fontSize: '13px', color: new Date(inv.due_date) < new Date() ? 'var(--error)' : 'inherit', fontWeight: new Date(inv.due_date) < new Date() ? 700 : 500 }}>
                         {new Date(inv.due_date).toLocaleDateString()}
                       </span>
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>
                    {formatCurrency(inv.amount - (inv.paid_amount || 0))}
                  </td>
                  <td style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span className={`badge-premium badge-premium--${
                      inv.status === 'overdue' ? 'error' : 
                      inv.status === 'partial' ? 'warning' : 'accent'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!stats.pending_invoices || stats.pending_invoices.length === 0) && (
             <div style={{ padding: '60px 0', textAlign: 'center', opacity: 0.4 }}>
                <FileText size={40} style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: '14px', fontWeight: 600 }}>Your accounts are currently clear</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default VendorDashboard;