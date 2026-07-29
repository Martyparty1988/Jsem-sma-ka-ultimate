const CACHE_VERSION = 'v86';
const CACHE_NAME = `jsem-smazka-${CACHE_VERSION}`;
const FACE_MODEL_CACHE = 'jsem-smazka-face-model-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  './foundation.css?v=86',
  './components.css?v=86',
  './screens.css?v=86',
  './app.js?v=86',
  './scanner-runtime.js?v=86',
  './result-runtime.js?v=86',
  './lifecycle-runtime.js?v=86',
  './responses.json',
  './responses-hard.json?v=64',
  './responses-pernik.json?v=64'
];

self.addEventListener(`install`, (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activation remains user-controlled through the visible update action.
});

self.addEventListener(`activate`, (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== FACE_MODEL_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener(`message`, (event) => {
  if (event.data?.type === `SKIP_WAITING`) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener(`fetch`, (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return (await caches.match('./index.html'))
          || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  /*
   * MediaPipe is intentionally absent from APP_SHELL. Only files requested by
   * the compatible browser path are retained, so install never downloads both
   * WASM variants and UI releases do not evict the large model cache.
   */
  if (requestUrl.pathname.includes('/vendor/mediapipe-face-mesh/')) {
    event.respondWith((async () => {
      const cache = await caches.open(FACE_MODEL_CACHE);
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) return cachedResponse;

      const networkResponse = await fetch(event.request);
      if (networkResponse.ok) {
        await cache.put(event.request, networkResponse.clone());
      }
      return networkResponse;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) return cachedResponse;

    try {
      const networkResponse = await fetch(event.request);
      if (networkResponse.ok) {
        await cache.put(event.request, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
