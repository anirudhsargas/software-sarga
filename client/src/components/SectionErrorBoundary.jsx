import React from 'react';
import { AlertTriangle, RefreshCw, ZapOff } from 'lucide-react';
import { isStaleChunkError } from '../utils/errorUtils';

const RELOAD_KEY = 'sarga_section_chunk_reload';
const RELOAD_WINDOW_MS = 30000;

function getReloadCount() {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return Date.now() - data.t < RELOAD_WINDOW_MS ? data.c : 0;
  } catch {
    return 0;
  }
}

class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunk: false };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      isChunk: isStaleChunkError(error)
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.name || 'Section'}] Error:`, error, errorInfo);
    
    if (isStaleChunkError(error)) {
      const count = getReloadCount();
      console.warn(`[SectionErrorBoundary] Stale chunk error (attempt ${count + 1}) — auto-reloading page.`);

      if (count < 2) {
        sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ c: count + 1, t: Date.now() }));

        const performCleanupAndReload = async () => {
          if ('serviceWorker' in navigator) {
            try {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const r of registrations) {
                await r.unregister();
              }
            } catch (e) {
              console.error(e);
            }
          }
          if ('caches' in window) {
            try {
              const names = await caches.keys();
              await Promise.all(names.map(n => caches.delete(n)));
            } catch (e) {
              console.error(e);
            }
          }
          window.location.reload();
        };

        performCleanupAndReload();
      }
    }
  }

  handleRetry = () => {
    if (this.state.isChunk) {
      this.handleHardReload();
    } else {
      this.setState({ hasError: false, error: null, isChunk: false });
    }
  };

  handleHardReload = async () => {
    sessionStorage.removeItem('sarga_section_chunk_reload');

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
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '40px 20px',
          color: 'var(--muted)',
          textAlign: 'center'
        }}>
          {isChunk ? (
            <ZapOff size={32} style={{ color: 'var(--warning)', opacity: 0.8 }} />
          ) : (
            <AlertTriangle size={32} style={{ opacity: 0.5 }} />
          )}
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
            {isChunk ? 'New Version Available' : (this.props.title || 'Something went wrong')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 400 }}>
            {isChunk
              ? 'An update was deployed. Please reload the page to load the latest files.'
              : (this.props.message || 'An unexpected error occurred while loading this section.')}
          </div>
          {!isChunk && error && (
            <details style={{
              textAlign: 'left',
              marginTop: 8,
              maxWidth: '90%',
              width: '450px',
              fontSize: '11px',
              fontFamily: 'monospace',
              background: 'var(--bg-2, #f5f5f5)',
              padding: '8px 12px',
              borderRadius: '6px',
              color: 'var(--text-muted, #666)',
              border: '1px solid var(--border, #eee)'
            }}>
              <summary style={{ cursor: 'pointer', outline: 'none' }}>Error details</summary>
              <pre style={{ margin: '8px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {error.toString()}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 20px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              marginTop: 8
            }}
          >
            <RefreshCw size={16} /> {isChunk ? 'Reload Now' : 'Retry'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
