import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark, Repeat, Plus, Edit2, X, Loader2,
  IndianRupee, Calendar, TrendingUp, AlertTriangle,
  ArrowLeft, CheckCircle, Clock, CreditCard
} from 'lucide-react';
import api from '../../services/api';
import auth from '../../services/auth';
import { fmt, fmtDate, today, thisMonth } from './constants';

const defaultEmiForm = { institution_name: '', emi_type: 'Loan', loan_amount: '', monthly_emi: '', tenure_months: '', start_date: today(), due_day: '1', branch_id: '', remarks: '' };
const defaultKuriForm = { kuri_name: '', organizer_name: '', organizer_phone: '', total_amount: '', monthly_installment: '', duration_months: '', start_date: today(), due_day: '1', branch_id: '', description: '' };

const FinanceTab = ({ branches, onError }) => {
  const [subTab, setSubTab] = useState('kuri');

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  // EMI state
  const [emis, setEmis] = useState([]);
  const [emiDash, setEmiDash] = useState(null);
  const [showEmiForm, setShowEmiForm] = useState(false);
  const [editingEmi, setEditingEmi] = useState(null);
  const [emiForm, setEmiForm] = useState(defaultEmiForm);
  const [selectedEmi, setSelectedEmi] = useState(null);
  const [emiDetail, setEmiDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Kuri state
  const [kuris, setKuris] = useState([]);
  const [kuriDash, setKuriDash] = useState(null);
  const [showKuriForm, setShowKuriForm] = useState(false);
  const [editingKuri, setEditingKuri] = useState(null);
  const [kuriForm, setKuriForm] = useState(defaultKuriForm);
  const [selectedKuri, setSelectedKuri] = useState(null);
  const [kuriDetail, setKuriDetail] = useState(null);

  // Kuri request (front office)
  const [showKuriRequest, setShowKuriRequest] = useState(false);
  const [kuriRequest, setKuriRequest] = useState(defaultKuriForm);
  const [kuriRequestReason, setKuriRequestReason] = useState('');
  const [kuriRequestSaving, setKuriRequestSaving] = useState(false);
  const [kuriRequestError, setKuriRequestError] = useState('');

  // Payment recording
  const [showPayForm, setShowPayForm] = useState(false);
  const [payType, setPayType] = useState('emi'); // 'emi' or 'kuri'
  const [payForm, setPayForm] = useState({ master_id: '', amount: '', payment_date: today(), payment_method: 'Cash', reference_number: '', remarks: '' });
  const [payConfirming, setPayConfirming] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const fetchEmis = useCallback(async () => {
    try { const r = await api.get('/emi-master', { params: { is_active: 1 } }); setEmis(r.data); } catch { }
  }, []);
  const fetchKuris = useCallback(async () => {
    try { const r = await api.get('/kuri-master', { params: { is_active: 1 } }); setKuris(r.data); } catch { }
  }, []);
  const fetchEmiDash = useCallback(async () => {
    try { const r = await api.get('/emi-dashboard'); setEmiDash(r.data); } catch { }
  }, []);
  const fetchKuriDash = useCallback(async () => {
    try { const r = await api.get('/kuri-dashboard'); setKuriDash(r.data); } catch { }
  }, []);

  useEffect(() => { fetchEmis(); fetchKuris(); fetchEmiDash(); fetchKuriDash(); }, [fetchEmis, fetchKuris, fetchEmiDash, fetchKuriDash]);

  const openEmiDetail = useCallback(async (emi) => {
    setSelectedEmi(emi); setLoadingDetail(true);
    try { const r = await api.get(`/emi-master/${emi.id}`); setEmiDetail(r.data); } catch { setEmiDetail(null); }
    finally { setLoadingDetail(false); }
  }, []);

  const openKuriDetail = useCallback(async (kuri) => {
    setSelectedKuri(kuri); setLoadingDetail(true);
    try { const r = await api.get(`/kuri-master/${kuri.id}`); setKuriDetail(r.data); } catch { setKuriDetail(null); }
    finally { setLoadingDetail(false); }
  }, []);

  const submitEmi = async (e) => {
    e.preventDefault();
    const action = editingEmi ? 'Update' : 'Create';
    const isConfirmed = await confirm({
      title: `${action} EMI Record`,
      message: `Are you sure you want to ${action.toLowerCase()} the EMI record for "${emiForm.institution_name}"?\n\nAmount: ₹${fmt(emiForm.emi_amount || 0)}/month`,
      confirmText: action,
      type: 'primary'
    });
    if (!isConfirmed) return;

    try {
      if (editingEmi) await api.put(`/emi-master/${editingEmi.id}`, emiForm);
      else await api.post('/emi-master', emiForm);
      setShowEmiForm(false); setEditingEmi(null); setEmiForm(defaultEmiForm); fetchEmis(); fetchEmiDash();
    } catch (err) { onError(err.response?.data?.message || 'Failed'); }
  };
  const submitKuri = async (e) => {
    e.preventDefault();
    const action = editingKuri ? 'Update' : 'Create';
    const isConfirmed = await confirm({
      title: `${action} Kuri Record`,
      message: `Are you sure you want to ${action.toLowerCase()} the Kuri record for "${kuriForm.kuri_name}"?\n\nAmount: ₹${fmt(kuriForm.monthly_installment || 0)}/month`,
      confirmText: action,
      type: 'primary'
    });
    if (!isConfirmed) return;

    try {
      if (editingKuri) await api.put(`/kuri-master/${editingKuri.id}`, kuriForm);
      else await api.post('/kuri-master', kuriForm);
      setShowKuriForm(false); setEditingKuri(null); setKuriForm(defaultKuriForm); fetchKuris(); fetchKuriDash();
    } catch (err) { onError(err.response?.data?.message || 'Failed'); }
  };

  const openKuriRequest = () => {
    setKuriRequest(defaultKuriForm);
    setKuriRequestReason('');
    setKuriRequestError('');
    setShowKuriRequest(true);
  };

  const submitKuriRequest = async (e) => {
    e.preventDefault();
    if (!kuriRequest.kuri_name.trim()) { setKuriRequestError('Kuri name is required'); return; }
    setKuriRequestSaving(true);
    try {
      const reasonBits = [
        kuriRequestReason || '',
        kuriRequest.monthly_installment ? `Monthly: ₹${kuriRequest.monthly_installment}` : '',
        kuriRequest.duration_months ? `Duration: ${kuriRequest.duration_months} months` : '',
        kuriRequest.start_date ? `Start: ${kuriRequest.start_date}` : '',
        kuriRequest.due_day ? `Due day: ${kuriRequest.due_day}` : ''
      ].filter(Boolean).join(' | ');

      await api.post('/vendor-requests', {
        request_type: 'Kuri',
        name: kuriRequest.kuri_name.trim(),
        contact_person: kuriRequest.organizer_name || null,
        branch_id: kuriRequest.branch_id || null,
        request_reason: reasonBits || null
      });
      setShowKuriRequest(false);
    } catch (err) {
      setKuriRequestError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit request');
    } finally { setKuriRequestSaving(false); }
  };

  const getPayMasterName = () => {
    if (payType === 'emi') { const e = emis.find(x => x.id === payForm.master_id); return e?.institution_name || ''; }
    const k = kuris.find(x => x.id === payForm.master_id); return k?.kuri_name || '';
  };

  const handlePayReview = (e) => { e.preventDefault(); setPayConfirming(true); };

  const submitPayment = async (e) => {
    e.preventDefault();
    setPaySubmitting(true);
    try {
      const endpoint = payType === 'emi' ? '/emi-payments' : '/kuri-payments';
      const body = payType === 'emi'
        ? { emi_id: payForm.master_id, amount: Number(payForm.amount), payment_date: payForm.payment_date, payment_method: payForm.payment_method, reference_number: payForm.reference_number, remarks: payForm.remarks }
        : { kuri_id: payForm.master_id, amount: Number(payForm.amount), payment_date: payForm.payment_date, payment_method: payForm.payment_method, reference_number: payForm.reference_number, remarks: payForm.remarks };
      await api.post(endpoint, body);
      setShowPayForm(false); setPayConfirming(false);
      setPayForm({ master_id: '', amount: '', payment_date: today(), payment_method: 'Cash', reference_number: '', remarks: '' });
      fetchEmis(); fetchKuris(); fetchEmiDash(); fetchKuriDash();
      if (selectedEmi) openEmiDetail(selectedEmi);
      if (selectedKuri) openKuriDetail(selectedKuri);
    } catch (err) { onError(err.response?.data?.message || 'Payment failed'); }
    finally { setPaySubmitting(false); }
  };

  /* ── EMI Detail View ── */
  if (selectedEmi) {
    const det = emiDetail;
    const payments = det?.payments || [];
    return (
      <div className="em-section">
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedEmi(null); setEmiDetail(null); }}><ArrowLeft size={16} /> Back to EMI List</button>
        {loadingDetail ? <div className="em-loading"><Loader2 className="spin" size={20} /></div> : det ? (
          <>
            <div className="em-finance-header">
              <Landmark size={24} style={{ color: 'var(--accent-2)' }} />
              <div><h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{det.institution_name || selectedEmi.institution_name}</h2>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{det.emi_type || selectedEmi.emi_type} · Due day: {det.due_day || selectedEmi.due_day}th</span></div>
              <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setPayType('emi'); setPayForm(p => ({ ...p, master_id: selectedEmi.id, amount: String(selectedEmi.monthly_emi || det.monthly_emi || '') })); setShowPayForm(true); }}>
                <IndianRupee size={14} /> Record Payment
              </button>
            </div>
            <div className="em-kpi-grid em-kpi-grid--4">
              <div className="em-kpi-card em-kpi-card--blue"><div className="em-kpi-card__icon"><CreditCard size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Loan Amount</div><div className="em-kpi-card__value">₹{fmt(det.loan_amount || selectedEmi.loan_amount)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--amber"><div className="em-kpi-card__icon"><Calendar size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Monthly EMI</div><div className="em-kpi-card__value">₹{fmt(det.monthly_emi || selectedEmi.monthly_emi)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--green"><div className="em-kpi-card__icon"><CheckCircle size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Total Paid</div><div className="em-kpi-card__value">₹{fmt(det.total_paid || selectedEmi.total_paid)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--red"><div className="em-kpi-card__icon"><AlertTriangle size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Remaining</div><div className="em-kpi-card__value">₹{fmt((det.loan_amount || selectedEmi.loan_amount) - (det.total_paid || selectedEmi.total_paid || 0))}</div></div></div>
            </div>
            {/* Progress bar */}
            <div className="em-card"><div className="em-card__title">Repayment Progress</div>
              <div className="em-progress-wrap">
                <div className="em-progress-bar"><div className="em-progress-bar__fill" style={{ width: `${Math.min(((det.total_paid || selectedEmi.total_paid || 0) / (det.loan_amount || selectedEmi.loan_amount || 1)) * 100, 100)}%` }} /></div>
                <div className="em-progress-label">{(((det.total_paid || selectedEmi.total_paid || 0) / (det.loan_amount || selectedEmi.loan_amount || 1)) * 100).toFixed(1)}% complete</div>
              </div>
            </div>
            {payments.length > 0 && (
              <div className="em-card"><div className="em-card__title"><Calendar size={16} /> Payment History</div>
                <div className="em-table-wrap"><table className="em-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Remarks</th></tr></thead>
                  <tbody>{payments.map((p, i) => (<tr key={i}><td>{fmtDate(p.payment_date)}</td><td className="em-amount-cell">₹{fmt(p.amount)}</td><td>{p.payment_method || '—'}</td><td>{p.reference_number || '—'}</td><td>{p.remarks || '—'}</td></tr>))}</tbody>
                </table></div>
              </div>
            )}
          </>
        ) : <div className="em-empty-text">Failed to load details</div>}
      </div>
    );
  }

  /* ── Kuri Detail View ── */
  if (selectedKuri) {
    const det = kuriDetail?.kuri || kuriDetail;
    const payments = kuriDetail?.payments || [];
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalTarget = Number(det?.total_amount || selectedKuri.total_amount || 0);
    const remaining = totalTarget - totalPaid;
    const progressPct = totalTarget > 0 ? Math.min((totalPaid / totalTarget) * 100, 100) : 0;
    return (
      <div className="em-section">
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedKuri(null); setKuriDetail(null); }}><ArrowLeft size={16} /> Back to Kuri List</button>
        {loadingDetail ? <div className="em-loading"><Loader2 className="spin" size={20} /></div> : det ? (
          <>
            <div className="em-finance-header">
              <Repeat size={24} style={{ color: '#8b5cf6' }} />
              <div><h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{det.kuri_name || selectedKuri.kuri_name}</h2>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Organizer: {det.organizer_name || selectedKuri.organizer_name || '—'} · Due day: {det.due_day || selectedKuri.due_day}th</span></div>
              <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setPayType('kuri'); setPayForm(p => ({ ...p, master_id: selectedKuri.id, amount: String(selectedKuri.monthly_installment || det.monthly_installment || '') })); setShowPayForm(true); }}>
                <IndianRupee size={14} /> Record Payment
              </button>
            </div>
            <div className="em-kpi-grid em-kpi-grid--4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="em-kpi-card em-kpi-card--purple"><div className="em-kpi-card__icon"><CreditCard size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Total Target Amount</div><div className="em-kpi-card__value">₹{fmt(totalTarget)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--amber"><div className="em-kpi-card__icon"><Calendar size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Monthly Installment</div><div className="em-kpi-card__value">₹{fmt(det.monthly_installment || selectedKuri.monthly_installment)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--green"><div className="em-kpi-card__icon"><CheckCircle size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Total Paid</div><div className="em-kpi-card__value">₹{fmt(totalPaid)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--red"><div className="em-kpi-card__icon"><AlertTriangle size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Remaining Balance</div><div className="em-kpi-card__value">₹{fmt(remaining)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--teal"><div className="em-kpi-card__icon"><TrendingUp size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Duration</div><div className="em-kpi-card__value">{det.duration_months || selectedKuri.duration_months || '—'} mo</div></div></div>
            </div>
            {/* Progress bar */}
            <div className="em-card"><div className="em-card__title">Collection Progress</div>
              <div className="em-progress-wrap">
                <div className="em-progress-bar"><div className="em-progress-bar__fill" style={{ width: `${progressPct}%` }} /></div>
                <div className="em-progress-label">{progressPct.toFixed(1)}% complete</div>
              </div>
            </div>
            {payments.length > 0 && (
              <div className="em-card"><div className="em-card__title"><Calendar size={16} /> Payment History</div>
                <div className="em-table-wrap"><table className="em-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Remarks</th></tr></thead>
                  <tbody>{payments.map((p, i) => (<tr key={i}><td>{fmtDate(p.payment_date)}</td><td className="em-amount-cell">₹{fmt(p.amount)}</td><td>{p.payment_method || '—'}</td><td>{p.reference_number || '—'}</td><td>{p.remarks || '—'}</td></tr>))}</tbody>
                </table></div>
              </div>
            )}
          </>
        ) : <div className="em-empty-text">Failed to load details</div>}
      </div>
    );
  }

  /* ══════════ Main Finance View ══════════ */
  return (
    <div className="em-section">
      <div className="em-finance-subtabs">
        <button className={`em-finance-subtab ${subTab === 'kuri' ? 'em-finance-subtab--active' : ''}`} onClick={() => setSubTab('kuri')}><Repeat size={16} /> Kuri / Chit Fund</button>
        <button className={`em-finance-subtab ${subTab === 'emi' ? 'em-finance-subtab--active' : ''}`} onClick={() => setSubTab('emi')}><Landmark size={16} /> EMI Commitments</button>
      </div>

      {/* ── EMI sub-tab ── */}
      {subTab === 'emi' && (
        <>
          {/* EMI Dashboard KPIs */}
          {emiDash && (
            <div className="em-kpi-grid em-kpi-grid--3">
              <div className="em-kpi-card em-kpi-card--blue"><div className="em-kpi-card__icon"><CreditCard size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Total EMI/Month</div><div className="em-kpi-card__value">₹{fmt(emiDash.totalEmiPerMonth)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--red"><div className="em-kpi-card__icon"><AlertTriangle size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Due This Month</div><div className="em-kpi-card__value">{emiDash.dueThisMonth?.length || 0}</div>{emiDash.dueThisMonth?.length > 0 && <div className="em-kpi-card__sub em-kpi-card__sub--warn">Needs attention</div>}</div></div>
              <div className="em-kpi-card em-kpi-card--amber"><div className="em-kpi-card__icon"><Clock size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Due This Week</div><div className="em-kpi-card__value">{emiDash.upcomingWeek?.length || 0}</div></div></div>
            </div>
          )}
          <div className="em-filter-row" style={{ justifyContent: 'flex-end' }}>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={() => { setEditingEmi(null); setEmiForm(defaultEmiForm); setShowEmiForm(true); }}><Plus size={15} /> Add EMI</button>
            )}
          </div>
          {emis.length === 0 ? (
            <div className="em-empty-state"><div className="em-empty-state__icon"><Landmark size={48} strokeWidth={1.5} /></div><h3 className="em-empty-state__title">No EMI Commitments</h3><p className="em-empty-state__desc">Add your loan EMIs to track monthly payments and get due date reminders.</p></div>
          ) : (
            <div className="em-finance-cards">
              {emis.map(e => {
                const paidPct = Math.min(((e.total_paid || 0) / (e.loan_amount || 1)) * 100, 100);
                return (
                  <div key={e.id} className="em-finance-card" onClick={() => openEmiDetail(e)} style={{ cursor: 'pointer' }}>
                    <div className="em-finance-card__header">
                      <Landmark size={18} style={{ color: 'var(--accent-2)' }} />
                      <div className="em-finance-card__title">{e.institution_name}</div>
                      <span className="em-type-badge em-type-badge--vendor">{e.emi_type}</span>
                    </div>
                    <div className="em-finance-card__body">
                      <div className="em-finance-card__row"><span>EMI Amount</span><strong>₹{fmt(e.monthly_emi)}</strong></div>
                      <div className="em-finance-card__row"><span>Due Day</span><strong>{e.due_day}th</strong></div>
                      <div className="em-finance-card__row"><span>Paid / Total</span><strong>₹{fmt(e.total_paid)} / ₹{fmt(e.loan_amount)}</strong></div>
                      <div className="em-progress-wrap"><div className="em-progress-bar"><div className="em-progress-bar__fill" style={{ width: `${paidPct}%` }} /></div><div className="em-progress-label">{paidPct.toFixed(0)}%</div></div>
                    </div>
                    <div className="em-finance-card__footer">
                      {isAdmin && (
                        <button className="btn btn-ghost btn-sm" onClick={(ev) => { ev.stopPropagation(); setEditingEmi(e); setEmiForm({ institution_name: e.institution_name, emi_type: e.emi_type || 'Loan', loan_amount: e.loan_amount, monthly_emi: e.monthly_emi, tenure_months: e.tenure_months || '', start_date: e.start_date?.slice(0, 10) || '', due_day: e.due_day || '1', branch_id: e.branch_id || '', remarks: e.remarks || '' }); setShowEmiForm(true); }}><Edit2 size={14} /> Edit</button>
                      )}
                      <button className="btn btn-primary btn-sm" onClick={(ev) => { ev.stopPropagation(); setPayType('emi'); setPayForm(p => ({ ...p, master_id: e.id, amount: String(e.monthly_emi || '') })); setShowPayForm(true); }}><IndianRupee size={14} /> Pay</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Kuri sub-tab ── */}
      {subTab === 'kuri' && (
        <>
          {kuriDash && (
            <div className="em-kpi-grid em-kpi-grid--3">
              <div className="em-kpi-card em-kpi-card--purple"><div className="em-kpi-card__icon"><Repeat size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Total Kuri/Month</div><div className="em-kpi-card__value">₹{fmt(kuriDash.totalKuriPerMonth)}</div></div></div>
              <div className="em-kpi-card em-kpi-card--red"><div className="em-kpi-card__icon"><AlertTriangle size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Due This Month</div><div className="em-kpi-card__value">{kuriDash.dueThisMonth?.length || 0}</div></div></div>
              <div className="em-kpi-card em-kpi-card--green"><div className="em-kpi-card__icon"><TrendingUp size={22} /></div><div className="em-kpi-card__body"><div className="em-kpi-card__label">Prizes Received</div><div className="em-kpi-card__value">₹{fmt(kuriDash.prizesReceived)}</div></div></div>
            </div>
          )}
          <div className="em-filter-row" style={{ justifyContent: 'flex-end' }}>
            {isAdmin ? (
              <button className="btn btn-primary btn-sm" onClick={() => { setEditingKuri(null); setKuriForm(defaultKuriForm); setShowKuriForm(true); }}><Plus size={15} /> Add Kuri</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={openKuriRequest}><Plus size={15} /> Request Kuri</button>
            )}
          </div>
          {kuris.length === 0 ? (
            <div className="em-empty-state"><div className="em-empty-state__icon"><Repeat size={48} strokeWidth={1.5} /></div><h3 className="em-empty-state__title">No Kuri / Chit Fund</h3><p className="em-empty-state__desc">Add your Kuri commitments to track installments and due dates.</p></div>
          ) : (
            <div className="em-finance-cards">
              {kuris.map(k => (
                <div key={k.id} className="em-finance-card" onClick={() => openKuriDetail(k)} style={{ cursor: 'pointer' }}>
                  <div className="em-finance-card__header">
                    <Repeat size={18} style={{ color: '#8b5cf6' }} />
                    <div className="em-finance-card__title">{k.kuri_name}</div>
                  </div>
                  <div className="em-finance-card__body">
                    <div className="em-finance-card__row"><span>Monthly</span><strong>₹{fmt(k.monthly_installment)}</strong></div>
                    <div className="em-finance-card__row"><span>Due Day</span><strong>{k.due_day}th</strong></div>
                    <div className="em-finance-card__row"><span>Total</span><strong>₹{fmt(k.total_amount)}</strong></div>
                    {k.organizer_name && <div className="em-finance-card__row"><span>Organizer</span><strong>{k.organizer_name}</strong></div>}
                  </div>
                  <div className="em-finance-card__footer">
                    {isAdmin && (
                      <button className="btn btn-ghost btn-sm" onClick={(ev) => { ev.stopPropagation(); setEditingKuri(k); setKuriForm({ kuri_name: k.kuri_name, organizer_name: k.organizer_name || '', organizer_phone: k.organizer_phone || '', total_amount: k.total_amount, monthly_installment: k.monthly_installment, duration_months: k.duration_months || '', start_date: k.start_date?.slice(0, 10) || '', due_day: k.due_day || '1', branch_id: k.branch_id || '', description: k.description || '' }); setShowKuriForm(true); }}><Edit2 size={14} /> Edit</button>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={(ev) => { ev.stopPropagation(); setPayType('kuri'); setPayForm(p => ({ ...p, master_id: k.id, amount: String(k.monthly_installment || '') })); setShowPayForm(true); }}><IndianRupee size={14} /> Pay</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Kuri Request Modal (Front Office) ── */}
      {showKuriRequest && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowKuriRequest(false); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>Request Kuri</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowKuriRequest(false)}><X size={18} /></button></div>
            <form onSubmit={submitKuriRequest}>
              <div className="em-modal__body">
                {kuriRequestError && <div className="em-error" style={{ marginBottom: 12 }}>{kuriRequestError}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group"><label>Kuri Name *</label><input className="em-input" value={kuriRequest.kuri_name} onChange={e => setKuriRequest(p => ({ ...p, kuri_name: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Organizer</label><input className="em-input" value={kuriRequest.organizer_name} onChange={e => setKuriRequest(p => ({ ...p, organizer_name: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Monthly Installment (₹)</label><input className="em-input" type="number" min="0" value={kuriRequest.monthly_installment} onChange={e => setKuriRequest(p => ({ ...p, monthly_installment: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Duration (Months)</label><input className="em-input" type="number" min="0" value={kuriRequest.duration_months} onChange={e => setKuriRequest(p => ({ ...p, duration_months: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Start Date</label><input className="em-input" type="date" value={kuriRequest.start_date} onChange={e => setKuriRequest(p => ({ ...p, start_date: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Due Day</label><input className="em-input" type="number" min="1" max="31" value={kuriRequest.due_day} onChange={e => setKuriRequest(p => ({ ...p, due_day: e.target.value }))} /></div>
                  {branches.length > 0 && <div className="em-form-group"><label>Branch</label><select className="em-input" value={kuriRequest.branch_id} onChange={e => setKuriRequest(p => ({ ...p, branch_id: e.target.value }))}><option value="">Select Branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
                  <div className="em-form-group em-form-group--full"><label>Reason / Notes</label><input className="em-input" value={kuriRequestReason} onChange={e => setKuriRequestReason(e.target.value)} placeholder="Why is this kuri needed?" /></div>
                </div>
              </div>
              <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setShowKuriRequest(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={kuriRequestSaving}>{kuriRequestSaving ? 'Submitting...' : 'Submit Request'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* ── EMI Form Modal ── */}
      {showEmiForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowEmiForm(false); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>{editingEmi ? 'Edit' : 'Add'} EMI</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowEmiForm(false)}><X size={18} /></button></div>
            <form onSubmit={submitEmi}>
              <div className="em-modal__body">
                <div className="em-form-grid">
                  <div className="em-form-group"><label>Institution</label><input className="em-input" value={emiForm.institution_name} onChange={e => setEmiForm(p => ({ ...p, institution_name: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Type</label><select className="em-input" value={emiForm.emi_type} onChange={e => setEmiForm(p => ({ ...p, emi_type: e.target.value }))}><option>Loan</option><option>Vehicle Loan</option><option>Equipment Loan</option><option>Personal Loan</option><option>Gold Loan</option><option>Other</option></select></div>
                  <div className="em-form-group"><label>Loan Amount (₹)</label><input className="em-input" type="number" min="0" value={emiForm.loan_amount} onChange={e => setEmiForm(p => ({ ...p, loan_amount: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Monthly EMI (₹)</label><input className="em-input" type="number" min="0" value={emiForm.monthly_emi} onChange={e => setEmiForm(p => ({ ...p, monthly_emi: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Tenure (Months)</label><input className="em-input" type="number" min="0" value={emiForm.tenure_months} onChange={e => setEmiForm(p => ({ ...p, tenure_months: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Start Date</label><input className="em-input" type="date" value={emiForm.start_date} onChange={e => setEmiForm(p => ({ ...p, start_date: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Due Day</label><input className="em-input" type="number" min="1" max="31" value={emiForm.due_day} onChange={e => setEmiForm(p => ({ ...p, due_day: e.target.value }))} /></div>
                  {branches.length > 0 && <div className="em-form-group"><label>Branch</label><select className="em-input" value={emiForm.branch_id} onChange={e => setEmiForm(p => ({ ...p, branch_id: e.target.value }))}><option value="">Select Branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
                  <div className="em-form-group em-form-group--full"><label>Remarks</label><input className="em-input" value={emiForm.remarks} onChange={e => setEmiForm(p => ({ ...p, remarks: e.target.value }))} /></div>
                </div>
              </div>
              <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setShowEmiForm(false)}>Cancel</button><button type="submit" className="btn btn-primary">{editingEmi ? 'Update' : 'Add'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* ── Kuri Form Modal ── */}
      {showKuriForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowKuriForm(false); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>{editingKuri ? 'Edit' : 'Add'} Kuri</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowKuriForm(false)}><X size={18} /></button></div>
            <form onSubmit={submitKuri}>
              <div className="em-modal__body">
                <div className="em-form-grid">
                  <div className="em-form-group"><label>Kuri Name</label><input className="em-input" value={kuriForm.kuri_name} onChange={e => setKuriForm(p => ({ ...p, kuri_name: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Organizer Name</label><input className="em-input" value={kuriForm.organizer_name} onChange={e => setKuriForm(p => ({ ...p, organizer_name: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Organizer Phone</label><input className="em-input" value={kuriForm.organizer_phone} onChange={e => setKuriForm(p => ({ ...p, organizer_phone: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Total Amount (₹)</label><input className="em-input" type="number" min="0" value={kuriForm.total_amount} onChange={e => setKuriForm(p => ({ ...p, total_amount: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Monthly Installment (₹)</label><input className="em-input" type="number" min="0" value={kuriForm.monthly_installment} onChange={e => setKuriForm(p => ({ ...p, monthly_installment: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Duration (Months)</label><input className="em-input" type="number" min="0" value={kuriForm.duration_months} onChange={e => setKuriForm(p => ({ ...p, duration_months: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Start Date</label><input className="em-input" type="date" value={kuriForm.start_date} onChange={e => setKuriForm(p => ({ ...p, start_date: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Due Day</label><input className="em-input" type="number" min="1" max="31" value={kuriForm.due_day} onChange={e => setKuriForm(p => ({ ...p, due_day: e.target.value }))} /></div>
                  {branches.length > 0 && <div className="em-form-group"><label>Branch</label><select className="em-input" value={kuriForm.branch_id} onChange={e => setKuriForm(p => ({ ...p, branch_id: e.target.value }))}><option value="">Select Branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
                  <div className="em-form-group em-form-group--full"><label>Remarks</label><input className="em-input" value={kuriForm.description} onChange={e => setKuriForm(p => ({ ...p, description: e.target.value }))} /></div>
                </div>
              </div>
              <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setShowKuriForm(false)}>Cancel</button><button type="submit" className="btn btn-primary">{editingKuri ? 'Update' : 'Add'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* ── Payment Recording Modal ── */}
      {showPayForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowPayForm(false); setPayConfirming(false); } }}>
          <div className="em-modal em-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>Record {payType === 'emi' ? 'EMI' : 'Kuri'} Payment</h2><button className="btn btn-ghost btn-icon" onClick={() => { setShowPayForm(false); setPayConfirming(false); }}><X size={18} /></button></div>
            {!payConfirming ? (
              <form onSubmit={handlePayReview}>
                <div className="em-modal__body">
                  <div className="em-form-grid">
                    <div className="em-form-group"><label>Amount (₹)</label><input className="em-input" type="number" min="0" step="0.01" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} required /></div>

                    <div className="em-form-group"><label>Payment Method</label><select className="em-input" value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))}><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option></select></div>
                    <div className="em-form-group"><label>Reference #</label><input className="em-input" value={payForm.reference_number} onChange={e => setPayForm(p => ({ ...p, reference_number: e.target.value }))} /></div>
                    <div className="em-form-group em-form-group--full"><label>Remarks</label><input className="em-input" value={payForm.remarks} onChange={e => setPayForm(p => ({ ...p, remarks: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setShowPayForm(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={!payForm.amount || Number(payForm.amount) <= 0}>Review & Confirm</button></div>
              </form>
            ) : (
              <form onSubmit={submitPayment}>
                <div className="em-modal__body">
                  <div className="em-confirm-summary">
                    <div className="em-confirm-summary__title"><CheckCircle size={18} /> Confirm {payType === 'emi' ? 'EMI' : 'Kuri'} Payment</div>
                    <div className="em-confirm-summary__rows">
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">{payType === 'emi' ? 'Institution' : 'Kuri'}</span><span className="em-confirm-summary__value">{getPayMasterName()}</span></div>
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Amount</span><span className="em-confirm-summary__value em-confirm-summary__amount">₹{fmt(Number(payForm.amount))}</span></div>
                      <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Method</span><span className="em-confirm-summary__value">{payForm.payment_method}</span></div>

                      {payForm.reference_number && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Reference</span><span className="em-confirm-summary__value">{payForm.reference_number}</span></div>}
                      {payForm.remarks && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Remarks</span><span className="em-confirm-summary__value">{payForm.remarks}</span></div>}
                    </div>
                    <div className="em-confirm-summary__warn"><AlertTriangle size={14} /> Please verify the details above before confirming.</div>
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
};

export default FinanceTab;
