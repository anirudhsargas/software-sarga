import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

export const SHORTCUT_LIST = [
  {
    id: 'shortcuts_cheat_sheet',
    name: 'Shortcut Page / Cheat Sheet',
    keys: ['Alt', 'K'],
    keyDisplay: 'Alt + K  (or Ctrl + Shift + K)',
    category: 'General',
    description: 'Open keyboard shortcuts helper modal',
    icon: '⌨️',
    codes: ['KeyK', 'F2']
  },
  {
    id: 'add_customer',
    name: 'Add New Customer',
    keys: ['Alt', 'C'],
    keyDisplay: 'Alt + C  (or Ctrl + Shift + C)',
    category: 'Sales & CRM',
    description: 'Quickly register a new customer',
    icon: '👤',
    codes: ['KeyC']
  },
  {
    id: 'new_order',
    name: 'New Order',
    keys: ['Alt', 'N'],
    keyDisplay: 'Alt + N  (or Ctrl + Shift + N)',
    category: 'Sales & CRM',
    description: 'Create a new print/sales order',
    icon: '🛒',
    codes: ['KeyN']
  },
  {
    id: 'payment',
    name: 'Record Payment',
    keys: ['Alt', 'P'],
    keyDisplay: 'Alt + P  (or Ctrl + Shift + P)',
    category: 'Finance',
    description: 'Record incoming or outgoing payment',
    icon: '💳',
    codes: ['KeyP']
  },
  {
    id: 'inventory',
    name: 'Inventory & Stock',
    keys: ['Alt', 'I'],
    keyDisplay: 'Alt + I  (or Ctrl + Shift + I)',
    category: 'Operations',
    description: 'View stock levels & update inventory',
    icon: '📦',
    codes: ['KeyI']
  },
  {
    id: 'scan_item',
    name: 'Scan Item',
    keys: ['Alt', 'S'],
    keyDisplay: 'Alt + S  (or Ctrl + Shift + S)',
    category: 'Operations',
    description: 'Scan barcode/QR code for instant item lookup',
    icon: '🔍',
    codes: ['KeyS']
  },
  {
    id: 'daily_book',
    name: 'Daily Book / Day Book',
    keys: ['Alt', 'B'],
    keyDisplay: 'Alt + B  (or Ctrl + Shift + B)',
    category: 'Finance',
    description: 'View today\'s cash flow, ledger & transaction summary',
    icon: '📖',
    codes: ['KeyB']
  },
  {
    id: 'upload_bills',
    name: 'Upload Bills',
    keys: ['Alt', 'U'],
    keyDisplay: 'Alt + U  (or Ctrl + Shift + U)',
    category: 'Expenses',
    description: 'Upload supplier invoices, receipts & bills',
    icon: '🧾',
    codes: ['KeyU']
  },
  {
    id: 'staff_management',
    name: 'Staff Management',
    keys: ['Alt', 'M'],
    keyDisplay: 'Alt + M  (or Ctrl + Shift + M)',
    category: 'HR & Staff',
    description: 'Manage staff, clock-in, and attendance roster',
    icon: '👥',
    codes: ['KeyM']
  },
  {
    id: 'expense_management',
    name: 'Expense Management',
    keys: ['Alt', 'X'],
    keyDisplay: 'Alt + X  (or Alt + E / Ctrl + Shift + E)',
    category: 'Expenses',
    description: 'Log and track business operational expenses',
    icon: '💰',
    codes: ['KeyX', 'KeyE']
  },
  {
    id: 'command_palette',
    name: 'Command Palette',
    keys: ['Alt', '/'],
    keyDisplay: 'Alt + /  (or Ctrl + Shift + /)',
    category: 'Navigation',
    description: 'Search & jump to any section instantly',
    icon: '⚡',
    codes: ['Slash']
  },
  {
    id: 'reports',
    name: 'Quick Reports',
    keys: ['Alt', 'R'],
    keyDisplay: 'Alt + R  (or Ctrl + Shift + R)',
    category: 'Analytics',
    description: 'View sales and financial summary reports',
    icon: '📊',
    codes: ['KeyR']
  }
];

