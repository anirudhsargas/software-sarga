import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

export default function SidebarThemeToggle({ collapsed = false }) {
  const { theme, setTheme } = useTheme();

  const themes = [
    { id: 'light', icon: Sun, label: 'Light' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'system', icon: Monitor, label: 'System' }
  ];

  if (collapsed) {
    const currentTheme = themes.find(t => t.id === theme) || themes[2];
    const CurrentIcon = currentTheme.icon;
    const cycleTheme = () => {
      const nextIndex = (themes.findIndex(t => t.id === theme) + 1) % themes.length;
      setTheme(themes[nextIndex].id);
    };

    return (
      <button 
        onClick={cycleTheme}
        className="nav-item theme-cycle-btn"
        title={`Theme: ${currentTheme.label} (Click to toggle)`}
        style={{
          background: 'transparent',
          border: 'none',
          width: '100%',
          cursor: 'pointer',
          padding: '8px 0',
          display: 'flex',
          justifyContent: 'center',
          color: 'var(--text-muted)'
        }}
      >
        <CurrentIcon size={20} />
      </button>
    );
  }

  return (
    <div className="sidebar-theme-toggle" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>
        Appearance
      </div>
      <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-2, #f0f0f0)', padding: '2px', borderRadius: '6px' }}>
        {themes.map(t => {
          const Icon = t.icon;
          const isActive = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              title={t.label}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '6px 0',
                border: 'none',
                background: isActive ? 'var(--surface, #ffffff)' : 'transparent',
                color: isActive ? 'var(--text-primary, #000)' : 'var(--text-muted, #71717a)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={14} />
              <span className="theme-toggle-label">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
