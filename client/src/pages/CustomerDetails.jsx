import { useSEO } from '../hooks/useSEO';
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
import localDb from '../services/localDb';
import toast from 'react-hot-toast';
import Pagination from '../components/Pagination';
import { useOnlineStatus } from '../hooks/useOffline';
import { whatsappUrl, paymentReminderMessage, dueCollectionMessage } from '../utils/whatsapp';
import { formatForDisplay, telHref } from '../utils/phone';
import Skeleton, { SkeletonText, SkeletonAvatar, SkeletonTitle, SkeletonKpi } from '../components/Skeleton';
import SecureImage from '../components/SecureImage';

import './CustomerDetails.css';
import PageContainer from '../components/ui/PageContainer';

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
import { formatCurrencyDecimal } from '../utils/formatters';
const fmtCurrency = (v) => formatCurrencyDecimal(v, 2);
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

const WhatsAppBtn = ({ mobile, customerName, outstanding, orderCount }) => {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const ref = React.useRef(null);
  const [dropPos, setDropPos] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  React.useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    }
  }, [open]);

  const options = [];
  if (outstanding > 0) {
    options.push({ label: 'Payment Reminder', icon: '💰', message: dueCollectionMessage({ customerName, totalDue: outstanding, jobCount: orderCount || 1 }) });
  }
  options.push({ label: 'Say Hello', icon: '👋', message: `Dear ${customerName || 'Customer'},\n\nGreetings from Sarga! 🙏\n\nHow can we help you today?` });
  return (
    <span ref={ref} className="cd-wa-wrap">
      <button ref={btnRef} onClick={() => setOpen(!open)} className="cd-wa-btn" title="WhatsApp">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        WhatsApp ▾
      </button>
      {open && (
        <div className="cd-wa-menu" style={{ top: dropPos.top, left: dropPos.left }}>
          {options.map((opt, i) => (
            <a key={i} href={whatsappUrl(mobile, opt.message)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
              className={`cd-wa-menu__item ${i < options.length - 1 ? 'cd-wa-menu__item--with-sep' : ''}`}
            >{opt.icon} {opt.label}</a>
          ))}
        </div>
      )}
    </span>
  );
};

