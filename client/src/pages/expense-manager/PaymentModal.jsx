import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { fmt } from './constants';
import auth from '../../services/auth';
import api from '../../services/api';
import toast from 'react-hot-toast';
import BranchSelect from '../../components/ui/BranchSelect';

const PaymentModal = ({ form, setForm, vendors, branches, onSubmit, onClose }) => {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  const [assignedBooks, setAssignedBooks] = useState([]);
  const [bookBalances, setBookBalances] = useState({ Offset: null, Laser: null, Other: null });
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({ from_book_type: '', to_book_type: '', amount: '', note: '' });
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/machines/my-books');
        if (!mounted) return;
        const books = res.data || [];
        setAssignedBooks(books);
        // If form doesn't already have a book_type, prefill with the first assigned book
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

  // Fetch live balances for Offset/Laser/Other for the payment date (includes today's transfers/payments)
  useEffect(() => {
    let mounted = true;
    const fetchBalances = async () => {
      setLoadingBalances(true);
      try {
        const date = form.payment_date || (new Date()).toISOString().slice(0, 10);
        const params = (id) => id ? `?date=${encodeURIComponent(date)}&branch_id=${encodeURIComponent(id)}` : `?date=${encodeURIComponent(date)}`;
        const branchParam = form.branch_id || '';
        const calls = [
          api.get(`/daily-report/offset-live${params(branchParam)}`),
          api.get(`/daily-report/laser-live${params(branchParam)}`),
          api.get(`/daily-report/other-live${params(branchParam)}`)
        ];
        const [off, las, oth] = await Promise.all(calls);
        if (!mounted) return;
        const offBal = off.data?.summary?.cash_closing ?? null;
        const lasBal = las.data?.summary?.cash_closing ?? null;
        const othBal = oth.data?.summary?.cash_closing ?? null;
        setBookBalances({ Offset: offBal, Laser: lasBal, Other: othBal });
      } catch {
        if (!mounted) return;
        setBookBalances({ Offset: null, Laser: null, Other: null });
      } finally {
        if (mounted) setLoadingBalances(false);
      }
    };
    fetchBalances();
    return () => { mounted = false; };
  }, [form.branch_id, form.payment_date]);

  const bookOptions = (assignedBooks && assignedBooks.length > 0) ? assignedBooks : ['Offset', 'Laser', 'Other'];

  const selectedBookBalance = form.book_type ? bookBalances[form.book_type] : null;
  const amountNumber = Number(form.amount) || 0;
  const amountWithinBalance = selectedBookBalance == null || amountNumber <= Number(selectedBookBalance) + 0.0001;
  const canSubmit = form.amount && amountNumber > 0 && form.payee_name && form.book_type && amountWithinBalance;

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
    if (!amountWithinBalance) {
      setError('Amount exceeds available balance for the selected book');
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
      <div role="button" tabIndex={0}  className="em-modal" onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
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
                    <label htmlFor="branch_id">Branch</label>
                    <BranchSelect id="branch_id" name="branch_id" className="em-input" value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}>
                      <option value="">Auto (your branch)</option>
                      {(branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </BranchSelect>
                  </div>
                )}

                {/* Category + Daily Book side by side */}
                <div className="em-form-group">
                  <label htmlFor="type">Category</label>
                  <select id="type" name="type" className="em-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    {['Vendor', 'Utility', 'Salary', 'Rent', 'Other'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div className="em-form-group">
                  <label htmlFor="book_type">Daily Book</label>
                  <select id="book_type" name="book_type" className="em-input" value={form.book_type || ''} onChange={e => setForm(p => ({ ...p, book_type: e.target.value }))}>
                    <option value="">Select Book</option>
                    {(bookOptions || []).map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  {assignedBooks.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>No assigned book — showing all.</div>
                  )}
                </div>

                {/* Available Balances — clickable chips */}
                <div className="em-form-group em-form-group--full">
                  <label style={{ marginBottom: 8, display: 'block' }}>
                    Available Balances
                    {loadingBalances && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8, fontWeight: 400 }}>refreshing…</span>}
                  </label>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {['Offset', 'Laser', 'Other'].map(b => {
                      const bal = bookBalances[b];
                      const isSelected = form.book_type === b;
                      const isLow = bal != null && Number(bal) < Number(form.amount || 0) && Number(form.amount || 0) > 0;
                      const chipBg = isSelected
                        ? (isLow ? 'var(--error-light, #fee2e2)' : 'var(--primary-light, #eff6ff)')
                        : 'var(--surface-2, #f4f4f5)';
                      const chipBorder = isSelected
                        ? (isLow ? '2px solid var(--error)' : '2px solid var(--primary)')
                        : '1.5px solid var(--border)';
                      const balColor = isLow ? 'var(--error)' : isSelected ? 'var(--primary)' : 'var(--text)';
                      return (
                        <div key={b} style={{
                          background: chipBg, border: chipBorder, borderRadius: 10,
                          padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2,
                          minWidth: 110, cursor: 'pointer', transition: 'all 0.15s'
                        }} onClick={() => setForm(p => ({ ...p, book_type: b }))}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? balColor : 'var(--muted)' }}>{b}</span>
                            {isSelected && <span style={{ fontSize: 10, background: isLow ? 'var(--error)' : 'var(--primary)', color: 'var(--color-white, #fff)', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>Selected</span>}
                          </div>
                          <span style={{ fontSize: 16, fontWeight: 700, color: balColor }}>
                            {loadingBalances ? '—' : `₹${fmt(bal ?? 0)}`}
                          </span>
                          {(isAdmin || assignedBooks.length === 0 || assignedBooks.includes(b)) && (
                            <button type="button" style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', marginTop: 2 }}
                              onClick={ev => {
                                ev.stopPropagation();
                                setShowTransfer(true);
                                setTransferForm({ from_book_type: b, to_book_type: (['Offset','Laser','Other'].find(x => x !== b) || ''), amount: '', note: '' });
                              }}>⇄ Transfer</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {form.type === 'Vendor' && (vendors || []).length > 0 && (
                  <div className="em-form-group">
                    <label htmlFor="vendor_id">Vendor</label>
                    <select id="vendor_id" name="vendor_id" className="em-input" value={form.vendor_id} onChange={e => {
                      const v = (vendors || []).find(x => x.id === Number(e.target.value));
                      setForm(p => ({ ...p, vendor_id: e.target.value, payee_name: v?.name || p.payee_name }));
                    }}>
                      <option value="">Select Vendor</option>
                      {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="em-form-group">
                  <label htmlFor="payee_name">Payee / Paid To *</label>
                  <input id="payee_name" name="payee_name" className="em-input" value={form.payee_name} onChange={e => setForm(p => ({ ...p, payee_name: e.target.value }))} placeholder="Name" required />
                </div>

                {/* Partial Payment Toggle */}
                {form.type !== 'Utility' && (
                  <div className="em-form-group em-form-group--full">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', width: 'fit-content' }}>
                      <input id="is_partial_payment" name="is_partial_payment" type="checkbox" checked={form.is_partial_payment || false}
                        onChange={e => setForm(p => ({ ...p, is_partial_payment: e.target.checked }))} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Partial Payment</span>
                    </label>
                    {form.is_partial_payment && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label htmlFor="bill_total_amount" style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Bill Total (₹):</label>
                        <input id="bill_total_amount" name="bill_total_amount" className="em-input" type="number" min="0" step="0.01" style={{ maxWidth: 160 }}
                          value={form.bill_total_amount} placeholder="Full bill amount"
                          onChange={e => setForm(p => ({ ...p, bill_total_amount: e.target.value }))} />
                      </div>
                    )}
                  </div>
                )}

                <div className="em-form-group">
                  <label htmlFor="amount">Amount (₹) *{form.is_partial_payment ? ' (paying now)' : ''}</label>
                  <input id="amount" name="amount" className={`em-input${!amountWithinBalance ? ' field-error' : ''}`} type="number" min="0" step="0.01" value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
                  {isPartial && (
                    <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4 }}>
                      Remaining after this: ₹{fmt(billTotal - payAmount)}
                    </div>
                  )}
                </div>

                <div className="em-form-group">
                  <label htmlFor="payment_method">Payment Method</label>
                  <select id="payment_method" name="payment_method" className="em-input" value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
                    {['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Both'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>

                {form.payment_method === 'Both' && (
                  <>
                    <div className="em-form-group">
                      <label htmlFor="cash_amount">Cash Amount</label>
                      <input id="cash_amount" name="cash_amount" className="em-input" type="number" min="0" step="0.01" value={form.cash_amount}
                        onChange={e => {
                          const cash = Number(e.target.value) || 0;
                          const total = Number(form.amount) || 0;
                          setForm(p => ({ ...p, cash_amount: e.target.value, upi_amount: String(Math.max(total - cash, 0)) }));
                        }} />
                    </div>
                    <div className="em-form-group">
                      <label htmlFor="upi_amount">UPI Amount</label>
                      <input id="upi_amount" name="upi_amount" className="em-input" type="number" min="0" step="0.01" value={form.upi_amount}
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
                  <label htmlFor="reference_number">Reference #</label>
                  <input id="reference_number" name="reference_number" className="em-input" value={form.reference_number} onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))} placeholder="Bill / cheque / transaction number" />
                </div>

                <div className="em-form-group em-form-group--full">
                  <label htmlFor="description">Description</label>
                  <input id="description" name="description" className="em-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Payment notes" />
                </div>

                {/* Balance exceeded — prominent alert banner */}
                {!amountWithinBalance && (
                  <div className="em-form-group em-form-group--full">
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      background: 'var(--error-light, #fee2e2)', border: '1.5px solid var(--error)',
                      borderRadius: 8, padding: '10px 14px', color: 'var(--error)'
                    }}>
                      <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          Amount exceeds available balance for <strong>{form.book_type || 'selected book'}</strong>
                        </div>
                        {form.book_type && selectedBookBalance != null && (
                          <div style={{ fontSize: 12, marginTop: 2 }}>
                            Available: <strong>₹{fmt(selectedBookBalance)}</strong> · Shortfall: <strong>₹{fmt(amountNumber - Number(selectedBookBalance))}</strong>. Use the <strong>⇄ Transfer</strong> button on the balance chip above to move funds first.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
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
                  <div className="em-confirm-summary__row">
                    <span className="em-confirm-summary__label">Daily Book</span>
                    <span className="em-confirm-summary__value">{form.book_type || '—'}</span>
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

          {/* Inline Transfer Form */}
          {showTransfer && (
            <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <h3 style={{ margin: '0 0 8px 0' }}>Quick Internal Transfer</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setTransferSubmitting(true);
                try {
                  const body = {
                    from_book_type: transferForm.from_book_type,
                    to_book_type: transferForm.to_book_type,
                    amount: Number(transferForm.amount),
                    note: transferForm.note || null,
                    branch_id: form.branch_id || undefined
                  };
                  if (!body.from_book_type || !body.to_book_type || !body.amount || body.amount <= 0) {
                    toast.error('Please provide a valid transfer');
                    setTransferSubmitting(false);
                    return;
                  }
                  const fromBal = bookBalances[body.from_book_type];
                  if (fromBal != null && body.amount > Number(fromBal)) {
                    toast.error('Transfer amount exceeds available balance');
                    setTransferSubmitting(false);
                    return;
                  }
                  await api.post('/internal-transfers', body);
                  toast.success('Transfer created');
                  setShowTransfer(false);
                  // refresh balances
                  const date = form.payment_date || (new Date()).toISOString().slice(0, 10);
                  const params = (id) => id ? `?date=${encodeURIComponent(date)}&branch_id=${encodeURIComponent(id)}` : `?date=${encodeURIComponent(date)}`;
                  const branchParam = form.branch_id || '';
                  const [off, las, oth] = await Promise.all([
                    api.get(`/daily-report/offset-live${params(branchParam)}`),
                    api.get(`/daily-report/laser-live${params(branchParam)}`),
                    api.get(`/daily-report/other-live${params(branchParam)}`)
                  ]);
                  setBookBalances({ Offset: off.data?.summary?.cash_closing ?? null, Laser: las.data?.summary?.cash_closing ?? null, Other: oth.data?.summary?.cash_closing ?? null });
                } catch (err) {
                  toast.error(err.response?.data?.error || 'Transfer failed');
                } finally { setTransferSubmitting(false); }
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 140 }}>
                    <label className="label">From</label>
                    <select name="from_book_type" aria-label="Select option"  className="input-field" value={transferForm.from_book_type} onChange={e => setTransferForm(f => ({ ...f, from_book_type: e.target.value }))}>
                      {['Offset','Laser','Other'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    {transferForm.from_book_type && bookBalances[transferForm.from_book_type] != null && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Available: ₹{fmt(bookBalances[transferForm.from_book_type])}</div>
                    )}
                  </div>
                  <div style={{ minWidth: 140 }}>
                    <label className="label">To</label>
                    <select name="to_book_type" aria-label="Select option"  className="input-field" value={transferForm.to_book_type} onChange={e => setTransferForm(f => ({ ...f, to_book_type: e.target.value }))}>
                      {['Offset','Laser','Other'].filter(b => b !== transferForm.from_book_type).map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <label className="label">Amount (₹)</label>
                    <input name="transfer_amount" type="number" min="0" step="0.01" className="input-field" value={transferForm.amount} onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className="label">Note</label>
                    <input name="transfer_note" className="input-field" value={transferForm.note} onChange={e => setTransferForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" />
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowTransfer(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={transferSubmitting}>{transferSubmitting ? 'Saving...' : 'Transfer'}</button>
                </div>
              </form>
            </div>
          )}
      </div>
    </div>
  );
};

export default React.memo(PaymentModal);
