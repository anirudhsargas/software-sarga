import React, { useState, useCallback } from 'react';
import {
  Zap, Wifi, Phone, Droplets, ArrowLeft,
  Calendar, TrendingUp, TrendingDown, AlertTriangle, Loader2,
  Plus, Trash2, X, PlusCircle, ShoppingCart, IndianRupee, FileText
} from 'lucide-react';
import api from '../../services/api';
import auth from '../../services/auth';
import { fmt, fmtDate } from './constants';
import { serverToday } from '../../services/serverTime';
import { useConfirm } from '../../contexts/ConfirmContext';
import toast from 'react-hot-toast';

const DEFAULT_UTILITY_TYPES = [
  { key: 'Electricity', icon: Zap, color: 'var(--warning)' },
  { key: 'Internet / Broadband', icon: Wifi, color: 'var(--accent-2)' },
  { key: 'Phone', icon: Phone, color: 'var(--success)' },
  { key: 'Water', icon: Droplets, color: '#06b6d4' },
];

const UtilitiesTab = ({ dashboard, onPayment, onRefresh }) => {
  const { confirm } = useConfirm();
  const [selectedUtility, setSelectedUtility] = useState(null);
  const [statement, setStatement] = useState(null);
  const [loadingStmt, setLoadingStmt] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [showRequestType, setShowRequestType] = useState(false);
  const [requestTypeName, setRequestTypeName] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState('');

  // Bill recording state
  const [showBillForm, setShowBillForm] = useState(false);
  const [billForm, setBillForm] = useState({ utility_type: '', amount: '', bill_number: '', bill_date: serverToday(), description: '', connection_id: '' });
  const [billSaving, setBillSaving] = useState(false);
  const [billError, setBillError] = useState('');
  const [billSuccess, setBillSuccess] = useState('');

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  // Load custom utility types from localStorage
  const [customTypes, setCustomTypes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('custom_utility_types') || '[]'); } catch { return []; }
  });

  const UTILITY_TYPES = [
    ...DEFAULT_UTILITY_TYPES,
    ...customTypes.map(name => ({ key: name, icon: Zap, color: '#8b5cf6' }))
  ];

  const handleAddType = () => {
    const name = newTypeName.trim();
    if (!name) return;
    if (UTILITY_TYPES.some(t => t.key.toLowerCase() === name.toLowerCase())) return;
    const updated = [...customTypes, name];
    setCustomTypes(updated);
    localStorage.setItem('custom_utility_types', JSON.stringify(updated));
    setNewTypeName('');
    setShowAddType(false);
  };

  const openRequestType = () => {
    setRequestTypeName('');
    setRequestReason('');
    setRequestError('');
    setShowRequestType(true);
  };

  const submitRequestType = async () => {
    if (!requestTypeName.trim()) return;
    setRequestSaving(true);
    try {
      await api.post('/vendor-requests', {
        request_type: 'Utility',
        name: requestTypeName.trim(),
        request_reason: requestReason || null,
        branch_id: null
      });
      setShowRequestType(false);
    } catch (err) {
      setRequestError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit request');
    } finally { setRequestSaving(false); }
  };

  const handleRemoveType = async (name) => {
    const isConfirmed = await confirm({
      title: 'Remove Utility Type',
      message: `Are you sure you want to remove "${name}" from utility types?`,
      confirmText: 'Remove',
      type: 'danger'
    });
    if (!isConfirmed) return;
    const updated = customTypes.filter(t => t !== name);
    setCustomTypes(updated);
    localStorage.setItem('custom_utility_types', JSON.stringify(updated));
  };

  const handleDeletePayment = async (paymentId) => {
    const isConfirmed = await confirm({
      title: 'Delete Payment',
      message: 'Are you sure you want to delete this payment record? This cannot be undone.',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/payments/${paymentId}`);
      if (selectedUtility) openUtilityDetail(selectedUtility);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete payment');
    }
  };

  const handleDeleteBill = async (billId) => {
    const isConfirmed = await confirm({
      title: 'Delete Bill',
      message: 'Are you sure you want to delete this bill record? This cannot be undone.',
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;
    try {
      await api.delete(`/utility-bills/${billId}`);
      if (selectedUtility) openUtilityDetail(selectedUtility);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete bill');
    }
  };

  /* ── Open Bill Form ── */
  const openBillForm = (utilType) => {
    setBillForm({ utility_type: utilType, amount: '', bill_number: '', bill_date: serverToday(), description: '', connection_id: '' });
    setBillError('');
    setBillSuccess('');
    setShowBillForm(true);
  };

  /* ── Submit Bill ── */
  const handleBillSubmit = async (e) => {
    e.preventDefault();
    if (!billForm.amount || Number(billForm.amount) <= 0) { setBillError('Amount is required'); return; }
    setBillSaving(true); setBillError(''); setBillSuccess('');
    try {
      await api.post('/utility-bills', billForm);
      setBillSuccess('Bill recorded successfully!');
      setTimeout(() => {
        setShowBillForm(false);
        if (selectedUtility) openUtilityDetail(selectedUtility);
        if (onRefresh) onRefresh();
      }, 800);
    } catch (err) {
      setBillError(err.response?.data?.message || 'Failed to record bill');
    } finally { setBillSaving(false); }
  };

  /* ── Open Utility Detail Dashboard ── */
  const openUtilityDetail = useCallback(async (utilType) => {
    setSelectedUtility(utilType);
    setLoadingStmt(true);
    try {
      const r = await api.get('/reports/utility-statement', { params: { utility_type: utilType } });
      const payments = (r.data?.payments || r.data?.rows || []).map(p => ({ ...p, _entry_type: 'Payment', _date: p.payment_date }));
      const bills = (r.data?.bills || []).map(b => ({ ...b, _entry_type: 'Bill', _date: b.bill_date }));
      const combined = [...payments, ...bills].sort((a, b) => new Date(b._date) - new Date(a._date));
      setStatement({ rows: combined, payments, bills });
    } catch { setStatement({ rows: [], payments: [], bills: [] }); }
    finally { setLoadingStmt(false); }
  }, []);

  const getSummaryForType = (name) => {
    return dashboard?.utility_summary?.find(u => (u.name || u.payee_name)?.toLowerCase() === name.toLowerCase());
  };

  const handleUtilityCardClick = (e, utilityKey) => {
    // Ignore card-open when user clicks inside action area/buttons.
    if (e?.target?.closest?.('.em-utility-card__actions')) return;
    openUtilityDetail(utilityKey);
  };

  /* ══════════ Utility Detail Sub-Dashboard ══════════ */
  if (selectedUtility) {
    const rows = statement?.rows || [];
    const payments = statement?.payments || [];
    const bills = statement?.bills || [];
    const totalBilled = bills.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalPaid = payments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const balance = totalBilled - totalPaid;
    const typeInfo = UTILITY_TYPES.find(t => t.key === selectedUtility) || UTILITY_TYPES[0];
    const Icon = typeInfo.icon;

    return (
      <div className="em-section">
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedUtility(null); setStatement(null); }}>
          <ArrowLeft size={16} /> Back to Utilities
        </button>

        <div className="em-utility-header" style={{ borderLeft: `4px solid ${typeInfo.color}` }}>
          <Icon size={28} style={{ color: typeInfo.color }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{selectedUtility}</h2>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Utility Dashboard</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff', border: 'none' }} onClick={() => openBillForm(selectedUtility)}>
              <ShoppingCart size={14} /> Add Bill
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => onPayment({ type: 'Utility', payee_name: selectedUtility })}>
              <IndianRupee size={14} /> Make Payment
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="em-kpi-grid em-kpi-grid--3">
          <div className="em-kpi-card em-kpi-card--amber">
            <div className="em-kpi-card__icon"><ShoppingCart size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Total Billed</div>
              <div className="em-kpi-card__value">₹{fmt(totalBilled)}</div>
            </div>
          </div>
          <div className="em-kpi-card em-kpi-card--green">
            <div className="em-kpi-card__icon"><IndianRupee size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Total Paid</div>
              <div className="em-kpi-card__value">₹{fmt(totalPaid)}</div>
            </div>
          </div>
          <div className={`em-kpi-card ${balance > 0 ? 'em-kpi-card--red' : 'em-kpi-card--blue'}`}>
            <div className="em-kpi-card__icon">{balance > 0 ? <TrendingDown size={22} /> : <TrendingUp size={22} />}</div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Balance Due</div>
              <div className="em-kpi-card__value">₹{fmt(Math.abs(balance))}</div>
              {balance > 0 && <div className="em-kpi-card__sub em-kpi-card__sub--warn">Outstanding</div>}
              {balance <= 0 && <div className="em-kpi-card__sub em-kpi-card__sub--ok">No dues</div>}
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="em-card">
          <div className="em-card__title"><FileText size={16} /> Transaction History</div>
          {loadingStmt ? <div className="em-loading"><Loader2 className="spin" size={20} /> Loading...</div> : rows.length > 0 ? (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    {isAdmin && <th style={{ width: 50 }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.payment_date || r.bill_date || r._date)}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                          background: r._entry_type === 'Bill' ? '#fef3c7' : '#dcfce7',
                          color: r._entry_type === 'Bill' ? '#92400e' : '#166534'
                        }}>
                          {r._entry_type}
                        </span>
                      </td>
                      <td>{r.reference_number || r.bill_number || '—'}</td>
                      <td>{r.description || r.connection_id || r.payee_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: r._entry_type === 'Bill' ? 'var(--error)' : 'var(--success)' }}>
                        {r._entry_type === 'Bill' ? '-' : '+'}₹{fmt(Number(r.amount || 0))}
                      </td>
                      {isAdmin && (
                        <td>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() =>
                            r._entry_type === 'Bill' ? handleDeleteBill(r.id) : handleDeletePayment(r.id)
                          }><Trash2 size={14} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="em-empty-inline">
              <Icon size={32} strokeWidth={1} />
              <p>No transactions found for {selectedUtility}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff', border: 'none' }} onClick={() => openBillForm(selectedUtility)}><ShoppingCart size={14} /> Add Bill</button>
                <button className="btn btn-primary btn-sm" onClick={() => onPayment({ type: 'Utility', payee_name: selectedUtility })}><Plus size={14} /> Add Payment</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════ Utility Overview Grid ══════════ */
  return (
    <div className="em-section">
      <div className="em-filter-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div className="em-section-title"><Zap size={18} /> Utility Payments</div>
        {isAdmin ? (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddType(true)}>
            <PlusCircle size={15} /> Add Utility Type
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={openRequestType}>
            <PlusCircle size={15} /> Request Utility Type
          </button>
        )}
      </div>

      <div className="em-utility-grid">
        {UTILITY_TYPES.map(u => {
          const summary = getSummaryForType(u.key);
          const Icon = u.icon;
          const isPaid = summary && Number(summary.total) > 0;
          const isCustom = customTypes.includes(u.key);
          return (
            <div
              key={u.key}
              className={`em-utility-card ${isPaid ? 'em-utility-card--paid' : 'em-utility-card--pending'}`}
              onClick={(e) => handleUtilityCardClick(e, u.key)}
              style={{ cursor: 'pointer' }}
            >
              <div className="em-utility-card__header">
                <div className="em-utility-card__icon" style={{ background: `${u.color}15`, color: u.color }}>
                  <Icon size={22} />
                </div>
                <div className="em-utility-card__name">{u.key}</div>
              </div>
              <div className="em-utility-card__status">
                {isPaid ? (
                  <span className="em-status-badge em-status-badge--paid">✓ Paid ₹{fmt(summary.total)}</span>
                ) : (
                  <span className="em-status-badge em-status-badge--pending"><AlertTriangle size={11} /> Not paid this month</span>
                )}
              </div>
              <div className="em-utility-card__actions" onClick={e => e.stopPropagation()}>
                <button type="button" className="btn btn-sm em-utility-card__btn-bill" onClick={(e) => { e.stopPropagation(); openBillForm(u.key); }}>
                  <ShoppingCart size={13} /> Bill
                </button>
                <button type="button" className="btn btn-primary btn-sm em-utility-card__btn-pay" onClick={(e) => { e.stopPropagation(); onPayment({ type: 'Utility', payee_name: u.key }); }}>
                  <IndianRupee size={13} /> Pay
                </button>
                {isAdmin && isCustom && (
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Remove type" onClick={(e) => { e.stopPropagation(); handleRemoveType(u.key); }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Table */}
      {dashboard?.utility_summary?.length > 0 && (
        <div className="em-card">
          <div className="em-card__title">This Month's Utility Payments</div>
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>Utility</th><th>Amount Paid</th><th>Status</th></tr></thead>
              <tbody>
                {dashboard.utility_summary.map((u, i) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onDoubleClick={() => openUtilityDetail(u.name || u.payee_name)}>
                    <td><strong>{u.name || u.payee_name}</strong></td>
                    <td className="em-amount-cell">₹{fmt(u.total)}</td>
                    <td><span className="em-status-badge em-status-badge--paid">Paid</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Utility Type Modal ── */}
      {showAddType && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddType(false); }}>
          <div className="em-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
              <h2>Add Utility Type</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddType(false)}><X size={18} /></button>
            </div>
            <div className="em-modal__body">
              <div className="em-form-group">
                <label>Utility Name *</label>
                <input className="em-input" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="e.g. Gas, Solar, Cable TV" autoFocus />
              </div>
            </div>
            <div className="em-modal__footer">
              <button className="btn btn-ghost" onClick={() => setShowAddType(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!newTypeName.trim()} onClick={handleAddType}>Add Type</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Request Utility Type Modal (Front Office) ── */}
      {showRequestType && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRequestType(false); }}>
          <div className="em-modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
              <h2>Request Utility Type</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRequestType(false)}><X size={18} /></button>
            </div>
            <div className="em-modal__body">
              {requestError && <div className="em-error" style={{ marginBottom: 12 }}>{requestError}</div>}
              <div className="em-form-group">
                <label>Utility Name *</label>
                <input className="em-input" value={requestTypeName} onChange={e => setRequestTypeName(e.target.value)} placeholder="e.g. Gas, Solar, Cable TV" autoFocus />
              </div>
              <div className="em-form-group">
                <label>Reason / Notes</label>
                <input className="em-input" value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Why is this utility needed?" />
              </div>
            </div>
            <div className="em-modal__footer">
              <button className="btn btn-ghost" onClick={() => setShowRequestType(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!requestTypeName.trim() || requestSaving} onClick={submitRequestType}>
                {requestSaving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bill Recording Modal ── */}
      {showBillForm && (
        <div className="em-modal-backdrop" onClick={() => setShowBillForm(false)}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleBillSubmit}>
              <div className="em-modal__header">
                <h3><ShoppingCart size={18} /> Record Bill — {billForm.utility_type}</h3>
                <button type="button" className="em-modal__close" onClick={() => setShowBillForm(false)}>×</button>
              </div>
              <div className="em-modal__body">
                {billError && <div className="em-alert em-alert--danger">{billError}</div>}
                {billSuccess && <div className="em-alert em-alert--success">{billSuccess}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group">
                    <label>Amount (₹) *</label>
                    <input className="em-input" type="number" step="0.01" min="0" required value={billForm.amount} onChange={e => setBillForm(p => ({ ...p, amount: e.target.value }))} placeholder="Enter bill amount" />
                  </div>
                  <div className="em-form-group">
                    <label>Bill Number</label>
                    <input className="em-input" value={billForm.bill_number} onChange={e => setBillForm(p => ({ ...p, bill_number: e.target.value }))} placeholder="e.g. ELEC-2026-001" />
                  </div>
                  <div className="em-form-group">
                    <label>Bill Date</label>
                    <input className="em-input" type="date" value={billForm.bill_date} onChange={e => setBillForm(p => ({ ...p, bill_date: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>Connection ID / Account No.</label>
                    <input className="em-input" value={billForm.connection_id} onChange={e => setBillForm(p => ({ ...p, connection_id: e.target.value }))} placeholder="e.g. KE-12345678" />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Description</label>
                    <textarea className="em-input" rows={3} value={billForm.description} onChange={e => setBillForm(p => ({ ...p, description: e.target.value }))} placeholder="Bill details, period, meter reading etc." />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowBillForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={billSaving}>{billSaving ? 'Saving...' : 'Record Bill'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UtilitiesTab;
