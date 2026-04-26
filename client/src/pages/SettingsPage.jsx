import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Settings as SettingsIcon, DollarSign, CreditCard, Building2, Globe, Plus, Edit2, Trash2, Save, X, Loader2, ToggleLeft, ToggleRight, Sparkles, Layout, UserSquare, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import './SettingsPage.css';

const tabs = [
    { key: 'general', label: 'General', icon: Building2, desc: 'Company profile and branding' },
    { key: 'taxation', label: 'Taxation', icon: DollarSign, desc: 'GST and tax rate configurations' },
    { key: 'payments', label: 'Payments', icon: CreditCard, desc: 'Manage payment modes and bank info' },
    { key: 'localization', label: 'Localization', icon: Globe, desc: 'Language and regional settings' },
    { key: 'appearance', label: 'Appearance', icon: Sparkles, desc: 'Theme and interface options' },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general');

    return (
        <div className="sp-container">
            <div className="sp-sidebar">
                <div className="sp-sidebar-header">
                    <div className="sp-icon-box">
                        <SettingsIcon size={20} />
                    </div>
                    <div>
                        <h2 className="sp-title">Settings</h2>
                        <p className="sp-subtitle-muted">Manage your software preferences</p>
                    </div>
                </div>
                <div className="sp-nav">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            className={`sp-nav-item ${activeTab === t.key ? 'sp-nav-item--active' : ''}`}
                            onClick={() => setActiveTab(t.key)}
                        >
                            <div className="sp-nav-icon">
                                <t.icon size={18} />
                            </div>
                            <div className="sp-nav-content">
                                <span className="sp-nav-label">{t.label}</span>
                                <span className="sp-nav-desc">{t.desc}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <main className="sp-content">
                <div className="sp-content-inner">
                    <Suspense fallback={<div className="sp-spinner-wrap"><Loader2 size={32} className="animate-spin text-accent" /></div>}>
                        {activeTab === 'general' && <CompanySettings />}
                        {activeTab === 'taxation' && <TaxSettings />}
                        {activeTab === 'payments' && <PaymentModeSettings />}
                        {activeTab === 'localization' && <LanguageSettings />}
                        {activeTab === 'appearance' && <AppearanceSettings />}
                    </Suspense>
                </div>
            </main>
        </div>
    );
}

