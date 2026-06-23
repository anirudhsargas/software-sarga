import React, { useState, useEffect } from 'react';
import { X, Zap, FileText, CreditCard, Stamp, Image, BookOpen, Printer, Camera, Scissors, Copy, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { useBranches } from '../contexts/BranchContext';
import auth from '../services/auth';

const COLORS = [
  { key: 'purple', bg: '#EEEDFE', fg: '#3C3489' },
  { key: 'teal', bg: '#E1F5EE', fg: '#0F6E56' },
  { key: 'blue', bg: '#E6F1FB', fg: '#185FA5' },
  { key: 'amber', bg: '#FAEEDA', fg: '#854F0B' },
  { key: 'pink', bg: '#FBEAF0', fg: '#993556' },
  { key: 'green', bg: '#EAF3DE', fg: '#3B6D11' },
];

const ICONS = [
  { key: 'bolt', Icon: Zap },
  { key: 'file', Icon: FileText },
  { key: 'card', Icon: CreditCard },
  { key: 'stamp', Icon: Stamp },
  { key: 'image', Icon: Image },
  { key: 'book', Icon: BookOpen },
  { key: 'printer', Icon: Printer },
  { key: 'camera', Icon: Camera },
  { key: 'scissors', Icon: Scissors },
  { key: 'copy', Icon: Copy },
  { key: 'tag', Icon: Tag },
];

const CUSTOMER_TYPES = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'regular', label: 'Regular' },
  { value: 'credit', label: 'Credit' },
];

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'credit', label: 'Credit' },
];

const defaultForm = () => ({
  name: '',
  price: '',
  unit: 'page',
  customer_type: 'walk_in',
  payment_mode: 'cash',
  color: 'purple',
  icon_name: 'bolt',
  sort_order: 0,
  product_id: null,
});

