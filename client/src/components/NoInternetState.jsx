import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw, Signal, Wifi } from 'lucide-react';

const checkOnline = () => navigator.onLine;

const NoInternetState = ({
  variant = 'inline',
  title = 'No Internet Connection',
  message = 'You appear to be offline. Some features may be unavailable.',
  suggestion = 'Check your connection and try again.',
  onRetry,
  onDismiss,
  lastUpdated,
  actionLabel = 'Try Again',
  compact = false,
  children
}) => {
  const [isOnline, setIsOnline] = useState(checkOnline);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        setIsOnline(checkOnline());
      }
    } finally {
      setRetrying(false);
    }
  }, [onRetry]);

  if (isOnline && !children) return null;

  if (isOnline && children) return children;

  const styles = {
    fullPage: {
      container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '40px 24px',
        textAlign: 'center',
        animation: 'noInternetFadeIn 0.4s ease'
      },
      icon: {
        width: 88,
        height: 88,
        borderRadius: '50%',
        background: 'var(--destructive)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        opacity: 0.15
      },
      iconInner: {
        color: 'var(--destructive)',
      }
    },
    inline: {
      container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: compact ? '20px 16px' : '32px 24px',
        textAlign: 'center',
        borderRadius: 12,
        border: '1px dashed var(--border)',
        background: 'var(--surface)',
        animation: 'noInternetFadeIn 0.3s ease'
      },
      icon: {
        width: compact ? 44 : 56,
        height: compact ? 44 : 56,
        borderRadius: '50%',
        background: 'var(--destructive)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        opacity: 0.12
      },
      iconInner: {
        color: 'var(--destructive)',
      }
    },
    section: {
      container: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface)'
      },
      icon: {
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'var(--destructive)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        opacity: 0.12
      },
      iconInner: {
        color: 'var(--destructive)',
      }
    }
  };

  const s = styles[variant] || styles.inline;

  const formatTime = (ts) => {
    if (!ts) return null;
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={s.container}>
      <style>{`
        @keyframes noInternetFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {variant === 'section' ? (
        <>
          <div style={s.icon}>
            <WifiOff size={18} style={s.iconInner} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {message}
            </div>
          </div>
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            {retrying ? (
              <RefreshCw size={14} className="spin" />
            ) : (
              <Wifi size={14} />
            )}
            {retrying ? 'Checking...' : actionLabel}
          </button>
        </>
      ) : (
        <>
          <div style={s.icon}>
            <WifiOff size={variant === 'fullPage' ? 40 : variant === 'inline' ? 28 : 18} style={s.iconInner} />
          </div>

          <h3 style={{
            fontSize: variant === 'fullPage' ? 20 : 16,
            fontWeight: 600,
            color: 'var(--text)',
            margin: '0 0 6px'
          }}>
            {title}
          </h3>

          <p style={{
            fontSize: variant === 'fullPage' ? 14 : 13,
            color: 'var(--text-secondary)',
            maxWidth: 400,
            lineHeight: 1.5,
            margin: '0 0 4px'
          }}>
            {message}
          </p>

          {suggestion && (
            <p style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              maxWidth: 360,
              margin: '0 0 16px',
              fontStyle: 'italic'
            }}>
              {suggestion}
            </p>
          )}

          {lastUpdated && (
            <p style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              margin: '0 0 12px'
            }}>
              Last updated: {formatTime(lastUpdated)}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13
              }}
            >
              {retrying ? (
                <RefreshCw size={15} className="spin" />
              ) : (
                <Signal size={15} />
              )}
              {retrying ? 'Checking...' : actionLabel}
            </button>

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
              >
                Dismiss
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NoInternetState;
