const CACHE_NAME = 'jsem-smazka-v22';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './face-warp.css?v=22',
  './face-warp-pro.css?v=22',
  './result-fullscreen.css',
  './iphone-responsive.css',
  './experience-upgrades.css',
  './professional-polish.css?v=18',
  './camera-cleanup.css?v=18',
  './diagnostic-upgrades.css',
  './ios-one-screen.css?v=21',
  './app.js',
  './face-scan.js?v=18',
  './face-warp.js?v=22',
  './hard-responses.js',
  './experience-upgrades.js',
  './diagnostic-upgrades.js',
  './privacy-hardening.js?v=20',
  './ios-one-screen.js?v=21',
  './responses.json',
  './responses-hard.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
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
