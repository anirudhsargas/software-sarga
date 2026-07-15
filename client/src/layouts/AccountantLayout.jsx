import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import AccountantSidebar from '../components/accounting/AccountantSidebar';
import './AccountantLayout.css';

// Lazy load pages
const AccountantDashboard = React.lazy(() => import('../pages/AccountantDashboard'));
const Customers = React.lazy(() => import('../pages/Customers'));
const CustomerPayments = React.lazy(() => import('../pages/CustomerPayments'));
const ExpenseManager = React.lazy(() => import('../pages/ExpenseManager'));
const Vendors = React.lazy(() => import('../pages/Vendors'));
const DailyReport = React.lazy(() => import('../pages/DailyReport'));
const VendorPayables = React.lazy(() => import('../pages/VendorPayables'));
const ConnectionLedger = React.lazy(() => import('../pages/ConnectionLedger'));
const InternalTransactions = React.lazy(() => import('../pages/InternalTransactions'));
const InternalTransfers = React.lazy(() => import('../pages/InternalTransfers'));
const Reports = React.lazy(() => import('../pages/Reports'));
const Accounts = React.lazy(() => import('../pages/Accounts'));
const AttendanceSalary = React.lazy(() => import('../pages/AttendanceSalary'));
const RecurringInvoices = React.lazy(() => import('../pages/RecurringInvoices'));
const UploadBills = React.lazy(() => import('../pages/UploadBills'));
const PaymentVerification = React.lazy(() => import('../pages/PaymentVerification'));

export default function AccountantLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hamburgerRef = useRef(null);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), []);

  useEffect(() => {
    if (sidebarOpen && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen || window.innerWidth >= 1024) return;
    const sidebarEl = document.querySelector('.acc-sidebar');
    if (!sidebarEl) return;
    const focusable = sidebarEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) { if (document.activeElement === first) { last.focus(); e.preventDefault(); } }
      else { if (document.activeElement === last) { first.focus(); e.preventDefault(); } }
    };
    sidebarEl.addEventListener('keydown', handleTab);
    first.focus();
    return () => sidebarEl.removeEventListener('keydown', handleTab);
  }, [sidebarOpen]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape' && sidebarOpen) closeSidebar(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [sidebarOpen, closeSidebar]);

  return (
    <div className="acc-layout-root">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {sidebarOpen && <div className="acc-overlay" onClick={closeSidebar} aria-hidden="true" />}

      <AccountantSidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <main id="main-content" className="acc-main-content">
        <button ref={hamburgerRef} className="acc-hamburger" onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-pressed={sidebarOpen}>
          {sidebarOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>

        <Suspense fallback={<div className="acc-loading-page">Loading...</div>}>
          <div className="acc-page-container">
            <Routes>
              <Route path="dashboard" element={<AccountantDashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="payments" element={<CustomerPayments />} />
              <Route path="expenses" element={<ExpenseManager />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="daily-book" element={<DailyReport />} />
              <Route path="ledger" element={<ConnectionLedger />} />
              <Route path="transactions" element={<InternalTransactions />} />
              <Route path="banks" element={<InternalTransfers />} />
              <Route path="bills" element={<UploadBills />} />
              <Route path="approvals" element={<PaymentVerification />} />
              <Route path="reports" element={<Reports />} />
              <Route path="salary" element={<AttendanceSalary />} />
              <Route path="attendance-records" element={<AttendanceSalary />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="purchases" element={<Vendors />} />
              <Route path="income" element={<CustomerPayments />} />
              <Route path="settings" element={<div style={{ padding: 24 }}><h2>Finance Settings</h2><p className="section-subtitle">Configure accounting preferences and defaults.</p></div>} />
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Routes>
          </div>
        </Suspense>
      </main>
    </div>
  );
}
