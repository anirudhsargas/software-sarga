import React, { useState } from 'react';
import { useShortcuts, SHORTCUT_LIST } from '../../context/ShortcutContext';
import { Keyboard, X, ChevronUp, Zap, Sparkles } from 'lucide-react';
import './Shortcuts.css';

export default function FloatingShortcutWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { openModal } = useShortcuts();

  return (
    <div className="floating-shortcut-container">
      {/* Floating Action Menu Popup */}
      {isOpen && (
        <div className="floating-shortcut-menu" onClick={(e) => e.stopPropagation()}>
          <div className="floating-shortcut-menu__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} color="#3b82f6" />
              <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>Quick Shortcuts Launcher</span>
            </div>
            <button
              className="floating-shortcut-menu__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.5rem 1rem 0.75rem 1rem' }}>
            Click any action below or press physical hotkey on keyboard:
          </p>

          <div className="floating-shortcut-menu__list">
            {SHORTCUT_LIST.map((item) => (
              <button
                key={item.id}
                type="button"
                className="floating-shortcut-item"
                onClick={() => {
                  setIsOpen(false);
                  openModal(item.id);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                  <span className="floating-shortcut-item__name">{item.name}</span>
                </div>
                <kbd className="floating-shortcut-kbd">{item.keys[0]} + {item.keys[1]}</kbd>
              </button>
            ))}
          </div>

          <div className="floating-shortcut-menu__footer">
            <button
              className="btn btn-primary btn-sm"
              style={{ width: '100%', fontSize: '0.82rem' }}
              onClick={() => {
                setIsOpen(false);
                openModal('shortcuts_cheat_sheet');
              }}
            >
              ⌨️ Open Full Hotkey Cheat Sheet (F2)
            </button>
          </div>
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        type="button"
        className={`floating-shortcut-trigger ${isOpen ? 'floating-shortcut-trigger--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Quick Action Shortcuts Launcher (Alt+K / F2)"
      >
        <Keyboard size={20} />
        <span className="floating-shortcut-trigger__text">Shortcuts</span>
        <span className="floating-shortcut-trigger__badge">Alt+K</span>
        <ChevronUp
          size={16}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}
        />
      </button>
    </div>
  );
}
