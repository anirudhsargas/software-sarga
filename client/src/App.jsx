import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChangePassword from './pages/ChangePassword';
import NotFound from './pages/NotFound';
import auth from './services/auth';
import { initServerTime } from './services/serverTime';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AuthProvider } from './hooks/useAuth';
import { initOfflineSync } from './services/offlineSync';
import OfflineStatusBar from './components/OfflineStatusBar';

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

    // Initialize PWA offline sync (pre-cache billing data, listen for reconnect)
    initOfflineSync();

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
      if (media.removeEventListener) {
        media.removeEventListener('change', handleChange);
      } else {
        media.removeListener(handleChange);
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
        <ConfirmProvider>
          <OfflineStatusBar />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: { fontSize: '14px' },
              success: { duration: 2500 },
              error: { duration: 4000 },
            }}
          />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard/*"
              element={
                <ProtectedRoute>
                  <Dashboard />
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
        </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
