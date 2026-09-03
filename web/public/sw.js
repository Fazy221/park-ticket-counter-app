// Minimal app-shell cache. This app is served by the same on-site
// PocketBase instance it talks to (see README - no separate web server),
// so a service worker isn't covering some other-host outage scenario; it's
// here mainly so the PWA install prompt has one (browsers require a
// registered SW with a fetch handler to consider a site installable) and
// as a small bonus: the shell still loads if the laptop's own PocketBase
// process is mid-restart when a superadmin opens the app window.
const CACHE_NAME = "gatemark-superadmin-shell-v1";
const SHELL_PATHS = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_PATHS)).catch(() => {
      // Best-effort - a failed pre-cache shouldn't block install.
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for everything: this is a live dashboard against a local
// server, so a stale cached response is actively wrong far more often than
// it's useful. Cache is purely a last-resort fallback for the app shell
// itself (so the window isn't just a browser error page) - never for
// /api/* data.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return; // never intercept API calls

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
