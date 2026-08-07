import React, { useState, useEffect } from 'react';
import { HelpCircle, X, Keyboard } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import './KeyboardShortcutsHelp.css';

const KeyboardShortcutsHelp = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const handleToggle = () => {
      setIsOpen((prev) => !prev);
    };
    window.addEventListener('toggle-shortcuts-help', handleToggle);
    return () => window.removeEventListener('toggle-shortcuts-help', handleToggle);
  }, []);

  if (!user) return null;

  const role = user.role;

  // Let's filter shortcuts based on roles to show what is accessible to the user
  const functionKeys = [
    { key: 'F1', name: 'Dashboard', roles: ['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer', 'Other Staff'] },
    { key: 'F2', name: 'Customers', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'F3', name: 'Orders', roles: ['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer'] },
    { key: 'F4', name: 'Create Invoice', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'F5', name: 'Payments', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'F6', name: 'Inventory', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'F7', name: 'Upload Bill', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'F8', name: 'Scan Item', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'F9', name: 'Product Library', roles: ['Admin', 'Front Office', 'Designer', 'Accountant'] },
    { key: 'F10', name: 'Expense Manager', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'F11', name: 'Vendors', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'F12', name: 'Stock Transfer', roles: ['Admin', 'Front Office', 'Accountant'] },
  ];

  const altKeys = [
    { key: 'Alt + D', name: 'Dashboard / Summary', roles: ['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer', 'Other Staff'] },
    { key: 'Alt + A', name: 'Assigned Jobs / Tasks', roles: ['Admin', 'Designer', 'Printer', 'Other Staff'] },
    { key: 'Alt + B / U / J', name: 'Bookings / Orders', roles: ['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer', 'Other Staff'] },
    { key: 'Alt + C', name: 'Add New Customer', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'Alt + N', name: 'Create Invoice', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'Alt + P', name: 'Payments', roles: ['Admin', 'Front Office', 'Accountant'] },
    { key: 'Alt + S', name: 'Shortcuts Page', roles: ['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer'] },
  ];

  const handleClose = () => setIsOpen(false);

  return (
    <>
      {/* Floating help button */}
      <button
        className="shortcuts-help-trigger"
        onClick={() => setIsOpen(true)}
        title="Keyboard Shortcuts (?)"
        aria-label="Keyboard Shortcuts"
      >
        <Keyboard size={20} />
      </button>

      {isOpen && (
        <div className="shortcuts-modal-overlay" onClick={handleClose}>
          <div className="shortcuts-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-modal-header">
              <h2>
                <Keyboard size={22} className="header-icon" /> Keyboard Shortcuts
              </h2>
              <button className="close-btn" onClick={handleClose} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <div className="shortcuts-modal-body">
              <p className="shortcuts-tip">
                Press <strong>?</strong> anywhere on the page (outside text inputs) to toggle this helper.
              </p>

              <div className="shortcuts-section">
                <h3>Function Keys (Global Navigation)</h3>
                <div className="shortcuts-list">
                  {functionKeys.map((item) => {
                    const isAllowed = item.roles.includes(role);
                    return (
                      <div key={item.key} className={`shortcut-item ${isAllowed ? '' : 'disabled'}`}>
                        <span className="shortcut-key">{item.key}</span>
                        <span className="shortcut-name">{item.name}</span>
                        {!isAllowed && <span className="shortcut-badge">Restricted</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="shortcuts-section">
                <h3>Alt Key Shortcuts</h3>
                <div className="shortcuts-list">
                  {altKeys.map((item) => {
                    const isAllowed = item.roles.includes(role);
                    return (
                      <div key={item.key} className={`shortcut-item ${isAllowed ? '' : 'disabled'}`}>
                        <span className="shortcut-key">{item.key}</span>
                        <span className="shortcut-name">{item.name}</span>
                        {!isAllowed && <span className="shortcut-badge">Restricted</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default KeyboardShortcutsHelp;
