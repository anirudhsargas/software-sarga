import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Plus, Phone, Mail, MapPin, Building2, Hash, Star,
  Package, IndianRupee, Clock, CheckCircle2, XCircle, CalendarDays,
  RotateCcw, Truck, CreditCard, AlertTriangle, Receipt,
  ChevronDown, ChevronUp, RefreshCw, Eye, Filter
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import './CustomerDetails.css';

/* ───── constants ───── */
const STATUS_STEPS = ['Pending', 'Processing', 'Completed', 'Delivered'];
const TABS = [
  { key: 'orders', label: 'Orders', icon: Package },
  { key: 'tracking', label: 'Tracking', icon: Truck },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'reorder', label: 'Quick Reorder', icon: RotateCcw },
];

/* ───── helpers ───── */
const fmtCurrency = (v) => '₹' + (parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const ago = (d) => {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

const CustomerDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('orders');
  const [statusFilter, setStatusFilter] = useState('All');
  const [expandedJob, setExpandedJob] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  /* ───── fetch ───── */
  const fetchDashboard = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const res = await api.get(`/customers/${id}/dashboard`, { headers: auth.getAuthHeader() });
      setData(res.data);
      setError('');
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load customer dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, [id]);
  useEffect(() => {
    if (location.state?.fromPayment) fetchDashboard(true);
  }, [location.state]);

  /* ───── derived ───── */
  const filteredJobs = useMemo(() => {
    if (!data) return [];
    if (statusFilter === 'All') return data.jobs;
    return data.jobs.filter(j => j.status === statusFilter);
  }, [data, statusFilter]);

  const assignmentsByJob = useMemo(() => {
    if (!data) return {};
    const map = {};
    (data.assignments || []).forEach(a => {
      if (!map[a.job_id]) map[a.job_id] = [];
      map[a.job_id].push(a);
    });
    return map;
  }, [data]);

  /* ───── actions ───── */
  const handleAddWork = () => navigate('/dashboard/billing', { state: { customer: data?.customer } });
  const handleReorder = (item) => {
    navigate('/dashboard/billing', {
      state: {
        customer: data?.customer,
        reorder: { job_name: item.job_name, product_id: item.product_id, quantity: item.last_quantity, unit_price: item.last_unit_price }
      }
    });
  };
  const handlePayment = () => navigate('/dashboard/customer-payments', { state: { customer: data?.customer } });

  /* ───── loading / error ───── */
  if (loading) return (
    <div className="cd-loading">
      <div className="cd-spinner" />
      <span>Loading dashboard...</span>
    </div>
  );
  if (error) return <div className="alert alert--error">{error}</div>;
  if (!data) return <div className="alert alert--error">Customer not found.</div>;

  const { customer, summary, payments, reorderItems } = data;
  const initials = (customer.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  /* ═══════ RENDER ═══════ */
  return (
    <div className="cd-page">
      {/* ── HEADER ── */}
      <div className="cd-header">
        <div className="cd-header-left">
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard/customers')}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="cd-title">Customer Dashboard</h1>
        </div>
        <div className="cd-header-actions">
          <button className="btn btn-ghost" onClick={() => fetchDashboard(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'cd-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={handleAddWork}>
            <Plus size={14} /> New Order
          </button>
        </div>
      </div>

      {/* ── PROFILE CARD ── */}
      <div className="cd-profile">
        <div className="cd-avatar">{initials}</div>
        <div className="cd-profile-info">
          <h2 className="cd-profile-name">{customer.name}</h2>
          <div className="cd-profile-badges">
            <span className="cd-badge cd-badge--type">{customer.type || 'Walk-in'}</span>
            {summary.totalOrders > 10 && <span className="cd-badge cd-badge--star"><Star size={10} /> Loyal</span>}
          </div>
          <div className="cd-profile-details">
            {customer.mobile && <span><Phone size={13} /> +91 {customer.mobile}</span>}
            {customer.email && <span><Mail size={13} /> {customer.email}</span>}
            {customer.address && <span><MapPin size={13} /> {customer.address}</span>}
            {customer.gst && <span><Hash size={13} /> GST: {customer.gst}</span>}
            {customer.branch_name && <span><Building2 size={13} /> {customer.branch_name}</span>}
          </div>
        </div>
        <div className="cd-profile-meta">
          <span className="cd-meta-item">Customer since {fmtDate(customer.created_at)}</span>
          {summary.lastOrderDate && <span className="cd-meta-item">Last order {ago(summary.lastOrderDate)}</span>}
        </div>
      </div>

      {/* ── KPI GRID ── */}
      <div className="cd-kpis">
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap"><Package size={18} /></div>
          <div className="cd-kpi-value">{summary.totalOrders}</div>
          <div className="cd-kpi-label">Total Orders</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--success"><IndianRupee size={18} /></div>
          <div className="cd-kpi-value">{fmtCurrency(summary.totalSpent)}</div>
          <div className="cd-kpi-label">Total Spent</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--warning"><Clock size={18} /></div>
          <div className="cd-kpi-value">{summary.pendingOrders + summary.processingOrders}</div>
          <div className="cd-kpi-label">In Progress</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--success"><CheckCircle2 size={18} /></div>
          <div className="cd-kpi-value">{summary.completedOrders}</div>
          <div className="cd-kpi-label">Completed</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--error"><AlertTriangle size={18} /></div>
          <div className="cd-kpi-value">{fmtCurrency(payments.outstandingBalance)}</div>
          <div className="cd-kpi-label">Outstanding</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--error"><XCircle size={18} /></div>
          <div className="cd-kpi-value">{summary.cancelledOrders}</div>
          <div className="cd-kpi-label">Cancelled</div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="cd-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`cd-tab ${tab === t.key ? 'cd-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: ORDERS ── */}
      {tab === 'orders' && (
        <div className="cd-section">
          <div className="cd-section-bar">
            <h3 className="cd-section-title">Recent Orders ({filteredJobs.length})</h3>
            <div className="cd-filters">
              {['All', 'Pending', 'Processing', 'Completed', 'Delivered', 'Cancelled'].map(s => (
                <button
                  key={s}
                  className={`cd-filter-btn ${statusFilter === s ? 'cd-filter-btn--active' : ''}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {filteredJobs.length === 0 ? (
            <div className="cd-empty"><Package size={32} /> No orders found</div>
          ) : (
            <div className="cd-orders-list">
              {filteredJobs.map(job => (
                <div key={job.id} className="cd-order-card">
                  <div className="cd-order-header" onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                    <div className="cd-order-left">
                      <span className="cd-order-number">#{job.job_number || job.id}</span>
                      <span className="cd-order-name">{job.job_name}</span>
                    </div>
                    <div className="cd-order-right">
                      <span className={`cd-status cd-status--${(job.status || 'pending').toLowerCase()}`}>
                        {job.status}
                      </span>
                      <span className="cd-order-amount">{fmtCurrency(job.total_amount)}</span>
                      {expandedJob === job.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                  {expandedJob === job.id && (
                    <div className="cd-order-details">
                      <div className="cd-detail-grid">
                        <div><span className="cd-detail-label">Quantity</span><span>{job.quantity || '—'}</span></div>
                        <div><span className="cd-detail-label">Unit Price</span><span>{fmtCurrency(job.unit_price)}</span></div>
                        <div><span className="cd-detail-label">Branch</span><span>{job.branch_name || '—'}</span></div>
                        <div><span className="cd-detail-label">Created</span><span>{fmtDate(job.created_at)}</span></div>
                        <div><span className="cd-detail-label">Payment</span><span className={`cd-pay-status cd-pay-status--${(job.payment_status || 'Unpaid').toLowerCase()}`}>{job.payment_status || 'Unpaid'}</span></div>
                        {job.notes && <div className="cd-detail-full"><span className="cd-detail-label">Notes</span><span>{job.notes}</span></div>}
                      </div>
                      {assignmentsByJob[job.id] && (
                        <div className="cd-assignment-list">
                          <span className="cd-detail-label">Staff Assigned</span>
                          {assignmentsByJob[job.id].map((a, i) => (
                            <span key={i} className="cd-assignment">{a.staff_name} — {a.role} ({a.assignment_status})</span>
                          ))}
                        </div>
                      )}
                      <div className="cd-order-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleReorder({ job_name: job.job_name, product_id: job.product_id, last_quantity: job.quantity, last_unit_price: job.unit_price })}>
                          <RotateCcw size={13} /> Reorder
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TRACKING ── */}
      {tab === 'tracking' && (
        <div className="cd-section">
          <h3 className="cd-section-title">Order Tracking</h3>
          {data.jobs.filter(j => j.status !== 'Cancelled').slice(0, 10).length === 0 ? (
            <div className="cd-empty"><Truck size={32} /> No active orders to track</div>
          ) : (
            <div className="cd-tracking-list">
              {data.jobs.filter(j => j.status !== 'Cancelled').slice(0, 10).map(job => {
                const stepIdx = STATUS_STEPS.indexOf(job.status);
                return (
                  <div key={job.id} className="cd-tracking-card">
                    <div className="cd-tracking-header">
                      <span className="cd-order-number">#{job.job_number || job.id}</span>
                      <span className="cd-order-name">{job.job_name}</span>
                      <span className="cd-order-amount">{fmtCurrency(job.total_amount)}</span>
                    </div>
                    <div className="cd-progress">
                      {STATUS_STEPS.map((step, i) => (
                        <div key={step} className={`cd-progress-step ${i <= stepIdx ? 'cd-progress-step--done' : ''} ${i === stepIdx ? 'cd-progress-step--current' : ''}`}>
                          <div className="cd-progress-dot" />
                          {i < STATUS_STEPS.length - 1 && <div className="cd-progress-line" />}
                          <span className="cd-progress-label">{step}</span>
                        </div>
                      ))}
                    </div>
                    {assignmentsByJob[job.id] && assignmentsByJob[job.id].length > 0 && (
                      <div className="cd-tracking-staff">
                        {assignmentsByJob[job.id].map((a, i) => (
                          <span key={i} className="cd-staff-chip">{a.staff_name} ({a.role})</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: PAYMENTS ── */}
      {tab === 'payments' && (
        <div className="cd-section">
          <div className="cd-section-bar">
            <h3 className="cd-section-title">Payments & Dues</h3>
            <button className="btn btn-primary btn-sm" onClick={handlePayment}>
              <Plus size={13} /> Record Payment
            </button>
          </div>

          <div className="cd-pay-kpis">
            <div className="cd-pay-kpi cd-pay-kpi--billed">
              <span className="cd-pay-kpi-label">Total Billed</span>
              <span className="cd-pay-kpi-value">{fmtCurrency(payments.totalBilled)}</span>
            </div>
            <div className="cd-pay-kpi cd-pay-kpi--paid">
              <span className="cd-pay-kpi-label">Total Paid</span>
              <span className="cd-pay-kpi-value">{fmtCurrency(payments.totalPaid)}</span>
            </div>
            <div className="cd-pay-kpi cd-pay-kpi--due">
              <span className="cd-pay-kpi-label">Outstanding</span>
              <span className="cd-pay-kpi-value">{fmtCurrency(payments.outstandingBalance)}</span>
            </div>
          </div>

          {/* Method breakdown */}
          {Object.keys(payments.methodBreakdown || {}).length > 0 && (
            <div className="cd-method-breakdown">
              <h4 className="cd-subsection-title">Payment Methods</h4>
              <div className="cd-method-bars">
                {Object.entries(payments.methodBreakdown).sort((a, b) => b[1] - a[1]).map(([method, amount]) => {
                  const methodTotal = Object.values(payments.methodBreakdown || {}).reduce((s, v) => s + Number(v || 0), 0);
                  const pct = methodTotal > 0 ? (amount / methodTotal * 100).toFixed(1) : 0;
                  return (
                    <div key={method} className="cd-method-row">
                      <span className="cd-method-name">{method}</span>
                      <div className="cd-method-bar-track">
                        <div className="cd-method-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="cd-method-value">{fmtCurrency(amount)} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payments table */}
          <div className="cd-pay-table-wrap">
            <table className="table cd-pay-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {(payments.records || []).length === 0 ? (
                  <tr><td colSpan="5" className="text-center muted">No payment records</td></tr>
                ) : (
                  payments.records.map(p => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.payment_date)}</td>
                      <td><Receipt size={13} className="muted" /> {p.payment_method}</td>
                      <td>{fmtCurrency(p.total_amount)}</td>
                      <td className="cd-text-green">{fmtCurrency(p.advance_paid)}</td>
                      <td className={Number(p.balance_amount) > 0 ? 'cd-text-red' : ''}>{fmtCurrency(p.balance_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: QUICK REORDER ── */}
      {tab === 'reorder' && (
        <div className="cd-section">
          <h3 className="cd-section-title">Quick Reorder</h3>
          {(reorderItems || []).length === 0 ? (
            <div className="cd-empty"><RotateCcw size={32} /> No previous products to reorder</div>
          ) : (
            <div className="cd-reorder-grid">
              {reorderItems.map((item, i) => (
                <div key={i} className="cd-reorder-card">
                  <div className="cd-reorder-info">
                    <span className="cd-reorder-name">{item.job_name}</span>
                    <span className="cd-reorder-meta">
                      Last: {item.last_quantity} × {fmtCurrency(item.last_unit_price)} = {fmtCurrency(item.last_total)}
                    </span>
                    <span className="cd-reorder-meta">Ordered {item.order_count}× · Last {ago(item.last_ordered)}</span>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => handleReorder(item)}>
                    <RotateCcw size={13} /> Reorder
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerDetails;