function AppearanceSettings() {
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    
    const toggleTheme = (t) => {
        setTheme(t);
        localStorage.setItem('theme', t);
        document.documentElement.setAttribute('data-theme', t);
        toast.success(`Theme switched to ${t}`);
    };

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Sparkles size={20} className="text-accent" />
                <h3 className="sp-card-title">Interface Appearance</h3>
            </div>
            <p className="sp-note">Customize how Sarga looks on your device.</p>
            
            <div className="sp-theme-grid">
                <div 
                    className={`sp-theme-card ${theme === 'dark' ? 'sp-theme-card--active' : ''}`}
                    onClick={() => toggleTheme('dark')}
                >
                    <div className="sp-theme-preview sp-theme-preview--dark">
                        <div className="sp-theme-mock-sidebar" />
                        <div className="sp-theme-mock-content" />
                    </div>
                    <div className="sp-theme-label">
                        <span className="font-bold">Dark Mode</span>
                        <div className="sp-dot" style={{ background: '#22c55e' }} />
                    </div>
                </div>
                
                <div 
                    className={`sp-theme-card ${theme === 'light' ? 'sp-theme-card--active' : ''}`}
                    onClick={() => toggleTheme('light')}
                >
                    <div className="sp-theme-preview sp-theme-preview--light">
                        <div className="sp-theme-mock-sidebar" />
                        <div className="sp-theme-mock-content" />
                    </div>
                    <div className="sp-theme-label">
                        <span className="font-bold">Light Mode</span>
                        <div className="sp-dot" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function CompanySettings() {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get('/company-settings').then(r => { setSettings(r.data); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try { 
            await api.put('/company-settings', settings); 
            window.dispatchEvent(new CustomEvent('companySettingsUpdated'));
            toast.success('Settings saved and applied'); 
        }
        catch { toast.error('Failed to save'); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin" /></div>;

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Building2 size={20} className="text-accent" />
                <h3 className="sp-card-title">Company Profile</h3>
            </div>
            
            <div className="sp-grid sp-grid--2">
                <div className="sp-field sp-field--full">
                    <label className="sp-label">Company Name</label>
                    <input
                        value={settings.company_name || ''}
                        onChange={e => setSettings(s => ({ ...s, company_name: e.target.value }))}
                        className="sp-input"
                        placeholder="e.g. Sarga Enterprise"
                    />
                </div>
                
                <div className="sp-field sp-field--full">
                    <label className="sp-label">Address</label>
                    <textarea
                        value={settings.company_address || ''}
                        onChange={e => setSettings(s => ({ ...s, company_address: e.target.value }))}
                        rows={3}
                        className="sp-input sp-textarea"
                        placeholder="Full business address"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">Phone</label>
                    <input
                        value={settings.company_phone || ''}
                        onChange={e => setSettings(s => ({ ...s, company_phone: e.target.value }))}
                        className="sp-input"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">Email</label>
                    <input
                        value={settings.company_email || ''}
                        onChange={e => setSettings(s => ({ ...s, company_email: e.target.value }))}
                        className="sp-input"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">GST Number</label>
                    <input
                        value={settings.company_gst || ''}
                        onChange={e => setSettings(s => ({ ...s, company_gst: e.target.value }))}
                        className="sp-input"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">Default Currency</label>
                    <input
                        value={settings.default_currency || 'INR'}
                        onChange={e => setSettings(s => ({ ...s, default_currency: e.target.value }))}
                        className="sp-input"
                    />
                </div>
            </div>

            <div className="sp-section-header" style={{ marginTop: 32 }}>
                <Layout size={20} className="text-accent" />
                <h3 className="sp-card-title">Invoice & Branding</h3>
            </div>

            <div className="sp-grid sp-grid--2">
                <div className="sp-field">
                    <label className="sp-label">Invoice Prefix</label>
                    <input
                        value={settings.invoice_prefix || ''}
                        onChange={e => setSettings(s => ({ ...s, invoice_prefix: e.target.value }))}
                        className="sp-input"
                        placeholder="e.g. INV-"
                    />
                </div>
                
                <div className="sp-field">
                    <label className="sp-label">Logo URL</label>
                    <input
                        value={settings.company_logo_url || ''}
                        onChange={e => setSettings(s => ({ ...s, company_logo_url: e.target.value }))}
                        className="sp-input"
                        placeholder="https://..."
                    />
                </div>

                <div className="sp-field sp-field--full">
                    <label className="sp-label">Invoice Footer Text</label>
                    <input
                        value={settings.invoice_footer_text || ''}
                        onChange={e => setSettings(s => ({ ...s, invoice_footer_text: e.target.value }))}
                        className="sp-input"
                    />
                </div>

                <div className="sp-field sp-field--full">
                    <label className="sp-label">Terms & Conditions</label>
                    <textarea
                        value={settings.invoice_terms || ''}
                        onChange={e => setSettings(s => ({ ...s, invoice_terms: e.target.value }))}
                        rows={4}
                        className="sp-input sp-textarea"
                    />
                </div>
            </div>

            <div className="sp-actions sp-actions--end">
                <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                    Save Company Profile
                </button>
            </div>
        </div>
    );
}

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
        fetch();
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
        // Optimistic UI Update
        setTaxes(prev => prev.filter(t => t.id !== id));
        try {
            await api.delete(`/tax-settings/${id}`);
            toast.success('Deleted');
            fetch();
        } catch {
            toast.error('Failed');
            fetch();
        }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin" /></div>;

    return (
        <div>
            <div className="sp-toolbar">
                <div className="sp-section-header">
                    <DollarSign size={20} className="text-accent" />
                    <h3 className="sp-toolbar-title">GST & Tax Rates</h3>
                </div>
                {!showForm && <button onClick={() => { setForm({ name: '', rate: 0, type: 'percentage', is_default: false, applies_to: 'all' }); setEditingId(null); setShowForm(true); }} className="btn btn-primary btn-sm"><Plus size={16} /> Add New Tax</button>}
            </div>

            {showForm && (
                <div className="sp-card" style={{ border: '1px solid var(--accent)', background: 'var(--accent-light, rgba(99, 102, 241, 0.05))' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h4 style={{ margin: 0, fontWeight: 700 }}>{editingId ? 'Modify' : 'New'} Tax Configuration</h4>
                        <button onClick={() => setShowForm(false)} className="icon-button"><X size={18} /></button>
                    </div>
                    <div className="sp-grid sp-grid--3">
                        <div className="sp-field"><label className="sp-label">Tax Label *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="sp-input" placeholder="e.g. GST 18%" /></div>
                        <div className="sp-field"><label className="sp-label">Percentage Rate (%)</label><input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: Number(e.target.value) }))} className="sp-input" /></div>
                        <div className="sp-field"><label className="sp-label">Application Scope</label>
                            <select value={form.applies_to} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value }))} className="sp-input">
                                <option value="all">Everything</option><option value="product">Products Only</option><option value="service">Services Only</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label className="sp-switch">
                            <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} /> 
                            <span>Primary / Default Tax</span>
                        </label>
                        <div className="sp-actions">
                            <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">Discard</button>
                            <button onClick={handleSave} className="btn btn-primary btn-sm">Commit Changes</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="sp-list">
                {taxes.map(t => (
                    <div key={t.id} className="sp-card sp-list-item" style={{ marginBottom: 12 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <strong style={{ fontSize: 16 }}>{t.name}</strong>
                                {t.is_default && <span className="sp-badge sp-badge--success" style={{ margin: 0 }}>DEFAULT</span>}
                                {!t.is_active && <span className="sp-badge sp-badge--danger" style={{ margin: 0 }}>DISABLED</span>}
                            </div>
                            <div className="sp-emphasis" style={{ color: 'var(--accent)', marginTop: 4 }}>{t.rate}% <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>applicable to {t.applies_to}</span></div>
                        </div>
                        <div className="sp-actions">
                            <button onClick={() => handleEdit(t)} className="btn btn-ghost btn-sm" title="Edit"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(t.id)} className="btn btn-ghost btn-sm sp-btn-danger" title="Delete"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

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
        fetch();
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
        // Optimistic UI Update
        setModes(prev => prev.filter(m => m.id !== id));
        try {
            await api.delete(`/payment-modes/${id}`);
            toast.success('Deleted');
            fetch();
        } catch {
            toast.error('Failed');
            fetch();
        }
    };

    const toggleActive = async (m) => {
        // Optimistic UI Update
        setModes(prev => prev.map(mode => mode.id === m.id ? { ...mode, is_active: !mode.is_active } : mode));
        try {
            await api.put(`/payment-modes/${m.id}`, { ...m, is_active: !m.is_active });
            toast.success(`${m.name} ${m.is_active ? 'disabled' : 'enabled'}`);
            fetch();
        } catch {
            toast.error('Failed');
            fetch();
        }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin" /></div>;

    return (
        <div>
            <div className="sp-toolbar">
                <div className="sp-section-header">
                    <CreditCard size={20} className="text-accent" />
                    <h3 className="sp-toolbar-title">Accepted Payment Modes</h3>
                </div>
                {!showForm && <button onClick={() => { setForm({ name: '', description: '', is_default: false, sort_order: 0 }); setEditingId(null); setShowForm(true); }} className="btn btn-primary btn-sm"><Plus size={16} /> Add Mode</button>}
            </div>

            {showForm && (
                <div className="sp-card" style={{ border: '1px solid var(--accent)', background: 'var(--accent-light, rgba(99, 102, 241, 0.05))' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h4 style={{ margin: 0, fontWeight: 700 }}>{editingId ? 'Edit' : 'New'} Payment Option</h4>
                        <button onClick={() => setShowForm(false)} className="icon-button"><X size={18} /></button>
                    </div>
                    <div className="sp-grid sp-grid--3">
                        <div className="sp-field"><label className="sp-label">Display Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="sp-input" placeholder="Cash, GPay, etc." /></div>
                        <div className="sp-field"><label className="sp-label">Description</label><input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="sp-input" /></div>
                        <div className="sp-field"><label className="sp-label">Order in List</label><input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="sp-input" /></div>
                    </div>
                    <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label className="sp-switch">
                            <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} /> 
                            <span>Default selection on billing</span>
                        </label>
                        <div className="sp-actions">
                            <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">Cancel</button>
                            <button onClick={handleSave} className="btn btn-primary btn-sm">Save Mode</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="sp-list">
                {modes.map(m => (
                    <div key={m.id} className={`sp-card sp-list-item ${m.is_active ? '' : 'sp-list-item--muted'}`} style={{ marginBottom: 12 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <strong style={{ fontSize: 16 }}>{m.name}</strong>
                                {m.is_default && <span className="sp-badge sp-badge--success" style={{ margin: 0 }}>DEFAULT</span>}
                                {!m.is_active && <span className="sp-badge sp-badge--danger" style={{ margin: 0 }}>INACTIVE</span>}
                            </div>
                            {m.description && <div className="sp-list-meta" style={{ marginTop: 4 }}>{m.description}</div>}
                        </div>
                        <div className="sp-actions">
                            <button onClick={() => toggleActive(m)} className={`btn btn-ghost btn-sm ${m.is_active ? 'sp-toggle-btn--on' : 'sp-toggle-btn--off'}`} title={m.is_active ? 'Deactivate' : 'Activate'}>
                                {m.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                            </button>
                            <button onClick={() => handleEdit(m)} className="btn btn-ghost btn-sm" title="Edit"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(m.id)} className="btn btn-ghost btn-sm sp-btn-danger" title="Delete"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LanguageSettings() {
    const [locale, setLocale] = useState(localStorage.getItem('sarga_locale') || 'en');
    const [overrides, setOverrides] = useState({});
    const [loading, setLoading] = useState(false);

    const defaultLabels = {
        summary: 'Summary', front_office: 'Front Office', dashboard: 'Dashboard', customers: 'Customers', 
        billing: 'Billing', orders: 'Orders', jobs_orders: 'Jobs & Orders', customer_payments: 'Customer Payments',
        inventory: 'Inventory', stock_verification: 'Stock Verification', stock_planning: 'Stock Planning',
        product_library: 'Product Library', plate_management: 'Plate Management', machine_management: 'Machine Management',
        paper_layout: 'Paper Layout', production_tracker: 'Production Tracker', staff: 'Staff', 
        staff_management: 'Staff Management', branches: 'Branches', requests: 'Requests',
        coupons: 'Coupons', cctv_attendance: 'CCTV Attendance', cctv_management: 'CCTV Management',
        schedules_time: 'Schedules & Time', expense_manager: 'Expense Manager', payment_verification: 'Payment Verification',
        accounts_gst: 'Accounts & GST', daily_report: 'Daily Report', internal_transactions: 'Internal Transactions',
        stock_transfer: 'Stock Transfer', internal_billing: 'Internal Billing', design_check: 'Design Check',
        paper_management: 'Paper Management',
        assigned_jobs: 'Assigned Jobs', quotes_estimates: 'Quotes & Estimates', recurring_invoices: 'Recurring Invoices',
        settings: 'Settings', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit'
    };

    useEffect(() => {
        setLoading(true);
        api.get(`/i18n/${locale}`)
            .then(r => { setOverrides(r.data); })
            .catch(() => {})
            .finally(() => { setLoading(false); });
    }, [locale]);

    const handleSave = async () => {
        try {
            await api.put(`/i18n/${locale}`, overrides);
            localStorage.setItem('sarga_locale', locale);
            window.dispatchEvent(new CustomEvent('companySettingsUpdated'));
            toast.success('Language settings saved and applied');
        } catch { toast.error('Failed to save'); }
    };

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Globe size={20} className="text-accent" />
                <h3 className="sp-card-title">Localization & Language</h3>
            </div>
            
            <div className="sp-field" style={{ maxWidth: 400, marginBottom: 32 }}>
                <label className="sp-label">System Interface Language</label>
                <select value={locale} onChange={e => setLocale(e.target.value)} className="sp-input">
                    <option value="en">English (Global)</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                    <option value="kn">Kannada (ಕನ್ನಡ)</option>
                    <option value="ta">Tamil (தமிழ்)</option>
                    <option value="te">Telugu (తెలుగు)</option>
                    <option value="mr">Marathi (ಮರಾಠಿ)</option>
                </select>
                <p className="sp-note" style={{ marginTop: 8, marginBottom: 0 }}>This changes the main sidebar and menu labels.</p>
            </div>

            <div className="sp-section-header">
                <Edit2 size={18} className="text-accent" />
                <h4 style={{ margin: 0, fontWeight: 700 }}>Customize Interface Labels</h4>
            </div>
            <p className="sp-note">Override specific words or phrases for the {locale.toUpperCase()} locale.</p>
            
            {loading ? (
                <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin" /></div>
            ) : (
                <div className="sp-grid sp-grid--2">
                    {Object.entries(defaultLabels).map(([key, def]) => (
                        <div key={key} className="sp-field">
                            <label className="sp-label" style={{ fontSize: 11, opacity: 0.7 }}>{key.toUpperCase()}</label>
                            <input 
                                value={overrides[key] || ''} 
                                placeholder={def}
                                onChange={e => setOverrides(o => ({ ...o, [key]: e.target.value }))} 
                                className="sp-input" 
                            />
                        </div>
                    ))}
                </div>
            )}
            
            <div className="sp-actions sp-actions--end">
                <button onClick={handleSave} className="btn btn-primary btn-sm">
                    <Save size={16} /> Update Language Overrides
                </button>
            </div>
        </div>
    );
}
