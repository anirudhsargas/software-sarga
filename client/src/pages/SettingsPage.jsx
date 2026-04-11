import React, { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, DollarSign, CreditCard, Building2, Globe, Plus, Edit2, Trash2, Save, X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import './SettingsPage.css';

const tabs = [
    { key: 'company', label: 'Company', icon: Building2 },
    { key: 'taxes', label: 'Taxes', icon: DollarSign },
    { key: 'payment-modes', label: 'Payment Modes', icon: CreditCard },
    { key: 'language', label: 'Language', icon: Globe },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('company');

    return (
        <div className="sp-page">
            <div className="sp-header">
                <SettingsIcon size={22} />
                <h2 className="sp-title">Settings</h2>
            </div>
            <div className="sp-tabs">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        className={`sp-tab ${activeTab === t.key ? 'sp-tab--active' : ''}`}
                        onClick={() => setActiveTab(t.key)}
                    >
                        <t.icon size={16} />
                        {t.label}
                    </button>
                ))}
            </div>
            {activeTab === 'company' && <CompanySettings />}
            {activeTab === 'taxes' && <TaxSettings />}
            {activeTab === 'payment-modes' && <PaymentModeSettings />}
            {activeTab === 'language' && <LanguageSettings />}
        </div>
    );
}

// ── Company Settings (Feature 11) ────────────────────────────
function CompanySettings() {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/company-settings').then(r => { setSettings(r.data); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try { await api.put('/company-settings', settings); toast.success('Settings saved'); }
        catch { toast.error('Failed to save'); }
        finally { setSaving(false); }
    };

    const fields = [
        { key: 'company_name', label: 'Company Name' },
        { key: 'company_address', label: 'Address', multi: true },
        { key: 'company_phone', label: 'Phone' },
        { key: 'company_email', label: 'Email' },
        { key: 'company_gst', label: 'GST Number' },
        { key: 'company_logo_url', label: 'Logo URL' },
        { key: 'invoice_prefix', label: 'Invoice Prefix' },
        { key: 'invoice_footer_text', label: 'Invoice Footer Text' },
        { key: 'invoice_terms', label: 'Invoice Terms & Conditions', multi: true },
        { key: 'default_currency', label: 'Default Currency' },
    ];

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin" /></div>;

    return (
        <div className="sp-card">
            <h3 className="sp-card-title">Company Information</h3>
            <div className="sp-grid sp-grid--2">
                {fields.map(f => (
                    <div key={f.key} className={`sp-field ${f.multi ? 'sp-field--full' : ''}`}>
                        <label className="sp-label">{f.label}</label>
                        {f.multi ? (
                            <textarea
                                value={settings[f.key] || ''}
                                onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))}
                                rows={3}
                                className="sp-input sp-textarea"
                            />
                        ) : (
                            <input
                                value={settings[f.key] || ''}
                                onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))}
                                className="sp-input"
                            />
                        )}
                    </div>
                ))}
            </div>
            <div className="sp-actions sp-actions--end">
                <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Settings
                </button>
            </div>
        </div>
    );
}

