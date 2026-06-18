import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Search, User, Phone, Palette, Calendar, Flag,
  FileText, DollarSign, Clock, CheckCircle, Eye, Send,
  AlertTriangle, ChevronDown, Upload, Save, Star, Briefcase
} from 'lucide-react';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import auth from '../../services/auth';
import '../../styles/designer-dashboard.css';

/* ── Constants ── */
const DESIGN_TYPES = [
  'Wedding Card Design', 'Invitation Design', 'Memento Design',
  'Business Branding', 'Brochure Design', 'Flyer Design',
  'Logo Design', 'Banner Design', 'Custom Printing', 'Other'
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

const SIZES = ['A4', 'A5', 'A6', 'Letter', 'Business Card', 'Custom'];

const STATUS_TABS = [
  { id: 'All', label: 'All' },
  { id: 'Requested', label: 'Waiting' },
  { id: 'Assigned', label: 'Assigned' },
  { id: 'Designing', label: 'Working' },
  { id: 'Review', label: 'Review' },
  { id: 'Approved', label: 'Approved' },
  { id: 'Delivered', label: 'Completed' },
];

const STATUS_PILL_CLASS = {
  Requested: 'status-pill--waiting',
  Assigned:  'status-pill--assigned',
  Designing: 'status-pill--working',
  Review:    'status-pill--review',
  Approved:  'status-pill--approved',
  Delivered: 'status-pill--completed',
};

const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

/* ── Helpers ── */
const now = new Date();

function formatDeadline(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Math.ceil((d - now) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Tomorrow';
  return `${diff}d`;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < now;
}

/* ── Empty form state ── */
const EMPTY_FORM = {
  customer_name: '',
  customer_phone: '',
  design_type: '',
  size: '',
  deadline: '',
  priority: 'Medium',
  notes: '',
  advance: '',
  assigned_designer: '',
  expected_delivery: '',
  status: 'Requested',
};

/* ── Main Component ── */
const DesignBooking = () => {
  useSEO('Design Queue');
  const queryClient = useQueryClient();
  const user = auth.getUser();

  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  /* ── Fetch bookings ── */
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['designer_bookings'],
    queryFn: async () => {
      const res = await api.get('/design-workspace/bookings');
      return res.data || [];
    },
    refetchInterval: 60000,
  });

  /* ── Fetch designers for assignment ── */
  const { data: designers = [] } = useQuery({
    queryKey: ['designers_list'],
    queryFn: async () => {
      try {
        const res = await api.get('/admin/designers');
        return res.data?.designers || [];
      } catch { return []; }
    },
  });

  /* ── Create booking mutation ── */
  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/design-workspace/bookings', payload),
    onSuccess: () => {
      toast.success('Booking created!');
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      queryClient.invalidateQueries(['designer_bookings']);
    },
    onError: () => toast.error('Failed to create booking'),
  });

  /* ── Status change mutation ── */
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.put(`/design-workspace/bookings/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries(['designer_bookings']);
    },
    onError: () => toast.error('Failed to update status'),
  });

  const handleFormChange = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customer_name || !form.design_type) {
      toast.error('Customer name and design type are required');
      return;
    }
    createMutation.mutate(form);
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const drafts = JSON.parse(localStorage.getItem('design_booking_drafts') || '[]');
      drafts.unshift({ ...form, savedAt: new Date().toISOString(), id: Date.now() });
      localStorage.setItem('design_booking_drafts', JSON.stringify(drafts.slice(0, 10)));
      toast.success('Draft saved locally');
    } finally {
      setSavingDraft(false);
    }
  };

  /* ── Smart queue sort: Priority → Deadline → Booking Time → VIP ── */
  const sortedQueue = [...bookings]
    .filter(b => {
      const matchStatus = statusFilter === 'All' || b.status === statusFilter;
      const matchSearch = !search ||
        b.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        b.design_type?.toLowerCase().includes(search.toLowerCase()) ||
        String(b.id).includes(search);
      return matchStatus && matchSearch;
    })
    .sort((a, b) => {
      // VIP (Urgent) first
      const pa = PRIORITY_ORDER[a.priority] ?? 9;
      const pb = PRIORITY_ORDER[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      // Then by deadline
      const da = a.due_date ? new Date(a.due_date) : new Date(9999, 0);
      const db = b.due_date ? new Date(b.due_date) : new Date(9999, 0);
      if (da - db !== 0) return da - db;
      // Then by booking time (oldest first)
      return new Date(a.created_at) - new Date(b.created_at);
    });

  return (
    <div className="booking-page">

      {/* ── Header ── */}
      <div className="designer-page-header">
        <div>
          <h1 className="designer-page-header__title">
            <Palette size={22} /> Design Bookings
          </h1>
          <p className="designer-page-header__subtitle">
            {bookings.length} total · smart-sorted by priority & deadline
          </p>
        </div>
        <button
          id="btn-new-booking"
          className="quick-action-btn quick-action-btn--primary"
          onClick={() => setShowForm(f => !f)}
        >
          <Plus size={15} />
          {showForm ? 'Hide Form' : 'New Booking'}
        </button>
      </div>

      {/* ── Split Layout ── */}
      <div className={`booking-split${showForm ? '' : ''}`} style={!showForm ? { gridTemplateColumns: '1fr' } : undefined}>

        {/* ── Booking Form ── */}
        {showForm && (
          <div className="booking-form-card">
            <div className="booking-form-header">
              <h2>New Design Booking</h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="booking-form-body">

                {/* Customer */}
                <div className="form-field">
                  <label className="form-label form-label--required">Customer Name</label>
                  <div style={{ position: 'relative' }}>
                    <User size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                      id="field-customer-name"
                      type="text"
                      className="form-input"
                      style={{ paddingLeft: 34 }}
                      placeholder="Customer name"
                      value={form.customer_name}
                      onChange={e => handleFormChange('customer_name', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="form-field">
                  <label className="form-label">Phone</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                      id="field-phone"
                      type="tel"
                      className="form-input"
                      style={{ paddingLeft: 34 }}
                      placeholder="Phone number"
                      value={form.customer_phone}
                      onChange={e => handleFormChange('customer_phone', e.target.value)}
                    />
                  </div>
                </div>

                {/* Design Type + Size */}
                <div className="form-row">
                  <div className="form-field">
                    <label className="form-label form-label--required">Design Type</label>
                    <select
                      id="field-design-type"
                      className="form-input"
                      value={form.design_type}
                      onChange={e => handleFormChange('design_type', e.target.value)}
                      required
                    >
                      <option value="">Select type</option>
                      {DESIGN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-label">Size</label>
                    <select
                      id="field-size"
                      className="form-input"
                      value={form.size}
                      onChange={e => handleFormChange('size', e.target.value)}
                    >
                      <option value="">Select size</option>
                      {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Deadline + Priority */}
                <div className="form-row">
                  <div className="form-field">
                    <label className="form-label">Deadline</label>
                    <input
                      id="field-deadline"
                      type="date"
                      className="form-input"
                      value={form.deadline}
                      onChange={e => handleFormChange('deadline', e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Priority</label>
                    <select
                      id="field-priority"
                      className="form-input"
                      value={form.priority}
                      onChange={e => handleFormChange('priority', e.target.value)}
                    >
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                {/* Advance + Expected Delivery */}
                <div className="form-row">
                  <div className="form-field">
                    <label className="form-label">Advance (₹)</label>
                    <div style={{ position: 'relative' }}>
                      <DollarSign size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                      <input
                        id="field-advance"
                        type="number"
                        className="form-input"
                        style={{ paddingLeft: 34 }}
                        placeholder="0"
                        value={form.advance}
                        onChange={e => handleFormChange('advance', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label className="form-label">Expected Delivery</label>
                    <input
                      id="field-expected-delivery"
                      type="date"
                      className="form-input"
                      value={form.expected_delivery}
                      onChange={e => handleFormChange('expected_delivery', e.target.value)}
                    />
                  </div>
                </div>

                {/* Assigned Designer */}
                <div className="form-field">
                  <label className="form-label">Assign Designer</label>
                  <select
                    id="field-designer"
                    className="form-input"
                    value={form.assigned_designer}
                    onChange={e => handleFormChange('assigned_designer', e.target.value)}
                  >
                    <option value="">— Unassigned —</option>
                    {designers.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.role})</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div className="form-field">
                  <label className="form-label">Notes</label>
                  <textarea
                    id="field-notes"
                    className="form-input"
                    style={{ minHeight: 80, resize: 'vertical' }}
                    placeholder="Design references, customer preferences, special instructions..."
                    value={form.notes}
                    onChange={e => handleFormChange('notes', e.target.value)}
                  />
                </div>

                {/* Status */}
                <div className="form-field">
                  <label className="form-label">Initial Status</label>
                  <select
                    id="field-status"
                    className="form-input"
                    value={form.status}
                    onChange={e => handleFormChange('status', e.target.value)}
                  >
                    <option value="Requested">Requested (Waiting)</option>
                    <option value="Assigned">Assigned</option>
                  </select>
                </div>

              </div>

              {/* Form Actions */}
              <div className="booking-form-actions">
                <button
                  id="btn-book"
                  type="submit"
                  className="quick-action-btn quick-action-btn--primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={createMutation.isLoading}
                >
                  <Plus size={14} />
                  {createMutation.isLoading ? 'Booking...' : 'Book'}
                </button>
                <button
                  id="btn-save-draft"
                  type="button"
                  className="quick-action-btn"
                  onClick={handleSaveDraft}
                  disabled={savingDraft}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Save size={14} />
                  {savingDraft ? 'Saving...' : 'Save Draft'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Queue Panel ── */}
        <div className="queue-panel">
          <div className="queue-header">
            <h2>
              <Briefcase size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Smart Queue
            </h2>
            {/* Search */}
            <div style={{ position: 'relative', width: 220 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                id="queue-search"
                type="text"
                placeholder="Search..."
                className="form-input"
                style={{ paddingLeft: 30, height: 36, fontSize: 13 }}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Status tabs */}
          <div className="queue-status-tabs">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.id}
                id={`tab-${tab.id.toLowerCase()}`}
                className={`queue-tab${statusFilter === tab.id ? ' queue-tab--active' : ''}`}
                onClick={() => setStatusFilter(tab.id)}
              >
                {tab.label}
                {tab.id !== 'All' && (
                  <span style={{ marginLeft: 5, opacity: 0.75, fontWeight: 800 }}>
                    {bookings.filter(b => b.status === tab.id).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Design</th>
                  <th>Priority</th>
                  <th>Deadline</th>
                  <th>Designer</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      Loading queue...
                    </td>
                  </tr>
                ) : sortedQueue.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      <CheckCircle size={28} style={{ opacity: 0.4, display: 'block', margin: '0 auto 8px' }} />
                      No bookings found
                    </td>
                  </tr>
                ) : (
                  sortedQueue.map(b => {
                    const overdue = isOverdue(b.due_date);
                    const urgentRow = b.priority === 'Urgent';
                    return (
                      <tr
                        key={b.id}
                        id={`queue-row-${b.id}`}
                        style={urgentRow ? { background: 'var(--error-bg)' } : undefined}
                      >
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>#{b.id}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                            {b.customer_name}
                          </div>
                          {b.company_name && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.company_name}</div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{b.design_type || '—'}</div>
                          {b.size && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.size}</div>}
                        </td>
                        <td>
                          <span className={`priority-badge priority-badge--${(b.priority || 'low').toLowerCase()}`}>
                            {b.priority === 'Urgent' && <Star size={10} />}
                            {b.priority || 'Normal'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontSize: 13, fontWeight: 600,
                            color: overdue ? 'var(--danger)' : 'var(--text-primary)',
                            display: 'flex', alignItems: 'center', gap: 4
                          }}>
                            {overdue && <AlertTriangle size={12} />}
                            {formatDeadline(b.due_date)}
                          </span>
                          {b.due_date && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {new Date(b.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 13, color: b.designer_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {b.designer_name || 'Unassigned'}
                        </td>
                        <td>
                          <select
                            value={b.status}
                            onChange={e => statusMutation.mutate({ id: b.id, status: e.target.value })}
                            disabled={statusMutation.isLoading}
                            className={`status-pill ${STATUS_PILL_CLASS[b.status] || ''}`}
                            style={{ border: 'none', outline: 'none', cursor: 'pointer', fontWeight: 700 }}
                          >
                            <option value="Requested">Waiting</option>
                            <option value="Assigned">Assigned</option>
                            <option value="Designing">Working</option>
                            <option value="Review">Review</option>
                            <option value="Approved">Approved</option>
                            <option value="Delivered">Delivered</option>
                          </select>
                        </td>
                        <td>
                          <button
                            className="kanban-btn"
                            id={`queue-open-${b.id}`}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignBooking;
