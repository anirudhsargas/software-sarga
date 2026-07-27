import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, Suspense } from 'react';
import { 
    Settings as SettingsIcon, DollarSign, CreditCard, Building2, Globe, Plus, Edit2, Trash2, Save, X, 
    Loader2, ToggleLeft, ToggleRight, Sparkles, Layout, ShieldCheck, CheckCircle, Receipt, Package, 
    Search, Download, Upload, RefreshCw, Volume2, QrCode, Printer, Database, ArrowRight, AlertTriangle 
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useTheme } from '../theme/ThemeProvider';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../components/ui/PageContainer';
import './SettingsPage.css';

const tabs = [
    { key: 'general', label: 'General & Branding', icon: Building2, desc: 'Company details, logo & contacts' },
    { key: 'invoicing', label: 'Invoicing & Receipts', icon: Receipt, desc: 'Receipt sizes, print & QR options' },
    { key: 'inventory', label: 'Inventory & AI', icon: Package, desc: 'Images, AI matching & stock defaults' },
    { key: 'taxation', label: 'Taxation & GST', icon: DollarSign, desc: 'GST rates & default tax scope' },
    { key: 'payments', label: 'Payment Modes', icon: CreditCard, desc: 'UPI, Cash, Card & default modes' },
    { key: 'localization', label: 'Localization', icon: Globe, desc: 'Languages & custom UI labels' },
    { key: 'appearance', label: 'Appearance & Audio', icon: Sparkles, desc: 'Themes, sounds & feedback' },
    { key: 'backup', label: 'Cloud Sync & Backup', icon: Database, desc: 'Google Sheets sync & health' },
    { key: 'security', label: 'Security & System', icon: ShieldCheck, desc: 'PIN rules, timeouts & staff' },
];

export default function SettingsPage() {
    useSEO('Settings & System Configuration');
    const [activeTab, setActiveTab] = useState('general');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredTabs = tabs.filter(t => 
        t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.key.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Export System Settings as JSON
    const handleExportSettings = async () => {
        try {
            const { data } = await api.get('/company-settings');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sarga_settings_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Settings exported successfully');
        } catch {
            toast.error('Failed to export settings');
        }
    };

    // Import System Settings from JSON
    const handleImportSettings = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const parsed = JSON.parse(evt.target.result);
                await api.put('/company-settings', parsed);
                window.dispatchEvent(new CustomEvent('companySettingsUpdated'));
                toast.success('Settings imported and applied successfully');
            } catch {
                toast.error('Invalid settings file or import failure');
            }
        };
        reader.readAsText(file);
    };

    return (
        <PageContainer>
            <div className="sp-container">
                <div className="sp-sidebar">
                    <div className="sp-sidebar-header">
                        <div className="sp-icon-box">
                            <SettingsIcon size={22} />
                        </div>
                        <div>
                            <h2 className="sp-title">Settings Hub</h2>
                            <p className="sp-subtitle-muted">System Preferences</p>
                        </div>
                    </div>

                    <div className="sp-sidebar-tools">
                        <div className="sp-search-wrap">
                            <Search size={14} className="text-muted" />
                            <input 
                                type="text" 
                                className="sp-search-input" 
                                placeholder="Search settings..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && <X size={14} className="cursor-pointer" onClick={() => setSearchQuery('')} />}
                        </div>
                        <div className="sp-tools-bar">
                            <button className="sp-tool-btn" onClick={handleExportSettings} title="Backup settings to file">
                                <Download size={12} /> Backup
                            </button>
                            <label className="sp-tool-btn" style={{ margin: 0, cursor: 'pointer' }} title="Restore settings from file">
                                <Upload size={12} /> Restore
                                <input type="file" accept=".json" onChange={handleImportSettings} style={{ display: 'none' }} />
                            </label>
                        </div>
                    </div>

                    <div className="sp-nav">
                        {filteredTabs.length === 0 ? (
                            <div className="text-xs text-muted p-3 text-center">No matching settings tab found</div>
                        ) : (
                            filteredTabs.map(t => (
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
                            ))
                        )}
                    </div>
                </div>

                <main className="sp-content">
                    <div className="sp-content-inner">
                        <Suspense fallback={<div className="sp-spinner-wrap"><Loader2 size={32} className="animate-spin text-accent" /></div>}>
                            {activeTab === 'general' && <CompanySettings />}
                            {activeTab === 'invoicing' && <ReceiptSettings />}
                            {activeTab === 'inventory' && <InventorySettingsSection />}
                            {activeTab === 'taxation' && <TaxSettings />}
                            {activeTab === 'payments' && <PaymentModeSettings />}
                            {activeTab === 'localization' && <LanguageSettings />}
                            {activeTab === 'appearance' && <AppearanceAudioSettings />}
                            {activeTab === 'backup' && <BackupSettingsSection />}
                            {activeTab === 'security' && <SecuritySettingsSection />}
                        </Suspense>
                    </div>
                </main>
            </div>
        </PageContainer>
    );
}