// ── Tax Settings (Feature 7) ─────────────────────────────────
function TaxSettings() {
    const [taxes, setTaxes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', rate: 0, type: 'percentage', is_default: false, applies_to: 'all' });
    const [editingId, setEditingId] = useState(null);

    const fetch = useCallback(async () => {
        try { const { data } = await api.get('/tax-settings'); setTaxes(data); } catch (err) { void err; }
        setLoading(false);
    }, []);
    useEffect(() => {
        const t = setTimeout(() => { void fetch(); }, 0);
        return () => clearTimeout(t);
    }, [fetch]);

    const handleSave = async () => {
        if (!form.name) return toast.error('Name is required');
        try {
            if (editingId) { await api.put(`/tax-settings/${editingId}`, form); }
            else { await api.post('/tax-settings', form); }
            toast.success('Saved'); setShowForm(false); setEditingId(null);
            setForm({ name: '', rate: 0, type: 'percentage', is_default: false, applies_to: 'all' }); fetch();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const handleEdit = (t) => { setForm(t); setEditingId(t.id); setShowForm(true); };
    const handleDelete = async (id) => {
        if (!confirm('Delete this tax rate?')) return;
        try { await api.delete(`/tax-settings/${id}`); toast.success('Deleted'); fetch(); } catch { toast.error('Failed'); }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin" /></div>;

    return (
        <div>
            <div className="sp-toolbar">
                <h3 className="sp-toolbar-title">Tax Rates</h3>
                <button onClick={() => { setForm({ name: '', rate: 0, type: 'percentage', is_default: false, applies_to: 'all' }); setEditingId(null); setShowForm(true); }} className="btn btn-primary btn-sm"><Plus size={16} /> Add Tax</button>
            </div>
            <div className="sp-list">
                {taxes.map(t => (
                    <div key={t.id} className="sp-card sp-list-item">
                    <div>
                        <strong>{t.name}</strong> — <span className="sp-emphasis">{t.rate}%</span>
                        {t.is_default && <span className="sp-badge sp-badge--success">Default</span>}
                        {!t.is_active && <span className="sp-badge sp-badge--danger">Inactive</span>}
                        <div className="sp-list-meta">Applies to: {t.applies_to}</div>
                    </div>
                    <div className="sp-actions">
                        <button onClick={() => handleEdit(t)} className="btn btn-ghost btn-sm"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(t.id)} className="btn btn-ghost btn-sm sp-btn-danger"><Trash2 size={14} /></button>
                    </div>
                </div>
                ))}
            </div>
            {showForm && (
                <div className="sp-card">
                    <h4 className="sp-subtitle">{editingId ? 'Edit' : 'Add'} Tax Rate</h4>
                    <div className="sp-grid sp-grid--3">
                        <div className="sp-field"><label className="sp-label">Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="sp-input" placeholder="e.g. GST 18%" /></div>
                        <div className="sp-field"><label className="sp-label">Rate (%)</label><input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: Number(e.target.value) }))} className="sp-input" /></div>
                        <div className="sp-field"><label className="sp-label">Applies To</label>
                            <select value={form.applies_to} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value }))} className="sp-input">
                                <option value="all">All</option><option value="product">Products</option><option value="service">Services</option>
                            </select>
                        </div>
                    </div>
                    <label className="sp-switch">
                        <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} /> Set as Default
                    </label>
                    <div className="sp-actions sp-actions--end">
                        <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">Cancel</button>
                        <button onClick={handleSave} className="btn btn-primary btn-sm">Save</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Payment Mode Settings (Feature 8) ────────────────────────
