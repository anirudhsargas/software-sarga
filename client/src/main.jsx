import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import "./styles/global-fixes.css";
import App from "./App.jsx";

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