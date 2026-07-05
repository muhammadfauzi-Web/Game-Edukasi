/**
 * Edukasi Service Worker
 * Strategy: cache-first for core app shell assets, falling back to the
 * network when a resource isn't cached yet, and falling back to the
 * cache when the network is unavailable (offline support).
 */

const CACHE_NAME = "edukasi-cache-v3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./manifest.json",
  "./data/data.json",
  "./icon-192.png",
  "./icon-512.png",
  "./audio/click.mp3",
  "./audio/correct.mp3",
  "./audio/wrong.mp3",
  "./audio/finish.mp3",
  "./audio/bgm.mp3"
];

// ---- INSTALL: pre-cache the app shell ----
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE: clean up old cache versions ----
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---- FETCH: cache-first, network fallback, offline fallback to cache ----
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache immediately, but also refresh it in the
        // background so the cache stays reasonably up to date.
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      }

      // Not in cache: try the network, then cache it for next time.
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline and not cached: fall back to the home page if
          // it's a navigation request, otherwise fail gracefully.
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("", { status: 408, statusText: "Offline" });
        });
    })
  );
});
