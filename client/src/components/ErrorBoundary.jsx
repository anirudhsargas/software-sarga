import React from 'react';
import { AlertTriangle, RefreshCw, RotateCw, Home, ZapOff } from 'lucide-react';
import { isChunkLoadError } from '../utils/errorUtils';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunk: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunk: isChunkLoadError(error) };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    if (isChunkLoadError(error)) {
      const reloadKey = 'sarga_chunk_reload';
      const count = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);

      if (count < 2) {
        sessionStorage.setItem(reloadKey, (count + 1).toString());
        console.warn(`[PWA] Chunk load error (attempt ${count + 1}) — reloading.`);

        if (count === 1 && 'serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
              registration.unregister();
            }
          }).finally(() => {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, isChunk: false });
  };

  handleHardReload = async () => {
    sessionStorage.removeItem('sarga_chunk_reload');

    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      } catch (e) {
        console.error('Failed to unregister service workers:', e);
      }
    }

    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (e) {
        console.error('Failed to clear caches:', e);
      }
    }

    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { isChunk, error } = this.state;
      return (
        <div className="error-boundary">
          <div className="error-boundary__container">
            <div className="error-boundary__icon">
              {isChunk ? <ZapOff size={36} /> : <AlertTriangle size={36} />}
            </div>
            <h1 className="error-boundary__title">
              {isChunk ? 'App Updated' : 'Something went wrong'}
            </h1>
            <p className="error-boundary__message">
              {isChunk
                ? 'A new version of Sarga was deployed. Please reload the page to continue.'
                : 'An unexpected error occurred. Please try refreshing the page.'}
            </p>
            {!isChunk && error && (
              <details className="error-boundary__details">
                <summary className="error-boundary__summary">Error details</summary>
                <pre className="error-boundary__stack">
                  {error.toString()}
                </pre>
              </details>
            )}
            <div className="error-boundary__actions">
              {isChunk ? (
                <button className="error-boundary__retry-btn" onClick={this.handleHardReload}>
                  <RefreshCw size={16} /> Reload Now
                </button>
              ) : (
                <>
                  <button className="error-boundary__retry-btn" onClick={() => window.location.reload()}>
                    <RotateCw size={16} /> Reload Page
                  </button>
                  <button className="error-boundary__home-btn" onClick={() => window.location.href = '/'}>
                    <Home size={16} /> Go Home
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
