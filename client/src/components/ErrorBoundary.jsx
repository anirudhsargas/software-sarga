import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
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
            Something went wrong
          </h1>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', maxWidth: '400px' }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          {this.state.error && (
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
              {this.state.error.toString()}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
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
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
