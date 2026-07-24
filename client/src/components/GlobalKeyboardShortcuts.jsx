import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

const GlobalKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!user) return;

      // Ignore shortcut key triggers when typing in input, textarea, select, or contenteditable
      const tag = document.activeElement?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        document.activeElement?.isContentEditable
      ) {
        return;
      }

      // Require Alt only (no Ctrl, no Meta)
      if (!e.altKey || e.ctrlKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      const role = user.role;

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
  }, [navigate, user]);

  return null;
};

export default GlobalKeyboardShortcuts;
