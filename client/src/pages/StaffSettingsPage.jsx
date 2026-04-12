import React, { useState } from 'react';
import { Settings as SettingsIcon, UserSquare } from 'lucide-react';
import './SettingsPage.css';
import { useEffect } from 'react';

const staffTabs = [
    { key: 'profile', label: 'Profile', icon: UserSquare, desc: 'Your staff profile' },
    { key: 'appearance', label: 'Appearance', icon: SettingsIcon, desc: 'Theme and interface options' },
    { key: 'sidebar', label: 'Sidebar Items', icon: SettingsIcon, desc: 'Choose visible sidebar items' },
];

const sidebarOptions = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'jobs', label: 'Jobs' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'profile', label: 'Profile' },
    // Add more as needed
];

function SidebarVisibilitySettings() {
    const [visibleItems, setVisibleItems] = useState(() => {
        // Load from localStorage or default to all true
        const saved = localStorage.getItem('staffSidebarItems');
        return saved ? JSON.parse(saved) : Object.fromEntries(sidebarOptions.map(opt => [opt.key, true]));
    });

    useEffect(() => {
        localStorage.setItem('staffSidebarItems', JSON.stringify(visibleItems));
    }, [visibleItems]);

    const toggleItem = (key) => {
        setVisibleItems(items => ({ ...items, [key]: !items[key] }));
    };

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <SettingsIcon size={20} className="text-accent" />
                <h3 className="sp-card-title">Sidebar Items</h3>
            </div>
            <p className="sp-note">Choose which items appear in your sidebar.</p>
            <div className="sp-grid sp-grid--2">
                {sidebarOptions.map(opt => (
                    <label key={opt.key} className="sp-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="checkbox"
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
    const [activeTab, setActiveTab] = useState('profile');

    return (
        <div className="sp-container">
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
                    {activeTab === 'appearance' && <div>Theme and interface options for staff.</div>}
                    {activeTab === 'sidebar' && <SidebarVisibilitySettings />}
                </div>
            </main>
        </div>
    );
}