function PaymentModeSettings() {
    const [modes, setModes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', is_default: false, sort_order: 0 });
    const [editingId, setEditingId] = useState(null);

    const fetch = useCallback(async () => {
        try { const { data } = await api.get('/payment-modes'); setModes(data); } catch (err) { void err; }
        setLoading(false);
    }, []);
    useEffect(() => {
        const t = setTimeout(() => { void fetch(); }, 0);
        return () => clearTimeout(t);
    }, [fetch]);

    const handleSave = async () => {
        if (!form.name) return toast.error('Name is required');
        try {
            if (editingId) { await api.put(`/payment-modes/${editingId}`, form); }
            else { await api.post('/payment-modes', form); }
            toast.success('Saved'); setShowForm(false); setEditingId(null);
            setForm({ name: '', description: '', is_default: false, sort_order: 0 }); fetch();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const handleEdit = (m) => { setForm(m); setEditingId(m.id); setShowForm(true); };
    const handleDelete = async (id) => {
        if (!confirm('Delete this payment mode?')) return;
        try { await api.delete(`/payment-modes/${id}`); toast.success('Deleted'); fetch(); } catch { toast.error('Failed'); }
    };

    const toggleActive = async (m) => {
        try {
            await api.put(`/payment-modes/${m.id}`, { ...m, is_active: !m.is_active });
            toast.success(`${m.name} ${m.is_active ? 'disabled' : 'enabled'}`); fetch();
        } catch { toast.error('Failed'); }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin" /></div>;

    return (
        <div>
            <div className="sp-toolbar">
                <h3 className="sp-toolbar-title">Payment Modes</h3>
                <button onClick={() => { setForm({ name: '', description: '', is_default: false, sort_order: 0 }); setEditingId(null); setShowForm(true); }} className="btn btn-primary btn-sm"><Plus size={16} /> Add Mode</button>
            </div>
            <div className="sp-list">
                {modes.map(m => (
                    <div key={m.id} className={`sp-card sp-list-item ${m.is_active ? '' : 'sp-list-item--muted'}`}>
                    <div>
                        <strong>{m.name}</strong>
                        {m.is_default && <span className="sp-badge sp-badge--success">Default</span>}
                        {m.description && <div className="sp-list-meta">{m.description}</div>}
                    </div>
                    <div className="sp-actions">
                        <button onClick={() => toggleActive(m)} className={`btn btn-ghost btn-sm ${m.is_active ? 'sp-toggle-btn--on' : 'sp-toggle-btn--off'}`} title={m.is_active ? 'Disable' : 'Enable'}>
                            {m.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                        <button onClick={() => handleEdit(m)} className="btn btn-ghost btn-sm"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(m.id)} className="btn btn-ghost btn-sm sp-btn-danger"><Trash2 size={14} /></button>
                    </div>
                </div>
                ))}
            </div>
            {showForm && (
                <div className="sp-card">
                    <h4 className="sp-subtitle">{editingId ? 'Edit' : 'Add'} Payment Mode</h4>
                    <div className="sp-grid sp-grid--3">
                        <div className="sp-field"><label className="sp-label">Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="sp-input" /></div>
                        <div className="sp-field"><label className="sp-label">Description</label><input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="sp-input" /></div>
                        <div className="sp-field"><label className="sp-label">Sort Order</label><input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="sp-input" /></div>
                    </div>
                    <label className="sp-switch">
                        <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} /> Set as Default
                    </label>
                    <div className="sp-actions sp-actions--end">
                        <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">Cancel</button>
                        <button onClick={handleSave} className="btn btn-primary btn-sm">Save</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Language Settings (Feature 10) ───────────────────────────
function LanguageSettings() {
    const [locale, setLocale] = useState(localStorage.getItem('sarga_locale') || 'en');
    const [overrides, setOverrides] = useState({});
    const [loading, setLoading] = useState(false);

    const defaultLabels = {
        dashboard: 'Dashboard', customers: 'Customers', billing: 'Billing', inventory: 'Inventory',
        quotes: 'Quotes & Estimates', invoices: 'Invoices', payments: 'Payments', settings: 'Settings',
        staff: 'Staff Management', reports: 'Reports', expenses: 'Expense Manager', save: 'Save',
        cancel: 'Cancel', delete: 'Delete', edit: 'Edit', create: 'Create', search: 'Search',
        total: 'Total', subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax', amount: 'Amount',
        date: 'Date', status: 'Status', name: 'Name', email: 'Email', phone: 'Phone',
        address: 'Address', notes: 'Notes', description: 'Description'
    };

    useEffect(() => {
        let mounted = true;
        const t = setTimeout(() => {
            if (mounted) setLoading(true);
            api.get(`/i18n/${locale}`)
                .then(r => { if (mounted) setOverrides(r.data); })
                .catch(() => {})
                .finally(() => { if (mounted) setLoading(false); });
        }, 0);
        return () => {
            mounted = false;
            clearTimeout(t);
        };
    }, [locale]);

    const handleSave = async () => {
        try {
            await api.put(`/i18n/${locale}`, overrides);
            localStorage.setItem('sarga_locale', locale);
            toast.success('Language settings saved');
        } catch { toast.error('Failed to save'); }
    };

    return (
        <div>
            <div className="sp-card">
                <h3 className="sp-card-title">Language & Localization</h3>
                <div className="sp-field">
                    <label className="sp-label">Interface Language</label>
                    <select value={locale} onChange={e => setLocale(e.target.value)} className="sp-input sp-inline-lang">
                        <option value="en">English</option>
                        <option value="hi">Hindi (हिन्दी)</option>
                        <option value="kn">Kannada (ಕನ್ನಡ)</option>
                        <option value="ta">Tamil (தமிழ்)</option>
                        <option value="te">Telugu (తెలుగు)</option>
                        <option value="mr">Marathi (मराठी)</option>
                    </select>
                </div>

                <h4 className="sp-subtitle">Customize Labels</h4>
                <p className="sp-note">Override default labels for the selected language. Leave blank to use the default.</p>
                {loading ? <Loader2 size={20} className="animate-spin" /> : (
                    <div className="sp-grid sp-grid--2">
                        {Object.entries(defaultLabels).map(([key, def]) => (
                            <div key={key} className="sp-field">
                                <label className="sp-label-muted">{key} <span style={{ opacity: 0.5 }}>({def})</span></label>
                                <input value={overrides[key] || ''} placeholder={def}
                                    onChange={e => setOverrides(o => ({ ...o, [key]: e.target.value }))} className="sp-input" />
                            </div>
                        ))}
                    </div>
                )}
                <div className="sp-actions sp-actions--end">
                    <button onClick={handleSave} className="btn btn-primary btn-sm"><Save size={16} /> Save Language Settings</button>
                </div>
            </div>
        </div>
    );
}
