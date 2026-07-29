import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import toast from 'react-hot-toast';

/**
 * GlobalKeyboardShortcuts
 *
 * Registers two sets of keyboard shortcuts:
 *
 * 1. **Function keys (F1–F12)** — Navigate to major pages.
 *    Work on every page, every role (silently ignored if the role
 *    doesn't have access to a particular page).
 *    Browser defaults (e.g. F5 refresh, F11 fullscreen) are prevented.
 *
 * 2. **Alt + letter** — Quick-access shortcuts (existing behaviour).
 *
 * 3. **Shift + ?** — Toggle shortcuts help modal.
 *
 * All shortcuts are suppressed when focus is inside an INPUT, TEXTAREA,
 * SELECT, or contentEditable element.
 */

// ─── Function Key → Page mapping ────────────────────────────────────────────
// Each entry defines: key, label, route resolver (may vary by role), and
// which roles are allowed.
const FUNCTION_KEY_MAP = {
  F1: {
    label: 'Dashboard',
    // Route varies per role
    getRoute: (role) => {
      if (role === 'Admin' || role === 'Front Office') return '/dashboard';
      if (role === 'Accountant') return '/accounting/dashboard';
      if (role === 'Designer') return '/designer';
      if (role === 'Printer') return '/dashboard/printer-dashboard';
      return '/staff'; // Other Staff
    },
    roles: null, // all roles
  },
  F2: {
    label: 'Customers',
    getRoute: () => '/dashboard/sales/customers',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
  F3: {
    label: 'Orders',
    getRoute: (role) => {
      if (role === 'Designer') return '/designer/assigned';
      if (role === 'Printer') return '/dashboard/printer-dashboard';
      return '/dashboard/sales/orders';
    },
    roles: ['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer'],
  },
  F4: {
    label: 'Create Invoice',
    getRoute: () => '/dashboard/sales/invoices/create',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
  F5: {
    label: 'Payments',
    getRoute: () => '/dashboard/sales/payments',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
  F6: {
    label: 'Inventory',
    getRoute: () => '/dashboard/inventory',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
  F7: {
    label: 'Upload Bill',
    getRoute: () => '/dashboard/expenses/upload-bills',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
  F8: {
    label: 'Scan Item',
    getRoute: () => '/dashboard/inventory/scan',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
  F9: {
    label: 'Product Library',
    getRoute: (role) => {
      if (role === 'Designer') return '/designer/library';
      return '/dashboard/products';
    },
    roles: ['Admin', 'Front Office', 'Designer', 'Accountant'],
  },
  F10: {
    label: 'Expense Manager',
    getRoute: () => '/dashboard/expenses',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
  F11: {
    label: 'Vendors',
    getRoute: () => '/dashboard/vendors',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
  F12: {
    label: 'Stock Transfer',
    getRoute: () => '/dashboard/stock-transfer',
    roles: ['Admin', 'Front Office', 'Accountant'],
  },
};

const GlobalKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isTyping = useCallback(() => {
    const tag = document.activeElement?.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      document.activeElement?.isContentEditable
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!user) return;

      const role = user.role;

      // ────────────────────────────────────────────────
      // 1. Function Keys (F1 – F12)
      // ────────────────────────────────────────────────
      const fnDef = FUNCTION_KEY_MAP[e.key];
      if (fnDef) {
        // Always prevent browser defaults for function keys
        e.preventDefault();
        e.stopPropagation();

        // Don't navigate when typing in input fields
        if (isTyping()) return;

        // Check role permission
        if (fnDef.roles && !fnDef.roles.includes(role)) {
          return; // silently ignore — role has no access
        }

        const route = fnDef.getRoute(role);
        navigate(route);
        toast(`${fnDef.label}`, {
          icon: '⌨️',
          duration: 1200,
          style: {
            fontSize: '13px',
            padding: '6px 14px',
            background: 'var(--surface, #1e1e2e)',
            color: 'var(--text, #cdd6f4)',
            border: '1px solid var(--border, #45475a)',
          },
        });
        return;
      }

      // ────────────────────────────────────────────────
      // 2. Shift + ? → Toggle Shortcuts Help
      // ────────────────────────────────────────────────
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTyping()) return;
        e.preventDefault();
        // Dispatch a custom event that KeyboardShortcutsHelp listens to
        window.dispatchEvent(new CustomEvent('toggle-shortcuts-help'));
        return;
      }

      // ────────────────────────────────────────────────
      // 3. Alt + letter shortcuts (existing behaviour)
      // ────────────────────────────────────────────────
      if (isTyping()) return;

      // Require Alt only (no Ctrl, no Meta)
      if (!e.altKey || e.ctrlKey || e.metaKey) return;

      const key = e.key.toLowerCase();

      e.preventDefault();

      // ALT + D (Dashboard / Summary)
      if (key === 'd') {
        if (role === 'Admin' || role === 'Front Office') {
          navigate('/dashboard');
        } else if (role === 'Accountant') {
          navigate('/accounting/dashboard');
        } else if (role === 'Designer') {
          navigate('/designer');
        } else {
          navigate('/staff');
        }
        return;
      }

      // ALT + A (Assigned Jobs / Tasks)
      if (key === 'a') {
        if (role === 'Designer' || role === 'Admin') {
          navigate('/designer/assigned');
        } else if (role === 'Printer') {
          navigate('/dashboard/printer-dashboard');
        } else {
          navigate('/staff/tasks');
        }
        return;
      }

      // ALT + B / ALT + U / ALT + J (Bookings / Orders)
      if (key === 'b' || key === 'u' || key === 'j') {
        if (role === 'Designer' || role === 'Admin') {
          navigate('/designer/bookings');
        } else if (role === 'Front Office' || role === 'Accountant') {
          navigate('/dashboard/sales/orders');
        } else {
          navigate('/staff/tasks');
        }
        return;
      }

      // ALT + C (Add New Customer)
      if (key === 'c') {
        if (['Admin', 'Front Office', 'Accountant'].includes(role)) {
          navigate('/dashboard/sales/customers/new');
        }
        return;
      }

      // ALT + N (Create Invoice)
      if (key === 'n') {
        if (['Admin', 'Front Office', 'Accountant'].includes(role)) {
          navigate('/dashboard/sales/invoices/create');
        }
        return;
      }

      // ALT + P (Payments)
      if (key === 'p') {
        if (['Admin', 'Front Office', 'Accountant'].includes(role)) {
          navigate('/dashboard/sales/payments');
        }
        return;
      }

      // ALT + S (Shortcuts Page)
      if (key === 's') {
        navigate('/dashboard/shortcuts');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, user, isTyping]);

  return null;
};

// Export the map so the help modal can use it
export { FUNCTION_KEY_MAP };
export default GlobalKeyboardShortcuts;
