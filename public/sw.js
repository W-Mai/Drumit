// Minimal service worker for Drumit. Goal:
//   - Make the app work offline on repeat visits (served from cache).
//   - Keep cached assets fresh in the background (stale-while-revalidate).
//   - Never intercept POST / analytics-like requests.
//   - Never cache cross-origin requests — they get passed through.
//
// The cache name is versioned so deploying a new build invalidates
// everything cleanly. Main-thread reads the build version and
// registers this SW with ?v=<version>; the URL change forces the
// browser to treat each version as a fresh SW install.

const VERSION = new URL(self.location).searchParams.get("v") ?? "dev";
const CACHE_NAME = `drumit-${VERSION}`;

// Under GitHub Pages this SW is scoped to /Drumit/. The SHELL list is a
// best-effort list of URLs that, if cached, let the app boot offline.
// We only prime the shell on install for the bare minimum; everything
// else comes in organically via the fetch handler.
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
      await self.skipWaiting();
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Same-origin only. Drumit doesn't make third-party calls we care to
  // cache; passing them through keeps the SW out of their way.
  if (url.origin !== self.location.origin) return;

  event.respondWith(handle(request));
});

async function handle(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: false });
  const fetchPromise = fetch(request)
    .then((resp) => {
      // Only cache ok same-origin responses.
      if (resp.ok && resp.type === "basic") {
        cache.put(request, resp.clone()).catch(() => {});
      }
      return resp;
    })
    .catch(() => null);

  // For navigation requests (HTML page loads) prefer network — it
  // usually has the freshest asset manifest hashes. Fall back to cache
  // offline.
  if (request.mode === "navigate") {
    return (await fetchPromise) ?? cached ?? offlineFallback();
  }
  // For everything else, stale-while-revalidate.
  return cached ?? (await fetchPromise) ?? offlineFallback();
}

function offlineFallback() {
  return new Response("Offline", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain" },
  });
}
