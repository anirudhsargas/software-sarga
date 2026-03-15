import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, IndianRupee, Loader2, ArrowLeft,
  Calendar, CheckCircle, Clock, AlertTriangle,
  X, User, CreditCard, Download
} from 'lucide-react';
import api from '../../services/api';
import { fmt, fmtDate, today, thisMonth } from './constants';

const DEFAULT_PAY_FORM = { amount: '', payment_date: today(), payment_method: 'Cash', reference_number: '', notes: '', bonus: '0', deduction: '0' };
const DEFAULT_BULK_FORM = { payment_method: 'Cash', payment_date: today(), reference_number: '', notes: '', bonus: '0', deduction: '0' };

const StaffExpensesTab = ({ onPayment, onError }) => {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [salaryInfo, setSalaryInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState(DEFAULT_PAY_FORM);
  const [month, setMonth] = useState(thisMonth());
  const [payConfirming, setPayConfirming] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payDirty, setPayDirty] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkForm, setBulkForm] = useState(DEFAULT_BULK_FORM);
  const [bulkDirty, setBulkDirty] = useState(false);

  const hasUnsavedChanges = (showPayModal && payDirty && !paySubmitting) || (showBulkModal && bulkDirty && !bulkSubmitting);

  const closePayModal = (force = false) => {
    if (!force && payDirty && !paySubmitting) {
      const shouldClose = window.confirm('You have unsaved salary payment changes. Discard them?');
      if (!shouldClose) return;
    }
    setShowPayModal(false);
    setPayConfirming(false);
    setPayDirty(false);
  };

  const closeBulkModal = (force = false) => {
    if (!force && bulkDirty && !bulkSubmitting) {
      const shouldClose = window.confirm('You have unsaved bulk payment changes. Discard them?');
      if (!shouldClose) return;
    }
    setShowBulkModal(false);
    setBulkDirty(false);
  };

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/staff');
      setStaffList(Array.isArray(r.data) ? r.data : r.data?.data || []);
    } catch { setStaffList([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const openStaffSalary = useCallback(async (staff) => {
    setSelectedStaff(staff);
    setLoadingInfo(true);
    try {
      const r = await api.get(`/staff/${staff.id}/salary-info`);
      setSalaryInfo(r.data);
    } catch { setSalaryInfo(null); }
    finally { setLoadingInfo(false); }
  }, []);

  const handleSalaryReview = (e) => { e.preventDefault(); setPayConfirming(true); };

  const toggleStaffSelection = (staffId) => {
    setSelectedStaffIds(prev => prev.includes(staffId)
      ? prev.filter(id => id !== staffId)
      : [...prev, staffId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedStaffIds.length === staffList.length) {
      setSelectedStaffIds([]);
      return;
    }
    setSelectedStaffIds(staffList.map(s => s.id));
  };

  const downloadSalarySlip = async (staffId, ym) => {
    try {
      const response = await api.get(`/staff/${staffId}/salary-slip/${ym}`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `salary-slip-${staffId}-${ym}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (onError) onError(err.response?.data?.message || 'Failed to download salary slip');
    }
  };

  const submitSalaryPayment = async (e) => {
    e.preventDefault();
    if (!selectedStaff) return;
    setPaySubmitting(true);
    try {
      await api.post(`/staff/${selectedStaff.id}/pay-salary`, {
        payment_month: `${month}-01`,
        base_salary: Number(payForm.amount || 0),
        payment_amount: Number(payForm.amount || 0),
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        reference_number: payForm.reference_number,
        notes: payForm.notes,
        bonus: Number(payForm.bonus || 0),
        deduction: Number(payForm.deduction || 0)
      });
      closePayModal(true);
      setPayForm(DEFAULT_PAY_FORM);
      openStaffSalary(selectedStaff);
    } catch (err) {
      if (onError) onError(err.response?.data?.message || 'Payment failed');
    }
    finally { setPaySubmitting(false); }
  };

  const submitBulkSalaryPayment = async (e) => {
    e.preventDefault();
    if (selectedStaffIds.length === 0) {
      if (onError) onError('Select at least one staff for bulk payment');
      return;
    }
    setBulkSubmitting(true);
    try {
      const { data } = await api.post('/staff/bulk-pay-salary', {
        staff_ids: selectedStaffIds,
        payment_month: `${month}-01`,
        payment_method: bulkForm.payment_method,
        payment_date: bulkForm.payment_date,
        reference_number: bulkForm.reference_number,
        notes: bulkForm.notes,
        bonus: Number(bulkForm.bonus || 0),
        deduction: Number(bulkForm.deduction || 0)
      });

      closeBulkModal(true);
      setSelectedStaffIds([]);
      fetchStaff();

      if (onPayment) {
        onPayment({
          type: 'Salary',
          amount: (data?.processed || []).reduce((sum, p) => sum + Number(p.amount || 0), 0),
          notes: `Bulk salary processed: ${data?.processed_count || 0} success, ${data?.failed_count || 0} failed`
        });
      }
    } catch (err) {
      if (onError) onError(err.response?.data?.message || 'Bulk salary payment failed');
    } finally {
      setBulkSubmitting(false);
    }
  };

  /* ── Staff Salary Detail ── */
  if (selectedStaff) {
    const info = salaryInfo;
    const staff = info?.staff || selectedStaff;
    const currentSalary = info?.currentMonthSalary;
    const records = info?.salaryRecords || [];
    const payments = info?.recentPayments || [];
    const isPaid = currentSalary?.status === 'Paid';
    const isPartial = currentSalary?.status === 'Partial';

    return (
      <div className="em-section">
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedStaff(null); setSalaryInfo(null); }}>
          <ArrowLeft size={16} /> Back to Staff List
        </button>

        {loadingInfo ? <div className="em-loading"><Loader2 className="spin" size={20} /> Loading salary info...</div> : (
          <>
            <div className="em-finance-header">
              <div className="em-staff-avatar"><User size={24} /></div>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{staff.name}</h2>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{staff.role} · {staff.salary_type === 'daily' ? `₹${fmt(staff.daily_rate)}/day` : `₹${fmt(staff.base_salary)}/month`}</span>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => downloadSalarySlip(staff.id, month)}>
                <Download size={14} /> Salary Slip
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => {
                setPayForm(p => ({ ...p, amount: String(staff.base_salary || staff.daily_rate * 26 || '') }));
                setPayDirty(false);
                setShowPayModal(true);
              }}>
                <IndianRupee size={14} /> Pay Salary
              </button>
            </div>

            {/* Salary KPIs */}
            <div className="em-kpi-grid em-kpi-grid--4">
              <div className="em-kpi-card em-kpi-card--blue">
                <div className="em-kpi-card__icon"><CreditCard size={22} /></div>
                <div className="em-kpi-card__body">
                  <div className="em-kpi-card__label">Base Salary</div>
                  <div className="em-kpi-card__value">₹{fmt(staff.base_salary || (staff.daily_rate * 26))}</div>
                </div>
              </div>
              <div className={`em-kpi-card ${isPaid ? 'em-kpi-card--green' : isPartial ? 'em-kpi-card--amber' : 'em-kpi-card--red'}`}>
                <div className="em-kpi-card__icon">{isPaid ? <CheckCircle size={22} /> : <AlertTriangle size={22} />}</div>
                <div className="em-kpi-card__body">
                  <div className="em-kpi-card__label">This Month</div>
                  <div className="em-kpi-card__value">{isPaid ? 'Paid' : isPartial ? 'Partial' : 'Pending'}</div>
                  {currentSalary?.net_salary && <div className="em-kpi-card__sub">₹{fmt(currentSalary.net_salary)}</div>}
                </div>
              </div>
              <div className="em-kpi-card em-kpi-card--teal">
                <div className="em-kpi-card__icon"><Calendar size={22} /></div>
                <div className="em-kpi-card__body">
                  <div className="em-kpi-card__label">Records</div>
                  <div className="em-kpi-card__value">{records.length}</div>
                  <div className="em-kpi-card__sub">Last 12 months</div>
                </div>
              </div>
              <div className="em-kpi-card em-kpi-card--purple">
                <div className="em-kpi-card__icon"><IndianRupee size={22} /></div>
                <div className="em-kpi-card__body">
                  <div className="em-kpi-card__label">Total Payments</div>
                  <div className="em-kpi-card__value">{payments.length}</div>
                </div>
              </div>
            </div>

            {/* Salary Records */}
            {records.length > 0 && (
              <div className="em-card">
                <div className="em-card__title"><Calendar size={16} /> Salary Records (Last 12 Months)</div>
                <div className="em-table-wrap">
                  <table className="em-table">
                    <thead><tr><th>Month</th><th>Base</th><th>Bonus</th><th>Deduction</th><th>Net</th><th>Status</th><th>Paid Date</th></tr></thead>
                    <tbody>
                      {records.map(r => (
                        <tr key={r.id}>
                          <td>{r.payment_month ? new Date(r.payment_month).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}</td>
                          <td>₹{fmt(r.base_salary)}</td>
                          <td>{r.bonus > 0 ? <span className="em-amount--green">+₹{fmt(r.bonus)}</span> : '—'}</td>
                          <td>{r.deduction > 0 ? <span className="em-amount--red">-₹{fmt(r.deduction)}</span> : '—'}</td>
                          <td className="em-amount-cell">₹{fmt(r.net_salary)}</td>
                          <td><span className={`em-status-badge em-status-badge--${r.status === 'Paid' ? 'paid' : r.status === 'Partial' ? 'partial' : 'pending'}`}>{r.status}</span></td>
                          <td>{fmtDate(r.paid_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent Payments */}
            {payments.length > 0 && (
              <div className="em-card">
                <div className="em-card__title"><IndianRupee size={16} /> Recent Payment Transactions</div>
                <div className="em-table-wrap">
                  <table className="em-table">
                    <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Notes</th></tr></thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td>{fmtDate(p.payment_date)}</td>
                          <td className="em-amount-cell">₹{fmt(p.payment_amount)}</td>
                          <td>{p.payment_method || '—'}</td>
                          <td>{p.reference_number || '—'}</td>
                          <td className="em-desc-cell">{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Salary Payment Modal */}
        {showPayModal && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closePayModal(); }}>
            <div className="em-modal em-modal--sm" onClick={e => e.stopPropagation()}>
              <div className="em-modal__header"><h2>Pay Salary — {selectedStaff.name}</h2><button className="btn btn-ghost btn-icon" aria-label="Close salary payment modal" onClick={() => closePayModal()}><X size={18} /></button></div>
              {payDirty && !payConfirming && <div className="alert alert--warning mb-12">Unsaved changes</div>}
              {!payConfirming ? (
                <form onSubmit={handleSalaryReview}>
                  <div className="em-modal__body">
                    <div className="em-form-grid">
                      <div className="em-form-group"><label>For Month</label><input className="em-input" type="month" value={month} onChange={e => { setMonth(e.target.value); setPayDirty(true); }} required /></div>
                      <div className="em-form-group"><label>Amount (₹)</label><input className="em-input" type="number" min="0" step="0.01" value={payForm.amount} onChange={e => { setPayForm(p => ({ ...p, amount: e.target.value })); setPayDirty(true); }} required /></div>
                      <div className="em-form-group"><label>Bonus (₹)</label><input className="em-input" type="number" min="0" value={payForm.bonus} onChange={e => { setPayForm(p => ({ ...p, bonus: e.target.value })); setPayDirty(true); }} /></div>
                      <div className="em-form-group"><label>Deduction (₹)</label><input className="em-input" type="number" min="0" value={payForm.deduction} onChange={e => { setPayForm(p => ({ ...p, deduction: e.target.value })); setPayDirty(true); }} /></div>
                      <div className="em-form-group"><label>Payment Method</label><select className="em-input" value={payForm.payment_method} onChange={e => { setPayForm(p => ({ ...p, payment_method: e.target.value })); setPayDirty(true); }}><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option></select></div>
                      <div className="em-form-group"><label>Reference #</label><input className="em-input" value={payForm.reference_number} onChange={e => { setPayForm(p => ({ ...p, reference_number: e.target.value })); setPayDirty(true); }} /></div>
                      <div className="em-form-group em-form-group--full"><label>Notes</label><input className="em-input" value={payForm.notes} onChange={e => { setPayForm(p => ({ ...p, notes: e.target.value })); setPayDirty(true); }} /></div>
                    </div>
                  </div>
                  <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => closePayModal()}>Cancel</button><button type="submit" className="btn btn-primary" disabled={!payForm.amount || Number(payForm.amount) <= 0}>Review & Confirm</button></div>
                </form>
              ) : (
                <form onSubmit={submitSalaryPayment}>
                  <div className="em-modal__body">
                    <div className="em-confirm-summary">
                      <div className="em-confirm-summary__title"><CheckCircle size={18} /> Confirm Salary Payment</div>
                      <div className="em-confirm-summary__rows">
                        <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Employee</span><span className="em-confirm-summary__value">{selectedStaff.name}</span></div>
                        <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">For Month</span><span className="em-confirm-summary__value">{month}</span></div>
                        <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Amount</span><span className="em-confirm-summary__value em-confirm-summary__amount">₹{fmt(Number(payForm.amount))}</span></div>
                        {Number(payForm.bonus) > 0 && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Bonus</span><span className="em-confirm-summary__value" style={{ color: 'var(--success)' }}>+₹{fmt(Number(payForm.bonus))}</span></div>}
                        {Number(payForm.deduction) > 0 && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Deduction</span><span className="em-confirm-summary__value" style={{ color: 'var(--error)' }}>-₹{fmt(Number(payForm.deduction))}</span></div>}
                        <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Method</span><span className="em-confirm-summary__value">{payForm.payment_method}</span></div>
                      </div>
                      <div className="em-confirm-summary__warn"><AlertTriangle size={14} /> Please verify the salary details before confirming.</div>
                    </div>
                  </div>
                  <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setPayConfirming(false)}>← Back to Edit</button><button type="submit" className="btn btn-primary" disabled={paySubmitting}>{paySubmitting ? 'Processing...' : 'Confirm Payment'}</button></div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Staff List ── */
  return (
    <div className="em-section">
      <div className="em-section-title"><Users size={18} /> Staff Expenses & Salary</div>

      {staffList.length > 0 && (
        <div className="row gap-sm items-center mb-12" style={{ justifyContent: 'space-between' }}>
          <label className="row gap-sm items-center" style={{ fontSize: 13, color: 'var(--muted)' }}>
            <input
              type="checkbox"
              checked={selectedStaffIds.length > 0 && selectedStaffIds.length === staffList.length}
              onChange={toggleSelectAll}
            />
            Select all ({selectedStaffIds.length}/{staffList.length})
          </label>
          <button
            className="btn btn-primary btn-sm"
            disabled={selectedStaffIds.length === 0}
            onClick={() => setShowBulkModal(true)}
          >
            <IndianRupee size={14} /> Bulk Pay Selected
          </button>
        </div>
      )}

      {loading ? <div className="em-loading"><Loader2 className="spin" size={20} /> Loading staff...</div> : staffList.length === 0 ? (
        <div className="em-empty-state">
          <div className="em-empty-state__icon"><Users size={48} strokeWidth={1.5} /></div>
          <h3 className="em-empty-state__title">No Staff Members Found</h3>
          <p className="em-empty-state__desc">Add staff members in Staff Management to start tracking salaries and expenses here.</p>
          <div className="em-empty-state__actions">
            <button className="btn btn-primary" onClick={() => onPayment({ type: 'Salary' })}>
              <Plus size={16} /> Quick Salary Payment
            </button>
          </div>
        </div>
      ) : (
        <div className="em-staff-grid">
          {staffList.map(s => (
            <div key={s.id} className="em-staff-card" onClick={() => openStaffSalary(s)}>
              <div style={{ alignSelf: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={selectedStaffIds.includes(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleStaffSelection(s.id)}
                />
              </div>
              <div className="em-staff-card__avatar"><User size={22} /></div>
              <div className="em-staff-card__info">
                <div className="em-staff-card__name">{s.name}</div>
                <div className="em-staff-card__role">{s.role || s.designation || '—'}</div>
                <div className="em-staff-card__salary">
                  {s.salary_type === 'daily' ? `₹${fmt(s.daily_rate)}/day` : `₹${fmt(s.base_salary)}/month`}
                </div>
              </div>
              <div className="em-staff-card__actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadSalarySlip(s.id, month);
                  }}
                >
                  <Download size={14} /> Slip
                </button>
                <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setSelectedStaff(s); setPayForm(p => ({ ...p, amount: String(s.base_salary || s.daily_rate * 26 || '') })); setPayDirty(false); setShowPayModal(true); }}>
                  <IndianRupee size={14} /> Pay
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBulkModal && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeBulkModal(); }}>
          <div className="em-modal em-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="em-modal__header">
              <h2>Bulk Salary Payment ({selectedStaffIds.length} staff)</h2>
              <button className="btn btn-ghost btn-icon" aria-label="Close bulk salary modal" onClick={() => closeBulkModal()}><X size={18} /></button>
            </div>
            {bulkDirty && <div className="alert alert--warning mb-12">Unsaved changes</div>}
            <form onSubmit={submitBulkSalaryPayment}>
              <div className="em-modal__body">
                <div className="em-form-grid">
                  <div className="em-form-group"><label>For Month</label><input className="em-input" type="month" value={month} onChange={e => { setMonth(e.target.value); setBulkDirty(true); }} required /></div>
                  <div className="em-form-group"><label>Payment Date</label><input className="em-input" type="date" value={bulkForm.payment_date} onChange={e => { setBulkForm(p => ({ ...p, payment_date: e.target.value })); setBulkDirty(true); }} required /></div>
                  <div className="em-form-group"><label>Method</label><select className="em-input" value={bulkForm.payment_method} onChange={e => { setBulkForm(p => ({ ...p, payment_method: e.target.value })); setBulkDirty(true); }}><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option></select></div>
                  <div className="em-form-group"><label>Reference #</label><input className="em-input" value={bulkForm.reference_number} onChange={e => { setBulkForm(p => ({ ...p, reference_number: e.target.value })); setBulkDirty(true); }} /></div>
                  <div className="em-form-group"><label>Bonus (applies each)</label><input className="em-input" type="number" min="0" value={bulkForm.bonus} onChange={e => { setBulkForm(p => ({ ...p, bonus: e.target.value })); setBulkDirty(true); }} /></div>
                  <div className="em-form-group"><label>Deduction (applies each)</label><input className="em-input" type="number" min="0" value={bulkForm.deduction} onChange={e => { setBulkForm(p => ({ ...p, deduction: e.target.value })); setBulkDirty(true); }} /></div>
                  <div className="em-form-group em-form-group--full"><label>Notes</label><input className="em-input" value={bulkForm.notes} onChange={e => { setBulkForm(p => ({ ...p, notes: e.target.value })); setBulkDirty(true); }} /></div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => closeBulkModal()}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={bulkSubmitting}>{bulkSubmitting ? 'Processing...' : 'Process Bulk Payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffExpensesTab;
