import React from 'react';
import { WifiOff, X, RefreshCw } from 'lucide-react';
import './OfflineBanner.css';

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
    <div className="offline-banner" role="alert">
      <div className="offline-banner__content">
        <div className="offline-banner__message">
          <WifiOff size={16} aria-hidden="true" />
          <span className="offline-banner__title">Connection Lost.</span>
          <span className="offline-banner__detail">
            Working in offline mode. Changes will be synced once connection is restored.
          </span>
        </div>

        <div className="offline-banner__actions">
          <button
            type="button"
            className="offline-banner__reconnect"
            onClick={handleRetry}
            disabled={retrying}
          >
            <RefreshCw size={12} className={retrying ? 'offline-banner__spin' : ''} aria-hidden="true" />
            {retrying ? 'Connecting...' : 'Reconnect'}
          </button>

          <button
            type="button"
            className="offline-banner__dismiss"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineBanner;
