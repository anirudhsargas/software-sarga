import React, { useState, useEffect, useCallback } from 'react';
import { Home, Plus, Edit2, Trash2, IndianRupee, X } from 'lucide-react';
import api from '../../services/api';
import auth from '../../services/auth';
import { fmt, today } from './constants';

const defaultRentForm = { property_name: '', location: '', owner_name: '', owner_mobile: '', monthly_rent: '', due_day: '1', advance_deposit: '', branch_id: '' };

const RentTab = ({ branches, onPayment, onError }) => {
  const [rentLocations, setRentLocations] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultRentForm);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState(defaultRentForm);
  const [requestReason, setRequestReason] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState('');

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  const fetchRentLocations = useCallback(async () => {
    try { const r = await api.get('/rent-locations'); setRentLocations(r.data); } catch {}
  }, []);

  useEffect(() => { fetchRentLocations(); }, [fetchRentLocations]);

  const submitRent = async (e) => {
    e.preventDefault();
    try {
      if (editing) await api.put(`/rent-locations/${editing.id}`, form);
      else await api.post('/rent-locations', form);
      setShowForm(false); setEditing(null); setForm(defaultRentForm); fetchRentLocations();
    } catch (err) { onError(err.response?.data?.message || 'Failed'); }
  };

  const deleteRent = async (id) => {
    if (!window.confirm('Remove this rent location?')) return;
    try { await api.delete(`/rent-locations/${id}`); fetchRentLocations(); } catch {}
  };

  const openRequestForm = () => {
    setRequestForm(defaultRentForm);
    setRequestReason('');
    setRequestError('');
    setShowRequestForm(true);
  };

  const submitRentRequest = async (e) => {
    e.preventDefault();
    if (!requestForm.property_name.trim()) { setRequestError('Property name is required'); return; }
    setRequestSaving(true);
    try {
      const reasonBits = [
        requestReason || '',
        requestForm.monthly_rent ? `Monthly Rent: ₹${requestForm.monthly_rent}` : '',
        requestForm.due_day ? `Due Day: ${requestForm.due_day}` : '',
        requestForm.advance_deposit ? `Advance: ₹${requestForm.advance_deposit}` : ''
      ].filter(Boolean).join(' | ');

      await api.post('/vendor-requests', {
        request_type: 'Rent',
        name: requestForm.property_name.trim(),
        contact_person: requestForm.owner_name || null,
        phone: requestForm.owner_mobile || null,
        address: requestForm.location || null,
        branch_id: requestForm.branch_id || null,
        request_reason: reasonBits || null
      });
      setShowRequestForm(false);
    } catch (err) {
      setRequestError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit request');
    } finally { setRequestSaving(false); }
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({ property_name: r.property_name, location: r.location || '', owner_name: r.owner_name || '', owner_mobile: r.owner_mobile || '', monthly_rent: r.monthly_rent, due_day: r.due_day || '1', advance_deposit: r.advance_deposit || '', branch_id: r.branch_id || '' });
    setShowForm(true);
  };

  return (
    <div className="em-section">
      <div className="em-filter-row" style={{ justifyContent: 'space-between' }}>
        <div className="em-section-title"><Home size={18} /> Rent Locations</div>
        {isAdmin ? (
          <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setForm(defaultRentForm); setShowForm(true); }}><Plus size={15} /> Add Location</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={openRequestForm}><Plus size={15} /> Request Location</button>
        )}
      </div>

      {rentLocations.length === 0 ? <div className="em-empty-text">No rent locations</div> : (
        <div className="em-rent-alerts">
          {rentLocations.map(r => {
            const paid = Number(r.paid_this_month || 0);
            const rent = Number(r.monthly_rent);
            const status = paid >= rent ? 'paid' : paid > 0 ? 'upcoming' : 'due';
            return (
              <div key={r.id} className={`em-rent-card em-rent-card--${status}`}>
                <div className="em-rent-card__info">
                  <div className="em-rent-card__name">{r.property_name}</div>
                  {r.location && <div className="em-rent-card__location">{r.location}</div>}
                  <div className="em-rent-card__owner">{r.owner_name} · {r.owner_mobile || ''}</div>
                </div>
                <div className="em-rent-card__amounts">
                  <div className="em-rent-card__row"><span>Monthly Rent</span><span className="em-rent-card__amt">₹{fmt(rent)}</span></div>
                  <div className="em-rent-card__row"><span>Paid</span><span className="em-rent-card__amt" style={{ color: '#16a34a' }}>₹{fmt(paid)}</span></div>
                  <div className="em-rent-card__row em-rent-card__row--due"><span>Remaining</span><span className="em-rent-card__amt" style={{ color: '#dc2626' }}>₹{fmt(Math.max(rent - paid, 0))}</span></div>
                </div>
                <div className="em-rent-card__actions">
                  <button className="btn btn-primary btn-sm" onClick={() => onPayment({ type: 'Rent', payee_name: r.owner_name, description: r.property_name, amount: String(Math.max(rent - paid, 0)) })}><IndianRupee size={14} /> Pay</button>
                  {isAdmin && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteRent(r.id)}><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rent Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>{editing ? 'Edit' : 'Add'} Rent Location</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button></div>
            <form onSubmit={submitRent}>
              <div className="em-modal__body">
                <div className="em-form-grid">
                  <div className="em-form-group"><label>Property Name</label><input className="em-input" value={form.property_name} onChange={e => setForm(p => ({ ...p, property_name: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Location</label><input className="em-input" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Owner Name</label><input className="em-input" value={form.owner_name} onChange={e => setForm(p => ({ ...p, owner_name: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Owner Mobile</label><input className="em-input" value={form.owner_mobile} onChange={e => setForm(p => ({ ...p, owner_mobile: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Monthly Rent (₹)</label><input className="em-input" type="number" min="0" value={form.monthly_rent} onChange={e => setForm(p => ({ ...p, monthly_rent: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Due Day</label><input className="em-input" type="number" min="1" max="31" value={form.due_day} onChange={e => setForm(p => ({ ...p, due_day: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Advance Deposit (₹)</label><input className="em-input" type="number" min="0" value={form.advance_deposit} onChange={e => setForm(p => ({ ...p, advance_deposit: e.target.value }))} /></div>
                  {branches.length > 0 && <div className="em-form-group"><label>Branch</label><select className="em-input" value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}><option value="">Select Branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
                </div>
              </div>
              <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Add'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* ── Rent Request Modal (Front Office) ── */}
      {showRequestForm && (
        <div className="modal-backdrop" onClick={() => setShowRequestForm(false)}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header"><h2>Request Rent Location</h2><button className="btn btn-ghost btn-icon" onClick={() => setShowRequestForm(false)}><X size={18} /></button></div>
            <form onSubmit={submitRentRequest}>
              <div className="em-modal__body">
                {requestError && <div className="em-error" style={{ marginBottom: 12 }}>{requestError}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group"><label>Property Name *</label><input className="em-input" value={requestForm.property_name} onChange={e => setRequestForm(p => ({ ...p, property_name: e.target.value }))} required /></div>
                  <div className="em-form-group"><label>Location</label><input className="em-input" value={requestForm.location} onChange={e => setRequestForm(p => ({ ...p, location: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Owner Name</label><input className="em-input" value={requestForm.owner_name} onChange={e => setRequestForm(p => ({ ...p, owner_name: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Owner Mobile</label><input className="em-input" value={requestForm.owner_mobile} onChange={e => setRequestForm(p => ({ ...p, owner_mobile: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Monthly Rent (₹)</label><input className="em-input" type="number" min="0" value={requestForm.monthly_rent} onChange={e => setRequestForm(p => ({ ...p, monthly_rent: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Due Day</label><input className="em-input" type="number" min="1" max="31" value={requestForm.due_day} onChange={e => setRequestForm(p => ({ ...p, due_day: e.target.value }))} /></div>
                  <div className="em-form-group"><label>Advance Deposit (₹)</label><input className="em-input" type="number" min="0" value={requestForm.advance_deposit} onChange={e => setRequestForm(p => ({ ...p, advance_deposit: e.target.value }))} /></div>
                  {branches.length > 0 && <div className="em-form-group"><label>Branch</label><select className="em-input" value={requestForm.branch_id} onChange={e => setRequestForm(p => ({ ...p, branch_id: e.target.value }))}><option value="">Select Branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
                  <div className="em-form-group em-form-group--full"><label>Reason / Notes</label><input className="em-input" value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Why is this location needed?" /></div>
                </div>
              </div>
              <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setShowRequestForm(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={requestSaving}>{requestSaving ? 'Submitting...' : 'Submit Request'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentTab;
