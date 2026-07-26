const CACHE_VERSION = 'v28';
const CACHE_NAME = `jsem-smazka-${CACHE_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

const STYLE_ASSETS = [
  './styles.css',
  './face-warp.css?v=27',
  './face-warp-pro.css?v=22',
  './experience-upgrades.css',
  './diagnostic-upgrades.css',
  './ios-one-screen.css?v=27',
  './in-frame-result.css?v=24',
  './face-landmarks.css?v=25',
  './visual-system.css?v=28'
];

const SCRIPT_ASSETS = [
  './app.js?v=28',
  './face-scan.js?v=25',
  './face-warp.js?v=27',
  './hard-responses.js',
  './experience-upgrades.js?v=28',
  './diagnostic-upgrades.js?v=28',
  './privacy-hardening.js?v=20',
  './ios-one-screen.js?v=28',
  './in-frame-result.js?v=24'
];

const DATA_ASSETS = [
  './responses.json',
  './responses-hard.json'
];

const APP_SHELL = [
  ...CORE_ASSETS,
  ...STYLE_ASSETS,
  ...SCRIPT_ASSETS,
  ...DATA_ASSETS
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
