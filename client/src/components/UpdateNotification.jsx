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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 'var(--z-toast)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '12px 20px',
            background: 'var(--card)',
            borderBottom: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
            fontSize: '14px',
            color: 'var(--text-primary)',
            fontWeight: 500,
          }}
        >
          <RefreshCw size={16} style={{ color: 'var(--accent)' }} />
          <span>A new version is available.</span>
          <button
            onClick={reload}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
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
