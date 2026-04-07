import React from 'react';

const isChunkError = (error) => {
  const msg = error?.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS') ||
    error?.name === 'ChunkLoadError'
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isChunk: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, isChunk: isChunkError(error) };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Auto-reload once on chunk load errors (stale PWA cache)
    if (isChunkError(error)) {
      const reloadKey = 'sarga_chunk_reload';
      const count = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
      
      if (count < 2) {
        sessionStorage.setItem(reloadKey, (count + 1).toString());
        console.warn(`[PWA] Chunk load error (attempt ${count + 1}) — reloading.`);
        
        // If it's the second attempt, try to unregister service workers first
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
      } else {
        // We've tried twice and it's still failing. Stay on the error screen.
        console.error('[PWA] Persistent chunk load error after multiple reloads.');
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, isChunk: false });
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
          minHeight: '100vh',
          padding: '2rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--error)' }}>
            {isChunk ? 'App Updated' : 'Something went wrong'}
          </h1>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', maxWidth: '400px' }}>
            {isChunk
              ? 'A new version of Sarga was deployed. Please reload the page to continue.'
              : 'An unexpected error occurred. Please try refreshing the page.'}
          </p>
          {!isChunk && error && (
            <pre style={{
              background: 'var(--surface-2)',
              padding: '1rem',
              borderRadius: '0.5rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              maxWidth: '600px',
              overflow: 'auto',
              marginBottom: '1.5rem',
              textAlign: 'left'
            }}>
              {error.toString()}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1.5rem',
                backgroundColor: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600
              }}
            >
              {isChunk ? 'Reload Now' : 'Reload Page'}
            </button>
            {!isChunk && (
              <>
                <button
                  onClick={this.handleReset}
                  style={{
                    padding: '0.5rem 1.5rem',
                    backgroundColor: 'var(--accent-2)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.href = '/'}
                  style={{
                    padding: '0.5rem 1.5rem',
                    backgroundColor: 'var(--muted)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Go Home
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
