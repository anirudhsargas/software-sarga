import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, X } from 'lucide-react';

const STORAGE_KEY = 'update_dismissed';

export const UpdateNotification = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === 'true'
  );
  const updateSWRef = useRef(null);

  const forceReload = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) await reg.unregister();
      } catch {}
    }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch {}
    }
    window.location.reload();
  }, []);

  const reload = useCallback(async () => {
    try {
      if (updateSWRef.current) {
        await updateSWRef.current(true);
        return;
      }
    } catch {}
    forceReload();
  }, [forceReload]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  useEffect(() => {
    const handleSWUpdate = (e) => {
      if (e.detail?.updateSW) {
        updateSWRef.current = e.detail.updateSW;
      }
      setUpdateAvailable(true);
      setDismissed(false);
      sessionStorage.removeItem(STORAGE_KEY);
    };

    window.addEventListener('sw.update', handleSWUpdate);

    return () => {
      window.removeEventListener('sw.update', handleSWUpdate);
    };
  }, []);

  const show = updateAvailable && !dismissed;

  return (
    <>
      {show && (
        <div
          role="alert"
          onClick={(e) => {
            if (e.target.closest('.update-dismiss-btn')) return;
            reload();
          }}
          className="update-notification-banner"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 20px',
            background: 'var(--surface-3, var(--card))',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-lg)',
            fontSize: '14px',
            color: 'var(--text-primary)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} style={{ color: 'var(--success)' }} className="spin" />
          <span>A new version of the software is available. Click here to update!</span>
          <button
            className="update-dismiss-btn"
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              marginLeft: '8px'
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
};

export default UpdateNotification;
