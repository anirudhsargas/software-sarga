import React, { useState } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const ManageShortcuts = ({ onClose }) => {
    const [formData, setFormData] = useState({
        name: '',
        display_name: '',
        default_price: '',
        pricing_mode: 'fixed',
        keyboard_shortcut: '',
        tiers: []
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/quick-billing/shortcuts', formData);
            toast.success('Shortcut created');
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create shortcut');
        } finally {
            setLoading(false);
        }
    };

    const addTier = () => {
        setFormData(prev => ({
            ...prev,
            tiers: [...prev.tiers, { min_qty: '', max_qty: '', price: '' }]
        }));
    };

    const removeTier = (idx) => {
        setFormData(prev => ({
            ...prev,
            tiers: prev.tiers.filter((_, i) => i !== idx)
        }));
    };

    const updateTier = (idx, field, value) => {
        setFormData(prev => ({
            ...prev,
            tiers: prev.tiers.map((t, i) => i === idx ? { ...t, [field]: value } : t)
        }));
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 'var(--z-modal-high)' }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header">
                    <h2>Manage Shortcuts</h2>
                    <button className="btn btn-icon" onClick={onClose}><X size={20} /></button>
                </div>
                
                <form className="modal-body form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Internal Name *</label>
                        <input required type="text" className="input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Photostat A4 B/W" />
                    </div>
                    
                    <div className="form-group">
                        <label>Display Name (Button Text)</label>
                        <input type="text" className="input" value={formData.display_name} onChange={e => setFormData({...formData, display_name: e.target.value})} placeholder="e.g. B/W Copy" />
                    </div>

                    <div className="row gap-md">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Default Price (₹) *</label>
                            <input required type="number" className="input" step="0.01" value={formData.default_price} onChange={e => setFormData({...formData, default_price: e.target.value})} />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Pricing Mode</label>
                            <select className="input" value={formData.pricing_mode} onChange={e => setFormData({...formData, pricing_mode: e.target.value})}>
                                <option value="fixed">Fixed Price</option>
                                <option value="tier">Tier Based (Slabs)</option>
                                <option value="manual">Manual Override Allowed</option>
                            </select>
                        </div>
                    </div>

                    {formData.pricing_mode === 'tier' && (
                        <div className="panel" style={{ marginBottom: '1rem', background: 'var(--surface-2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h4>Tier Pricing Configuration</h4>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={addTier}><Plus size={14}/> Add Tier</button>
                            </div>
                            {formData.tiers.map((tier, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                    <input type="number" className="input" placeholder="Min Qty" value={tier.min_qty} onChange={e => updateTier(idx, 'min_qty', e.target.value)} required />
                                    <span>to</span>
                                    <input type="number" className="input" placeholder="Max Qty (optional)" value={tier.max_qty} onChange={e => updateTier(idx, 'max_qty', e.target.value)} />
                                    <span>= ₹</span>
                                    <input type="number" className="input" placeholder="Price" value={tier.price} onChange={e => updateTier(idx, 'price', e.target.value)} required />
                                    <button type="button" className="btn btn-icon" onClick={() => removeTier(idx)}><Trash2 size={16} color="var(--error)" /></button>
                                </div>
                            ))}
                            {formData.tiers.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No tiers added. Base price will apply.</p>}
                        </div>
                    )}

                    <div className="form-group">
                        <label>Keyboard Shortcut (Optional)</label>
                        <input type="text" className="input" value={formData.keyboard_shortcut} onChange={e => setFormData({...formData, keyboard_shortcut: e.target.value})} placeholder="e.g. Alt+1" />
                        <small style={{ color: 'var(--muted)' }}>Users can press this combination to trigger the shortcut</small>
                    </div>

                    <div className="modal-footer" style={{ marginTop: '1.5rem', padding: 0, borderTop: 'none', gap: '1rem' }}>
                        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                            {loading ? 'Saving...' : <><Save size={16}/> Save Shortcut</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ManageShortcuts;