const AddEditShortcutModal = ({ open, onClose, onSave, editingShortcut, targetBranchId, onSuggest }) => {
  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin';
  const { branches } = useBranches();
  const [form, setForm] = useState(defaultForm());
  const [suggestBranchId, setSuggestBranchId] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingShortcut) {
      setForm({
        name: editingShortcut.name || '',
        price: editingShortcut.price || '',
        unit: editingShortcut.unit || 'page',
        customer_type: editingShortcut.customer_type || 'walk_in',
        payment_mode: editingShortcut.payment_mode || 'cash',
        color: editingShortcut.color || 'purple',
        icon_name: editingShortcut.icon_name || 'bolt',
        sort_order: editingShortcut.sort_order || 0,
        product_id: editingShortcut.product_id || null,
      });
    } else {
      setForm(defaultForm());
    }
    setShowSuggest(false);
    setSuggestBranchId('');
  }, [editingShortcut, open]);

  if (!open) return null;

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (form.price === '' || Number(form.price) < 0) { toast.error('Enter a valid price'); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        sort_order: Number(form.sort_order) || 0,
      };
      await onSave(payload);
      onClose();
    } catch {
      toast.error('Failed to save shortcut');
    } finally {
      setSaving(false);
    }
  };

  const handleSuggest = async () => {
    if (!suggestBranchId) { toast.error('Select a target branch'); return; }

    setSaving(true);
    try {
      const shortcutData = {
        name: form.name,
        price: Number(form.price) || 0,
        unit: form.unit || 'page',
        customer_type: form.customer_type,
        payment_mode: form.payment_mode,
        color: form.color,
        icon_name: form.icon_name,
        sort_order: Number(form.sort_order) || 0,
        product_id: form.product_id,
      };
      await onSuggest(suggestBranchId, shortcutData);
      toast.success('Suggestion submitted');
      onClose();
    } catch {
      toast.error('Failed to submit suggestion');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="shortcut-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-modal__header">
          <h2>{editingShortcut ? 'Edit Shortcut' : 'Add Shortcut'}</h2>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="shortcut-modal__body">
          {/* Name */}
          <div className="shortcut-field">
            <label htmlFor="shortcut-name">Name *</label>
            <input
              id="shortcut-name"
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Photostat B&W"
              autoFocus
            />
          </div>

          {/* Price + Unit row */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="shortcut-field" style={{ flex: 1 }}>
              <label htmlFor="shortcut-price">Price (₹) *</label>
              <input
                id="shortcut-price"
                type="number"
                min="0"
                step="0.50"
                value={form.price}
                onChange={(e) => handleChange('price', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="shortcut-field" style={{ flex: 1 }}>
              <label htmlFor="shortcut-unit">Unit</label>
              <input
                id="shortcut-unit"
                type="text"
                value={form.unit}
                onChange={(e) => handleChange('unit', e.target.value)}
                placeholder="page"
              />
            </div>
          </div>

          {/* Customer Type + Payment Mode row */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="shortcut-field" style={{ flex: 1 }}>
              <label htmlFor="shortcut-cust-type">Customer Type</label>
              <select
                id="shortcut-cust-type"
                value={form.customer_type}
                onChange={(e) => handleChange('customer_type', e.target.value)}
              >
                {CUSTOMER_TYPES.map(ct => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
            </div>
            <div className="shortcut-field" style={{ flex: 1 }}>
              <label htmlFor="shortcut-payment">Payment Mode</label>
              <select
                id="shortcut-payment"
                value={form.payment_mode}
                onChange={(e) => handleChange('payment_mode', e.target.value)}
              >
                {PAYMENT_MODES.map(pm => (
                  <option key={pm.value} value={pm.value}>{pm.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Color picker */}
          <div className="shortcut-field">
            <label>Color</label>
            <div className="shortcut-color-row">
              {COLORS.map(c => (
                <button
                  key={c.key}
                  className={`shortcut-color-swatch ${form.color === c.key ? 'shortcut-color-swatch--active' : ''}`}
                  style={{ background: c.fg }}
                  onClick={() => handleChange('color', c.key)}
                  title={c.key}
                  type="button"
                />
              ))}
            </div>
          </div>

          {/* Icon picker */}
          <div className="shortcut-field">
            <label>Icon</label>
            <div className="shortcut-icon-row">
              {ICONS.map(ic => (
                <button
                  key={ic.key}
                  className={`shortcut-icon-option ${form.icon_name === ic.key ? 'shortcut-icon-option--active' : ''}`}
                  onClick={() => handleChange('icon_name', ic.key)}
                  title={ic.key}
                  type="button"
                >
                  <ic.Icon size={18} />
                </button>
              ))}
            </div>
          </div>

          {/* Sort Order */}
          <div className="shortcut-field">
            <label htmlFor="shortcut-sort">Sort Order</label>
            <input
              id="shortcut-sort"
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(e) => handleChange('sort_order', e.target.value)}
            />
          </div>

          {/* Suggest to another branch (only for front_office on add) */}
          {isAdmin && !editingShortcut && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              {!showSuggest ? (
                <button
                  type="button"
                  onClick={() => setShowSuggest(true)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--muted)',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  + Suggest to another branch
                </button>
              ) : (
                <div className="shortcut-field">
                  <label htmlFor="shortcut-suggest-branch">Suggest to Branch</label>
                  <select
                    id="shortcut-suggest-branch"
                    value={suggestBranchId}
                    onChange={(e) => setSuggestBranchId(e.target.value)}
                  >
                    <option value="">Select branch...</option>
                    {branches
                      .filter(b => String(b.id) !== String(targetBranchId))
                      .map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))
                    }
                  </select>
                  <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={saving || !suggestBranchId}
                    style={{
                      marginTop: 6,
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--accent)',
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 500,
                    }}
                  >
                    Send Suggestion
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shortcut-modal__footer">
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              color: 'var(--text)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--on-accent, #fff)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : editingShortcut ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddEditShortcutModal;
