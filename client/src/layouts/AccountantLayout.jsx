import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AccountantSidebar from '../components/accounting/AccountantSidebar';
import './AccountantLayout.css';

// Lazy load pages
const AccountantDashboard = React.lazy(() => import('../pages/accounting/AccountantDashboard'));

export default function AccountantLayout() {
  return (
    <div className="acc-layout-root">
      <AccountantSidebar />
      <main className="acc-main-content">
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
