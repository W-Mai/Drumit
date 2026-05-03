import { buildInfo } from "./buildInfo";

/**
 * Register the app's service worker. Intentionally tolerant: dev mode
 * skips entirely (vite hot-reload and SW caching don't play well), and
 * any browser without SW support is just a no-op.
 *
 * The registration URL carries `?v=<version>` so every deployed build
 * is treated as a fresh SW (the browser compares SW scripts
 * byte-for-byte). The same `v` flows into the SW as its cache name.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    // `import.meta.env.BASE_URL` resolves to /Drumit/ in production and
    // / in dev; using it keeps the SW scoped to the app path under
    // GitHub Pages.
    const swUrl = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(
      buildInfo.version,
    )}`;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      // Non-fatal: app works without SW, just without offline support.
      console.warn("[sw] registration failed:", err);
    });
  });
}
