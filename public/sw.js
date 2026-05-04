// Service worker for Drumit.
//
// - Offline-capable: same-origin GETs are cached stale-while-revalidate.
// - Navigation (HTML) is network-first with a cache fallback, so redeploys
//   reach the page on the very next load (no "stuck on old app" trap).
// - Versioned cache name per build; install self-promotes immediately
//   (skipWaiting) but new JS doesn't control the page until the old tab
//   either closes or the main thread posts {type:"SKIP_WAITING"} and
//   reloads — see lib/registerServiceWorker.ts.
// - iOS PWA: main thread calls registration.update() on focus +
//   visibilitychange + a 30-min interval; updateViaCache=none on the
//   registration so the SW script bytes are re-fetched.

const VERSION = new URL(self.location).searchParams.get("v") ?? "dev";
const CACHE_NAME = `drumit-${VERSION}`;
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.addAll(SHELL);
      } catch {
        // Ignore shell-prime failures; fetch handler will still hydrate.
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("drumit-") && n !== CACHE_NAME)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(handle(request));
});

async function handle(request) {
  const cache = await caches.open(CACHE_NAME);

  // Navigation: always try network first so redeploys land immediately.
  // Fall back to cache only if the network is truly unreachable.
  if (request.mode === "navigate") {
    try {
      const resp = await fetch(request, { cache: "no-store" });
      if (resp.ok && resp.type === "basic") {
        cache.put(request, resp.clone()).catch(() => {});
      }
      return resp;
    } catch {
      const cached = await cache.match(request, { ignoreSearch: false });
      return cached ?? offlineFallback();
    }
  }

  // Assets: stale-while-revalidate.
  const cached = await cache.match(request, { ignoreSearch: false });
  const fetchPromise = fetch(request)
    .then((resp) => {
      if (resp.ok && resp.type === "basic") {
        cache.put(request, resp.clone()).catch(() => {});
      }
      return resp;
    })
    .catch(() => null);

  return cached ?? (await fetchPromise) ?? offlineFallback();
}

function offlineFallback() {
  return new Response("Offline", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain" },
  });
}
