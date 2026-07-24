import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';

const STORAGE_KEY = 'update_dismissed';

// ── DEBUG: remove after diagnosis ──────────────────────────────────────────
const DEBUG_UPDATE = true;
// ───────────────────────────────────────────────────────────────────────────

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
  // DEBUG state
  const [debugInfo, setDebugInfo] = useState(null);

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
      if (DEBUG_UPDATE) {
        navigator.serviceWorker?.ready.then(reg => {
          setDebugInfo({
            trigger: 'SW (service worker update)',
            currentMeta: getMetaVersion() || 'none',
            serverVersion: '—',
            swState: reg.waiting ? 'waiting SW present' : 'no waiting SW',
          });
        });
      }
      setUpdateAvailable(true);
      setDismissed(false);
      sessionStorage.removeItem(STORAGE_KEY);
    };

    const handleAppUpdate = (e) => {
      const newVer = e.detail?.version;
      if (newVer) setVersion(newVer);
      if (DEBUG_UPDATE) {
        setDebugInfo({
          trigger: 'Version API mismatch',
          currentMeta: getMetaVersion() || 'none',
          serverVersion: newVer || 'unknown',
          swState: '—',
        });
      }
      setUpdateAvailable(true);
      setDismissed(false);
      sessionStorage.removeItem(STORAGE_KEY);
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
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            padding: '12px 20px',
            background: 'var(--card)',
            borderBottom: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
            fontSize: '14px',
            color: 'var(--text-primary)',
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

          {/* ── DEBUG PANEL: remove after diagnosis ── */}
          {DEBUG_UPDATE && debugInfo && (
            <div style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              background: '#1a1a2e',
              color: '#e0e0e0',
              padding: '6px 14px',
              borderRadius: '6px',
              lineHeight: '1.7',
              textAlign: 'left',
              width: '100%',
              maxWidth: '600px',
            }}>
              <strong style={{ color: '#f97316' }}>🔍 DEBUG — Update Trigger Info</strong><br />
              <span style={{ color: '#94a3b8' }}>Trigger:</span> <span style={{ color: '#4ade80' }}>{debugInfo.trigger}</span><br />
              <span style={{ color: '#94a3b8' }}>Current version (meta tag):</span> <span style={{ color: '#60a5fa' }}>{debugInfo.currentMeta}</span><br />
              <span style={{ color: '#94a3b8' }}>Server version:</span> <span style={{ color: '#f472b6' }}>{debugInfo.serverVersion}</span><br />
              <span style={{ color: '#94a3b8' }}>SW waiting state:</span> <span style={{ color: '#facc15' }}>{debugInfo.swState}</span>
            </div>
          )}
          {/* ─────────────────────────────────────── */}
        </div>
      )}

      {/* Version badge removed from fixed overlay — no longer floats over page content */}
    </>
  );
};

export default UpdateNotification;

