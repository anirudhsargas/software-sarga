if (import.meta.env.PROD) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Stale chunk recovery ──────────────────────────────────────────────────────
// When the PWA service worker is updated, old dynamic-import URLs (hashed chunk
// filenames) no longer exist in the new build. The browser gets a "Failed to
// fetch dynamically imported module" error. Catch it here and do a hard reload
// so the browser picks up the new files. A flag prevents infinite reload loops.
window.addEventListener('unhandledrejection', (event) => {
  const msg = event?.reason?.message || '';
  const isChunkError =
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS') ||
    (event?.reason?.name === 'ChunkLoadError');
  if (isChunkError) {
    const reloadKey = 'sarga_chunk_reload';
    const count = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
    if (count < 2) {
      sessionStorage.setItem(reloadKey, (count + 1).toString());
      console.warn(`[PWA] Stale chunk (attempt ${count + 1}) — reloading.`);
      if (count === 1 && 'serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) registration.unregister();
          }).finally(() => { window.location.reload(); });
      } else {
          window.location.reload();
      }
    }
  }
});

// Clear reload flag on successful load
sessionStorage.removeItem('sarga_chunk_reload');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Global ripple effect for all .btn elements
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn');
  if (!btn || btn.disabled) return;
  
  const { addRipple } = await import('./utils/ripple');
  addRipple({ currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
});

// Service worker registration is handled automatically by vite-plugin-pwa (registerType: 'autoUpdate')
