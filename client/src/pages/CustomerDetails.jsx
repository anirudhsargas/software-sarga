import React, { useEffect, useState, useMemo, useCallback } from 'react';
import usePolling from '../hooks/usePolling';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Plus, Phone, Mail, MapPin, Building2, Hash, Star,
  Package, IndianRupee, Clock, CheckCircle2, XCircle, CalendarDays,
  RotateCcw, Truck, CreditCard, AlertTriangle, Receipt,
  ChevronDown, ChevronUp, Eye, Filter, Image, Trash2,
  Upload, FileText, Download, X, Loader2, Copy
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

import './CustomerDetails.css';

/* ───── constants ───── */
const STATUS_STEPS = ['Pending', 'Processing', 'Completed', 'Delivered'];
const TABS = [
  { key: 'orders', label: 'Orders', icon: Package },
  { key: 'tracking', label: 'Tracking', icon: Truck },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'designs', label: 'Designs', icon: Image },
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

  // Design history state
  const [designs, setDesigns] = useState([]);
  const [designsLoading, setDesignsLoading] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadJobId, setUploadJobId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewDesign, setPreviewDesign] = useState(null);

  /* ───── fetch ───── */
  const fetchDashboard = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const res = await api.get(`/customers/${id}/dashboard`);
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

  // Fetch designs when tab switches to designs
  const fetchDesigns = async () => {
    setDesignsLoading(true);
    try {
      const res = await api.get(`/customers/${id}/designs`);
      setDesigns(res.data || []);
    } catch { setDesigns([]); }
    finally { setDesignsLoading(false); }
  };

  useEffect(() => {
    if (tab === 'designs') fetchDesigns();
  }, [tab, id]);

  /* ── Auto-refresh every 30s (pauses when tab hidden) ── */
  usePolling(() => fetchDashboard(true), 30000);

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

  const handleRepeatOrder = async (jobId) => {
    try {
      const res = await api.post(`/jobs/${jobId}/repeat`);
      toast.success(res.data.message || 'Order repeated!');
      fetchDashboard(true);
      navigate(`/dashboard/jobs/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to repeat order');
    }
  };

  const handleUploadDesigns = async () => {
    if (uploadFiles.length === 0) return toast.error('Select at least one file');
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of uploadFiles) {
        console.log(`Adding file to upload: ${f.name} (${f.type})`);
        formData.append('files', f);
      }
      if (uploadTitle) formData.append('title', uploadTitle);
      if (uploadNotes) formData.append('notes', uploadNotes);
      if (uploadTags) formData.append('tags', uploadTags);
      if (uploadJobId) formData.append('job_id', uploadJobId);

      const response = await api.post(`/customers/${id}/designs`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log('Upload response:', response);
      toast.success(`${uploadFiles.length} design(s) uploaded`);
      setUploadModal(false);
      setUploadFiles([]);
      setUploadTitle('');
      setUploadNotes('');
      setUploadTags('');
      setUploadJobId('');
      fetchDesigns();
    } catch (err) {
      console.error('Upload error details:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Upload failed';
      console.error('Error message:', errorMsg);
      toast.error(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDesign = async (designId) => {
    if (!confirm('Delete this design file permanently?')) return;
    try {
      await api.delete(`/customers/${id}/designs/${designId}`);
      toast.success('Design deleted');
      setDesigns(prev => prev.filter(d => d.id !== designId));
    } catch {
      toast.error('Failed to delete');
    }
  };

  const getServerBase = () => {
    const base = api.defaults.baseURL || '';
    return base.replace(/\/api\/?$/, '');
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

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
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="cd-title">Customer Dashboard</h1>
        </div>
        <div className="cd-header-actions">
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
                        <button className="btn btn-primary btn-sm" onClick={() => handleRepeatOrder(job.id)}
                          title="Creates a new order instantly with same details">
                          <Copy size={13} /> 1-Click Repeat
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleReorder({ job_name: job.job_name, product_id: job.product_id, last_quantity: job.quantity, last_unit_price: job.unit_price })}>
                          <RotateCcw size={13} /> Edit & Reorder
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

      {/* ── TAB: DESIGNS ── */}
      {tab === 'designs' && (
        <div className="cd-section">
          <div className="cd-section-bar">
            <h3 className="cd-section-title">Design History ({designs.length})</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setUploadModal(true)}>
              <Upload size={13} /> Upload Design
            </button>
          </div>

          {designsLoading ? (
            <div className="cd-loading" style={{ padding: '40px 0' }}>
              <div className="cd-spinner" />
              <span>Loading designs...</span>
            </div>
          ) : designs.length === 0 ? (
            <div className="cd-empty"><Image size={32} /> No designs uploaded yet</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {designs.map(d => {
                const isImage = d.file_type === 'image';
                const isPdf = d.file_type === 'pdf';
                const serverBase = getServerBase();
                const fileUrl = `${serverBase}${d.file_url}`;

                return (
                  <div key={d.id} style={{
                    border: '1px solid var(--border, #e5e7eb)', borderRadius: 12,
                    overflow: 'hidden', background: 'var(--surface, #fff)',
                    transition: 'box-shadow 0.2s', cursor: 'pointer'
                  }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    {/* Thumbnail / Preview */}
                    <div
                      onClick={() => isImage ? setPreviewDesign(d) : window.open(fileUrl, '_blank')}
                      style={{
                        height: 160, background: 'var(--bg, #f3f4f6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', position: 'relative'
                      }}
                    >
                      {isImage ? (
                        <img src={fileUrl} alt={d.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--muted, var(--muted))' }}>
                          <FileText size={40} style={{ opacity: 0.4 }} />
                          <div style={{ fontSize: 11, marginTop: 4, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                            {d.file_type || path.extname(d.original_name || '')}
                          </div>
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                        opacity: 0, transition: 'opacity 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                      }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0}
                      >
                        <button onClick={(e) => { e.stopPropagation(); window.open(fileUrl, '_blank'); }}
                          style={{ background: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                          <Eye size={14} /> View
                        </button>
                        <a href={fileUrl} download onClick={e => e.stopPropagation()}
                          style={{ background: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>
                          <Download size={14} /> Save
                        </a>
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={d.title}>
                        {d.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted, var(--muted))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{fmtDate(d.created_at)}</span>
                        <span>{formatFileSize(d.file_size)}</span>
                      </div>
                      {d.job_number && (
                        <div style={{ fontSize: 11, color: 'var(--accent, var(--accent))', marginTop: 4, fontWeight: 500 }}>
                          Job #{d.job_number} — {d.job_name}
                        </div>
                      )}
                      {d.tags && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {d.tags.split(',').map((tag, i) => (
                            <span key={i} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg, #f3f4f6)', borderRadius: 4, fontWeight: 500 }}>
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                      {d.notes && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>{d.notes}</div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border, #e5e7eb)' }}>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>by {d.uploaded_by_name || 'Unknown'}</span>
                        <button onClick={() => handleDeleteDesign(d.id)} title="Delete"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                  <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleReorder(item)}>
                      <RotateCcw size={13} /> Reorder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Upload Design Modal */}
      {uploadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--surface, #222)', borderRadius: 16, width: '100%', maxWidth: 500, padding: 32, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={20} color="var(--accent)" />
                </div>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Upload Designs</h2>
              </div>
              <button onClick={() => setUploadModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            {/* File Drop Zone */}
            <div
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #555)'; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border, #555)'; setUploadFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
              style={{
                border: '2px dashed var(--border, #555)', borderRadius: 12, padding: 24,
                textAlign: 'center', marginBottom: 16, cursor: 'pointer', transition: 'border-color 0.2s'
              }}
              onClick={() => document.getElementById('design-file-input').click()}
            >
              <Upload size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 500 }}>Click or drag files here</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>JPG, PNG, PDF, AI, PSD, EPS, CorelDRAW, InDesign, TIFF, ZIP — up to 150MB each</div>
              <input id="design-file-input" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.ai,.eps,.psd,.cdr,.indd,.tiff,.tif,.bmp,.zip,.rar"
                style={{ display: 'none' }}
                onChange={e => setUploadFiles(prev => [...prev, ...Array.from(e.target.files)])}
              />
            </div>

            {/* Selected Files */}
            {uploadFiles.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{uploadFiles.length} file(s) selected</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {uploadFiles.map((f, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--bg, #333)', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>
                      {f.name}
                      <button onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: 0, display: 'flex' }}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Title (optional)</label>
                <input type="text" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="e.g., Business Card Design v2"
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid var(--border, #555)', background: 'var(--bg, #333)', color: 'inherit', outline: 'none', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Link to Job (optional)</label>
                <select value={uploadJobId} onChange={e => setUploadJobId(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid var(--border, #555)', background: 'var(--bg, #333)', color: 'inherit', outline: 'none', fontSize: 13 }}>
                  <option value="">No job linked</option>
                  {(data?.jobs || []).slice(0, 50).map(j => (
                    <option key={j.id} value={j.id}>#{j.job_number} — {j.job_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Tags (comma-separated)</label>
                <input type="text" value={uploadTags} onChange={e => setUploadTags(e.target.value)} placeholder="e.g., logo, visiting card, letterhead"
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid var(--border, #555)', background: 'var(--bg, #333)', color: 'inherit', outline: 'none', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Notes (optional)</label>
                <textarea value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} placeholder="Any special instructions or notes..." rows={2}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid var(--border, #555)', background: 'var(--bg, #333)', color: 'inherit', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-ghost flex-1" onClick={() => { setUploadModal(false); setUploadFiles([]); }}>Cancel</button>
              <button className="btn btn-primary flex-1" onClick={handleUploadDesigns} disabled={uploading || uploadFiles.length === 0}
                style={{ opacity: uploading || uploadFiles.length === 0 ? 0.5 : 1 }}>
                {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : `Upload ${uploadFiles.length} File${uploadFiles.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Design Preview Lightbox */}
      {previewDesign && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20, cursor: 'zoom-out' }}
          onClick={() => setPreviewDesign(null)}
        >
          <button onClick={() => setPreviewDesign(null)}
            style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <X size={16} /> Close
          </button>
          <img
            src={`${getServerBase()}${previewDesign.file_url}`}
            alt={previewDesign.title}
            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', objectFit: 'contain' }}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: '10px 20px', color: '#fff', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{previewDesign.title}</div>
            {previewDesign.notes && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{previewDesign.notes}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDetails;
