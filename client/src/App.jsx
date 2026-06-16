import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense } from 'react';
import './bones/registry';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ServerError = lazy(() => import('./pages/ServerError'));
const NetworkError = lazy(() => import('./pages/NetworkError'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const StaffSettingsPage = lazy(() => import('./pages/StaffSettingsPage'));
import auth from './services/auth';
import { initServerTime } from './services/serverTime';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { BranchProvider } from './contexts/BranchContext';
import { AuthProvider } from './hooks/useAuth';

import { HelmetProvider } from 'react-helmet-async';

import { ThemeProvider } from './theme/ThemeProvider';

import { syncManager } from './services/syncWorkerManager';
import { SyncStatusBar } from './components/SyncStatusBar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const AccountantLayout = lazy(() => import('./layouts/AccountantLayout'));
const StaffLayout = lazy(() => import('./layouts/StaffLayout'));
const StaffDashboard = lazy(() => import('./pages/staff/StaffDashboard'));
const LeaveManagement = lazy(() => import('./pages/staff/LeaveManagement'));
const MyTasks = lazy(() => import('./pages/staff/MyTasks'));

const DesignerLayout = lazy(() => import('./layouts/DesignerLayout'));
const DesignDashboard = lazy(() => import('./pages/designer/DesignDashboard'));
const ProductLibrary = lazy(() => import('./pages/designer/ProductLibrary'));
const DesignBooking = lazy(() => import('./pages/designer/DesignBooking'));
const BlockJournal = lazy(() => import('./pages/designer/BlockJournal'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30000,
      retry: 1
    }
  }
});

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
    // Remove splash screen after app mounts
    document.body.classList.add('loaded');

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

    // bfcache: cleanup sync worker on hide / recreate on show
    const handlePageHide = () => {
      syncManager.destroy();
    };
    const handlePageShow = () => {
      syncManager.init();
      const token = localStorage.getItem('token');
      if (token) syncManager.updateToken(token);
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      syncManager.destroy();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
    <HelmetProvider>
    <ThemeProvider>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
        <BranchProvider>
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
              <Route
                path="/accounting/*"
                element={
                  <ProtectedRoute roles={['Accountant', 'Admin']}>
                    <AccountantLayout />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/*"
                element={
                  <ProtectedRoute>
                    <StaffLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<StaffDashboard />} />
                <Route path="leaves" element={<LeaveManagement />} />
                <Route path="tasks" element={<MyTasks />} />
              </Route>
              <Route
                path="/designer/*"
                element={
                  <ProtectedRoute roles={['Designer', 'Admin']}>
                    <DesignerLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DesignDashboard />} />
                <Route path="library" element={<ProductLibrary />} />
                <Route path="bookings" element={<DesignBooking />} />
                <Route path="blocks" element={<BlockJournal />} />
              </Route>
              <Route path="/error/server" element={<ServerError />} />
              <Route path="/error/network" element={<NetworkError />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ConfirmProvider>
        </BranchProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
    </ThemeProvider>
    </HelmetProvider>
    </QueryClientProvider>
  );
}

export default App;
