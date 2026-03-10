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
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        console.warn('[PWA] Stale chunk in error boundary — reloading.');
        window.location.reload();
      } else {
        sessionStorage.removeItem(reloadKey);
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
              background: '#f3f4f6',
              padding: '1rem',
              borderRadius: '0.5rem',
              fontSize: '0.8rem',
              color: '#374151',
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
                backgroundColor: '#3b82f6',
                color: '#fff',
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
                    color: '#fff',
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
                    color: '#fff',
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
