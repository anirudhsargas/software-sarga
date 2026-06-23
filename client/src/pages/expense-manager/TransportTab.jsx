import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Truck, Plus, Edit2, Trash2, Download, IndianRupee, TrendingUp, X, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { fmt, fmtDate, today, exportRowsToCsv, TRANSPORT_EXPENSE_TYPES } from './constants';
import { useDebounce } from '../../hooks/useDebounce';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useConfirm } from '../../contexts/ConfirmContext';
import PageContainer from '../../components/ui/PageContainer';

const defaultForm = { transport_type: '', vehicle_number: '', driver_name: '', amount: '', payment_method: 'Cash', reference_number: '', description: '', expense_date: today(), bill_number: '', from_location: '', to_location: '', distance_km: '' };
const PAGE_SIZE = 50;

const TransportTab = ({ onError }) => {
  const { confirm } = useConfirm();
  const [dashboard, setDashboard] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [formDirty, setFormDirty] = useState(false);

  const hasUnsavedChanges = showForm && formDirty && !submitting;

  const updateForm = (patch) => {
    setForm(p => ({ ...p, ...patch }));
    setFormDirty(true);
  };

  const closeFormModal = (force = false) => {
    if (!force && formDirty && !submitting) {
      const shouldClose = window.confirm('You have unsaved transport expense changes. Discard them?');
      if (!shouldClose) return;
    }
    setShowForm(false);
    setConfirming(false);
    setFormDirty(false);
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await api.get('/transport-dashboard');
      setDashboard(r.data);
    } catch (err) {
      if (onError) onError(err.response?.data?.message || 'Failed to load transport dashboard');
    }
  }, [onError]);
  const fetchExpenses = useCallback(async (pageNum = 1) => {
    try {
      const params = new URLSearchParams();
      params.append('page', pageNum);
      params.append('limit', PAGE_SIZE);
      const r = await api.get(`/transport-expenses?${params.toString()}`);
      setExpenses(r.data.data || []);
      setPage(r.data.page || 1);
    } catch {
      setExpenses([]);
    }
  }, []);

  useEffect(() => { fetchDashboard(); fetchExpenses(page); }, [fetchDashboard, fetchExpenses, page]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleReview = (e) => { e.preventDefault(); setConfirming(true); };

  const submitForm = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) await api.put(`/transport-expenses/${editing.id}`, form);
      else await api.post('/transport-expenses', form);
      closeFormModal(true); setEditing(null); setForm(defaultForm);
      fetchDashboard(); fetchExpenses();
    } catch (err) { onError(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({ transport_type: row.transport_type, vehicle_number: row.vehicle_number || '', driver_name: row.driver_name || '', amount: row.amount, payment_method: row.payment_method || 'Cash', reference_number: row.reference_number || '', description: row.description || '', expense_date: row.expense_date?.slice(0, 10) || today(), bill_number: row.bill_number || '', from_location: row.from_location || '', to_location: row.to_location || '', distance_km: row.distance_km || '' });
    setFormDirty(false);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Transport Expense',
      message: 'Are you sure you want to delete this transport expense?',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    // Optimistic UI Update
    setExpenses(prev => prev.filter(e => e.id !== id));
    try {
      await api.delete(`/transport-expenses/${id}`);
      fetchDashboard();
      fetchExpenses();
    } catch (err) {
      if (onError) onError(err.response?.data?.message || 'Failed to delete transport expense');
      fetchExpenses();
    }
  };

  const debouncedSearch = useDebounce(search, 300);
  const filteredExpenses = useMemo(() => {
    const arr = Array.isArray(expenses) ? expenses : [];
    if (!debouncedSearch) return arr;
    const s = debouncedSearch.toLowerCase();
    return arr.filter(r =>
      (r.transport_type && r.transport_type.toLowerCase().includes(s)) ||
      (r.vehicle_number && r.vehicle_number.toLowerCase().includes(s)) ||
      (r.driver_name && r.driver_name.toLowerCase().includes(s)) ||
      (r.from_location && r.from_location.toLowerCase().includes(s)) ||
      (r.to_location && r.to_location.toLowerCase().includes(s)) ||
      (r.amount && String(r.amount).includes(s)) ||
      (r.description && r.description.toLowerCase().includes(s))
    );
  }, [expenses, debouncedSearch]);
  const totalPages = Math.ceil(filteredExpenses.length / PAGE_SIZE);
  const pagedExpenses = useMemo(() => filteredExpenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredExpenses, page]);

  // Virtualizer setup
  const parentRef = React.useRef();
  const rowVirtualizer = useVirtualizer({
    count: pagedExpenses.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  return (
    <PageContainer>
      <div className="em-filter-row" style={{ justifyContent: 'space-between' }}>
        <div className="em-section-title"><Truck size={18} /> Transport & Delivery</div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setForm(defaultForm); setFormDirty(false); setShowForm(true); }}><Plus size={15} /> Add Expense</button>
      </div>

      {dashboard && (
        <div className="em-kpi-grid">
          <div className="em-kpi em-kpi--red"><IndianRupee size={28} /><div className="em-kpi__body"><div className="em-kpi__value">₹{fmt(dashboard.total_spent)}</div><div className="em-kpi__label">This Month</div></div></div>
          <div className="em-kpi em-kpi--blue"><Truck size={28} /><div className="em-kpi__body"><div className="em-kpi__value">{dashboard.transaction_count}</div><div className="em-kpi__label">Trips</div></div></div>
          <div className="em-kpi em-kpi--green"><TrendingUp size={28} /><div className="em-kpi__body"><div className="em-kpi__value">{fmt(dashboard.total_distance_km)} km</div><div className="em-kpi__label">Distance</div></div></div>
        </div>
      )}

      {expenses.length > 0 ? (
        <div className="em-card">
          <div className="em-card__title">All Transport Expenses <button className="btn btn-ghost btn-sm" onClick={() => exportRowsToCsv(expenses, 'transport-expenses.csv')}><Download size={14} /> CSV</button></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
            <label htmlFor="transport-search" className="sr-only">Search transport expenses</label>
            <input
              id="transport-search"
              className="em-input"
              style={{ maxWidth: 220 }}
              placeholder="Search transport expenses..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              aria-label="Search transport expenses"
            />
            {filteredExpenses.length > PAGE_SIZE && (
              <>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredExpenses.length)} of {filteredExpenses.length}</span>
                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={16} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={16} /></button>
              </>
            )}
          </div>
          <div className="em-table-wrap" ref={parentRef} style={{ maxHeight: 480, overflow: 'auto' }}>
            <table className="em-table">
              <thead><tr><th>Date</th><th>Type</th><th>Vehicle</th><th>From → To</th><th>Amount</th><th>Actions</th></tr></thead>
              <tbody style={{ position: 'relative', display: 'block', height: rowVirtualizer.getTotalSize(), minHeight: 48 }}>
                {rowVirtualizer.getVirtualItems().map(virtualRow => {
                  const r = pagedExpenses[virtualRow.index];
                  return (
                    <tr
                      key={r.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      <td>{fmtDate(r.expense_date)}</td>
                      <td><span className="em-type-badge em-type-badge--other">{r.transport_type}</span></td>
                      <td>{r.vehicle_number || '—'}</td>
                      <td>{r.from_location || ''}{r.to_location ? ` → ${r.to_location}` : ''}</td>
                      <td className="em-amount-cell">₹{fmt(r.amount)}</td>
                      <td>
                        <button className="btn btn-ghost btn-icon btn-sm" aria-label="Edit transport expense" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" aria-label="Delete transport expense" onClick={() => handleDelete(r.id)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pagedExpenses.length === 0 && <div className="em-empty-text">No transport expenses found</div>}
          </div>
        </div>
      ) : <div className="em-empty-text">No transport expenses yet</div>}

      {/* Transport Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeFormModal(); }}>
          <div role="button" tabIndex={0}  className="em-modal" onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <div className="em-modal__header"><h2>{editing ? 'Edit' : 'Add'} Transport Expense</h2><button className="btn btn-ghost btn-icon" aria-label="Close transport expense form" onClick={() => closeFormModal()}><X size={18} /></button></div>
            {!confirming && formDirty && <div className="alert alert--warning mb-12">Unsaved changes</div>}
            {!confirming ? (
              <form onSubmit={!editing ? handleReview : submitForm}>
                <div className="em-modal__body">
                  <div className="em-form-grid">
<div className="em-form-group"><label>Transport Type</label><select name="transport_type" aria-label="Select option"  className="em-input" value={form.transport_type} onChange={e => updateForm({ transport_type: e.target.value })} required><option value="">Select Type</option>{TRANSPORT_EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                    <div className="em-form-group"><label>Vehicle #</label><input name="vehicle_number" className="em-input" value={form.vehicle_number} onChange={e => updateForm({ vehicle_number: e.target.value })} /></div>
                    <div className="em-form-group"><label>Driver Name</label><input name="driver_name" className="em-input" value={form.driver_name} onChange={e => updateForm({ driver_name: e.target.value })} /></div>
                    <div className="em-form-group"><label>Amount (₹)</label><input name="amount" className="em-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => updateForm({ amount: e.target.value })} required /></div>
                    <div className="em-form-group"><label>From</label><input name="from_location" className="em-input" value={form.from_location} onChange={e => updateForm({ from_location: e.target.value })} /></div>
                    <div className="em-form-group"><label>To</label><input name="to_location" className="em-input" value={form.to_location} onChange={e => updateForm({ to_location: e.target.value })} /></div>
                    <div className="em-form-group"><label>Distance (km)</label><input name="distance_km" className="em-input" type="number" min="0" value={form.distance_km} onChange={e => updateForm({ distance_km: e.target.value })} /></div>
                    <div className="em-form-group"><label>Payment Method</label><select name="payment_method" aria-label="Select option"  className="em-input" value={form.payment_method} onChange={e => updateForm({ payment_method: e.target.value })}>{['Cash', 'UPI', 'Bank Transfer'].map(m => <option key={m}>{m}</option>)}</select></div>
                    <div className="em-form-group"><label>Date</label>
        <label htmlFor="date-y2ztc" className="sr-only">Select Date</label>
        <input id="date-y2ztc" name="expense_date" className="em-input" type="date" value={form.expense_date} onChange={e => updateForm({ expense_date: e.target.value })} /></div>
                    <div className="em-form-group"><label>Bill #</label><input name="bill_number" className="em-input" value={form.bill_number} onChange={e => updateForm({ bill_number: e.target.value })} /></div>
                    <div className="em-form-group em-form-group--full"><label>Description</label><input name="description" className="em-input" value={form.description} onChange={e => updateForm({ description: e.target.value })} /></div>
                  </div>
                </div>
                <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => closeFormModal()}>Cancel</button><button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Review & Confirm'}</button></div>
              </form>
            ) : (
              <form onSubmit={submitForm}>
                <div className="em-modal__body">
                  <div className="em-confirm-summary">
                    <div className="em-confirm-summary__title"><CheckCircle size={18} /> Confirm Transport Expense</div>
                    <div className="em-confirm-summary__rows">
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Type</span><span className="em-confirm-summary__value">{form.transport_type}</span></div>
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Amount</span><span className="em-confirm-summary__value em-confirm-summary__amount">₹{fmt(Number(form.amount))}</span></div>
                      {form.vehicle_number && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Vehicle</span><span className="em-confirm-summary__value">{form.vehicle_number}</span></div>}
                      {(form.from_location || form.to_location) && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Route</span><span className="em-confirm-summary__value">{form.from_location || ''} → {form.to_location || ''}</span></div>}
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Method</span><span className="em-confirm-summary__value">{form.payment_method}</span></div>
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Date</span><span className="em-confirm-summary__value">{form.expense_date}</span></div>
                    </div>
                    <div className="em-confirm-summary__warn"><AlertTriangle size={14} /> Please verify before confirming.</div>
                  </div>
                </div>
                <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>← Back to Edit</button><button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Confirm & Save'}</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default React.memo(TransportTab);
