import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Plus, Edit2, Trash2, Download, TrendingUp, TrendingDown,
  Receipt, X, Calendar, ArrowUpRight, ArrowDownRight, Loader2, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react';
import api from '../../services/api';
import { fmt, fmtDate, today, thisMonth, exportRowsToCsv } from './constants';
import { useConfirm } from '../../contexts/ConfirmContext';
import PageContainer from '../../components/ui/PageContainer';
import Loading from '../../components/ui/Loading';

const defaultForm = { transaction_date: today(), transaction_type: 'Cash Out', amount: '', description: '', reference_number: '', received_from: '', paid_to: '', category: '', book_type: '' };
const PETTY_CATEGORIES = ['Tea / Snacks', 'Stationery', 'Cleaning', 'Travel', 'Courier', 'Tips', 'Parking', 'Photocopies', 'Misc Purchases', 'Other'];
const PAGE_SIZE = 50;

const PettyCashTab = ({ onError }) => {
  const { confirm } = useConfirm();
  const [dashboard, setDashboard] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(thisMonth());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [formDirty, setFormDirty] = useState(false);

  const [assignedBooks, setAssignedBooks] = useState([]);

  const hasUnsavedChanges = showForm && formDirty && !submitting;

  const updateForm = (patch) => {
    setForm(p => ({ ...p, ...patch }));
    setFormDirty(true);
  };

  const closeFormModal = (force = false) => {
    if (!force && formDirty && !submitting) {
      const shouldClose = window.confirm('You have unsaved daily cash changes. Discard them?');
      if (!shouldClose) return;
    }
    setShowForm(false);
    setConfirming(false);
    setFormDirty(false);
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await api.get('/petty-cash-dashboard');
      setDashboard(r.data);
    } catch (err) {
      if (onError) onError(err.response?.data?.message || 'Failed to load petty cash dashboard');
    }
  }, [onError]);
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/petty-cash-ledger');
      setLedger(r.data);
    } catch (err) {
      if (onError) onError(err.response?.data?.message || 'Failed to load petty cash ledger');
    }
    finally { setLoading(false); }
  }, [onError]);

  useEffect(() => { fetchDashboard(); fetchLedger(); }, [fetchDashboard, fetchLedger]);
  useEffect(() => { setPage(1); }, [filterMonth]);

  // fetch assigned books for petty cash book selector
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/machines/my-books');
        if (!mounted) return;
        const books = res.data || [];
        setAssignedBooks(books);
        if ((!form.book_type || form.book_type === '') && books.length > 0) {
          setForm(p => ({ ...p, book_type: books[0] }));
        }
      } catch {
        if (!mounted) return;
        setAssignedBooks([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleReview = (e) => {
    e.preventDefault();
    if (!form.book_type) {
      window.alert('Please select Daily Book');
      return;
    }
    setConfirming(true);
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) await api.put(`/petty-cash/${editing.id}`, form);
      else await api.post('/petty-cash', form);
      closeFormModal(true); setEditing(null); setForm(defaultForm);
      fetchDashboard(); fetchLedger();
    } catch (err) { onError(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({ transaction_date: row.transaction_date?.slice(0, 10) || today(), transaction_type: row.transaction_type, amount: row.amount, description: row.description || '', reference_number: row.reference_number || '', received_from: row.received_from || '', paid_to: row.paid_to || '', category: row.category || '', book_type: row.book_type || '' });
    setFormDirty(false);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: 'Delete Cash Entry',
      message: 'Are you sure you want to delete this daily cash entry?',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    // Optimistic UI Update
    setLedger(prev => prev.filter(e => e.id !== id));
    try {
      await api.delete(`/petty-cash/${id}`);
      fetchDashboard();
      fetchLedger();
    } catch (err) {
      if (onError) onError(err.response?.data?.message || 'Failed to delete daily cash entry');
      fetchLedger();
    }
  };

  // Filter ledger by month
  const filteredLedger = ledger.filter(r => {
    if (!filterMonth) return true;
    return r.transaction_date?.startsWith(filterMonth);
  });

  const totalPages = Math.ceil(filteredLedger.length / PAGE_SIZE);
  const pagedLedger = filteredLedger.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Calculate opening/closing balance for filtered period
  const openingBalance = ledger.length > 0 ? (() => {
    const beforeMonthEntries = ledger.filter(r => r.transaction_date < `${filterMonth}-01`);
    return beforeMonthEntries.length > 0 ? Number(beforeMonthEntries[beforeMonthEntries.length - 1]?.balance_after || 0) : 0;
  })() : 0;
  const closingBalance = filteredLedger.length > 0 ? Number(filteredLedger[filteredLedger.length - 1]?.balance_after || 0) : openingBalance;

  return (
    <PageContainer>
      <div className="em-filter-row" style={{ justifyContent: 'space-between' }}>
        <div className="em-section-title"><Wallet size={18} /> Daily Cash</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="pc-month" className="sr-only">Filter by month</label>
          <input id="pc-month" type="month" aria-label="Filter by month" className="em-input em-input--sm" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setForm(defaultForm); setFormDirty(false); setShowForm(true); }}><Plus size={15} /> New Entry</button>
        </div>
      </div>

      {/* KPI Cards */}
      {dashboard && (
        <div className="em-kpi-grid em-kpi-grid--4">
          <div className="em-kpi-card em-kpi-card--green">
            <div className="em-kpi-card__icon"><Wallet size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Current Balance</div>
              <div className="em-kpi-card__value">₹{fmt(dashboard.current_balance)}</div>
            </div>
          </div>
          <div className="em-kpi-card em-kpi-card--blue">
            <div className="em-kpi-card__icon"><ArrowUpRight size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Cash In (Month)</div>
              <div className="em-kpi-card__value">₹{fmt(dashboard.cash_in_month)}</div>
            </div>
          </div>
          <div className="em-kpi-card em-kpi-card--red">
            <div className="em-kpi-card__icon"><ArrowDownRight size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Cash Out (Month)</div>
              <div className="em-kpi-card__value">₹{fmt(dashboard.cash_out_month)}</div>
            </div>
          </div>
          <div className="em-kpi-card em-kpi-card--amber">
            <div className="em-kpi-card__icon"><Receipt size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Transactions</div>
              <div className="em-kpi-card__value">{dashboard.transaction_count}</div>
            </div>
          </div>
        </div>
      )}

      {/* Opening / Closing Balance Bar */}
      <div className="em-balance-bar">
        <div className="em-balance-bar__item">
          <span className="em-balance-bar__label">Opening Balance</span>
          <span className="em-balance-bar__value">₹{fmt(openingBalance)}</span>
        </div>
        <div className="em-balance-bar__arrow">→</div>
        <div className="em-balance-bar__item">
          <span className="em-balance-bar__label">Closing Balance</span>
          <span className="em-balance-bar__value">₹{fmt(closingBalance)}</span>
        </div>
      </div>

      {/* Ledger Table */}
      {loading ? <Loading type="spinner" text="Loading petty cash..." /> : filteredLedger.length > 0 ? (
        <div className="em-card">
          <div className="em-card__title">
            Daily Cash Ledger
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportRowsToCsv(filteredLedger, 'petty-cash.csv')}><Download size={14} /> CSV</button>
          </div>
          {filteredLedger.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '8px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredLedger.length)} of {filteredLedger.length}</span>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={16} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={16} /></button>
            </div>
          )}
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>In</th><th>Out</th><th>Balance</th><th>Actions</th></tr></thead>
              <tbody>
                {pagedLedger.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.transaction_date)}</td>
                    <td><span className={`em-type-badge ${r.transaction_type === 'Cash In' || r.transaction_type === 'Opening' ? 'em-type-badge--payment' : 'em-type-badge--purchase'}`}>{r.transaction_type}</span></td>
                    <td>{r.category || '—'}</td>
                    <td className="em-desc-cell">{r.description || '—'}{r.paid_to ? ` → ${r.paid_to}` : ''}{r.received_from ? ` ← ${r.received_from}` : ''}</td>
                    <td>{r.transaction_type === 'Cash In' || r.transaction_type === 'Opening' ? <span className="em-amount--green">₹{fmt(r.amount)}</span> : ''}</td>
                    <td>{r.transaction_type === 'Cash Out' ? <span className="em-amount--red">₹{fmt(r.amount)}</span> : ''}</td>
                    <td style={{ fontWeight: 700 }}>₹{fmt(r.balance_after)}</td>
                    <td>
                      <button className="btn btn-ghost btn-icon btn-sm" aria-label="Edit daily cash entry" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" aria-label="Delete daily cash entry" onClick={() => handleDelete(r.id)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="em-empty-state">
          <div className="em-empty-state__icon"><Wallet size={48} strokeWidth={1.5} /></div>
          <h3 className="em-empty-state__title">No Daily Cash Entries</h3>
          <p className="em-empty-state__desc">Start by recording an opening balance or your first daily cash transaction.</p>
          <div className="em-empty-state__actions">
            <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ ...defaultForm, transaction_type: 'Opening' }); setFormDirty(false); setShowForm(true); }}>
              <Plus size={16} /> Set Opening Balance
            </button>
          </div>
        </div>
      )}

      {/* Petty Cash Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeFormModal(); }}>
          <div role="button" tabIndex={0}  className="em-modal" onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
            <div className="em-modal__header"><h2>{editing ? 'Edit' : 'New'} Daily Cash Entry</h2><button className="btn btn-ghost btn-icon" aria-label="Close daily cash form" onClick={() => closeFormModal()}><X size={18} /></button></div>
            {!confirming && formDirty && <div className="alert alert--warning mb-12">Unsaved changes</div>}
            {!confirming ? (
              <form onSubmit={!editing ? handleReview : submitForm}>
                <div className="em-modal__body">
                  <div className="em-form-grid">
                    <div className="em-form-group"><label>Type</label><select name="transaction_type" aria-label="Select option"  className="em-input" value={form.transaction_type} onChange={e => updateForm({ transaction_type: e.target.value })}><option>Opening</option><option>Cash In</option><option>Cash Out</option></select></div>
                    <div className="em-form-group"><label>Daily Book</label><select name="book_type" aria-label="Select option" className="em-input" value={form.book_type || ''} onChange={e => updateForm({ book_type: e.target.value })}><option value="">Select Book</option>{((assignedBooks && assignedBooks.length > 0) ? assignedBooks : ['Offset','Laser','Other']).map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                    <div className="em-form-group"><label>Amount (₹)</label><input name="amount" className="em-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => updateForm({ amount: e.target.value })} required /></div>
                    <div className="em-form-group"><label>Date</label>
        <label htmlFor="date-t2y6d8" className="sr-only">Select Date</label>
        <input id="date-t2y6d8" name="transaction_date" className="em-input" type="date" value={form.transaction_date} onChange={e => updateForm({ transaction_date: e.target.value })} /></div>
                    <div className="em-form-group"><label>Category</label>
                      <select name="category" aria-label="Select option"  className="em-input" value={form.category} onChange={e => updateForm({ category: e.target.value })}>
                        <option value="">Select Category</option>
                        {PETTY_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    {form.transaction_type === 'Cash In' && <div className="em-form-group"><label>Received From</label><input name="received_from" className="em-input" value={form.received_from} onChange={e => updateForm({ received_from: e.target.value })} /></div>}
                    {form.transaction_type === 'Cash Out' && <div className="em-form-group"><label>Paid To</label><input name="paid_to" className="em-input" value={form.paid_to} onChange={e => updateForm({ paid_to: e.target.value })} /></div>}
                    <div className="em-form-group"><label>Reference #</label><input name="reference_number" className="em-input" value={form.reference_number} onChange={e => updateForm({ reference_number: e.target.value })} /></div>
                    <div className="em-form-group em-form-group--full"><label>Description</label><input name="description" className="em-input" value={form.description} onChange={e => updateForm({ description: e.target.value })} /></div>
                  </div>
                </div>
                <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => closeFormModal()}>Cancel</button><button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Review & Confirm'}</button></div>
              </form>
            ) : (
              <form onSubmit={submitForm}>
                <div className="em-modal__body">
                  <div className="em-confirm-summary">
                    <div className="em-confirm-summary__title"><CheckCircle size={18} /> Confirm Daily Cash Entry</div>
                    <div className="em-confirm-summary__rows">
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Type</span><span className="em-confirm-summary__value">{form.transaction_type}</span></div>
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Amount</span><span className="em-confirm-summary__value em-confirm-summary__amount">₹{fmt(Number(form.amount))}</span></div>
                      {form.category && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Category</span><span className="em-confirm-summary__value">{form.category}</span></div>}
                      {form.paid_to && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Paid To</span><span className="em-confirm-summary__value">{form.paid_to}</span></div>}
                      {form.received_from && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Received From</span><span className="em-confirm-summary__value">{form.received_from}</span></div>}
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Date</span><span className="em-confirm-summary__value">{form.transaction_date}</span></div>
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

export default React.memo(PettyCashTab);
