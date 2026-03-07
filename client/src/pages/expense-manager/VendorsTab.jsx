import React, { useState, useCallback } from 'react';
import {
  Store, IndianRupee, ChevronDown, ChevronUp, ArrowLeft,
  Phone, MapPin, FileText, User, TrendingUp, TrendingDown,
  Search, Package, Loader2, Plus, Pencil, Trash2, X, ShoppingCart, Calendar
} from 'lucide-react';
import api from '../../services/api';
import auth from '../../services/auth';
import { fmt, fmtDate } from './constants';
import { serverToday } from '../../services/serverTime';
import { useConfirm } from '../../contexts/ConfirmContext';
import toast from 'react-hot-toast';

const emptyVendorForm = { name: '', type: 'Vendor', contact_person: '', phone: '', address: '', gstin: '', order_link: '' };

const VendorsTab = ({ vendors, onPayment, onRefreshVendors }) => {
  const { confirm } = useConfirm();
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [vendorLedger, setVendorLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Admin CRUD state
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState(emptyVendorForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Front office request state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState(emptyVendorForm);
  const [requestReason, setRequestReason] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState('');

  // Purchase recording state
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ vendor_id: '', amount: '', bill_number: '', bill_date: serverToday(), description: '' });
  const [purchaseSaving, setPurchaseSaving] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [purchaseSuccess, setPurchaseSuccess] = useState('');

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  const openVendorDetail = useCallback(async (v) => {
    setSelectedVendor(v);
    setLoadingLedger(true);
    try {
      const [ledgerRes, billsRes] = await Promise.all([
        api.get('/reports/vendor-ledger', { params: { vendor_id: v.id } }),
        api.get('/vendor-bills', { params: { vendor_id: v.id } })
      ]);
      const payments = (ledgerRes.data?.rows || []).map(r => ({ ...r, _entry_type: 'Payment', _date: r.payment_date }));
      const purchases = (Array.isArray(billsRes.data) ? billsRes.data : []).map(r => ({ ...r, _entry_type: 'Purchase', _date: r.bill_date }));
      const combined = [...payments, ...purchases].sort((a, b) => new Date(b._date) - new Date(a._date));
      setVendorLedger({ rows: combined, payments, purchases });
    } catch { setVendorLedger({ rows: [], payments: [], purchases: [] }); }
    finally { setLoadingLedger(false); }
  }, []);

  /* ── Admin CRUD ── */
  const openAddForm = () => {
    setEditingVendor(null);
    setVendorForm(emptyVendorForm);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (v) => {
    setEditingVendor(v);
    setVendorForm({ name: v.name || '', type: v.type || 'Vendor', contact_person: v.contact_person || '', phone: v.phone || '', address: v.address || '', gstin: v.gstin || '', order_link: v.order_link || '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSaveVendor = async (e) => {
    e.preventDefault();
    if (!vendorForm.name.trim()) { setFormError('Name is required'); return; }
    setSaving(true); setFormError('');
    try {
      if (editingVendor) {
        await api.put(`/vendors/${editingVendor.id}`, vendorForm);
      } else {
        await api.post('/vendors', vendorForm);
      }
      setShowForm(false);
      if (onRefreshVendors) onRefreshVendors();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to save vendor');
    } finally { setSaving(false); }
  };

  const handleDeleteVendor = async (v) => {
    const isConfirmed = await confirm({
      title: 'Delete Vendor',
      message: `Are you sure you want to delete vendor "${v.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;

    try {
      await api.delete(`/vendors/${v.id}`);
      if (onRefreshVendors) onRefreshVendors();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Cannot delete this vendor');
    }
  };

  const openRequestForm = () => {
    setRequestForm(emptyVendorForm);
    setRequestReason('');
    setRequestError('');
    setShowRequestForm(true);
  };

  const submitVendorRequest = async (e) => {
    e.preventDefault();
    if (!requestForm.name.trim()) { setRequestError('Name is required'); return; }
    setRequestSaving(true);
    try {
      await api.post('/vendor-requests', {
        request_type: 'Vendor',
        name: requestForm.name.trim(),
        contact_person: requestForm.contact_person || null,
        phone: requestForm.phone || null,
        address: requestForm.address || null,
        gstin: requestForm.gstin || null,
        branch_id: null,
        request_reason: requestReason || null
      });
      setShowRequestForm(false);
    } catch (err) {
      setRequestError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit request');
    } finally { setRequestSaving(false); }
  };

  /* ── Purchase submit ── */
  const openPurchaseForm = (v) => {
    setPurchaseForm({ vendor_id: v.id, amount: '', bill_number: '', bill_date: serverToday(), description: '' });
    setPurchaseError('');
    setPurchaseSuccess('');
    setShowPurchaseForm(true);
  };

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    setPurchaseSaving(true);
    setPurchaseError('');
    try {
      await api.post('/vendor-purchases', purchaseForm);
      setPurchaseSuccess('Purchase recorded successfully!');
      setTimeout(() => {
        setShowPurchaseForm(false);
        setPurchaseSuccess('');
        if (selectedVendor) openVendorDetail(selectedVendor);
        if (onRefreshVendors) onRefreshVendors();
      }, 1000);
    } catch (err) {
      setPurchaseError(err.response?.data?.message || 'Failed to record purchase');
    } finally { setPurchaseSaving(false); }
  };

  const filteredVendors = vendors.filter(v =>
    v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ── Vendor Detail Dashboard ── */
  if (selectedVendor) {
    const v = selectedVendor;
    const rows = vendorLedger?.rows || [];
    const purchases = vendorLedger?.purchases || [];
    const payments = vendorLedger?.payments || [];
    const totalPurchases = purchases.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const totalPaid = payments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const balance = totalPurchases - totalPaid;

    return (
      <div className="em-section">
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedVendor(null); setVendorLedger(null); }}>
          <ArrowLeft size={16} /> Back to Vendors
        </button>

        {/* Vendor Profile Card */}
        <div className="em-vendor-profile">
          <div className="em-vendor-profile__avatar"><Store size={32} /></div>
          <div className="em-vendor-profile__info">
            <h2 className="em-vendor-profile__name">{v.name}</h2>
            <div className="em-vendor-profile__meta">
              <span className="em-type-badge em-type-badge--vendor">{v.type || 'Vendor'}</span>
              {v.phone && <span className="em-vendor-profile__tag"><Phone size={12} /> {v.phone}</span>}
              {v.address && <span className="em-vendor-profile__tag"><MapPin size={12} /> {v.address}</span>}
              {v.contact_person && <span className="em-vendor-profile__tag"><User size={12} /> {v.contact_person}</span>}
              {v.gstin && <span className="em-vendor-profile__tag"><FileText size={12} /> GSTIN: {v.gstin}</span>}
            </div>
          </div>
          <div className="em-vendor-profile__actions" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff' }} onClick={() => openPurchaseForm(v)}>
              <ShoppingCart size={14} /> Record Purchase
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => onPayment({ type: 'Vendor', vendor_id: v.id, payee_name: v.name })}>
              <IndianRupee size={14} /> Make Payment
            </button>
          </div>
        </div>

        {/* Financial Summary KPIs */}
        <div className="em-kpi-grid em-kpi-grid--3">
          <div className="em-kpi-card em-kpi-card--blue">
            <div className="em-kpi-card__icon"><Package size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Total Purchases</div>
              <div className="em-kpi-card__value">₹{fmt(totalPurchases)}</div>
            </div>
          </div>
          <div className="em-kpi-card em-kpi-card--green">
            <div className="em-kpi-card__icon"><TrendingUp size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Total Paid</div>
              <div className="em-kpi-card__value">₹{fmt(totalPaid)}</div>
            </div>
          </div>
          <div className="em-kpi-card" style={{ borderLeft: `4px solid ${balance > 0 ? 'var(--error)' : 'var(--success)'}` }}>
            <div className="em-kpi-card__icon"><TrendingDown size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Balance Due</div>
              <div className="em-kpi-card__value" style={{ color: balance > 0 ? 'var(--error)' : 'var(--success)' }}>₹{fmt(Math.abs(balance))}</div>
              {balance > 0 && <div className="em-kpi-card__sub em-kpi-card__sub--warn">Outstanding</div>}
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="em-card">
          <div className="em-card__title"><FileText size={16} /> Transaction History</div>
          {loadingLedger ? <div className="em-loading"><Loader2 className="spin" size={20} /> Loading...</div> : rows.length > 0 ? (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.payment_date || r.bill_date || r._date)}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                          background: r._entry_type === 'Purchase' ? '#fef3c7' : '#dcfce7',
                          color: r._entry_type === 'Purchase' ? '#92400e' : '#166534'
                        }}>
                          {r._entry_type}
                        </span>
                      </td>
                      <td>{r.reference_number || r.bill_number || '—'}</td>
                      <td>{r.description || r.payee_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: r._entry_type === 'Purchase' ? 'var(--error)' : 'var(--success)' }}>
                        {r._entry_type === 'Purchase' ? '-' : '+'}₹{fmt(Number(r.amount || r.total_amount || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="em-empty-inline">
              <FileText size={32} strokeWidth={1} />
              <p>No transactions found for this vendor</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Vendor List ── */
  return (
    <div className="em-section">
      <div className="em-filter-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div className="em-section-title"><Store size={18} /> Vendor Management</div>
        <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
          <div className="em-search-wrap" style={{ maxWidth: 220 }}>
            <Search size={16} className="em-search-icon" />
            <input className="em-input" style={{ paddingLeft: 36 }} placeholder="Search vendors..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          {isAdmin ? (
            <button className="btn btn-primary btn-sm" onClick={openAddForm}>
              <Plus size={15} /> Add Vendor
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={openRequestForm}>
              <Plus size={15} /> Request Vendor
            </button>
          )}
        </div>
      </div>

      {vendors.length === 0 ? (
        <div className="em-empty-state">
          <div className="em-empty-state__icon"><Store size={48} strokeWidth={1.5} /></div>
          <h3 className="em-empty-state__title">No Vendors Yet</h3>
          <p className="em-empty-state__desc">Add vendors to track purchases and payments.</p>
          {isAdmin ? (
            <button className="btn btn-primary btn-sm" onClick={openAddForm}><Plus size={15} /> Add First Vendor</button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={openRequestForm}><Plus size={15} /> Request Vendor</button>
          )}
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="em-empty-text">No vendors matching "{searchTerm}"</div>
      ) : (
        <div className="em-vendor-list">
          {filteredVendors.map(v => (
            <div key={v.id} className="em-vendor-card" onDoubleClick={() => openVendorDetail(v)}>
              <div className="em-vendor-card__header" onClick={() => setExpandedVendor(expandedVendor === v.id ? null : v.id)}>
                <div className="em-vendor-card__avatar"><Store size={18} /></div>
                <div className="em-vendor-card__info">
                  <div className="em-vendor-card__name">{v.name}</div>
                  <div className="em-vendor-card__meta">{v.type} · {v.phone || 'No phone'}</div>
                </div>
                <div className="em-vendor-card__actions">
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openVendorDetail(v); }}>View</button>
                  <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff', border: 'none' }} onClick={(e) => { e.stopPropagation(); openPurchaseForm(v); }}>
                    <ShoppingCart size={14} /> Purchase
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onPayment({ type: 'Vendor', vendor_id: v.id, payee_name: v.name }); }}>
                    <IndianRupee size={14} /> Pay
                  </button>
                  {isAdmin && (
                    <>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={(e) => { e.stopPropagation(); openEditForm(v); }}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v); }}><Trash2 size={14} /></button>
                    </>
                  )}
                  {expandedVendor === v.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>
              {expandedVendor === v.id && (
                <div className="em-vendor-card__body">
                  <div className="em-vendor-card__details-grid">
                    {v.address && <div className="em-vendor-detail-item"><MapPin size={14} /><span>{v.address}</span></div>}
                    {v.gstin && <div className="em-vendor-detail-item"><FileText size={14} /><span>GSTIN: {v.gstin}</span></div>}
                    <div className="em-vendor-detail-item"><User size={14} /><span>Contact: {v.contact_person || '—'}</span></div>
                    {v.phone && <div className="em-vendor-detail-item"><Phone size={14} /><span>{v.phone}</span></div>}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openVendorDetail(v)}>View Full Dashboard →</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit Vendor Modal ── */}
      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
              <h2>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveVendor}>
              <div className="em-modal__body">
                {formError && <div className="em-error" style={{ marginBottom: 12 }}>{formError}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group">
                    <label>Vendor Name *</label>
                    <input className="em-input" value={vendorForm.name} onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="em-form-group">
                    <label>Type</label>
                    <select className="em-input" value={vendorForm.type} onChange={e => setVendorForm(p => ({ ...p, type: e.target.value }))}>
                      <option value="Vendor">Vendor</option>
                      <option value="Paper Supplier">Paper Supplier</option>
                      <option value="Ink Supplier">Ink Supplier</option>
                      <option value="Machine Vendor">Machine Vendor</option>
                      <option value="Service Provider">Service Provider</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="em-form-group">
                    <label>Contact Person</label>
                    <input className="em-input" value={vendorForm.contact_person} onChange={e => setVendorForm(p => ({ ...p, contact_person: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>Phone</label>
                    <input className="em-input" value={vendorForm.phone} onChange={e => setVendorForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Address</label>
                    <input className="em-input" value={vendorForm.address} onChange={e => setVendorForm(p => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>GSTIN</label>
                    <input className="em-input" value={vendorForm.gstin} onChange={e => setVendorForm(p => ({ ...p, gstin: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>Order Link</label>
                    <input className="em-input" value={vendorForm.order_link} onChange={e => setVendorForm(p => ({ ...p, order_link: e.target.value }))} placeholder="https://..." />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : (editingVendor ? 'Update Vendor' : 'Add Vendor')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Vendor Request Modal (Front Office) ── */}
      {showRequestForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRequestForm(false); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
              <h2>Request Vendor</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRequestForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={submitVendorRequest}>
              <div className="em-modal__body">
                {requestError && <div className="em-error" style={{ marginBottom: 12 }}>{requestError}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group">
                    <label>Vendor Name *</label>
                    <input className="em-input" value={requestForm.name} onChange={e => setRequestForm(p => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="em-form-group">
                    <label>Contact Person</label>
                    <input className="em-input" value={requestForm.contact_person} onChange={e => setRequestForm(p => ({ ...p, contact_person: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>Phone</label>
                    <input className="em-input" value={requestForm.phone} onChange={e => setRequestForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>GSTIN</label>
                    <input className="em-input" value={requestForm.gstin} onChange={e => setRequestForm(p => ({ ...p, gstin: e.target.value }))} />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Address</label>
                    <input className="em-input" value={requestForm.address} onChange={e => setRequestForm(p => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Reason / Notes</label>
                    <input className="em-input" value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Why is this vendor needed?" />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowRequestForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={requestSaving}>{requestSaving ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Recording Modal */}
      {showPurchaseForm && (
        <div className="em-modal-backdrop" onClick={() => setShowPurchaseForm(false)}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handlePurchaseSubmit}>
              <div className="em-modal__header">
                <h3><ShoppingCart size={18} /> Record Purchase — {purchaseForm.vendor_name}</h3>
                <button type="button" className="em-modal__close" onClick={() => setShowPurchaseForm(false)}>×</button>
              </div>
              <div className="em-modal__body">
                {purchaseError && <div className="em-alert em-alert--danger">{purchaseError}</div>}
                {purchaseSuccess && <div className="em-alert em-alert--success">{purchaseSuccess}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group">
                    <label>Amount (₹) *</label>
                    <input className="em-input" type="number" step="0.01" min="0" required value={purchaseForm.amount} onChange={e => setPurchaseForm(p => ({ ...p, amount: e.target.value }))} placeholder="Enter purchase amount" />
                  </div>
                  <div className="em-form-group">
                    <label>Bill Number</label>
                    <input className="em-input" value={purchaseForm.bill_number} onChange={e => setPurchaseForm(p => ({ ...p, bill_number: e.target.value }))} placeholder="e.g. INV-001" />
                  </div>
                  <div className="em-form-group">
                    <label>Bill Date</label>
                    <input className="em-input" type="date" value={purchaseForm.bill_date} onChange={e => setPurchaseForm(p => ({ ...p, bill_date: e.target.value }))} />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Description</label>
                    <textarea className="em-input" rows={3} value={purchaseForm.description} onChange={e => setPurchaseForm(p => ({ ...p, description: e.target.value }))} placeholder="What was purchased?" />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowPurchaseForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={purchaseSaving}>{purchaseSaving ? 'Saving...' : 'Record Purchase'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorsTab;
