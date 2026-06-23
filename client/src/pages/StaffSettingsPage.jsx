import { useSEO } from '../hooks/useSEO';
import React, { useState } from 'react';
import { Settings as SettingsIcon, UserSquare, Loader2 } from 'lucide-react';
import './SettingsPage.css';
import useAuth from '../hooks/useAuth';
import api from '../services/api';
import toast from 'react-hot-toast';
import AppearanceSettings from '../components/AppearanceSettings';
import PageContainer from '../components/ui/PageContainer';

const staffTabs = [
    { key: 'profile', label: 'Profile', icon: UserSquare, desc: 'Your staff profile' },
    { key: 'appearance', label: 'Appearance', icon: SettingsIcon, desc: 'Theme and interface options' },
    { key: 'sidebar', label: 'Sidebar Items', icon: SettingsIcon, desc: 'Choose visible sidebar items' },
];

const sidebarOptions = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'customers', label: 'Customers' },
    { key: 'billing', label: 'Billing' },
    { key: 'jobs', label: 'Jobs & Orders' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'operations', label: 'Operations' },
    { key: 'finance', label: 'Finance' },
    { key: 'manage', label: 'Management' },
    { key: 'reports', label: 'Reports' },
    { key: 'internal', label: 'Internal Books' },
];

function SidebarVisibilitySettings() {
    const { user, updateUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [visibleItems, setVisibleItems] = useState(() => {
        try {
            const settings = user?.settings ? (typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings) : {};
            return settings.sidebar || Object.fromEntries(sidebarOptions.map(opt => [opt.key, true]));
        } catch {
            return Object.fromEntries(sidebarOptions.map(opt => [opt.key, true]));
        }
    });

    const toggleItem = async (key) => {
        const oldItems = { ...visibleItems };
        const newVisible = { ...visibleItems, [key]: !visibleItems[key] };
        setVisibleItems(newVisible);
        
        setLoading(true);
        try {
            const { data } = await api.patch('/staff/settings', { settings: { sidebar: newVisible } });
            updateUser({ ...user, settings: data.settings });
            toast.success('Sidebar preferences updated');
        } catch {
            toast.error('Failed to save preferences');
            setVisibleItems(oldItems);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <SettingsIcon size={20} className="text-accent" />
                <h3 className="sp-card-title">Sidebar Items</h3>
                {loading && <Loader2 size={16} className="animate-spin ml-8" />}
            </div>
            <p className="sp-note">Choose which items appear in your sidebar. These settings are saved to your profile.</p>
            <div className="sp-grid sp-grid--2">
                {sidebarOptions.map(opt => (
                    <label key={opt.key} className="sp-label" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}>
                        <input
                            type="checkbox"
                            disabled={loading}
                            checked={!!visibleItems[opt.key]}
                            onChange={() => toggleItem(opt.key)}
                            style={{ marginRight: 8 }}
                        />
                        {opt.label}
                    </label>
                ))}
            </div>
        </div>
    );
}

export default function StaffSettingsPage() {
    useSEO('Staff Settings Page');

    const [activeTab, setActiveTab] = useState('profile');

    return (
        <PageContainer>
            <div className="sp-sidebar">
                <div className="sp-sidebar-header">
                    <div className="sp-icon-box">
                        <SettingsIcon size={20} />
                    </div>
                    <div>
                        <h2 className="sp-title">Staff Settings</h2>
                        <p className="sp-subtitle-muted">Manage your staff preferences</p>
                    </div>
                </div>
                <div className="sp-nav">
                    {staffTabs.map(t => (
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
                    {activeTab === 'profile' && <div>Your staff profile settings go here.</div>}
                    {activeTab === 'appearance' && <AppearanceSettings />}
                    {activeTab === 'sidebar' && <SidebarVisibilitySettings />}
                </div>
            </main>
        </PageContainer>
    );
}
