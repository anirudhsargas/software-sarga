import React, { useState, useEffect, useCallback } from 'react';
import { HelpCircle, Plus, Edit2, Trash2, Download, IndianRupee, Receipt, Repeat, X, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import { fmt, fmtDate, today, exportRowsToCsv, MISC_CATEGORIES } from './constants';
import { useConfirm } from '../../contexts/ConfirmContext';

const defaultForm = { expense_category: '', vendor_name: '', amount: '', payment_method: 'Cash', reference_number: '', description: '', expense_date: today(), bill_number: '', is_recurring: false };
const PAGE_SIZE = 50;

const MiscTab = ({ onError }) => {
  const { confirm } = useConfirm();
  const [dashboard, setDashboard] = useState(null);
  const [expenses, setExpenses] = useState([]);
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
      const shouldClose = window.confirm('You have unsaved expense changes. Discard them?');
      if (!shouldClose) return;
    }
    setShowForm(false);
    setConfirming(false);
    setFormDirty(false);
  };

  const fetchDashboard = useCallback(async () => { try { const r = await api.get('/misc-dashboard'); setDashboard(r.data); } catch { } }, []);
  const fetchExpenses = useCallback(async () => { try { const r = await api.get('/misc-expenses'); setExpenses(r.data); setPage(1); } catch { } }, []);

  useEffect(() => { fetchDashboard(); fetchExpenses(); }, [fetchDashboard, fetchExpenses]);

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
      if (editing) await api.put(`/misc-expenses/${editing.id}`, form);
      else await api.post('/misc-expenses', form);
      closeFormModal(true); setEditing(null); setForm(defaultForm);
      fetchDashboard(); fetchExpenses();
    } catch (err) { onError(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({ expense_category: row.expense_category, vendor_name: row.vendor_name || '', amount: row.amount, payment_method: row.payment_method || 'Cash', reference_number: row.reference_number || '', description: row.description || '', expense_date: row.expense_date?.slice(0, 10) || today(), bill_number: row.bill_number || '', is_recurring: row.is_recurring || false });
    setFormDirty(false);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Expense',
      message: 'Are you sure you want to delete this expense?',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    try { await api.delete(`/misc-expenses/${id}`); fetchDashboard(); fetchExpenses(); } catch { }
  };

  const totalPages = Math.ceil(expenses.length / PAGE_SIZE);
  const pagedExpenses = expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="em-section">
      <div className="em-filter-row" style={{ justifyContent: 'space-between' }}>
        <div className="em-section-title"><HelpCircle size={18} /> Miscellaneous Expenses</div>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setForm(defaultForm); setFormDirty(false); setShowForm(true); }}><Plus size={15} /> Add Expense</button>
      </div>

      {dashboard && (
        <div className="em-kpi-grid">
          <div className="em-kpi em-kpi--red"><IndianRupee size={28} /><div className="em-kpi__body"><div className="em-kpi__value">₹{fmt(dashboard.total_spent)}</div><div className="em-kpi__label">This Month</div></div></div>
          <div className="em-kpi em-kpi--blue"><Receipt size={28} /><div className="em-kpi__body"><div className="em-kpi__value">{dashboard.transaction_count}</div><div className="em-kpi__label">Transactions</div></div></div>
          <div className="em-kpi em-kpi--amber"><Repeat size={28} /><div className="em-kpi__body"><div className="em-kpi__value">{dashboard.recurring_count || 0}</div><div className="em-kpi__label">Recurring</div></div></div>
        </div>
      )}

      {expenses.length > 0 ? (
        <div className="em-card">
          <div className="em-card__title">All Misc Expenses <button className="btn btn-ghost btn-sm" onClick={() => exportRowsToCsv(expenses, 'misc-expenses.csv')}><Download size={14} /> CSV</button></div>
          {expenses.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '8px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, expenses.length)} of {expenses.length}</span>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={16} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={16} /></button>
            </div>
          )}
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Recurring</th><th>Actions</th></tr></thead>
              <tbody>
                {pagedExpenses.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.expense_date)}</td><td><span className="em-type-badge em-type-badge--other">{r.expense_category}</span></td><td>{r.vendor_name || '—'}</td><td className="em-amount-cell">₹{fmt(r.amount)}</td><td>{r.is_recurring ? '✓' : ''}</td>
                    <td><button className="btn btn-ghost btn-icon btn-sm" aria-label="Edit misc expense" onClick={() => openEdit(r)}><Edit2 size={14} /></button> <button className="btn btn-ghost btn-icon btn-sm" aria-label="Delete misc expense" onClick={() => handleDelete(r.id)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <div className="em-empty-text">No misc expenses yet</div>}

      {/* Misc Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeFormModal(); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>{editing ? 'Edit' : 'Add'} Miscellaneous Expense</h2><button className="btn btn-ghost btn-icon" aria-label="Close misc expense form" onClick={() => closeFormModal()}><X size={18} /></button></div>
            {!confirming && formDirty && <div className="alert alert--warning mb-12">Unsaved changes</div>}
            {!confirming ? (
              <form onSubmit={!editing ? handleReview : submitForm}>
                <div className="em-modal__body">
                  <div className="em-form-grid">
                    <div className="em-form-group"><label>Category</label><select className="em-input" value={form.expense_category} onChange={e => updateForm({ expense_category: e.target.value })} required><option value="">Select Category</option>{MISC_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                    <div className="em-form-group"><label>Vendor / Shop</label><input className="em-input" value={form.vendor_name} onChange={e => updateForm({ vendor_name: e.target.value })} /></div>
                    <div className="em-form-group"><label>Amount (₹)</label><input className="em-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => updateForm({ amount: e.target.value })} required /></div>
                    <div className="em-form-group"><label>Payment Method</label><select className="em-input" value={form.payment_method} onChange={e => updateForm({ payment_method: e.target.value })}>{['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m}>{m}</option>)}</select></div>
                    <div className="em-form-group"><label>Bill #</label><input className="em-input" value={form.bill_number} onChange={e => updateForm({ bill_number: e.target.value })} /></div>
                    <div className="em-form-group"><label>Date</label><input className="em-input" type="date" value={form.expense_date} onChange={e => updateForm({ expense_date: e.target.value })} /></div>
                    <div className="em-form-group"><label>Recurring?</label><select className="em-input" value={form.is_recurring ? 'true' : 'false'} onChange={e => updateForm({ is_recurring: e.target.value === 'true' })}><option value="false">No</option><option value="true">Yes</option></select></div>
                    <div className="em-form-group em-form-group--full"><label>Description</label><input className="em-input" value={form.description} onChange={e => updateForm({ description: e.target.value })} /></div>
                  </div>
                </div>
                <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => closeFormModal()}>Cancel</button><button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Review & Confirm'}</button></div>
              </form>
            ) : (
              <form onSubmit={submitForm}>
                <div className="em-modal__body">
                  <div className="em-confirm-summary">
                    <div className="em-confirm-summary__title"><CheckCircle size={18} /> Confirm Misc Expense</div>
                    <div className="em-confirm-summary__rows">
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Category</span><span className="em-confirm-summary__value">{form.expense_category}</span></div>
                      {form.vendor_name && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Vendor</span><span className="em-confirm-summary__value">{form.vendor_name}</span></div>}
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Amount</span><span className="em-confirm-summary__value em-confirm-summary__amount">₹{fmt(Number(form.amount))}</span></div>
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Method</span><span className="em-confirm-summary__value">{form.payment_method}</span></div>
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Date</span><span className="em-confirm-summary__value">{form.expense_date}</span></div>
                      {form.is_recurring && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Recurring</span><span className="em-confirm-summary__value">Yes</span></div>}
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

    </div>
  );
};

export default MiscTab;
