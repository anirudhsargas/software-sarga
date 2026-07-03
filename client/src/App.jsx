import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppShellSkeleton from './components/ui/AppShellSkeleton';
import './bones/registry';
import './pages/public/public.css';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ServerError = lazy(() => import('./pages/ServerError'));
const NetworkError = lazy(() => import('./pages/NetworkError'));
const AccessDenied = lazy(() => import('./pages/AccessDenied'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const StaffSettingsPage = lazy(() => import('./pages/StaffSettingsPage'));
import auth from './services/auth';
import { initServerTime, checkHealth, waitForServer } from './services/serverTime';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { BranchProvider } from './contexts/BranchContext';
import { AuthProvider, AuthContext } from './hooks/useAuth';

import { HelmetProvider } from 'react-helmet-async';

import { ThemeProvider } from './theme/ThemeProvider';

import { syncManager } from './services/syncWorkerManager';
import { preloadStaticDataWithRetry } from './services/api';
import { SyncStatusBar } from './components/SyncStatusBar';
import UpdateNotification from './components/UpdateNotification';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TooltipProvider from './components/ui/TooltipProvider';

const PublicLayout = lazy(() => import('./pages/public/PublicLayout'));
const HomePage = lazy(() => import('./pages/public/HomePage'));
const ServicesPage = lazy(() => import('./pages/public/ServicesPage'));
const ProductsPage = lazy(() => import('./pages/public/ProductsPage'));
const DesignPage = lazy(() => import('./pages/public/DesignPage'));
const TrackPage = lazy(() => import('./pages/public/TrackPage'));
const ContactPage = lazy(() => import('./pages/public/ContactPage'));
const SignInPage = lazy(() => import('./pages/public/SignInPage'));
const PrivacyPage = lazy(() => import('./pages/public/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/public/TermsPage'));

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
const AssignedJobs = lazy(() => import('./pages/designer/AssignedJobs'));
const DesignAnalytics = lazy(() => import('./pages/designer/DesignAnalytics'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 120000,
      gcTime: 1000 * 60 * 10,
      retry: 1
    }
  }
});

const ProtectedRoute = ({ children, roles }) => {
  const authCtx = React.useContext(AuthContext);
  const user = authCtx?.user || auth.getUser();
  if (!auth.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
};


import { useState } from 'react';

function ToastAnnouncer() {
  const [message, setMessage] = useState('');
  
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const toastText = mutation.target.textContent;
          if (toastText && toastText !== message) {
            setMessage(toastText);
          }
        }
      });
    });
    
    const toastContainer = document.querySelector('.react-hot-toast');
    if (toastContainer) {
      observer.observe(toastContainer, { childList: true, subtree: true });
    }
    
    return () => observer.disconnect();
  }, [message]);
  
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only" style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}>
      {message}
    </div>
  );
}

// Navigation event listener for cross-component navigation (used by api.js interceptors, etc.)
function RouteChangeHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e) => {
      if (e.detail && e.detail.path) {
        navigate(e.detail.path);
      }
    };
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, [navigate]);
  return null;
}

const ConnectingScreen = () => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 10000,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg, #f8f9fa)', color: 'var(--text, #212529)',
    padding: '24px', textAlign: 'center', gap: '16px',
  }}>
    <div className="spin" style={{ width: 40, height: 40, border: '3px solid var(--border,#dee2e6)', borderTopColor: 'var(--accent,#4361ee)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <div>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Waking up the server…</h2>
      <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--muted,#6c757d)' }}>
        This may take up to a minute on the first request.
      </p>
    </div>
  </div>
);

function App() {
  const [isOffline, setIsOffline] = useState(false);
  const [serverStarting, setServerStarting] = useState(true);

  useEffect(() => {
    // Remove splash screen after app mounts
    document.body.classList.add('loaded');

    // First ensure the backend is awake, then proceed with init
    (async () => {
      const ready = await waitForServer({
        maxAttempts: 20,
        initialDelayMs: 3000,
        onRetry: (delay, attempt) => {
          console.log(`[Server] Waiting for backend — attempt ${attempt}, retry in ${delay}ms`);
        },
      });
      if (!ready) {
        console.warn('[Server] Backend did not become healthy — continuing anyway');
      }
      setServerStarting(false);
    })();

    // Sync with server clock so staff cannot manipulate dates
    // (runs after waitForServer completes above)
    initServerTime().catch(() => {});

    // Only initialise the sync worker and preload data when the user is
    // authenticated with a valid (non-expired) token. An expired token
    // fires 8+ API calls that all return 401, which wipes localStorage
    // and causes the login → dashboard → login redirect loop.
    if (auth.isAuthenticated()) {
      const token = auth.getToken();
      syncManager.init();
      syncManager.updateToken(token);
      preloadStaticDataWithRetry(2);
    }

    // Listen for online/offline
    const handleOnline = () => { setIsOffline(false); syncManager.setOnlineStatus(true); };
    const handleOffline = () => { setIsOffline(true); syncManager.setOnlineStatus(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // bfcache: cleanup sync worker on hide / recreate on show
    const handlePageHide = () => {
      syncManager.destroy();
    };
    const handlePageShow = () => {
      if (auth.isAuthenticated()) {
        const freshToken = auth.getToken();
        syncManager.init();
        syncManager.updateToken(freshToken);
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    // Periodic health check every 60 seconds
    const healthInterval = setInterval(async () => {
      const healthy = await checkHealth();
      setIsOffline(!healthy);
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      clearInterval(healthInterval);
      syncManager.destroy();
    };
  }, []);

  if (serverStarting) {
    return <ConnectingScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
    <HelmetProvider>
    <ThemeProvider>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
        <BranchProvider>
        <ConfirmProvider>
          <TooltipProvider>
          <RouteChangeHandler />
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <SyncStatusBar />
          <UpdateNotification />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                fontSize: 'var(--text-base)',
                background: 'var(--toast-bg)',
                color: 'var(--toast-text)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)',
              },
              success: { duration: 2500 },
              error: { duration: 4000 },
            }}
          />
          <ToastAnnouncer />
          <OfflineBanner visible={isOffline} onRetry={() => { setIsOffline(false); initServerTime(); }} />
          <main id="main-content">
          <Suspense fallback={<AppShellSkeleton />}>
            <Routes>
              {/* Public routes */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/design" element={<DesignPage />} />
                <Route path="/track" element={<TrackPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/signin" element={<SignInPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
              </Route>

              {/* Auth routes */}
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
                <Route path="assigned" element={<AssignedJobs />} />
                <Route path="analytics" element={<DesignAnalytics />} />
              </Route>
              <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
              <Route path="/users" element={<Navigate to="/dashboard/staff" replace />} />
              <Route path="/settings" element={<Navigate to="/dashboard/settings" replace />} />
              <Route path="/profile" element={<Navigate to="/dashboard" replace />} />
              <Route path="/error/server" element={<ServerError />} />
              <Route path="/error/network" element={<NetworkError />} />
              <Route path="/access-denied" element={<AccessDenied />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </main>
        </TooltipProvider>
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
