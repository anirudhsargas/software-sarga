import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';

import "./index.css";
import "./styles/global-fixes.css";
import App from "./App.jsx";
import { API_URL } from "./services/api";

// Service worker and auto-update polling in production
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

  const checkVersion = async () => {
    try {
      const response = await fetch(`${API_URL}version`);
      if (!response.ok) return;
      const data = await response.json();
      const currentVersion = getMetaVersion() || '1.0.0';
      if (data.version && data.version !== currentVersion) {
        if (data.critical) {
          window.location.reload(true);
        } else {
          window.dispatchEvent(new CustomEvent('app.update', { detail: { version: data.version } }));
        }
      }
    } catch (err) {
      console.error('Failed to check app version:', err);
    }
  };

  // Check version on startup and every 5 minutes
  checkVersion();
  setInterval(checkVersion, 5 * 60 * 1000);
}

// ── Sentry ─────────────────────────────

Sentry.init({
  dsn: "https://ed80e78984db726985d5baaa8aaab8d7@o4511491000041472.ingest.us.sentry.io/4511609262112769",

  tracesSampleRate: 0.2,
});

// Optional: disable logs in production

if (import.meta.env.PROD) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

// ── Stale chunk recovery ──────────────

window.addEventListener("unhandledrejection", (event) => {
  const msg = event?.reason?.message || "";

  const isChunkError =
    msg.includes(
      "Failed to fetch dynamically imported module"
    ) ||
    msg.includes(
      "Importing a module script failed"
    ) ||
    msg.includes(
      "Unable to preload CSS"
    ) ||
    event?.reason?.name === "ChunkLoadError";

  if (isChunkError) {
    const reloadKey =
      "sarga_chunk_reload";

    const count =
      parseInt(
        sessionStorage.getItem(reloadKey) || "0",
        10
      );

    if (count < 2) {
      sessionStorage.setItem(
        reloadKey,
        String(count + 1)
      );

      window.location.reload();
    }
  }
});

sessionStorage.removeItem(
  "sarga_chunk_reload"
);

// ── React Render ─────────────────────

createRoot(
  document.getElementById("root")
).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Ripple

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
  }
);