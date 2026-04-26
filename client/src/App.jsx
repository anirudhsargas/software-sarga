import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense } from 'react';
import './bones/registry';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const StaffSettingsPage = lazy(() => import('./pages/StaffSettingsPage'));
import auth from './services/auth';
import { initServerTime } from './services/serverTime';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AuthProvider } from './hooks/useAuth';

import { syncManager } from './services/syncWorkerManager';
import { SyncStatusBar } from './components/SyncStatusBar';

const ProtectedRoute = ({ children, roles }) => {
  if (!auth.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const user = auth.getUser();
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};


function App() {
  useEffect(() => {
    // Sync with server clock so staff cannot manipulate dates
    initServerTime();

    // Initialize sync worker
    syncManager.init();

    // Update token when it changes
    const token = localStorage.getItem('token');
    if (token) syncManager.updateToken(token);

    // Listen for online/offline
    const handleOnline = () => syncManager.setOnlineStatus(true);
    const handleOffline = () => syncManager.setOnlineStatus(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Theme handling (unchanged)
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (isDark) => {
      document.documentElement.classList.toggle('dark', isDark);
    };
    applyTheme(media.matches);
    const handleChange = (event) => applyTheme(event.matches);
    if (media.addEventListener) {
      media.addEventListener('change', handleChange);
    } else {
      media.addListener(handleChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (media.removeEventListener) {
        media.removeEventListener('change', handleChange);
      } else {
        media.removeListener(handleChange);
      }
      syncManager.destroy();
    };
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
        <ConfirmProvider>
          <SyncStatusBar />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                fontSize: '14px',
                background: 'var(--toast-bg)',
                color: 'var(--toast-text)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)',
              },
              success: { duration: 2500 },
              error: { duration: 4000 },
            }}
          />
          <Suspense fallback={<div style={{padding:40}}><span>Loading...</span></div>}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/dashboard/*"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute>
                    {/* Redirect to dashboard inventory overview */}
                    <Navigate to="/dashboard/inventory/overview" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff-settings"
                element={
                  <ProtectedRoute roles={['Other Staff', 'Designer', 'Printer', 'Front Office', 'Accountant']}>
                    <StaffSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/change-password"
                element={
                  <ProtectedRoute>
                    <ChangePassword />
                  </ProtectedRoute>
                }
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
