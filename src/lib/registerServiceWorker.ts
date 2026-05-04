import { buildInfo } from "./buildInfo";

// Events dispatched on window so the app can react. 'drumit:update-ready'
// fires when a new SW has installed and is waiting; app can show a
// refresh prompt. 'drumit:controller-changed' fires when the new SW
// took control (reload needed to pick up fresh JS).
export const UPDATE_READY_EVENT = "drumit:update-ready";
export const CONTROLLER_CHANGED_EVENT = "drumit:controller-changed";

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // Dev mode: Vite HMR and SW caching fight each other.
  if (import.meta.env.DEV) return;

  window.addEventListener("load", async () => {
    // ?v=<version> forces a fresh SW install per build.
    const swUrl = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(
      buildInfo.version,
    )}`;
    try {
      const registration = await navigator.serviceWorker.register(swUrl, {
        // Bypass the HTTP cache when fetching the SW script itself so
        // iOS PWA standalone mode actually notices redeploys.
        updateViaCache: "none",
      });

      // A waiting worker means an earlier tab installed a new SW that
      // hasn't taken control yet. Tell the app so it can prompt.
      if (registration.waiting && navigator.serviceWorker.controller) {
        emit(UPDATE_READY_EVENT);
      }

      registration.addEventListener("updatefound", () => {
        const newSw = registration.installing;
        if (!newSw) return;
        newSw.addEventListener("statechange", () => {
          if (newSw.state === "installed" && navigator.serviceWorker.controller) {
            // installed but not yet controlling → an update is ready.
            emit(UPDATE_READY_EVENT);
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        emit(CONTROLLER_CHANGED_EVENT);
      });

      // Poll for updates: iOS PWA standalone sessions can live for hours
      // or days without the browser's built-in 24h update check ever
      // firing. Check on tab focus and every 30 minutes.
      const check = () => {
        registration.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("focus", check);
      setInterval(check, 30 * 60 * 1000);
    } catch (err) {
      console.warn("[sw] registration failed:", err);
    }
  });
}

function emit(name: string) {
  window.dispatchEvent(new CustomEvent(name));
}

/**
 * Tell the currently-waiting SW to activate itself. The 'controllerchange'
 * event will fire shortly after, which the caller should use as a cue
 * to reload the page so the new assets boot.
 */
export async function applyServiceWorkerUpdate(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting;
  if (waiting) {
    waiting.postMessage({ type: "SKIP_WAITING" });
    // controllerchange listener will reload.
  } else {
    window.location.reload();
  }
}
