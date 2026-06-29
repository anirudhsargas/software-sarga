import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '10px 16px',
        background: 'var(--danger, #dc3545)',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <WifiOff size={16} />
      <span>Unable to reach the server. Your data may not be saved.</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            border: '1px solid rgba(255,255,255,0.5)',
            borderRadius: '4px',
            background: 'transparent',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <RefreshCw size={14} /> Retry
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '18px',
          opacity: 0.7,
          padding: '0 4px',
        }}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
};

export default OfflineBanner;
