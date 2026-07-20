import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

export const SHORTCUT_LIST = [
  {
    id: 'shortcuts_cheat_sheet',
    name: 'Shortcut Page / Cheat Sheet',
    keys: ['Alt', 'K'],
    keyDisplay: 'Alt + K',
    altKey: 'Shift + ?',
    category: 'General',
    description: 'Open keyboard shortcuts helper modal',
    icon: '⌨️'
  },
  {
    id: 'add_customer',
    name: 'Add New Customer',
    keys: ['Alt', 'C'],
    keyDisplay: 'Alt + C',
    category: 'Sales & CRM',
    description: 'Quickly register a new customer',
    icon: '👤'
  },
  {
    id: 'new_order',
    name: 'New Order',
    keys: ['Alt', 'N'],
    keyDisplay: 'Alt + N',
    category: 'Sales & CRM',
    description: 'Create a new print/sales order',
    icon: '🛒'
  },
  {
    id: 'payment',
    name: 'Record Payment',
    keys: ['Alt', 'P'],
    keyDisplay: 'Alt + P',
    category: 'Finance',
    description: 'Record incoming or outgoing payment',
    icon: '💳'
  },
  {
    id: 'inventory',
    name: 'Inventory & Stock',
    keys: ['Alt', 'I'],
    keyDisplay: 'Alt + I',
    category: 'Operations',
    description: 'View stock levels & update inventory',
    icon: '📦'
  },
  {
    id: 'scan_item',
    name: 'Scan Item',
    keys: ['Alt', 'S'],
    keyDisplay: 'Alt + S',
    category: 'Operations',
    description: 'Scan barcode/QR code for instant item lookup',
    icon: '🔍'
  },
  {
    id: 'daily_book',
    name: 'Daily Book / Day Book',
    keys: ['Alt', 'B'],
    keyDisplay: 'Alt + B',
    category: 'Finance',
    description: 'View today\'s cash flow, ledger & transaction summary',
    icon: '📖'
  },
  {
    id: 'upload_bills',
    name: 'Upload Bills',
    keys: ['Alt', 'U'],
    keyDisplay: 'Alt + U',
    category: 'Expenses',
    description: 'Upload supplier invoices, receipts & bills',
    icon: '🧾'
  },
  {
    id: 'staff_management',
    name: 'Staff Management',
    keys: ['Alt', 'M'],
    keyDisplay: 'Alt + M',
    category: 'HR & Staff',
    description: 'Manage staff, clock-in, and attendance roster',
    icon: '👥'
  },
  {
    id: 'expense_management',
    name: 'Expense Management',
    keys: ['Alt', 'E'],
    keyDisplay: 'Alt + E',
    category: 'Expenses',
    description: 'Log and track business operational expenses',
    icon: '💰'
  },
  {
    id: 'command_palette',
    name: 'Command Palette',
    keys: ['Alt', '/'],
    keyDisplay: 'Alt + /',
    category: 'Navigation',
    description: 'Search & jump to any section instantly',
    icon: '⚡'
  },
  {
    id: 'reports',
    name: 'Quick Reports',
    keys: ['Alt', 'R'],
    keyDisplay: 'Alt + R',
    category: 'Analytics',
    description: 'View sales and financial summary reports',
    icon: '📊'
  }
];

const ShortcutContext = createContext(null);

export function ShortcutProvider({ children }) {
  const [activeModal, setActiveModal] = useState(null); // 'add_customer', 'new_order', etc.
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
      if (e.key === 'Escape') {
        if (activeModal) {
          e.preventDefault();
          e.stopPropagation();
          closeModal();
          return;
        }
      }

      // Check if user is typing in a form input
      const target = e.target;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // Safe matching for Alt + key combinations
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();

        let matchedId = null;
        if (key === 'k') matchedId = 'shortcuts_cheat_sheet';
        else if (key === 'c') matchedId = 'add_customer';
        else if (key === 'n') matchedId = 'new_order';
        else if (key === 'p') matchedId = 'payment';
        else if (key === 'i') matchedId = 'inventory';
        else if (key === 's') matchedId = 'scan_item';
        else if (key === 'b') matchedId = 'daily_book';
        else if (key === 'u') matchedId = 'upload_bills';
        else if (key === 'm') matchedId = 'staff_management';
        else if (key === 'e') matchedId = 'expense_management';
        else if (key === '/' || key === '?') matchedId = 'command_palette';
        else if (key === 'r') matchedId = 'reports';

        if (matchedId) {
          // CRITICAL: Prevent browser default action (e.g. Alt+P browser print, Alt+S save, etc.)
          e.preventDefault();
          e.stopPropagation();

          const found = SHORTCUT_LIST.find((s) => s.id === matchedId);
          if (found) {
            toast.success(`⌨️ Shortcut: ${found.name} (${found.keyDisplay})`, {
              id: `shortcut-toast-${matchedId}`,
              duration: 2500,
              style: {
                background: '#1e293b',
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

      // Allow Shift + ? to open cheat sheet when not in text input
      if (!isInput && e.shiftKey && e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        toast.success(`⌨️ Shortcut: Cheat Sheet (Shift + ?)`, {
          id: 'shortcut-toast-cheatsheet',
          duration: 2000
        });
        openModal('shortcuts_cheat_sheet');
      }
    };

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
