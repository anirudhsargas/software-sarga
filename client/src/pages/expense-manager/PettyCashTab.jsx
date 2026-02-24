import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Plus, Edit2, Trash2, Download, TrendingUp, TrendingDown,
  Receipt, X, Calendar, ArrowUpRight, ArrowDownRight, Loader2, CheckCircle, AlertTriangle
} from 'lucide-react';
import api from '../../services/api';
import { fmt, fmtDate, today, thisMonth, exportRowsToCsv } from './constants';

const defaultForm = { transaction_date: today(), transaction_type: 'Cash Out', amount: '', description: '', reference_number: '', received_from: '', paid_to: '', category: '' };
const PETTY_CATEGORIES = ['Tea / Snacks', 'Stationery', 'Cleaning', 'Travel', 'Courier', 'Tips', 'Parking', 'Photocopies', 'Misc Purchases', 'Other'];

const PettyCashTab = ({ onError }) => {
  const [dashboard, setDashboard] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(thisMonth());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchDashboard = useCallback(async () => { try { const r = await api.get('/petty-cash-dashboard'); setDashboard(r.data); } catch {} }, []);
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/petty-cash-ledger'); setLedger(r.data); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDashboard(); fetchLedger(); }, [fetchDashboard, fetchLedger]);

  const handleReview = (e) => { e.preventDefault(); setConfirming(true); };

  const submitForm = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) await api.put(`/petty-cash/${editing.id}`, form);
      else await api.post('/petty-cash', form);
      setShowForm(false); setEditing(null); setForm(defaultForm); setConfirming(false);
      fetchDashboard(); fetchLedger();
    } catch (err) { onError(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({ transaction_date: row.transaction_date?.slice(0, 10) || today(), transaction_type: row.transaction_type, amount: row.amount, description: row.description || '', reference_number: row.reference_number || '', received_from: row.received_from || '', paid_to: row.paid_to || '', category: row.category || '' });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this daily cash entry?')) return;
    try { await api.delete(`/petty-cash/${id}`); fetchDashboard(); fetchLedger(); } catch {}
  };

  // Filter ledger by month
  const filteredLedger = ledger.filter(r => {
    if (!filterMonth) return true;
    return r.transaction_date?.startsWith(filterMonth);
  });

  // Calculate opening/closing balance for filtered period
  const openingBalance = ledger.length > 0 ? (() => {
    const beforeMonthEntries = ledger.filter(r => r.transaction_date < `${filterMonth}-01`);
    return beforeMonthEntries.length > 0 ? Number(beforeMonthEntries[beforeMonthEntries.length - 1]?.balance_after || 0) : 0;
  })() : 0;
  const closingBalance = filteredLedger.length > 0 ? Number(filteredLedger[filteredLedger.length - 1]?.balance_after || 0) : openingBalance;

  return (
    <div className="em-section">
      <div className="em-filter-row" style={{ justifyContent: 'space-between' }}>
        <div className="em-section-title"><Wallet size={18} /> Daily Cash</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" className="em-input em-input--sm" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setForm(defaultForm); setShowForm(true); }}><Plus size={15} /> New Entry</button>
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
      {loading ? <div className="em-loading"><Loader2 className="spin" size={20} /> Loading...</div> : filteredLedger.length > 0 ? (
        <div className="em-card">
          <div className="em-card__title">
            Daily Cash Ledger
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportRowsToCsv(filteredLedger, 'petty-cash.csv')}><Download size={14} /> CSV</button>
          </div>
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>In</th><th>Out</th><th>Balance</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredLedger.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.transaction_date)}</td>
                    <td><span className={`em-type-badge ${r.transaction_type === 'Cash In' || r.transaction_type === 'Opening' ? 'em-type-badge--payment' : 'em-type-badge--purchase'}`}>{r.transaction_type}</span></td>
                    <td>{r.category || '—'}</td>
                    <td className="em-desc-cell">{r.description || '—'}{r.paid_to ? ` → ${r.paid_to}` : ''}{r.received_from ? ` ← ${r.received_from}` : ''}</td>
                    <td>{r.transaction_type === 'Cash In' || r.transaction_type === 'Opening' ? <span className="em-amount--green">₹{fmt(r.amount)}</span> : ''}</td>
                    <td>{r.transaction_type === 'Cash Out' ? <span className="em-amount--red">₹{fmt(r.amount)}</span> : ''}</td>
                    <td style={{ fontWeight: 700 }}>₹{fmt(r.balance_after)}</td>
                    <td>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(r.id)}><Trash2 size={14} /></button>
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
            <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ ...defaultForm, transaction_type: 'Opening' }); setShowForm(true); }}>
              <Plus size={16} /> Set Opening Balance
            </button>
          </div>
        </div>
      )}

      {/* Petty Cash Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => { setShowForm(false); setConfirming(false); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>{editing ? 'Edit' : 'New'} Daily Cash Entry</h2><button className="btn btn-ghost btn-icon" onClick={() => { setShowForm(false); setConfirming(false); }}><X size={18} /></button></div>
            {!confirming ? (
              <form onSubmit={!editing ? handleReview : submitForm}>
                <div className="em-modal__body">
                  <div className="em-form-grid">
                    <div className="em-form-group"><label>Type</label><select className="em-input" value={form.transaction_type} onChange={e => setForm(p => ({ ...p, transaction_type: e.target.value }))}><option>Opening</option><option>Cash In</option><option>Cash Out</option></select></div>
                    <div className="em-form-group"><label>Amount (₹)</label><input className="em-input" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required /></div>
                    <div className="em-form-group"><label>Date</label><input className="em-input" type="date" value={form.transaction_date} onChange={e => setForm(p => ({ ...p, transaction_date: e.target.value }))} /></div>
                    <div className="em-form-group"><label>Category</label>
                      <select className="em-input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                        <option value="">Select Category</option>
                        {PETTY_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    {form.transaction_type === 'Cash In' && <div className="em-form-group"><label>Received From</label><input className="em-input" value={form.received_from} onChange={e => setForm(p => ({ ...p, received_from: e.target.value }))} /></div>}
                    {form.transaction_type === 'Cash Out' && <div className="em-form-group"><label>Paid To</label><input className="em-input" value={form.paid_to} onChange={e => setForm(p => ({ ...p, paid_to: e.target.value }))} /></div>}
                    <div className="em-form-group"><label>Reference #</label><input className="em-input" value={form.reference_number} onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))} /></div>
                    <div className="em-form-group em-form-group--full"><label>Description</label><input className="em-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Review & Confirm'}</button></div>
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
    </div>
  );
};

export default PettyCashTab;
