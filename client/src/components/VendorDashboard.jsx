import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  Users, TrendingUp, AlertTriangle, IndianRupee, 
  Calendar, FileText, ArrowUpRight, ArrowDownRight, 
  Layers, Package, ChevronRight, RefreshCw 
} from 'lucide-react';

const VendorDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    loadDashboardStats();
  }, []);

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
      <div className="flex flex-col items-center justify-center h-400 gap-16">
        <div className="spinner-premium"></div>
        <p className="text-muted font-500">Synthesizing analytics...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="glass-card p-40">
        <div className="flex flex-col items-center justify-center gap-24">
          <AlertTriangle size={64} className="text-error opacity-30" />
          <div className="text-center max-w-500">
            <h3 className="text-20 font-700 mb-8">Analytics Unavailable</h3>
            <p className="text-muted mb-4">
              {error ? `${error}` : 'We encountered an issue while retrieving dashboard data.'}
            </p>
            <p className="text-12 text-muted-dark mb-24">
              This usually means there are no vendors in the system yet, or the database tables are not properly initialized.
            </p>
          </div>
          <div className="flex gap-12 flex-wrap justify-center">
            <button
              onClick={handleRetry}
              className="btn btn-secondary flex items-center gap-8 px-24 py-12"
            >
              <RefreshCw size={16} />
              Retry
            </button>
            <a
              href="/dashboard/vendors"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = '/dashboard/vendors?view=list';
              }}
              className="btn btn-primary px-24 py-12"
            >
              Open Directory
            </a>
          </div>
          {retryCount > 2 && (
            <div className="p-16 bg-warning-soft rounded-12 border border-warning-subtle w-full">
              <p className="text-12 font-600 text-warning">
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
    { label: 'Total Payable', value: formatCurrency(stats.pending_amount), icon: IndianRupee, color: 'warning', trend: '+5%', isPositive: false },
    { label: 'Overdue Bills', value: formatCurrency(stats.overdue_amount), icon: AlertTriangle, color: 'error', trend: '+2%', isPositive: false },
  ];

  return (
    <div className="dashboard-wrapper">
      {/* Metrics Row */}
      <div className="metrics-grid mb-32">
        {metrics.map((m, idx) => (
          <div key={idx} className="metric-card group">
            <div className={`metric-icon-box metric-icon-box--${m.color}`}>
              <m.icon size={24} />
            </div>
            <div className="metric-info">
              <span className="metric-label">{m.label}</span>
              <div className="flex items-baseline gap-8">
                <h2 className="metric-value">{m.value}</h2>
                <span className={`metric-trend ${m.isPositive ? 'text-success' : 'text-error'}`}>
                  {m.isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {m.trend}
                </span>
              </div>
            </div>
            <div className="metric-glow"></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-24 mb-32">
        {/* Trend Chart */}
        <div className="lg:col-span-8 glass-card p-24">
          <div className="flex justify-between items-center mb-24">
            <div>
              <h3 className="text-18 font-700">Spending Velocity</h3>
              <p className="text-12 text-muted">Monthly procurement trends across branches</p>
            </div>
            <div className="flex gap-12 text-11 font-600">
               <span className="flex items-center gap-4"><div className="w-8 h-8 rounded-full bg-blue-500"></div> Perambra</span>
               <span className="flex items-center gap-4"><div className="w-8 h-8 rounded-full bg-emerald-500"></div> Meppayur</span>
            </div>
          </div>
          <div className="h-320">
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
        <div className="lg:col-span-4 glass-card p-24">
          <h3 className="text-18 font-700 mb-4">Top Partners</h3>
          <p className="text-12 text-muted mb-24">Strategic vendors by volume this month</p>
          
          <div className="space-y-16">
            {stats.top_vendors?.slice(0, 5).map((vendor, i) => (
              <div key={i} className="flex items-center justify-between p-12 bg-surface-2 rounded-16 border border-subtle hover:border-accent-soft transition-colors cursor-default">
                <div className="flex items-center gap-12">
                  <div className="w-32 h-32 rounded-10 bg-accent text-on-accent flex items-center justify-center font-700 text-12">
                    {i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-6">
                      <p className="text-14 font-700 tracking-tight">{vendor.name}</p>
                      {vendor.vendor_code && (
                        <span className="text-10 font-800 text-accent bg-accent-soft px-4 rounded-4">{vendor.vendor_code}</span>
                      )}
                    </div>
                    <p className="text-11 text-muted font-600">High Volume</p>
                  </div>
                </div>
                <p className="text-14 font-700 text-accent">{formatCurrency(vendor.spend)}</p>
              </div>
            ))}
            {(!stats.top_vendors || stats.top_vendors.length === 0) && (
              <div className="py-40 text-center opacity-40">
                <Package size={32} className="mx-auto mb-8" />
                <p className="text-12">No significant volume</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pending Invoices */}
      <div className="glass-card overflow-hidden">
        <div className="p-24 border-b border-subtle flex justify-between items-center bg-surface-2/30">
          <div>
            <h3 className="text-18 font-700">Priority Liabilities</h3>
            <p className="text-12 text-muted">Awaiting settlement or verification</p>
          </div>
          <button className="text-13 font-700 text-accent flex items-center gap-4 hover:underline">
            Full Ledger <ChevronRight size={14} />
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-2/50 text-left">
                <th className="px-24 py-16 text-11 font-700 uppercase tracking-wider text-muted">Invoice Details</th>
                <th className="px-24 py-16 text-11 font-700 uppercase tracking-wider text-muted">Vendor Entity</th>
                <th className="px-24 py-16 text-11 font-700 uppercase tracking-wider text-muted">Maturity Date</th>
                <th className="px-24 py-16 text-11 font-700 uppercase tracking-wider text-muted">Balance Due</th>
                <th className="px-24 py-16 text-11 font-700 uppercase tracking-wider text-muted">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {stats.pending_invoices?.map((inv) => (
                <tr key={inv.id} className="hover:bg-surface-2/50 transition-colors">
                  <td className="px-24 py-16">
                    <p className="text-14 font-700 text-accent">{inv.invoice_number || `INV-${inv.id}`}</p>
                    <p className="text-11 text-muted font-600 uppercase tracking-tighter mt-2">{inv.branch}</p>
                  </td>
                  <td className="px-24 py-16">
                    <div className="flex items-center gap-6">
                      <p className="text-14 font-600">{inv.vendor_name}</p>
                      {inv.vendor_code && (
                        <span className="text-9 font-800 text-accent bg-accent-soft px-3 rounded-4">{inv.vendor_code}</span>
                      )}
                    </div>
                    <p className="text-11 text-muted">{new Date(inv.invoice_date).toLocaleDateString()}</p>
                  </td>
                  <td className="px-24 py-16">
                    <div className="flex items-center gap-6">
                       <Calendar size={12} className={new Date(inv.due_date) < new Date() ? 'text-error' : 'text-muted'} />
                       <span className={`text-13 font-500 ${new Date(inv.due_date) < new Date() ? 'text-error font-700' : ''}`}>
                         {new Date(inv.due_date).toLocaleDateString()}
                       </span>
                    </div>
                  </td>
                  <td className="px-24 py-16 text-14 font-700 text-accent">
                    {formatCurrency(inv.amount - (inv.paid_amount || 0))}
                  </td>
                  <td className="px-24 py-16">
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
             <div className="py-60 text-center opacity-40">
                <FileText size={40} className="mx-auto mb-12" />
                <p className="text-14 font-600">Your accounts are currently clear</p>
             </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .dashboard-wrapper { animation: fade-in 0.6s ease-out; }
        .mb-32 { margin-bottom: 32px; }
        .mb-24 { margin-bottom: 24px; }
        .mb-16 { margin-bottom: 16px; }
        .mb-12 { margin-bottom: 12px; }
        .mb-8 { margin-bottom: 8px; }
        .mb-4 { margin-bottom: 4px; }
        .mt-2 { margin-top: 2px; }
        .p-24 { padding: 24px; }
        .p-40 { padding: 40px; }
        .gap-12 { gap: 12px; }
        .gap-16 { gap: 16px; }
        .gap-24 { gap: 24px; }
        .h-320 { height: 320px; }
        .h-400 { height: 400px; }
        
        .glass-card {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          box-shadow: var(--shadow-sm);
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 24px;
        }

        .metric-card {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 20px;
          position: relative;
          overflow: hidden;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .metric-card:hover { transform: translateY(-4px); }

        .metric-icon-box {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          position: relative;
          z-index: 2;
        }

        .metric-icon-box--accent { background: var(--accent-soft); color: var(--accent); }
        .metric-icon-box--success { background: var(--success-bg); color: var(--success); }
        .metric-icon-box--warning { background: var(--warning-bg); color: var(--warning); }
        .metric-icon-box--error { background: var(--error-bg); color: var(--error); }

        .metric-info { position: relative; z-index: 2; }
        .metric-label { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .metric-value { font-size: 24px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; margin-top: 2px; }
        .metric-trend { font-size: 12px; font-weight: 700; display: flex; items-center gap: 2px; }

        .metric-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(600px circle at var(--x) var(--y), rgba(var(--accent-rgb), 0.06), transparent 40%);
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        .metric-card:hover .metric-glow { opacity: 1; }

        .badge-premium {
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .badge-premium--accent { background: var(--accent-soft); color: var(--accent); }
        .badge-premium--warning { background: var(--warning-bg); color: var(--warning); }
        .badge-premium--error { background: var(--error-bg); color: var(--error); }

        .spinner-premium {
          width: 44px;
          height: 44px;
          border: 3px solid var(--accent-soft);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default VendorDashboard;