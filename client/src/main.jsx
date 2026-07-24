import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';

import "./index.css";
import "./styles/global-fixes.css";
import App from "./App.jsx";
import { API_URL } from "./services/api";

// Service worker — update detection via Workbox onNeedRefresh
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('sw.update', { detail: { updateSW } }));
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    }
  });
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

// ── vite:preloadError — catches stale preload requests for chunk hashes
// that were removed from the server after a new deployment.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

// Clear the chunk-reload flag on successful app load so it doesn't
// block a legitimate future reload need.
if (sessionStorage.getItem('chunk-reload')) {
  sessionStorage.removeItem('chunk-reload');
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
const RELOAD_WINDOW_MS = 30000;

function getReloadCount() {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return Date.now() - data.t < RELOAD_WINDOW_MS ? data.c : 0;
  } catch {
    return 0;
  }
}

function setReloadCount(count) {
  sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ c: count, t: Date.now() }));
}

function handleStaleChunk() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    });
  }

  const count = getReloadCount();
  if (count < 2) {
    setReloadCount(count + 1);

    if (count === 1 && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const r of registrations) r.unregister();
      });
      if ("caches" in window) {
        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))));
      }
      window.location.reload();
    } else {
      window.location.reload();
    }
  }
}

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