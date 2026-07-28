import React from 'react';
import { X } from 'lucide-react';
import NoInternetState from './NoInternetState';

const OfflineBanner = ({ visible, onRetry }) => {
  const [dismissed, setDismissed] = React.useState(false);

  if (!visible || dismissed) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '8px 16px',
        background: 'var(--destructive)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <NoInternetState
          variant="section"
          title="Server Unreachable"
          message="Your data may not be saved until connection restores."
          actionLabel="Retry"
          onRetry={onRetry}
        />
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            opacity: 0.7,
            padding: '4px',
            flexShrink: 0,
          }}
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default OfflineBanner;
