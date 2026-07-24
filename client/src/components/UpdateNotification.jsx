import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';

const STORAGE_KEY = 'update_dismissed';

function getMetaVersion() {
  const meta = document.querySelector('meta[name="app-version"]');
  return meta ? meta.getAttribute('content') : null;
}

export const UpdateNotification = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === 'true'
  );
  const [version, setVersion] = useState(getMetaVersion);

  const forceReload = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) await reg.unregister();
      } catch {}
    }
    window.location.reload();
  }, []);

  const reload = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          let done = false;
          const tid = setTimeout(() => { done = true; forceReload(); }, 5000);
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!done) { done = true; clearTimeout(tid); window.location.reload(); }
          }, { once: true });
          return;
        }
      } catch {}
    }
    forceReload();
  }, [forceReload]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  useEffect(() => {
    const handleSWUpdate = () => {
      setUpdateAvailable(true);
      setDismissed(false);
      sessionStorage.removeItem(STORAGE_KEY);
    };

    const handleAppUpdate = (e) => {
      if (e.detail?.version) setVersion(e.detail.version);
      handleSWUpdate();
    };

    window.addEventListener('sw.update', handleSWUpdate);
    window.addEventListener('app.update', handleAppUpdate);

    return () => {
      window.removeEventListener('sw.update', handleSWUpdate);
      window.removeEventListener('app.update', handleAppUpdate);
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

      {/* Version badge removed from fixed overlay — no longer floats over page content */}
    </>
  );
};

export default UpdateNotification;