const CustomerDetails = () => {
    useSEO('Customer Details');

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
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsLimit, setPaymentsLimit] = useState(10);
  const isOnline = useOnlineStatus();

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
      let dashboardData = null;
      if (isOnline) {
        try {
          const res = await api.get(`/customers/${id}/dashboard`, { params: { page: paymentsPage, limit: paymentsLimit } });
          dashboardData = res.data;
        } catch (err) {
          console.warn('[CustomerDetails] Server dashboard fetch failed, falling back to local', err && err.message);
          dashboardData = await localDb.getCustomerDashboard(id);
        }
      } else {
        dashboardData = await localDb.getCustomerDashboard(id);
      }

      if (dashboardData) {
        setData(dashboardData);
        setError('');
      } else {
        setError('Customer not found locally');
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load customer dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, [id, isOnline, paymentsPage, paymentsLimit]);
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
  const handleAddWork = () => navigate('/dashboard/sales/invoices', { state: { action: 'create', customer: data?.customer } });
  const handleReorder = (item) => {
    navigate('/dashboard/sales/invoices', {
      state: {
        action: 'create',
        customer: data?.customer,
        prefillOrderLine: { product_name: item.job_name, product_id: item.product_id, quantity: item.last_quantity, unit_price: item.last_unit_price, total_amount: item.last_quantity * item.last_unit_price }
      }
    });
  };
  const handlePayment = () => navigate('/dashboard/sales/payments', { state: { customer: data?.customer } });

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

  // Reset payments page when customer or online state changes
  useEffect(() => {
    setPaymentsPage(1);
  }, [id, isOnline]);

  /* ───── loading / error ───── */
  if (error) return <div className="alert alert--error">{error}</div>;

  // Render skeleton placeholders while `data` loads. Provide safe defaults
  // so the page shell can render immediately and individual sections
  // replace themselves when the data becomes available.
  const customer = data?.customer || {};
  const summary = data?.summary || { totalOrders: 0, totalSpent: 0, pendingOrders: 0, processingOrders: 0, completedOrders: 0, cancelledOrders: 0, lastOrderDate: null };
  const payments = data?.payments || { outstandingBalance: 0 };
  const paymentRecords = payments.records || [];
  const paymentsTotal = payments.total || paymentRecords.length || 0;
  const paymentsTotalPages = Math.max(1, Math.ceil(paymentsTotal / (paymentsLimit || 1)));
  const paginatedPayments = payments.total ? paymentRecords : paymentRecords.slice((paymentsPage - 1) * paymentsLimit, paymentsPage * paymentsLimit);
  const reorderItems = data?.reorderItems || [];
  const customerDisplayPhone = formatForDisplay(customer?.mobile);
  const customerTelHref = telHref(customer?.mobile);
  const initials = (customer.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  /* ═══════ RENDER ═══════ */
  return (
    <PageContainer>
      {/* ── HEADER ── */}
      <div className="cd-header">
        <div className="cd-header-left">
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard/customers')}>
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
        <div className="cd-avatar">{loading ? <SkeletonAvatar /> : initials}</div>
        <div className="cd-profile-info">
          <h2 className="cd-profile-name">{loading ? <SkeletonTitle width={180} /> : customer.name}</h2>
          <div className="cd-profile-badges">
            {loading ? (
              <>
                <span className="cd-badge" style={{ padding: 6 }}><SkeletonText width={70} height={16} /></span>
                <span style={{ marginLeft: 8 }}><SkeletonText width={60} height={16} /></span>
              </>
            ) : (
              <>
                <span className="cd-badge cd-badge--type">{customer.type || 'Walk-in'}</span>
                {summary.totalOrders > 10 && <span className="cd-badge cd-badge--star"><Star size={10} /> Loyal</span>}
              </>
            )}
          </div>
          <div className="cd-profile-details">
            {loading ? (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><SkeletonText width={120} /></span>
                <span><SkeletonText width={150} /></span>
                <span><SkeletonText width={130} /></span>
              </>
            ) : (
              <>
                {customer.mobile && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={13} /> <a href={customerTelHref} style={{ color: 'inherit', textDecoration: 'none' }}>{customerDisplayPhone}</a>
                    <a href={customerTelHref} style={{ color: 'var(--success)', textDecoration: 'none', fontWeight: 600, fontSize: 12 }} title="Call">📞</a>
                    <WhatsAppBtn mobile={customer.mobile} customerName={customer.name} outstanding={payments.outstandingBalance} orderCount={summary.totalOrders - summary.completedOrders - summary.cancelledOrders} />
                  </span>
                )}
                {customer.email && <span><Mail size={13} /> {customer.email}</span>}
                {customer.address && <span><MapPin size={13} /> {customer.address}</span>}
                {customer.gst && <span><Hash size={13} /> GST: {customer.gst}</span>}
                {customer.branch_name && <span><Building2 size={13} /> {customer.branch_name}</span>}
              </>
            )}
          </div>
        </div>
        <div className="cd-profile-meta">
          {loading ? (
            <>
              <span className="cd-meta-item"><SkeletonText width={110} /></span>
              <span className="cd-meta-item"><SkeletonText width={90} /></span>
            </>
          ) : (
            <>
              <span className="cd-meta-item">Customer since {fmtDate(customer.created_at)}</span>
              {summary.lastOrderDate && <span className="cd-meta-item">Last order {ago(summary.lastOrderDate)}</span>}
            </>
          )}
        </div>
      </div>

      {/* ── KPI GRID ── */}
      <div className="cd-kpis">
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap"><Package size={18} /></div>
          <div className="cd-kpi-value">{loading ? <SkeletonKpi /> : summary.totalOrders}</div>
          <div className="cd-kpi-label">Total Orders</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--success"><IndianRupee size={18} /></div>
          <div className="cd-kpi-value">{loading ? <SkeletonKpi /> : fmtCurrency(summary.totalSpent)}</div>
          <div className="cd-kpi-label">Total Spent</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--warning"><Clock size={18} /></div>
          <div className="cd-kpi-value">{loading ? <SkeletonKpi /> : summary.pendingOrders + summary.processingOrders}</div>
          <div className="cd-kpi-label">In Progress</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--success"><CheckCircle2 size={18} /></div>
          <div className="cd-kpi-value">{loading ? <SkeletonKpi /> : summary.completedOrders}</div>
          <div className="cd-kpi-label">Completed</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--error"><AlertTriangle size={18} /></div>
          <div className="cd-kpi-value">{loading ? <SkeletonKpi /> : fmtCurrency(payments.outstandingBalance)}</div>
          <div className="cd-kpi-label">Outstanding</div>
        </div>
        <div className="cd-kpi">
          <div className="cd-kpi-icon-wrap cd-kpi-icon-wrap--error"><XCircle size={18} /></div>
          <div className="cd-kpi-value">{loading ? <SkeletonKpi /> : summary.cancelledOrders}</div>
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
                  <div role="button" tabIndex={0} className="cd-order-header" onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                    <div className="cd-order-left">
                      <span className="cd-order-number">#{job.job_number || job.id}</span>
                      <span className="cd-order-name">{job.job_name}</span>
                      {/* Compact Tags for Customer Dashboard */}
                      {job.description && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {job.description.split(' | ').filter(p => p && p.trim()).map((part, i) => {
                            const isTagged = part.includes(':');
                            const [label, ...rest] = isTagged ? part.split(':') : ['', part];
                            const value = isTagged ? rest.join(':').trim() : part.trim();
                            const tagLabel = isTagged ? label.trim().toLowerCase() : '';
                            
                            const isColour = tagLabel === 'colour' || tagLabel === 'color';
                            const isNumbering = tagLabel === 'numbering' || tagLabel.includes('from') || tagLabel.includes('to');
                            const isMatter = tagLabel === 'matter';
                            
                            return (
                              <span key={i} style={{
                                fontSize: '8px',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                background: isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--muted-foreground)',
                                color: isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--muted-foreground)',
                                border: `1px solid ${isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--muted-foreground)'}`,
                                fontWeight: 700,
                                whiteSpace: 'nowrap'
                              }}>
                                {isColour && '🎨 '}
                                {isNumbering && '🔢 '}
                                {isMatter && '📝 '}
                                {tagLabel && value}
                                {!tagLabel && value}
                              </span>
                            );
                          })}
                        </div>
                      )}
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
                        {job.payment_id ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/sales/invoices')} title="View associated invoice details">
                            <FileText size={13} /> View Invoice
                          </button>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/sales/invoices', { state: { action: 'create', job: job } })} title="Generate invoice from this order">
                            <Plus size={13} /> Generate Invoice
                          </button>
                        )}
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
                    
                    {/* Compact Tags for Customer Dashboard */}
                    {job.description && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 8 }}>
                        {job.description.split(' | ').filter(p => p && p.trim()).map((part, i) => {
                          const isTagged = part.includes(':');
                          const [label, ...rest] = isTagged ? part.split(':') : ['', part];
                          const value = isTagged ? rest.join(':').trim() : part.trim();
                          const tagLabel = isTagged ? label.trim().toLowerCase() : '';
                          
                          const isColour = tagLabel === 'colour' || tagLabel === 'color';
                          const isNumbering = tagLabel === 'numbering' || tagLabel.includes('from') || tagLabel.includes('to');
                          const isMatter = tagLabel === 'matter';
                          
                          return (
                            <span key={i} style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--muted-foreground)',
                              color: isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--muted-foreground)',
                              border: `1px solid ${isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--muted-foreground)'}`,
                              fontWeight: 600,
                              whiteSpace: 'nowrap'
                            }}>
                              {isColour && '🎨 '}
                              {isNumbering && '🔢 '}
                              {isMatter && '📝 '}
                              {tagLabel && <span style={{ textTransform: 'capitalize' }}>{tagLabel}: </span>}
                              {value}
                            </span>
                          );
                        })}
                      </div>
                    )}
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
                {paginatedPayments.length === 0 ? (
                  <tr><td colSpan="5" className="text-center muted">No payment records</td></tr>
                ) : (
                  paginatedPayments.map(p => (
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
          {paymentsTotal > paymentsLimit && (
            <div style={{ marginTop: 12 }}>
              <Pagination
                page={paymentsPage}
                totalPages={paymentsTotalPages}
                total={paymentsTotal}
                limit={paymentsLimit}
                onPageChange={(p) => setPaymentsPage(p)}
                loading={refreshing}
              />
            </div>
          )}
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
                    <div role="button" tabIndex={0} onClick={() => isImage ? setPreviewDesign(d) : window.open(fileUrl, '_blank')}
                      style={{
                        height: 160, background: 'var(--bg, #f3f4f6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', position: 'relative'
                      }}
                    >
                      {isImage ? (
                        <SecureImage src={d.file_url} alt={d.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                          <FileText size={40} style={{ opacity: 0.4 }} />
                          <div style={{ fontSize: 11, marginTop: 4, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                            {d.file_type || (d.original_name || '').split('.').pop()?.toUpperCase() || ''}
                          </div>
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div style={{
                        position: 'absolute', inset: 0, background: 'var(--shadow-sm)',
                        opacity: 0, transition: 'opacity 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                      }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0}
                      >
                        <button onClick={(e) => { e.stopPropagation(); window.open(fileUrl, '_blank'); }}
                          style={{ background: 'var(--surface)', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                          <Eye size={14} /> View
                        </button>
                        <a href={fileUrl} download onClick={e => e.stopPropagation()}
                          style={{ background: 'var(--surface)', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>
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
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{fmtDate(d.created_at)}</span>
                        <span>{formatFileSize(d.file_size)}</span>
                      </div>
                      {d.job_number && (
                        <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 500 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--surface, #222)', borderRadius: 16, width: '100%', maxWidth: 500, padding: 32, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  name="uploadTitle"
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid var(--border, #555)', background: 'var(--bg, #333)', color: 'inherit', outline: 'none', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Link to Job (optional)</label>
                <select value={uploadJobId} onChange={e => setUploadJobId(e.target.value)}
                  name="uploadJobId"
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
                  name="uploadTags"
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '2px solid var(--border, #555)', background: 'var(--bg, #333)', color: 'inherit', outline: 'none', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Notes (optional)</label>
                <textarea value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} placeholder="Any special instructions or notes..." rows={2}
                  name="uploadNotes"
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
        <div role="button" tabIndex={0} style={{ position: 'fixed', inset: 0, background: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20, cursor: 'zoom-out' }}
          onClick={() => setPreviewDesign(null)}
        >
          <button onClick={() => setPreviewDesign(null)}
            style={{ position: 'absolute', top: 20, right: 20, background: 'var(--card)', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <X size={16} /> Close
          </button>
          <SecureImage
            src={previewDesign.file_url}
            alt={previewDesign.title}
            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', objectFit: 'contain' }}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: 'var(--shadow-sm)', borderRadius: 10, padding: '10px 20px', color: 'var(--on-accent)', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{previewDesign.title}</div>
            {previewDesign.notes && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{previewDesign.notes}</div>}
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default CustomerDetails;
