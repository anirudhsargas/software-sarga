import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import AccountantSidebar from '../components/accounting/AccountantSidebar';
import './AccountantLayout.css';

// Lazy load pages
const AccountantDashboard = React.lazy(() => import('../pages/accounting/AccountantDashboard'));

export default function AccountantLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hamburgerRef = useRef(null);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), []);

  // Lock body scroll when drawer open on mobile/tablet
  useEffect(() => {
    if (sidebarOpen && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  // Focus trap inside drawer
  useEffect(() => {
    if (!sidebarOpen || window.innerWidth >= 1024) return;
    const sidebarEl = document.querySelector('.acc-sidebar');
    if (!sidebarEl) return;
    const focusable = sidebarEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { last.focus(); e.preventDefault(); }
      } else {
        if (document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    };
    sidebarEl.addEventListener('keydown', handleTab);
    first.focus();
    return () => sidebarEl.removeEventListener('keydown', handleTab);
  }, [sidebarOpen]);

  // Escape key closes
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && sidebarOpen) closeSidebar();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [sidebarOpen, closeSidebar]);

  // Close on nav — reset sidebarOpen when path changes
  // (AccountantSidebar handles NavLink onClick close via the isOpen prop)

  return (
    <div className="acc-layout-root">
      {/* Overlay for mobile/tablet */}
      {sidebarOpen && (
        <div className="acc-overlay" onClick={closeSidebar} aria-hidden="true" />
      )}

      <AccountantSidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <main className="acc-main-content">
        {/* Hamburger for mobile/tablet */}
        <button
          ref={hamburgerRef}
          className="acc-hamburger"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Suspense fallback={<div className="acc-loading-page">Loading...</div>}>
          <div className="acc-page-container">
            <Routes>
              <Route path="dashboard" element={<AccountantDashboard />} />
              {/* Fallbacks for undefined routes */}
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Routes>
          </div>
        </Suspense>
      </main>
    </div>
  );
}
