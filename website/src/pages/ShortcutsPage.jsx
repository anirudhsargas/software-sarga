import React from 'react';
import { SHORTCUT_LIST, useShortcuts } from '../context/ShortcutContext';
import { Keyboard, ShieldCheck, Zap } from 'lucide-react';
import '../components/Shortcuts/Shortcuts.css';

export default function ShortcutsPage() {
  const { openModal } = useShortcuts();
  const categories = Array.from(new Set(SHORTCUT_LIST.map((s) => s.category)));

  return (
    <div className="container" style={{ padding: '3rem 1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: '#fff',
            marginBottom: '1rem',
            boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5)'
          }}
        >
          <Keyboard size={32} />
        </div>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>Keyboard Shortcuts Reference</h1>
        <p style={{ fontSize: '1.1rem', color: '#64748b', maxWidth: '650px', margin: '0 auto' }}>
          Accelerate your workflow with quick action hotkeys. Trigger any action instantly from anywhere in the application without touching your mouse.
        </p>
      </div>

      <div
        style={{
          padding: '1.25rem 1.5rem',
          borderRadius: '12px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          marginBottom: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}
      >
        <ShieldCheck size={28} color="#10b981" style={{ flexShrink: 0 }} />
        <div>
          <h4 style={{ margin: '0 0 0.25rem 0', color: '#065f46', fontSize: '1rem' }}>
            Browser Conflict Override Protection Guaranteed
          </h4>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#047857' }}>
            All action shortcuts use safe <kbd>Alt</kbd> + key combinations and run through explicit event prevention handler routines. Standard browser system keys like window opening or tab closing are left completely unaffected.
          </p>
        </div>
      </div>

      {categories.map((cat) => {
        const items = SHORTCUT_LIST.filter((s) => s.category === cat);
        return (
          <div key={cat} style={{ marginBottom: '2.5rem' }}>
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#3b82f6',
                borderBottom: '2px solid #e2e8f0',
                paddingBottom: '0.5rem',
                marginBottom: '1.25rem'
              }}
            >
              {cat}
            </h3>

            <div className="shortcut-grid">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="shortcut-item-card"
                  onClick={() => openModal(item.id)}
                  style={{ background: 'var(--bg-card, #ffffff)' }}
                >
                  <div className="shortcut-item-card__info">
                    <span className="shortcut-item-card__icon">{item.icon}</span>
                    <div>
                      <div className="shortcut-item-card__name">{item.name}</div>
                      <div className="shortcut-item-card__desc">{item.description}</div>
                    </div>
                  </div>
                  <div className="shortcut-kbd-group">
                    {item.keys.map((k, idx) => (
                      <React.Fragment key={idx}>
                        <kbd>{k}</kbd>
                        {idx < item.keys.length - 1 && <span style={{ fontSize: 11, color: '#94a3b8' }}>+</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div
        style={{
          textAlign: 'center',
          padding: '2.5rem',
          borderRadius: '16px',
          background: 'var(--bg-secondary, #f8fafc)',
          border: '1px solid #e2e8f0',
          marginTop: '2rem'
        }}
      >
        <Zap size={32} color="#f59e0b" style={{ marginBottom: '0.75rem' }} />
        <h3 style={{ margin: '0 0 0.5rem 0' }}>Pro Tip: Quick Command Search</h3>
        <p style={{ color: '#64748b', marginBottom: '1.25rem', fontSize: '0.95rem' }}>
          Press <kbd>Alt</kbd> + <kbd>/</kbd> anywhere to open the interactive Command Palette and type to launch actions.
        </p>
        <button className="btn btn-primary" onClick={() => openModal('shortcuts_cheat_sheet')}>
          Open Keyboard Cheat Sheet Modal
        </button>
      </div>
    </div>
  );
}