const ShortcutContext = createContext(null);

export function ShortcutProvider({ children }) {
  const [activeModal, setActiveModal] = useState(null);
  const [lastTriggered, setLastTriggered] = useState(null);

  const openModal = useCallback((modalId) => {
    setActiveModal(modalId);
    const shortcut = SHORTCUT_LIST.find((s) => s.id === modalId);
    if (shortcut) {
      setLastTriggered(shortcut.name);
    }
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const toggleCheatSheet = useCallback(() => {
    setActiveModal((prev) => (prev === 'shortcuts_cheat_sheet' ? null : 'shortcuts_cheat_sheet'));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Allow Escape key to close open modal anywhere
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (activeModal) {
          e.preventDefault();
          e.stopPropagation();
          closeModal();
          return;
        }
      }

      // Check key character and physical key code
      const keyChar = e.key ? e.key.toLowerCase() : '';
      const keyCode = e.code ? e.code : '';

      // Match trigger for Alt + Key OR Ctrl + Shift + Key
      const hasModifier = (e.altKey && !e.ctrlKey && !e.metaKey) || (e.ctrlKey && e.shiftKey);

      if (hasModifier) {
        let matchedId = null;

        // Match based on key string OR physical key code
        if (keyChar === 'k' || keyCode === 'KeyK') matchedId = 'shortcuts_cheat_sheet';
        else if (keyChar === 'c' || keyCode === 'KeyC') matchedId = 'add_customer';
        else if (keyChar === 'n' || keyCode === 'KeyN') matchedId = 'new_order';
        else if (keyChar === 'p' || keyCode === 'KeyP') matchedId = 'payment';
        else if (keyChar === 'i' || keyCode === 'KeyI') matchedId = 'inventory';
        else if (keyChar === 's' || keyCode === 'KeyS') matchedId = 'scan_item';
        else if (keyChar === 'b' || keyCode === 'KeyB') matchedId = 'daily_book';
        else if (keyChar === 'u' || keyCode === 'KeyU') matchedId = 'upload_bills';
        else if (keyChar === 'm' || keyCode === 'KeyM') matchedId = 'staff_management';
        else if (keyChar === 'x' || keyChar === 'e' || keyCode === 'KeyX' || keyCode === 'KeyE') matchedId = 'expense_management';
        else if (keyChar === '/' || keyChar === '?' || keyCode === 'Slash') matchedId = 'command_palette';
        else if (keyChar === 'r' || keyCode === 'KeyR') matchedId = 'reports';

        if (matchedId) {
          // Prevent browser default behavior (e.g. Chrome Alt+E menu focus, Alt+P print, etc.)
          e.preventDefault();
          e.stopPropagation();

          const found = SHORTCUT_LIST.find((s) => s.id === matchedId);
          if (found) {
            toast.success(`⌨️ Shortcut: ${found.name}`, {
              id: `shortcut-toast-${matchedId}`,
              duration: 2500,
              style: {
                background: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #3b82f6',
                borderRadius: '10px',
                fontWeight: '600',
                fontSize: '14px'
              }
            });
            openModal(matchedId);
          }
        }
      }

      // Dedicated F2 key for Shortcut Cheat Sheet on any page
      if (e.key === 'F2' || e.code === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        openModal('shortcuts_cheat_sheet');
      }
    };

    // Attach to window in capture phase to ensure it works across EVERY PAGE & route
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeModal, openModal, closeModal]);

  return (
    <ShortcutContext.Provider
      value={{
        activeModal,
        openModal,
        closeModal,
        toggleCheatSheet,
        lastTriggered,
        shortcuts: SHORTCUT_LIST
      }}
    >
      {children}
    </ShortcutContext.Provider>
  );
}

export function useShortcuts() {
  const context = useContext(ShortcutContext);
  if (!context) {
    throw new Error('useShortcuts must be used within a ShortcutProvider');
  }
  return context;
}
