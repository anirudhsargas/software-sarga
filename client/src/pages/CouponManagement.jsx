import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Tag, Plus, X, Trash2, ToggleLeft, ToggleRight, Loader2, Edit3, CheckCircle, Clock, Infinity as InfinityIcon } from 'lucide-react';
import PageContainer from '../components/ui/PageContainer';

const usageTypeLabels = { one_time: 'One-Time', limited: 'Limited', unlimited: 'Unlimited' };

const CouponManagement = () => {
    useSEO('Coupon Management');

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: '',
    usage_type: 'unlimited',
    max_uses: '',
    min_order_amount: '',
    expiry_date: ''
  });

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await api.get('/coupons');
      setCoupons(res.data || []);
    } catch {
      toast.error('Failed to load coupons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCoupons(); }, []);

  const resetForm = () => {
    setForm({ code: '', discount_type: 'percent', discount_value: '', usage_type: 'unlimited', max_uses: '', min_order_amount: '', expiry_date: '' });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };

  const openEdit = (coupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      usage_type: coupon.usage_type || 'unlimited',
      max_uses: coupon.max_uses || '',
      min_order_amount: coupon.min_order_amount || '',
      expiry_date: coupon.expiry_date ? coupon.expiry_date.split('T')[0] : ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error('Enter a coupon code'); return; }
    if (!form.discount_value || Number(form.discount_value) <= 0) { toast.error('Enter a valid discount value'); return; }
    if (form.discount_type === 'percent' && Number(form.discount_value) > 100) { toast.error('Percentage cannot exceed 100%'); return; }
    if (form.usage_type === 'limited' && (!form.max_uses || Number(form.max_uses) < 1)) { toast.error('Enter max uses for limited coupons'); return; }

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/coupons/${editing.id}`, form);
        toast.success('Coupon updated!');
      } else {
        await api.post('/coupons', form);
        toast.success('Coupon created!');
      }
      setShowModal(false);
      resetForm();
      fetchCoupons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save coupon');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon) => {
    try {
      await api.put(`/coupons/${coupon.id}`, {
        ...coupon,
        is_active: !coupon.is_active
      });
      toast.success(coupon.is_active ? 'Coupon deactivated' : 'Coupon activated');
      fetchCoupons();
    } catch {
      toast.error('Failed to update coupon');
    }
  };

  const deleteCoupon = async (coupon) => {
    if (!window.confirm(`Deactivate coupon "${coupon.code}"?`)) return;
    try {
      await api.delete(`/coupons/${coupon.id}`);
      toast.success('Coupon deactivated');
      fetchCoupons();
    } catch {
      toast.error('Failed to deactivate coupon');
    }
  };

  const isExpired = (d) => {
    if (!d) return false;
    return new Date(d) < new Date(new Date().toISOString().split('T')[0]);
  };

  const isExhausted = (c) => c.max_uses !== null && c.used_count >= c.max_uses;

  return (
    <PageContainer>
      {/* Header */}
      <div className="row space-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="row gap-sm items-center">
          <Tag size={22} style={{ color: 'var(--accent)' }} />
          <h1 className="section-title" style={{ margin: 0, fontSize: '22px' }}>Coupon Management</h1>
        </div>
        <button className="btn btn-primary" onClick={openCreate} style={{ gap: '6px' }}>
          <Plus size={16} /> Create Coupon
        </button>
      </div>

      {/* Coupon List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
          Loading coupons...
        </div>
      ) : coupons.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <Tag size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>No coupons yet</div>
          <div style={{ fontSize: '13px' }}>Create your first coupon to offer discounts</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {coupons.map(c => {
            const expired = isExpired(c.expiry_date);
            const exhausted = isExhausted(c);
            const inactive = !c.is_active || expired || exhausted;
            return (
              <div
                key={c.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  opacity: inactive ? 0.55 : 1,
                  transition: 'box-shadow 0.2s, opacity 0.2s',
                }}
              >
                <div className="row space-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
                  {/* Left: Code + Discount */}
                  <div className="row gap-md items-center" style={{ flexWrap: 'wrap' }}>
                    <div style={{
                      background: c.discount_type === 'percent'
                        ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                        : 'linear-gradient(135deg, #f59e0b, #ef4444)',
                      color: 'var(--on-accent)', fontWeight: 700, fontSize: '13px',
                      padding: '6px 14px', borderRadius: '8px',
                      letterSpacing: '0.08em', textTransform: 'uppercase'
                    }}>
                      {c.code}
                    </div>
                    <div>
                      <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontFamily: "'Space Grotesk', sans-serif" }}>
                        {c.discount_type === 'percent' ? `${Number(c.discount_value)}%` : `₹${Number(c.discount_value).toFixed(0)}`}
                      </span>
                      <span className="muted" style={{ fontSize: '13px', marginLeft: '4px' }}>off</span>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="row gap-xs items-center">
                    <button className="icon-button" title="Edit" onClick={() => openEdit(c)}><Edit3 size={16} /></button>
                    <button className="icon-button" title={c.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(c)}>
                      {c.is_active ? <ToggleRight size={18} style={{ color: 'var(--success)' }} /> : <ToggleLeft size={18} style={{ color: 'var(--muted)' }} />}
                    </button>
                    <button className="icon-button" title="Delete" onClick={() => deleteCoupon(c)} style={{ color: 'var(--error)' }}><Trash2 size={16} /></button>
                  </div>
                </div>

                {/* Meta row */}
                <div className="row gap-md items-center" style={{ marginTop: '10px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--muted)' }}>
                  {/* Usage type */}
                  <span className="row gap-xs items-center">
                    {c.usage_type === 'unlimited' ? <InfinityIcon size={13} /> : c.usage_type === 'one_time' ? <CheckCircle size={13} /> : <Clock size={13} />}
                    {usageTypeLabels[c.usage_type] || 'Unlimited'}
                    {c.max_uses !== null && <span>({c.used_count}/{c.max_uses} used)</span>}
                    {c.max_uses === null && <span>({c.used_count} used)</span>}
                  </span>

                  {/* Min order */}
                  {Number(c.min_order_amount) > 0 && (
                    <span>Min ₹{Number(c.min_order_amount).toFixed(0)}</span>
                  )}

                  {/* Expiry */}
                  {c.expiry_date && (
                    <span style={{ color: expired ? 'var(--error)' : 'var(--muted)' }}>
                      {expired ? 'Expired' : 'Expires'} {new Date(c.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}

                  {/* Status badges */}
                  {!c.is_active && <span style={{ color: 'var(--error)', fontWeight: 600 }}>Inactive</span>}
                  {exhausted && c.is_active && <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Exhausted</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div role="button" tabIndex={0} className="modal-backdrop" onClick={() => { setShowModal(false); resetForm(); }}>
          <div role="button" tabIndex={0} className="modal" style={{ maxWidth: '480px', width: '92%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button className="icon-button" onClick={() => { setShowModal(false); resetForm(); }}
              style={{ position: 'absolute', top: '18px', right: '18px' }}>
              <X size={20} />
            </button>
            <h2 className="section-title mb-24">{editing ? 'Edit Coupon' : 'Create Coupon'}</h2>

            <div className="stack-md">
              {/* Code */}
              <div>
                <label className="label">Coupon Code</label>
                <input
                  className="input-field"
                  placeholder="e.g., SAVE20"
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  disabled={!!editing}
                  style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}
                />
              </div>

              {/* Discount Type + Value */}
              <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label className="label">Discount Type</label>
                  <select className="input-field" value={form.discount_type}
                    onChange={e => setForm({ ...form, discount_type: e.target.value })}>
                    <option value="percent">Percentage (%)</option>
                    <option value="amount">Flat Amount (₹)</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label className="label">{form.discount_type === 'percent' ? 'Discount %' : 'Discount ₹'}</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    max={form.discount_type === 'percent' ? 100 : undefined}
                    step={form.discount_type === 'percent' ? '0.5' : '1'}
                    placeholder={form.discount_type === 'percent' ? '10' : '50'}
                    value={form.discount_value}
                    onChange={e => setForm({ ...form, discount_value: e.target.value })}
                  />
                </div>
              </div>

              {/* Usage Type */}
              <div>
                <label className="label">Usage Type</label>
                <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
                  {['one_time', 'limited', 'unlimited'].map(type => (
                    <button
                      key={type}
                      type="button"
                      className={`btn btn-sm ${form.usage_type === type ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setForm({ ...form, usage_type: type, max_uses: type === 'one_time' ? 1 : (type === 'unlimited' ? '' : form.max_uses) })}
                      style={{ gap: '5px' }}
                    >
                      {type === 'one_time' && <CheckCircle size={14} />}
                      {type === 'limited' && <Clock size={14} />}
                      {type === 'unlimited' && <InfinityIcon size={14} />}
                      {usageTypeLabels[type]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max uses (only for limited) */}
              {form.usage_type === 'limited' && (
                <div>
                  <label className="label">Max Uses</label>
                  <input
                    type="number"
                    className="input-field"
                    min="1"
                    placeholder="50"
                    value={form.max_uses}
                    onChange={e => setForm({ ...form, max_uses: e.target.value })}
                    style={{ maxWidth: '160px' }}
                  />
                </div>
              )}

              {/* Min order + Expiry */}
              <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label className="label">Min Order ₹ <span className="muted">(optional)</span></label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    placeholder="0"
                    value={form.min_order_amount}
                    onChange={e => setForm({ ...form, min_order_amount: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label className="label">Expiry Date <span className="muted">(optional)</span></label>
                  <input
                    type="date"
                    className="input-field"
                    value={form.expiry_date}
                    onChange={e => setForm({ ...form, expiry_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="row gap-sm" style={{ marginTop: '8px' }}>
                <button className="btn btn-primary btn--full" onClick={handleSave} disabled={saving} style={{ gap: '6px' }}>
                  {saving ? <><Loader2 size={16} className="spin" /> Saving...</> : editing ? 'Update Coupon' : 'Create Coupon'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default CouponManagement;
