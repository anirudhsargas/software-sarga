import React from 'react';
import { Sparkles } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import toast from 'react-hot-toast';

export default function AppearanceSettings() {
    const { theme, setTheme } = useTheme();

    const handleThemeChange = (t) => {
        setTheme(t);
        toast.success(`Theme switched to ${t === 'system' ? 'System default' : t === 'dark' ? 'Dark mode' : 'Light mode'}`);
    };

    return (
        <div className="sp-card">
            <div className="sp-section-header">
                <Sparkles size={20} className="text-accent" />
                <h3 className="sp-card-title">Interface Appearance</h3>
            </div>
            <p className="sp-note">Choose your preferred theme. System will follow your device settings.</p>
            
            <div className="sp-theme-grid">
                <div role="button" tabIndex={0} className={`sp-theme-card ${theme === 'system' ? 'sp-theme-card--active' : ''}`}
                    onClick={() => handleThemeChange('system')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleThemeChange('system'); }}
                >
                    <div className="sp-theme-preview sp-theme-preview--system">
                        <div className="sp-theme-mock-sidebar sp-theme-mock-sidebar--system" />
                        <div className="sp-theme-mock-content sp-theme-mock-content--system" />
                    </div>
                    <div className="sp-theme-label">
                        <span className="font-bold">System</span>
                        <div className="sp-dot sp-dot--accent" />
                    </div>
                </div>

                <div role="button" tabIndex={0} className={`sp-theme-card ${theme === 'light' ? 'sp-theme-card--active' : ''}`}
                    onClick={() => handleThemeChange('light')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleThemeChange('light'); }}
                >
                    <div className="sp-theme-preview sp-theme-preview--light">
                        <div className="sp-theme-mock-sidebar" />
                        <div className="sp-theme-mock-content" />
                    </div>
                    <div className="sp-theme-label">
                        <span className="font-bold">Light</span>
                        <div className="sp-dot" />
                    </div>
                </div>
                
                <div role="button" tabIndex={0} className={`sp-theme-card ${theme === 'dark' ? 'sp-theme-card--active' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleThemeChange('dark'); }}
                >
                    <div className="sp-theme-preview sp-theme-preview--dark">
                        <div className="sp-theme-mock-sidebar" />
                        <div className="sp-theme-mock-content" />
                    </div>
                    <div className="sp-theme-label">
                        <span className="font-bold">Dark</span>
                        <div className="sp-dot sp-dot--accent" />
                    </div>
                </div>
            </div>
        </div>
    );
}
