import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';

import "./index.css";
import "./styles/global-fixes.css";
import App from "./App.jsx";
import { API_URL } from "./services/api";

// ── Auto-reload throttle ───────────────────────────
// Every automatic reload path (service-worker takeover, stale chunk
// detection, vite:preloadError) goes through allowAutoReload(). At most
// 2 automatic reloads are permitted inside a 30s window; anything beyond
// that is a pathological loop (SW churn, cached index.html pointing at
// removed chunks, deploy mismatch) and must be stopped so the user is
// never left on an endless refresh cycle.
const RELOAD_KEY = 'sarga_chunk_reload';
const RELOAD_WINDOW_MS = 30000;
const RELOAD_MAX = 2;

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

function allowAutoReload() {
  const count = getReloadCount();
  if (count >= RELOAD_MAX) return false;
  setReloadCount(count + 1);
  return true;
}

// Service worker — update detection via Workbox onNeedRefresh
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload for a legitimate SW takeover, never in a loop.
    if (allowAutoReload()) {
      window.location.reload();
    }
  });

  const updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('sw.update', { detail: { updateSW } }));
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    }
  });

  // Check for service worker updates periodically (every 10 minutes) & on tab focus
  navigator.serviceWorker.ready.then((registration) => {
    // Check for updates on mount
    registration.update().catch(() => {});

    // Check for updates every 10 minutes
    setInterval(() => {
      registration.update().catch(() => {});
    }, 10 * 60 * 1000);

    // Check for updates when tab is focused
    window.addEventListener('focus', () => {
      registration.update().catch(() => {});
    });
  });
}

// ── Sentry (Lazy Loaded after startup to optimize Time to Interactive) ──
const pendingErrors = [];
const pendingRejections = [];

const earlyErrorHandler = (event) => {
  pendingErrors.push(event);
};

const earlyRejectionHandler = (event) => {
  pendingRejections.push(event);
};

window.addEventListener('error', earlyErrorHandler);
window.addEventListener('unhandledrejection', earlyRejectionHandler);

const initLazySentry = () => {
  import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn: "https://ed80e78984db726985d5baaa8aaab8d7@o4511491000041472.ingest.us.sentry.io/4511609262112769",
        tracesSampleRate: 0.2,
      });

      // Remove the early listeners
      window.removeEventListener('error', earlyErrorHandler);
      window.removeEventListener('unhandledrejection', earlyRejectionHandler);

      // Report queued errors
      pendingErrors.forEach((event) => {
        if (event.error) {
          Sentry.captureException(event.error);
        } else {
          Sentry.captureMessage(event.message || 'Unknown error');
        }
      });
      pendingRejections.forEach((event) => {
        Sentry.captureException(event.reason || new Error('Unhandled promise rejection'));
      });

      // Clear the arrays
      pendingErrors.length = 0;
      pendingRejections.length = 0;
    })
    .catch((err) => {
      const msg = err?.message || '';
      if (/Cannot access\s+['"][^'"]+['"]\s+before initialization/.test(msg)) {
        handleStaleChunk();
      } else {
        console.error("Sentry load failed:", err);
      }
    });
};

// Delay Sentry load by 4 seconds (after initial render and interaction window)
if (window.requestIdleCallback) {
  window.addEventListener('load', () => {
    window.requestIdleCallback(() => {
      setTimeout(initLazySentry, 4000);
    });
  }, { once: true });
} else {
  window.addEventListener('load', () => {
    setTimeout(initLazySentry, 4000);
  }, { once: true });
}


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
// that were removed from the server after a new deployment. Throttled so a
// stale service worker / index.html can't loop reloads forever.
window.addEventListener('vite:preloadError', () => {
  if (allowAutoReload()) {
    window.location.reload();
  }
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

function handleStaleChunk() {
  if (!allowAutoReload()) return;

  const performCleanupAndReload = async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const r of registrations) {
          await r.unregister();
        }
      } catch (e) {
        console.error(e);
      }
    }
    if ("caches" in window) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      } catch (e) {
        console.error(e);
      }
    }
    window.location.reload();
  };

  performCleanupAndReload();
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

// ── Global Mouse Wheel Scroll Protection for Number Inputs ──
// Prevents accidental value mutations when scrolling over numeric fields in payment/billing forms.
document.addEventListener("focusin", (e) => {
  if (e.target && e.target.tagName === "INPUT" && e.target.type === "number") {
    if (!e.target.dataset.wheelDisabled) {
      e.target.dataset.wheelDisabled = "true";
      e.target.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          e.target.blur();
        },
        { passive: false }
      );
    }
  }
});