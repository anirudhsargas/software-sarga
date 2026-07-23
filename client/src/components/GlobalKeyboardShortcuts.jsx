import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

const GlobalKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e) => {
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

      if (!e.altKey) return;
      if (!user) return; // Only process shortcuts if authenticated

      const key = e.key.toLowerCase();
      const role = user.role;

      // ALT + D (Dashboard / Summary)
      if (key === 'd') {
        e.preventDefault();
        if (role === 'Admin' || role === 'Front Office') {
          navigate('/dashboard');
        } else if (role === 'Accountant') {
          navigate('/accounting/dashboard');
        } else if (role === 'Designer') {
          navigate('/designer');
        } else {
          navigate('/staff');
        }
      }

      // ALT + A (Assigned Jobs / Tasks)
      if (key === 'a') {
        e.preventDefault();
        if (role === 'Designer' || role === 'Admin') {
          navigate('/designer/assigned');
        } else if (role === 'Printer') {
          navigate('/dashboard/printer-dashboard');
        } else {
          navigate('/staff/tasks');
        }
      }

      // ALT + B / ALT + U / ALT + J (Bookings / Orders)
      if (key === 'b' || key === 'u' || key === 'j') {
        e.preventDefault();
        if (role === 'Designer' || role === 'Admin') {
          navigate('/designer/bookings');
        } else if (role === 'Front Office' || role === 'Accountant') {
          navigate('/dashboard/sales/orders');
        } else {
          navigate('/staff/tasks');
        }
      }

      // ALT + N (Create Invoice)
      if (key === 'n') {
        if (['Admin', 'Front Office', 'Accountant'].includes(role)) {
          e.preventDefault();
          navigate('/dashboard/sales/invoices/create');
        }
      }

      // ALT + P (Payments)
      if (key === 'p') {
        if (['Admin', 'Front Office', 'Accountant'].includes(role)) {
          e.preventDefault();
          navigate('/dashboard/sales/payments');
        }
      }

      // ALT + S (Shortcuts Page)
      if (key === 's') {
        e.preventDefault();
        navigate('/dashboard/shortcuts');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, user]);

  return null;
};

export default GlobalKeyboardShortcuts;