// ──────────────────────────────────────────────────────────────
// TAB 1: Company General & Branding Settings
// ──────────────────────────────────────────────────────────────
function CompanySettings() {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.get('/company-settings').then(r => { setSettings(r.data); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try { 
            await api.put('/company-settings', settings); 
            window.dispatchEvent(new CustomEvent('companySettingsUpdated'));
            toast.success('Company profile updated successfully');
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
        catch { toast.error('Failed to save settings'); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>;

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Building2 size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Company Profile & Branding</h3>
                    <div className="sp-card-subtitle">Manage business details printed on bills, receipts, and quotes</div>
                </div>
            </div>
            
            <div className="sp-grid sp-grid--2">
                <div className="sp-field sp-field--full">
                    <label className="sp-label">Business / Company Name *</label>
                    <input
                        value={settings.company_name || ''}
                        onChange={e => setSettings(s => ({ ...s, company_name: e.target.value }))}
                        className="sp-input"
                        placeholder="e.g. Sarga Printing & Media Group"
                    />
                </div>
                
                <div className="sp-field sp-field--full">
                    <label className="sp-label">Official Address</label>
                    <textarea
                        value={settings.company_address || ''}
                        onChange={e => setSettings(s => ({ ...s, company_address: e.target.value }))}
                        rows={3}
                        className="sp-input sp-textarea"
                        placeholder="Full business address for invoice header"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">Phone / Mobile</label>
                    <input
                        value={settings.company_phone || ''}
                        onChange={e => setSettings(s => ({ ...s, company_phone: e.target.value }))}
                        className="sp-input"
                        placeholder="+91 9876543210"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">Support Email</label>
                    <input
                        value={settings.company_email || ''}
                        onChange={e => setSettings(s => ({ ...s, company_email: e.target.value }))}
                        className="sp-input"
                        placeholder="billing@sarga.com"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">GSTIN / Tax ID Number</label>
                    <input
                        value={settings.company_gst || ''}
                        onChange={e => setSettings(s => ({ ...s, company_gst: e.target.value }))}
                        className="sp-input"
                        placeholder="29AAAAA0000A1Z5"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">Default System Currency</label>
                    <input
                        value={settings.default_currency || 'INR'}
                        onChange={e => setSettings(s => ({ ...s, default_currency: e.target.value }))}
                        className="sp-input"
                        placeholder="INR / ₹"
                    />
                </div>
            </div>

            <div className="sp-section-header" style={{ marginTop: 32 }}>
                <Layout size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Invoice Customization & Header Notes</h3>
                    <div className="sp-card-subtitle">Prefixes, terms & logo links</div>
                </div>
            </div>

            <div className="sp-grid sp-grid--2">
                <div className="sp-field">
                    <label className="sp-label">Invoice Number Prefix</label>
                    <input
                        value={settings.invoice_prefix || 'INV-'}
                        onChange={e => setSettings(s => ({ ...s, invoice_prefix: e.target.value }))}
                        className="sp-input"
                        placeholder="e.g. INV-"
                    />
                </div>
                
                <div className="sp-field">
                    <label className="sp-label">Company Logo URL</label>
                    <input
                        value={settings.company_logo_url || ''}
                        onChange={e => setSettings(s => ({ ...s, company_logo_url: e.target.value }))}
                        className="sp-input"
                        placeholder="https://domain.com/logo.png"
                    />
                </div>

                <div className="sp-field sp-field--full">
                    <label className="sp-label">Invoice Footer Note</label>
                    <input
                        value={settings.invoice_footer_text || ''}
                        onChange={e => setSettings(s => ({ ...s, invoice_footer_text: e.target.value }))}
                        className="sp-input"
                        placeholder="Thank you for your business! Visit again."
                    />
                </div>

                <div className="sp-field sp-field--full">
                    <label className="sp-label">Terms & Conditions</label>
                    <textarea
                        value={settings.invoice_terms || ''}
                        onChange={e => setSettings(s => ({ ...s, invoice_terms: e.target.value }))}
                        rows={4}
                        className="sp-input sp-textarea"
                        placeholder="1. Goods once sold will not be taken back.&#10;2. Subject to local jurisdiction."
                    />
                </div>
            </div>

            <div className="sp-actions sp-actions--end">
                <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle size={16} /> : <Save size={16} />} 
                    {saved ? 'Changes Saved!' : 'Save Company Profile'}
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// TAB 2: Invoicing & Receipts Settings (with Live Interactive Preview)
// ──────────────────────────────────────────────────────────────
function ReceiptSettings() {
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
            toast.success('Invoicing & Receipt preferences saved');
        } catch {
            toast.error('Failed to save receipt settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>;

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Receipt size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Invoicing & Thermal Receipt Formatting</h3>
                    <div className="sp-card-subtitle">Configure paper sizes, thermal printer options & live invoice preview</div>
                </div>
            </div>

            <div className="sp-receipt-layout">
                <div className="sp-grid sp-grid--1">
                    <div className="sp-field">
                        <label className="sp-label">Default Receipt Paper Format</label>
                        <select 
                            value={settings.receipt_type || 'thermal_80mm'} 
                            onChange={e => setSettings(s => ({ ...s, receipt_type: e.target.value }))}
                            className="sp-input"
                        >
                            <option value="thermal_80mm">Thermal Printer 80mm (Standard POS)</option>
                            <option value="thermal_58mm">Thermal Printer 58mm (Compact Mobile POS)</option>
                            <option value="a4_standard">A4 Full Page Standard Invoice</option>
                            <option value="a5_landscape">A5 Half Page Invoice</option>
                        </select>
                    </div>

                    <div className="sp-field">
                        <label className="sp-label">Invoice Total Round-off Mode</label>
                        <select 
                            value={settings.invoice_round_off || 'nearest_1'} 
                            onChange={e => setSettings(s => ({ ...s, invoice_round_off: e.target.value }))}
                            className="sp-input"
                        >
                            <option value="none">No Rounding (Exact Decimals)</option>
                            <option value="nearest_1">Round to Nearest ₹1</option>
                            <option value="nearest_5">Round to Nearest ₹5</option>
                            <option value="floor">Always Round Down</option>
                        </select>
                    </div>

                    <div className="sp-field">
                        <label className="sp-label">Default Payment Due Days</label>
                        <input 
                            type="number" 
                            value={settings.invoice_default_due_days || 7} 
                            onChange={e => setSettings(s => ({ ...s, invoice_default_due_days: e.target.value }))}
                            className="sp-input"
                        />
                    </div>

                    <div className="sp-field">
                        <label className="sp-label">Thermal Header Note / Greeting</label>
                        <input 
                            value={settings.thermal_header_note || 'Welcome to Sarga Printing'} 
                            onChange={e => setSettings(s => ({ ...s, thermal_header_note: e.target.value }))}
                            className="sp-input"
                            placeholder="Header text printed on receipt"
                        />
                    </div>

                    <div className="sp-field">
                        <label className="sp-label">Thermal Footer Note</label>
                        <input 
                            value={settings.thermal_footer_note || 'Thank you! Visit again.'} 
                            onChange={e => setSettings(s => ({ ...s, thermal_footer_note: e.target.value }))}
                            className="sp-input"
                            placeholder="Footer text printed on receipt"
                        />
                    </div>

                    <label className="sp-switch-label">
                        <div className="sp-switch-text">
                            <span className="sp-switch-title">Auto-Print Receipt on Bill Save</span>
                            <span className="sp-switch-desc">Automatically trigger printer dialog right after creating invoice</span>
                        </div>
                        <input 
                            type="checkbox" 
                            className="sp-toggle"
                            checked={settings.auto_print_on_save === 'true' || settings.auto_print_on_save === true} 
                            onChange={e => setSettings(s => ({ ...s, auto_print_on_save: e.target.checked }))} 
                        />
                    </label>

                    <label className="sp-switch-label">
                        <div className="sp-switch-text">
                            <span className="sp-switch-title">Print UPI QR Code on Receipts</span>
                            <span className="sp-switch-desc">Include dynamic UPI QR code on receipt for instant customer payment</span>
                        </div>
                        <input 
                            type="checkbox" 
                            className="sp-toggle"
                            checked={settings.receipt_show_upi_qr !== 'false' && settings.receipt_show_upi_qr !== false} 
                            onChange={e => setSettings(s => ({ ...s, receipt_show_upi_qr: e.target.checked }))} 
                        />
                    </label>

                    <label className="sp-switch-label">
                        <div className="sp-switch-text">
                            <span className="sp-switch-title">Print Company Logo on Receipts</span>
                            <span className="sp-switch-desc">Include logo image header on compatible thermal receipt printers</span>
                        </div>
                        <input 
                            type="checkbox" 
                            className="sp-toggle"
                            checked={settings.receipt_show_logo === 'true' || settings.receipt_show_logo === true} 
                            onChange={e => setSettings(s => ({ ...s, receipt_show_logo: e.target.checked }))} 
                        />
                    </label>
                </div>

                {/* Live Receipt Mockup Preview */}
                <div>
                    <div className="sp-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Printer size={14} className="text-accent" /> Live Receipt Preview
                    </div>
                    <div className="sp-receipt-preview-box">
                        <div className="sp-receipt-preview-header">
                            {settings.receipt_show_logo && settings.company_logo_url && (
                                <img src={settings.company_logo_url} alt="Logo" className="sp-receipt-preview-logo" onError={(e) => e.target.style.display='none'} />
                            )}
                            <div className="sp-receipt-preview-title">{settings.company_name || 'SARGA ENTERPRISE'}</div>
                            <div style={{ fontSize: 10, color: '#666' }}>{settings.company_address || '123 Business Way'}</div>
                            {settings.company_gst && <div style={{ fontSize: 10 }}>GSTIN: {settings.company_gst}</div>}
                            <div style={{ marginTop: 4, fontWeight: 'bold' }}>{settings.thermal_header_note || 'RECEIPT'}</div>
                        </div>

                        <div className="sp-receipt-preview-row">
                            <span>INV-2026-0042</span>
                            <span>{new Date().toLocaleDateString()}</span>
                        </div>

                        <div className="sp-receipt-preview-divider" />

                        <div className="sp-receipt-preview-items">
                            <div className="sp-receipt-preview-row" style={{ fontWeight: 'bold' }}>
                                <span>ITEM</span>
                                <span>QTY x AMT</span>
                            </div>
                            <div className="sp-receipt-preview-row">
                                <span>A4 Flex Printing</span>
                                <span>2 x ₹150</span>
                            </div>
                            <div className="sp-receipt-preview-row">
                                <span>Card Lamination</span>
                                <span>100 x ₹2</span>
                            </div>
                        </div>

                        <div className="sp-receipt-preview-divider" />

                        <div className="sp-receipt-preview-row">
                            <span>Subtotal:</span>
                            <span>₹500.00</span>
                        </div>
                        <div className="sp-receipt-preview-row">
                            <span>GST (18%):</span>
                            <span>₹90.00</span>
                        </div>
                        <div className="sp-receipt-preview-row" style={{ fontWeight: 'bold', fontSize: 13 }}>
                            <span>TOTAL:</span>
                            <span>₹590.00</span>
                        </div>

                        {(settings.receipt_show_upi_qr !== 'false' && settings.receipt_show_upi_qr !== false) && (
                            <div className="sp-receipt-preview-qr">
                                <QrCode size={40} />
                                <span style={{ fontSize: 9 }}>Scan to pay via GPay/UPI</span>
                            </div>
                        )}

                        <div className="sp-receipt-preview-footer">
                            <div>{settings.thermal_footer_note || 'Thank you! Visit again.'}</div>
                            <div style={{ fontSize: 9, marginTop: 2 }}>{settings.invoice_footer_text}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="sp-actions sp-actions--end">
                <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Receipt Preferences
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// TAB 3: Inventory & AI Settings (Integrated)
// ──────────────────────────────────────────────────────────────
function InventorySettingsSection() {
    const [imgSettings, setImgSettings] = useState({
        auto_assign_images: 1,
        cache_images: 1,
        generate_missing: 1,
        category_placeholders: 1,
        ask_before_saving: 1,
        image_quality: 'Medium'
    });
    const [companySettings, setCompanySettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        Promise.all([
            api.get('/inventory/settings/image').catch(() => ({ data: {} })),
            api.get('/company-settings').catch(() => ({ data: {} }))
        ]).then(([resImg, resComp]) => {
            if (resImg.data) setImgSettings(s => ({ ...s, ...resImg.data }));
            if (resComp.data) setCompanySettings(resComp.data);
            setLoading(false);
        });
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await Promise.all([
                api.put('/inventory/settings/image', imgSettings),
                api.put('/company-settings', companySettings)
            ]);
            window.dispatchEvent(new CustomEvent('companySettingsUpdated'));
            toast.success('Inventory & AI settings updated');
        } catch {
            toast.error('Failed to save inventory settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>;

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Package size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Inventory & Product Image AI Settings</h3>
                    <div className="sp-card-subtitle">Manage automated stock deducts, image generation quality & threshold alerts</div>
                </div>
            </div>

            <div className="sp-grid sp-grid--2">
                <div className="sp-field">
                    <label className="sp-label">Default Low Stock Alert Threshold</label>
                    <input 
                        type="number" 
                        value={companySettings.low_stock_default_threshold || 10} 
                        onChange={e => setCompanySettings(s => ({ ...s, low_stock_default_threshold: e.target.value }))}
                        className="sp-input"
                        placeholder="e.g. 10 units"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">Product Image AI Quality</label>
                    <select 
                        value={imgSettings.image_quality || 'Medium'} 
                        onChange={e => setImgSettings(s => ({ ...s, image_quality: e.target.value }))}
                        className="sp-input"
                    >
                        <option value="Low">Low (Fast loading, web compressed)</option>
                        <option value="Medium">Medium (Balanced clarity)</option>
                        <option value="High">High (High resolution HD)</option>
                    </select>
                </div>
            </div>

            <div style={{ marginTop: 24 }} className="sp-grid sp-grid--1">
                <label className="sp-switch-label">
                    <div className="sp-switch-text">
                        <span className="sp-switch-title">Auto-Assign Item Images</span>
                        <span className="sp-switch-desc">Automatically fetch and assign product photos for new catalog entries</span>
                    </div>
                    <input 
                        type="checkbox" 
                        className="sp-toggle"
                        checked={!!imgSettings.auto_assign_images} 
                        onChange={e => setImgSettings(s => ({ ...s, auto_assign_images: e.target.checked ? 1 : 0 }))} 
                    />
                </label>

                <label className="sp-switch-label">
                    <div className="sp-switch-text">
                        <span className="sp-switch-title">Generate Missing Product Images with AI</span>
                        <span className="sp-switch-desc">Generate images for inventory items currently missing an icon</span>
                    </div>
                    <input 
                        type="checkbox" 
                        className="sp-toggle"
                        checked={!!imgSettings.generate_missing} 
                        onChange={e => setImgSettings(s => ({ ...s, generate_missing: e.target.checked ? 1 : 0 }))} 
                    />
                </label>

                <label className="sp-switch-label">
                    <div className="sp-switch-text">
                        <span className="sp-switch-title">Cache Product Images Locally</span>
                        <span className="sp-switch-desc">Store generated image URLs locally for offline usage & fast load</span>
                    </div>
                    <input 
                        type="checkbox" 
                        className="sp-toggle"
                        checked={!!imgSettings.cache_images} 
                        onChange={e => setImgSettings(s => ({ ...s, cache_images: e.target.checked ? 1 : 0 }))} 
                    />
                </label>

                <label className="sp-switch-label">
                    <div className="sp-switch-text">
                        <span className="sp-switch-title">Auto-Deduct Stock on Invoice Creation</span>
                        <span className="sp-switch-desc">Instantly deduct paper and inventory stock when billing a customer</span>
                    </div>
                    <input 
                        type="checkbox" 
                        className="sp-toggle"
                        checked={companySettings.auto_deduct_stock !== 'false' && companySettings.auto_deduct_stock !== false} 
                        onChange={e => setCompanySettings(s => ({ ...s, auto_deduct_stock: e.target.checked }))} 
                    />
                </label>
            </div>

            <div className="sp-actions sp-actions--end">
                <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Inventory Settings
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// TAB 4: Taxation Settings
// ──────────────────────────────────────────────────────────────
function TaxSettings() {
    const [taxes, setTaxes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', rate: 0, type: 'percentage', is_default: false, applies_to: 'all' });
    const [editingId, setEditingId] = useState(null);

    const fetchTaxes = async () => {
        try { const { data } = await api.get('/tax-settings'); setTaxes(data || []); } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { fetchTaxes(); }, []);

    const handleSave = async () => {
        if (!form.name) return toast.error('Tax name is required');
        try {
            if (editingId) { await api.put(`/tax-settings/${editingId}`, form); }
            else { await api.post('/tax-settings', form); }
            toast.success('Tax configuration saved'); 
            setShowForm(false); 
            setEditingId(null);
            setForm({ name: '', rate: 0, type: 'percentage', is_default: false, applies_to: 'all' }); 
            fetchTaxes();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to save tax rate'); }
    };

    const handleEdit = (t) => { setForm(t); setEditingId(t.id); setShowForm(true); };
    const handleDelete = async (id) => {
        if (!confirm('Delete this tax rate?')) return;
        setTaxes(prev => prev.filter(t => t.id !== id));
        try {
            await api.delete(`/tax-settings/${id}`);
            toast.success('Tax deleted');
            fetchTaxes();
        } catch { toast.error('Failed to delete'); fetchTaxes(); }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>;

    return (
        <div>
            <div className="sp-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div className="sp-section-header" style={{ marginBottom: 0 }}>
                    <DollarSign size={20} className="text-accent" />
                    <div>
                        <h3 className="sp-card-title">GST & Tax Rate Configurations</h3>
                        <div className="sp-card-subtitle">Manage tax brackets applied to items and billing</div>
                    </div>
                </div>
                {!showForm && (
                    <button onClick={() => { setForm({ name: '', rate: 0, type: 'percentage', is_default: false, applies_to: 'all' }); setEditingId(null); setShowForm(true); }} className="btn btn-primary btn-sm">
                        <Plus size={16} /> Add Tax Bracket
                    </button>
                )}
            </div>

            {showForm && (
                <div className="sp-card" style={{ border: '1px solid var(--accent)', background: 'var(--accent-light, rgba(79,70,229,0.05))' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h4 style={{ margin: 0, fontWeight: 700 }}>{editingId ? 'Modify' : 'New'} Tax Bracket</h4>
                        <button onClick={() => setShowForm(false)} className="icon-button"><X size={18} /></button>
                    </div>
                    <div className="sp-grid sp-grid--3">
                        <div className="sp-field">
                            <label className="sp-label">Tax Label *</label>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="sp-input" placeholder="e.g. GST 18%" />
                        </div>
                        <div className="sp-field">
                            <label className="sp-label">Rate (%)</label>
                            <input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: Number(e.target.value) }))} className="sp-input" />
                        </div>
                        <div className="sp-field">
                            <label className="sp-label">Application Scope</label>
                            <select value={form.applies_to} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value }))} className="sp-input">
                                <option value="all">Everything (Products & Services)</option>
                                <option value="product">Products Only</option>
                                <option value="service">Services Only</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label className="sp-switch-label" style={{ padding: '8px 12px' }}>
                            <span className="sp-switch-title">Default Tax on Billing</span>
                            <input type="checkbox" className="sp-toggle" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} /> 
                        </label>
                        <div className="sp-actions">
                            <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">Discard</button>
                            <button onClick={handleSave} className="btn btn-primary btn-sm">Save Tax Rate</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="sp-list">
                {taxes.map(t => (
                    <div key={t.id} className="sp-card sp-list-item">
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <strong style={{ fontSize: 15 }}>{t.name}</strong>
                                {t.is_default && <span className="sp-badge sp-badge--success">DEFAULT</span>}
                                {!t.is_active && <span className="sp-badge sp-badge--danger">DISABLED</span>}
                            </div>
                            <div className="sp-emphasis" style={{ color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
                                {t.rate}% <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>• applicable to {t.applies_to}</span>
                            </div>
                        </div>
                        <div className="sp-actions" style={{ margin: 0 }}>
                            <button onClick={() => handleEdit(t)} className="btn btn-ghost btn-sm" title="Edit"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(t.id)} className="btn btn-ghost btn-sm sp-btn-danger" title="Delete"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// TAB 5: Payment Modes Settings
// ──────────────────────────────────────────────────────────────
function PaymentModeSettings() {
    const [modes, setModes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', is_default: false, sort_order: 0 });
    const [editingId, setEditingId] = useState(null);

    const fetchModes = async () => {
        try { const { data } = await api.get('/payment-modes'); setModes(data || []); } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { fetchModes(); }, []);

    const handleSave = async () => {
        if (!form.name) return toast.error('Payment mode name is required');
        try {
            if (editingId) { await api.put(`/payment-modes/${editingId}`, form); }
            else { await api.post('/payment-modes', form); }
            toast.success('Payment mode saved'); 
            setShowForm(false); 
            setEditingId(null);
            setForm({ name: '', description: '', is_default: false, sort_order: 0 }); 
            fetchModes();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    };

    const handleEdit = (m) => { setForm(m); setEditingId(m.id); setShowForm(true); };
    const handleDelete = async (id) => {
        if (!confirm('Delete this payment mode?')) return;
        setModes(prev => prev.filter(m => m.id !== id));
        try {
            await api.delete(`/payment-modes/${id}`);
            toast.success('Payment mode deleted');
            fetchModes();
        } catch { toast.error('Failed to delete'); fetchModes(); }
    };

    const toggleActive = async (m) => {
        setModes(prev => prev.map(mode => mode.id === m.id ? { ...mode, is_active: !mode.is_active } : mode));
        try {
            await api.put(`/payment-modes/${m.id}`, { ...m, is_active: !m.is_active });
            toast.success(`${m.name} ${m.is_active ? 'disabled' : 'enabled'}`);
            fetchModes();
        } catch { toast.error('Failed'); fetchModes(); }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>;

    return (
        <div>
            <div className="sp-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div className="sp-section-header" style={{ marginBottom: 0 }}>
                    <CreditCard size={20} className="text-accent" />
                    <div>
                        <h3 className="sp-card-title">Accepted Payment Modes</h3>
                        <div className="sp-card-subtitle">Configure Cash, UPI, GPay, Bank Transfer, and Card options</div>
                    </div>
                </div>
                {!showForm && (
                    <button onClick={() => { setForm({ name: '', description: '', is_default: false, sort_order: 0 }); setEditingId(null); setShowForm(true); }} className="btn btn-primary btn-sm">
                        <Plus size={16} /> Add Payment Mode
                    </button>
                )}
            </div>

            {showForm && (
                <div className="sp-card" style={{ border: '1px solid var(--accent)', background: 'var(--accent-light, rgba(79,70,229,0.05))' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h4 style={{ margin: 0, fontWeight: 700 }}>{editingId ? 'Edit' : 'New'} Payment Mode</h4>
                        <button onClick={() => setShowForm(false)} className="icon-button"><X size={18} /></button>
                    </div>
                    <div className="sp-grid sp-grid--3">
                        <div className="sp-field">
                            <label className="sp-label">Display Name *</label>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="sp-input" placeholder="e.g. UPI / Google Pay" />
                        </div>
                        <div className="sp-field">
                            <label className="sp-label">Description / Instructions</label>
                            <input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="sp-input" placeholder="e.g. Scan QR on counter" />
                        </div>
                        <div className="sp-field">
                            <label className="sp-label">Sort Order</label>
                            <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="sp-input" />
                        </div>
                    </div>
                    <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label className="sp-switch-label" style={{ padding: '8px 12px' }}>
                            <span className="sp-switch-title">Default Selected Mode on Billing</span>
                            <input type="checkbox" className="sp-toggle" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} /> 
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
                    <div key={m.id} className={`sp-card sp-list-item ${m.is_active ? '' : 'sp-list-item--muted'}`}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <strong style={{ fontSize: 15 }}>{m.name}</strong>
                                {m.is_default && <span className="sp-badge sp-badge--success">DEFAULT</span>}
                                {!m.is_active && <span className="sp-badge sp-badge--danger">INACTIVE</span>}
                            </div>
                            {m.description && <div className="sp-list-meta" style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>{m.description}</div>}
                        </div>
                        <div className="sp-actions" style={{ margin: 0 }}>
                            <button onClick={() => toggleActive(m)} className="btn btn-ghost btn-sm" title={m.is_active ? 'Deactivate' : 'Activate'}>
                                {m.is_active ? <ToggleRight size={22} className="text-accent" /> : <ToggleLeft size={22} />}
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

// ──────────────────────────────────────────────────────────────
// TAB 6: Localization & Languages
// ──────────────────────────────────────────────────────────────
function LanguageSettings() {
    const [locale, setLocale] = useState(localStorage.getItem('sarga_locale') || 'en');
    const [overrides, setOverrides] = useState({});
    const [loading, setLoading] = useState(false);
    const [filterKey, setFilterKey] = useState('');

    const defaultLabels = {
        summary: 'Summary', front_office: 'Front Office', dashboard: 'Dashboard', customers: 'Customers', 
        billing: 'Billing', orders: 'Orders', jobs_orders: 'Jobs & Orders', customer_payments: 'Customer Payments',
        inventory: 'Inventory', stock_verification: 'Stock Verification', stock_planning: 'Stock Planning',
        product_library: 'Product Library', plate_management: 'Plate Management', machine_management: 'Machine Management',
        paper_layout: 'Paper Layout', production_tracker: 'Production Tracker', staff: 'Staff', 
        staff_management: 'Staff Management', branches: 'Branches', requests: 'Requests',
        coupons: 'Coupons', cctv_attendance: 'CCTV Attendance', cctv_management: 'CCTV Management',
        expense_manager: 'Expense Manager', accounts_gst: 'Accounts & GST', daily_report: 'Daily Report',
        settings: 'Settings', save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit'
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const r = await api.get(`/i18n/${locale}`);
                setOverrides(r.data || {});
            } catch { /* ignore */ }
            setLoading(false);
        })();
    }, [locale]);

    const handleSave = async () => {
        try {
            await api.put(`/i18n/${locale}`, overrides);
            localStorage.setItem('sarga_locale', locale);
            window.dispatchEvent(new CustomEvent('companySettingsUpdated'));
            toast.success(`Language settings updated for ${locale.toUpperCase()}`);
        } catch { toast.error('Failed to save language overrides'); }
    };

    const filteredKeys = Object.entries(defaultLabels).filter(([k, v]) => 
        k.toLowerCase().includes(filterKey.toLowerCase()) || 
        v.toLowerCase().includes(filterKey.toLowerCase())
    );

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Globe size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Localization & System Language</h3>
                    <div className="sp-card-subtitle">Choose interface language and customize navigation label translations</div>
                </div>
            </div>
            
            <div className="sp-field" style={{ maxWidth: 400, marginBottom: 28 }}>
                <label className="sp-label">Primary Interface Language</label>
                <select value={locale} onChange={e => setLocale(e.target.value)} className="sp-input">
                    <option value="en">English (Global Standard)</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                    <option value="kn">Kannada (ಕನ್ನಡ)</option>
                    <option value="ta">Tamil (தமிழ்)</option>
                    <option value="te">Telugu (తెలుగు)</option>
                    <option value="mr">Marathi (मराठी)</option>
                </select>
            </div>

            <div className="sp-section-header" style={{ marginBottom: 12 }}>
                <Edit2 size={18} className="text-accent" />
                <h4 style={{ margin: 0, fontWeight: 700 }}>Custom Menu & Sidebar Labels</h4>
            </div>
            
            <div className="sp-search-wrap" style={{ maxWidth: 360, marginBottom: 16 }}>
                <Search size={14} className="text-muted" />
                <input 
                    type="text" 
                    className="sp-search-input" 
                    placeholder="Filter labels..." 
                    value={filterKey}
                    onChange={e => setFilterKey(e.target.value)}
                />
            </div>
            
            {loading ? (
                <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>
            ) : (
                <div className="sp-grid sp-grid--2">
                    {filteredKeys.map(([key, def]) => (
                        <div key={key} className="sp-field">
                            <label className="sp-label" style={{ fontSize: 11, opacity: 0.8 }}>{key.toUpperCase()}</label>
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
                <button onClick={handleSave} className="btn btn-primary">
                    <Save size={16} /> Save Language Preferences
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// TAB 7: Appearance & Audio Preferences
// ──────────────────────────────────────────────────────────────
function AppearanceAudioSettings() {
    const { theme, setTheme } = useTheme();
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/company-settings').then(r => { setSettings(r.data); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const handleThemeChange = (t) => {
        setTheme(t);
        toast.success(`Theme switched to ${t === 'system' ? 'System default' : t === 'dark' ? 'Dark mode' : 'Light mode'}`);
    };

    const handleSaveAudio = async () => {
        try {
            await api.put('/company-settings', settings);
            window.dispatchEvent(new CustomEvent('companySettingsUpdated'));
            toast.success('Audio & notification settings saved');
        } catch {
            toast.error('Failed to save audio settings');
        }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>;

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Sparkles size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Interface Appearance & Theme</h3>
                    <div className="sp-card-subtitle">Choose color theme mode and dark/light visuals</div>
                </div>
            </div>
            
            <div className="sp-theme-grid" style={{ marginBottom: 32 }}>
                <div role="button" tabIndex={0} className={`sp-theme-card ${theme === 'system' ? 'sp-theme-card--active' : ''}`}
                    onClick={() => handleThemeChange('system')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleThemeChange('system'); }}
                >
                    <div className="sp-theme-preview sp-theme-preview--system">
                        <div className="sp-theme-mock-sidebar" />
                    </div>
                    <div className="sp-theme-label">
                        <span className="font-bold">System Default</span>
                        <div className="sp-dot sp-dot--accent" />
                    </div>
                </div>

                <div role="button" tabIndex={0} className={`sp-theme-card ${theme === 'light' ? 'sp-theme-card--active' : ''}`}
                    onClick={() => handleThemeChange('light')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleThemeChange('light'); }}
                >
                    <div className="sp-theme-preview sp-theme-preview--light">
                        <div className="sp-theme-mock-sidebar" />
                    </div>
                    <div className="sp-theme-label">
                        <span className="font-bold">Light Mode</span>
                        <div className="sp-dot" />
                    </div>
                </div>
                
                <div role="button" tabIndex={0} className={`sp-theme-card ${theme === 'dark' ? 'sp-theme-card--active' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleThemeChange('dark'); }}
                >
                    <div className="sp-theme-preview sp-theme-preview--dark">
                        <div className="sp-theme-mock-sidebar" />
                    </div>
                    <div className="sp-theme-label">
                        <span className="font-bold">Dark Mode</span>
                        <div className="sp-dot sp-dot--accent" />
                    </div>
                </div>
            </div>

            <div className="sp-section-header">
                <Volume2 size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Audio & Sound Feedback</h3>
                    <div className="sp-card-subtitle">Enable audio chimes on successful transactions</div>
                </div>
            </div>

            <div className="sp-grid sp-grid--1">
                <label className="sp-switch-label">
                    <div className="sp-switch-text">
                        <span className="sp-switch-title">Billing Success Audio Chime</span>
                        <span className="sp-switch-desc">Play a subtle audio confirmation tone upon completing a sale</span>
                    </div>
                    <input 
                        type="checkbox" 
                        className="sp-toggle"
                        checked={settings.sound_on_billing !== 'false' && settings.sound_on_billing !== false} 
                        onChange={e => setSettings(s => ({ ...s, sound_on_billing: e.target.checked }))} 
                    />
                </label>
            </div>

            <div className="sp-actions sp-actions--end">
                <button onClick={handleSaveAudio} className="btn btn-primary">
                    <Save size={16} /> Save Audio Preferences
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// TAB 8: Cloud Backup & Google Sheets Sync Status
// ──────────────────────────────────────────────────────────────
function BackupSettingsSection() {
    const [health, setHealth] = useState({ status: 'checking', latency: 0 });
    const [status, setStatus] = useState({ enabled: true, sheetId: '' });
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        Promise.all([
            api.get('/backup/health').catch(err => ({ data: { status: 'unhealthy', error: err.message } })),
            api.get('/backup/status').catch(() => ({ data: {} }))
        ]).then(([resHealth, resStatus]) => {
            setHealth(resHealth.data);
            setStatus(resStatus.data);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>;

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Database size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Google Sheets & Cloud Sync Backup</h3>
                    <div className="sp-card-subtitle">Real-time status of automatic Google Sheets sync and data integrity</div>
                </div>
            </div>

            <div className="sp-grid sp-grid--2" style={{ marginBottom: 24 }}>
                <div style={{ padding: 16, background: 'var(--bg-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div className="sp-label">SYNC STATUS</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <span className={`sp-badge ${health.status === 'healthy' || health.status === 'ok' ? 'sp-badge--success' : 'sp-badge--danger'}`}>
                            {health.status?.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{health.latency ? `${health.latency}ms latency` : ''}</span>
                    </div>
                </div>

                <div style={{ padding: 16, background: 'var(--bg-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div className="sp-label">TARGET SPREADSHEET</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: 'var(--text)', wordBreak: 'break-all' }}>
                        {status.sheetId || 'Connected to Google Workspace'}
                    </div>
                </div>
            </div>

            <p className="sp-note">
                Google Sheets synchronization continuously backs up your customer records, billing receipts, expenses, and inventory transactions directly into cloud spreadsheets.
            </p>

            <div className="sp-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => navigate('/dashboard/backup')} className="btn btn-primary">
                    Open Full Backup Manager & Restore Tool <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// TAB 9: Security & System Settings
// ──────────────────────────────────────────────────────────────
function SecuritySettingsSection() {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        api.get('/company-settings').then(r => { setSettings(r.data); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/company-settings', settings);
            window.dispatchEvent(new CustomEvent('companySettingsUpdated'));
            toast.success('Security preferences updated');
        } catch {
            toast.error('Failed to save security settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin text-accent" /></div>;

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <ShieldCheck size={20} className="text-accent" />
                <div>
                    <h3 className="sp-card-title">Security & Role Access Preferences</h3>
                    <div className="sp-card-subtitle">Configure discount approval thresholds, session timeouts, and staff access</div>
                </div>
            </div>

            <div className="sp-grid sp-grid--2">
                <div className="sp-field">
                    <label className="sp-label">Discount Threshold Requiring PIN Approval (%)</label>
                    <input 
                        type="number" 
                        value={settings.discount_pin_threshold || 15} 
                        onChange={e => setSettings(s => ({ ...s, discount_pin_threshold: e.target.value }))}
                        className="sp-input"
                        placeholder="e.g. 15%"
                    />
                </div>

                <div className="sp-field">
                    <label className="sp-label">Inactivity Session Timeout (Minutes)</label>
                    <select 
                        value={settings.session_timeout_mins || 30} 
                        onChange={e => setSettings(s => ({ ...s, session_timeout_mins: e.target.value }))}
                        className="sp-input"
                    >
                        <option value="15">15 Minutes</option>
                        <option value="30">30 Minutes</option>
                        <option value="60">60 Minutes (1 Hour)</option>
                        <option value="0">Never Timeout (Stay logged in)</option>
                    </select>
                </div>
            </div>

            <div style={{ marginTop: 24 }} className="sp-grid sp-grid--1">
                <label className="sp-switch-label">
                    <div className="sp-switch-text">
                        <span className="sp-switch-title">Require Manager PIN to Void / Cancel Invoices</span>
                        <span className="sp-switch-desc">Front office staff must enter manager PIN before cancelling saved bills</span>
                    </div>
                    <input 
                        type="checkbox" 
                        className="sp-toggle"
                        checked={settings.pin_require_cancel_invoice !== 'false' && settings.pin_require_cancel_invoice !== false} 
                        onChange={e => setSettings(s => ({ ...s, pin_require_cancel_invoice: e.target.checked }))} 
                    />
                </label>
            </div>

            <div className="sp-actions" style={{ marginTop: 32, justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => navigate('/dashboard/staff')} className="btn btn-ghost">
                    Manage Staff Accounts & Role Permissions
                </button>
                <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Security Settings
                </button>
            </div>
        </div>
    );
}
