import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { today, fmt } from './constants';
import auth from '../../services/auth';

const defaultPayForm = {
  type: 'Utility', payee_name: '', amount: '', payment_method: 'Cash',
  cash_amount: '', upi_amount: '', reference_number: '', description: '',
  payment_date: today(), vendor_id: '', branch_id: '', category: '', sub_category: '',
  bill_total_amount: '', is_partial_payment: false
};

const PaymentModal = ({ form, setForm, vendors, branches, onSubmit, onClose }) => {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  const canSubmit = form.amount && Number(form.amount) > 0 && form.payee_name;

  // Auto-validate "Both" split
  const bothValid = form.payment_method !== 'Both' || (
    Math.abs((Number(form.cash_amount) || 0) + (Number(form.upi_amount) || 0) - (Number(form.amount) || 0)) < 0.01
  );

  const handleConfirm = (e) => {
    e.preventDefault();
    setError('');
    if (!bothValid) {
      setError('Cash + UPI must equal total amount');
      return;
    }
    setConfirming(true);
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try { await onSubmit(e); }
    catch (err) { setError(err?.message || 'Payment failed'); }
    finally { setSubmitting(false); setConfirming(false); }
  };

  // When amount changes and partial is on, auto-calc remaining
  const billTotal = Number(form.bill_total_amount) || 0;
  const payAmount = Number(form.amount) || 0;
  const isPartial = form.is_partial_payment && billTotal > 0 && payAmount < billTotal;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal" onClick={e => e.stopPropagation()}>
        <div className="em-modal__header">
          <h2>Record Payment</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {error && <div className="em-alert em-alert--danger" style={{ margin: '0 16px' }}>{error}</div>}

        {!confirming ? (
          <form onSubmit={handleConfirm}>
            <div className="em-modal__body">
              <div className="em-form-grid">
                {/* Branch — only show for Admin/Accountant; Front Office auto-resolves on server */}
                {isAdmin && (branches || []).length > 0 && (
                  <div className="em-form-group">
                    <label>Branch</label>
                    <select className="em-input" value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}>
                      <option value="">Auto (your branch)</option>
                      {(branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="em-form-group">
                  <label>Category</label>
                  <select className="em-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    {['Vendor', 'Utility', 'Salary', 'Rent', 'Other'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                {form.type === 'Vendor' && (vendors || []).length > 0 && (
                  <div className="em-form-group">
                    <label>Vendor</label>
                    <select className="em-input" value={form.vendor_id} onChange={e => {
                      const v = (vendors || []).find(x => x.id === Number(e.target.value));
                      setForm(p => ({ ...p, vendor_id: e.target.value, payee_name: v?.name || p.payee_name }));
                    }}>
                      <option value="">Select Vendor</option>
                      {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="em-form-group">
                  <label>Payee / Paid To *</label>
                  <input className="em-input" value={form.payee_name} onChange={e => setForm(p => ({ ...p, payee_name: e.target.value }))} placeholder="Name" required />
                </div>

                {/* Partial Payment Toggle (Hidden for Utilities) */}
                {form.type !== 'Utility' && (
                  <div className="em-form-group em-form-group--full" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                      <input type="checkbox" checked={form.is_partial_payment || false}
                        onChange={e => setForm(p => ({ ...p, is_partial_payment: e.target.checked }))} />
                      Partial Payment
                    </label>
                    {form.is_partial_payment && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                        <label style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Bill Total:</label>
                        <input className="em-input" type="number" min="0" step="0.01" style={{ maxWidth: 140 }}
                          value={form.bill_total_amount} placeholder="Full bill amount"
                          onChange={e => setForm(p => ({ ...p, bill_total_amount: e.target.value }))} />
                      </div>
                    )}
                  </div>
                )}

                <div className="em-form-group">
                  <label>Amount (₹) *{form.is_partial_payment ? ' (paying now)' : ''}</label>
                  <input className="em-input" type="number" min="0" step="0.01" value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
                  {isPartial && (
                    <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4 }}>
                      Remaining after this: ₹{fmt(billTotal - payAmount)}
                    </div>
                  )}
                </div>

                <div className="em-form-group">
                  <label>Payment Method</label>
                  <select className="em-input" value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
                    {['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Both'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>

                {form.payment_method === 'Both' && (
                  <>
                    <div className="em-form-group">
                      <label>Cash Amount</label>
                      <input className="em-input" type="number" min="0" step="0.01" value={form.cash_amount}
                        onChange={e => {
                          const cash = Number(e.target.value) || 0;
                          const total = Number(form.amount) || 0;
                          setForm(p => ({ ...p, cash_amount: e.target.value, upi_amount: String(Math.max(total - cash, 0)) }));
                        }} />
                    </div>
                    <div className="em-form-group">
                      <label>UPI Amount</label>
                      <input className="em-input" type="number" min="0" step="0.01" value={form.upi_amount}
                        onChange={e => {
                          const upi = Number(e.target.value) || 0;
                          const total = Number(form.amount) || 0;
                          setForm(p => ({ ...p, upi_amount: e.target.value, cash_amount: String(Math.max(total - upi, 0)) }));
                        }} />
                    </div>
                    {!bothValid && <div style={{ gridColumn: '1/-1', color: 'var(--error)', fontSize: 13 }}>Cash + UPI must equal ₹{fmt(Number(form.amount))}</div>}
                  </>
                )}

                <div className="em-form-group">
                  <label>Reference #</label>
                  <input className="em-input" value={form.reference_number} onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))} placeholder="Bill/cheque/transaction number" />
                </div>

                <div className="em-form-group em-form-group--full">
                  <label>Description</label>
                  <input className="em-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Payment notes" />
                </div>
              </div>
            </div>
            <div className="em-modal__footer">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!canSubmit || !bothValid}>Review & Confirm</button>
            </div>
          </form>
        ) : (
          /* ── Confirmation Step ── */
          <form onSubmit={handleFinalSubmit}>
            <div className="em-modal__body">
              <div className="em-confirm-summary">
                <div className="em-confirm-summary__title"><CheckCircle size={18} /> Confirm Payment Details</div>
                <div className="em-confirm-summary__rows">
                  <div className="em-confirm-summary__row">
                    <span className="em-confirm-summary__label">Paid To</span>
                    <span className="em-confirm-summary__value">{form.payee_name}</span>
                  </div>
                  <div className="em-confirm-summary__row">
                    <span className="em-confirm-summary__label">Category</span>
                    <span className="em-confirm-summary__value">{form.type}</span>
                  </div>
                  {isPartial && (
                    <div className="em-confirm-summary__row">
                      <span className="em-confirm-summary__label">Bill Total</span>
                      <span className="em-confirm-summary__value">₹{fmt(billTotal)}</span>
                    </div>
                  )}
                  <div className="em-confirm-summary__row">
                    <span className="em-confirm-summary__label">{isPartial ? 'Paying Now' : 'Amount'}</span>
                    <span className="em-confirm-summary__value em-confirm-summary__amount">₹{fmt(payAmount)}</span>
                  </div>
                  {isPartial && (
                    <div className="em-confirm-summary__row">
                      <span className="em-confirm-summary__label">Remaining</span>
                      <span className="em-confirm-summary__value" style={{ color: 'var(--warning)' }}>₹{fmt(billTotal - payAmount)}</span>
                    </div>
                  )}
                  <div className="em-confirm-summary__row">
                    <span className="em-confirm-summary__label">Method</span>
                    <span className="em-confirm-summary__value">{form.payment_method}</span>
                  </div>
                  {form.payment_method === 'Both' && (
                    <>
                      <div className="em-confirm-summary__row">
                        <span className="em-confirm-summary__label">Cash</span>
                        <span className="em-confirm-summary__value">₹{fmt(Number(form.cash_amount || 0))}</span>
                      </div>
                      <div className="em-confirm-summary__row">
                        <span className="em-confirm-summary__label">UPI</span>
                        <span className="em-confirm-summary__value">₹{fmt(Number(form.upi_amount || 0))}</span>
                      </div>
                    </>
                  )}

                  {form.reference_number && (
                    <div className="em-confirm-summary__row">
                      <span className="em-confirm-summary__label">Reference</span>
                      <span className="em-confirm-summary__value">{form.reference_number}</span>
                    </div>
                  )}
                  {form.description && (
                    <div className="em-confirm-summary__row">
                      <span className="em-confirm-summary__label">Description</span>
                      <span className="em-confirm-summary__value">{form.description}</span>
                    </div>
                  )}
                </div>
                <div className="em-confirm-summary__warn"><AlertTriangle size={14} /> Please verify the details above before confirming.</div>
              </div>
            </div>
            <div className="em-modal__footer">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>← Back to Edit</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Processing...' : 'Confirm Payment'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export { defaultPayForm };
export default PaymentModal;
