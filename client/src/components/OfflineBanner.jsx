import React from 'react';
import { WifiOff, X, RefreshCw } from 'lucide-react';

const OfflineBanner = ({ visible, onRetry }) => {
  const [dismissed, setDismissed] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setDismissed(false); // Reset dismissal when network changes to offline
    }
  }, [visible]);

  if (!visible || dismissed) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      if (onRetry) await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: 'linear-gradient(135deg, #e11d48, #be123c)',
        color: '#ffffff',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-icon {
          animation: spin 1s linear infinite;
        }
      `}</style>
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <WifiOff size={16} style={{ color: '#ffe4e6', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.2px' }}>
            Connection Lost.
          </span>
          <span style={{ fontSize: '13px', color: '#ffe4e6', fontWeight: 500 }}>
            Working in offline mode. Changes will be synced once connection is restored.
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#ffffff',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              outline: 'none'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
          >
            <RefreshCw size={12} className={retrying ? 'spin-icon' : ''} />
            {retrying ? 'Connecting...' : 'Reconnect'}
          </button>
          
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              opacity: 0.8,
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'opacity 0.2s',
              outline: 'none'
            }}
            onMouseOver={e => e.currentTarget.style.opacity = 1}
            onMouseOut={e => e.currentTarget.style.opacity = 0.8}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineBanner;
