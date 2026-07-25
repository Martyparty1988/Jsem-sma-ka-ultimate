const CACHE_NAME = 'jsem-smazka-v17';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './face-warp.css',
  './result-fullscreen.css',
  './iphone-responsive.css',
  './experience-upgrades.css',
  './professional-polish.css?v=17',
  './app.js',
  './face-scan.js?v=17',
  './face-warp.js',
  './hard-responses.js',
  './experience-upgrades.js',
  './responses.json',
  './responses-hard.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', responseClone));
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || networkPromise.then((networkResponse) => (
        networkResponse || new Response('Offline', { status: 503, statusText: 'Offline' })
      ));
    })
  );
});