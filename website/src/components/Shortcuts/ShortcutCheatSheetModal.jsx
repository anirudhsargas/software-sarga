import React, { useState } from 'react';
import { useShortcuts } from '../../context/ShortcutContext';
import { X, Search, ShieldCheck, Keyboard } from 'lucide-react';
import './Shortcuts.css';

export default function ShortcutCheatSheetModal() {
  const { activeModal, closeModal, openModal, shortcuts } = useShortcuts();
  const [searchTerm, setSearchTerm] = useState('');

  if (activeModal !== 'shortcuts_cheat_sheet') return null;

  const filteredShortcuts = shortcuts.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.keyDisplay.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categories = Array.from(new Set(shortcuts.map((s) => s.category)));

  return (
    <div className="shortcut-overlay" onClick={closeModal}>
      <div
        className="shortcut-modal shortcut-modal--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="shortcut-modal__header">
          <div className="shortcut-modal__title-box">
            <div className="shortcut-modal__icon">
              <Keyboard size={24} className="text-primary" />
            </div>
            <div>
              <h3 className="shortcut-modal__title">Keyboard Shortcuts Guide</h3>
              <p className="shortcut-modal__subtitle">
                Press any key combination below to trigger quick actions anywhere in the application
              </p>
            </div>
          </div>
          <button className="shortcut-modal__close" onClick={closeModal} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="shortcut-modal__body">
          {/* Safety Notice */}
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
                justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
              <ShieldCheck size={20} style={{ color: '#059669', flexShrink: 0 }} />
              <span>
                <strong>Browser Conflict Guard Active:</strong> Hotkeys are explicitly isolated from browser default handlers.
              </span>
            </div>
            <div className="browser-safety-badge">
              <span>✓ Safe Hotkeys</span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="shortcut-search-bar">
            <Search className="shortcut-search-icon" size={18} />
            <input
              type="text"
              className="shortcut-search-input"
              placeholder="Search shortcuts by action name, key, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          {/* Categories & Shortcuts */}
          {categories.map((cat) => {
            const items = filteredShortcuts.filter((s) => s.category === cat);
            if (items.length === 0) return null;

            return (
              <div key={cat} className="shortcut-category">
                <div className="shortcut-category__title">
                  <span>{cat}</span>
                </div>
                <div className="shortcut-grid">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="shortcut-item-card"
                      onClick={() => openModal(item.id)}
                      title={`Click to open ${item.name}`}
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

          {filteredShortcuts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No matching shortcuts found</p>
              <p style={{ fontSize: '0.88rem' }}>Try searching for "Customer", "Order", "Payment", or "Alt"</p>
            </div>
          )}
        </div>

        <div className="shortcut-modal__footer">
          <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Tip: Press <kbd>Esc</kbd> anytime to dismiss active dialogs.</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={closeModal}>
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
