import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';

import "./index.css";
import "./styles/global-fixes.css";
import App from "./App.jsx";
import { API_URL } from "./services/api";

// Service worker and version-update polling in production
if (import.meta.env.PROD) {
  registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('sw.update'));
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    }
  });

  const getMetaVersion = () => {
    const meta = document.querySelector('meta[name="app-version"]');
    return meta ? meta.getAttribute('content') : null;
  };

  // Shared request cache — prevents duplicate in-flight version fetches
  let versionPromise = null;

  const checkVersion = async () => {
    if (versionPromise) return versionPromise;

    const doFetch = async () => {
      try {
        const versionUrl = API_URL.startsWith('http')
          ? `${API_URL.replace(/\/?$/, '/')}version`
          : 'https://software-sarga-2.onrender.com/api/version';
        const response = await fetch(versionUrl);
        if (!response.ok) return;
        const data = await response.json();
        const currentVersion = getMetaVersion() || '1.0.0';
        if (data.version && data.version !== currentVersion) {
          if (data.critical) {
            const lastReloaded = sessionStorage.getItem('sarga_critical_reloaded');
            if (lastReloaded !== data.version) {
              sessionStorage.setItem('sarga_critical_reloaded', data.version);
              window.location.reload();
              return;
            }
          }
          window.dispatchEvent(new CustomEvent('app.update', { detail: { version: data.version } }));
        }
      } catch (err) {
        console.error('Failed to check app version:', err);
      }
    };

    versionPromise = doFetch().finally(() => { versionPromise = null; });
    return versionPromise;
  };

  // Debounce mount: sessionStorage guard avoids StrictMode double-fetch
  // and rapid mount/unmount cycles in dev
  if (!sessionStorage.getItem('sarga_version_checked')) {
    sessionStorage.setItem('sarga_version_checked', '1');
    checkVersion();
  }

  // Poll every 5 minutes with cleanup
  const versionInterval = setInterval(checkVersion, 5 * 60 * 1000);
  window.addEventListener('beforeunload', () => clearInterval(versionInterval), { once: true });
}

// ── Sentry (Lazy Loaded) ────────────────
import('@sentry/react').then((Sentry) => {
  Sentry.init({
    dsn: "https://ed80e78984db726985d5baaa8aaab8d7@o4511491000041472.ingest.us.sentry.io/4511609262112769",
    tracesSampleRate: 0.2,
  });
}).catch(err => {
  const msg = err?.message || '';
  if (/Cannot access\s+['"][^'"]+['"]\s+before initialization/.test(msg)) {
    handleStaleChunk();
  } else {
    console.error("Sentry load failed:", err);
  }
});

// Optional: disable logs in production

if (import.meta.env.PROD) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

// ── Health keepalive ping ────────────

const pingHealth = () => {
  const url = API_URL.startsWith('http')
    ? `${API_URL.replace(/\/?$/, '/')}health`
    : 'https://software-sarga-2.onrender.com/api/health';
  fetch(url).catch(() => {});
};

if (import.meta.env.PROD) {
  pingHealth();
  const healthInterval = setInterval(pingHealth, 300000);
  window.addEventListener('beforeunload', () => clearInterval(healthInterval), { once: true });
}

// ── Online recovery ───────────────────

window.addEventListener('online', () => {
  sessionStorage.removeItem('sarga_network_error');
});

// ── Stale chunk recovery ──────────────

function isStaleChunkError(msg) {
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Unable to preload CSS") ||
    /Cannot access\s+['"][^'"]+['"]\s+before initialization/.test(msg)
  );
}

// Catches dynamic import failures (lazy-loaded routes) and TDZ errors
// that occur when chunks from different deployments get mixed.
window.addEventListener("unhandledrejection", (event) => {
  const msg = event?.reason?.message || "";
  if (isStaleChunkError(msg)) {
    handleStaleChunk();
  }
});

// Catches static script/style loading failures (e.g. cached index.html
// referencing old chunk hashes that no longer exist after deployment)
// as well as runtime TDZ errors from stale cached chunks.
window.addEventListener("error", (event) => {
  const target = event.target;

  // Resource loading errors (scripts, stylesheets, images)
  if (target && (target.tagName === "SCRIPT" || target.tagName === "LINK")) {
    const src = target.src || target.href || "";
    if (src.includes("/assets/")) {
      event.preventDefault();
      handleStaleChunk();
      return;
    }
  }

  // Runtime TDZ errors from stale chunks (not resource errors, but
  // module evaluation errors caused by version-mismatched chunks)
  const err = event.error || event.reason;
  if (err && isStaleChunkError(err.message || "")) {
    event.preventDefault();
    handleStaleChunk();
  }
}, true);

const RELOAD_KEY = "sarga_chunk_reload";

function handleStaleChunk() {
  // Activate waiting service worker if available
  if ("serviceWorker" in navigator && navigator.serviceWorker.waiting) {
    navigator.serviceWorker.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  const count = parseInt(sessionStorage.getItem(RELOAD_KEY) || "0", 10);
  if (count < 2) {
    sessionStorage.setItem(RELOAD_KEY, String(count + 1));
    window.location.reload();
  }
}

// Reset reload counter on fresh page load
sessionStorage.removeItem(RELOAD_KEY);

// ── React Render ─────────────────────

createRoot(
  document.getElementById("root")
).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Ripple effect handler — uses AbortController for cleanup
const rippleController = new AbortController();
document.addEventListener(
  "click",
  async (e) => {
    const btn =
      e.target.closest(".btn");

    if (!btn || btn.disabled)
      return;

    const { addRipple } =
      await import(
        "./utils/ripple"
      );

    addRipple({
      currentTarget: btn,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  },
  { signal: rippleController.signal }
);

// Clean up ripple listener on page unload
window.addEventListener("beforeunload", () => {
  rippleController.abort();
});