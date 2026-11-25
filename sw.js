const CACHE_NAME = "framekit-v8";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./vendor/leaflet.css",
  "./vendor/leaflet.js",
  "./vendor/wlibraw/wlibraw.js",
  "./vendor/wlibraw/wlibraw.wasm",
  "./vendor/wlibraw/api.js",
  "./vendor/wlibraw/dispose.js",
  "./vendor/wlibraw/file.js",
  "./vendor/wlibraw/image.js",
  "./vendor/wlibraw/params.js",
  "./vendor/wlibraw/types.js",
  "./css/styles.css",
  "./js/i18n.js",
  "./js/gear.js",
  "./js/suncalc.js",
  "./js/extras.js",
  "./js/storage.js",
  "./js/raw_decoder.js",
  "./js/raw_worker.js",
  "./js/editor_engine.js",
  "./js/editor_ui.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Локальні файли додатка — cache-first із фоновим оновленням
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // Зовнішні ресурси (Leaflet, тайли карти) — network-first із fallback у кеш
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && (url.hostname.includes("unpkg") || url.hostname.includes("openstreetmap"))) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
