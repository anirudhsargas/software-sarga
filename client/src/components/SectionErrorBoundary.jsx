import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[${this.props.name || 'Section'}] Error:`, error, errorInfo);
  }

  handleRetry = () => {
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
          gap: 12,
          padding: '40px 20px',
          color: 'var(--muted)',
          textAlign: 'center'
        }}>
          <AlertTriangle size={32} style={{ opacity: 0.5 }} />
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
            {this.props.title || 'Something went wrong'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 400 }}>
            {this.props.message || 'An unexpected error occurred while loading this section.'}
          </div>
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
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
