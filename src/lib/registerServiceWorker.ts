import { buildInfo } from "./buildInfo";

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Dev mode: Vite HMR and SW caching fight each other.
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    // ?v=<version> forces a fresh SW install per build.
    const swUrl = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(
      buildInfo.version,
    )}`;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn("[sw] registration failed:", err);
    });
  });
}
