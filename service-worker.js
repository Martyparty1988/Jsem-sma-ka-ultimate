const CACHE_VERSION = 'v105';
const CACHE_NAME = `jsem-smazka-${CACHE_VERSION}`;
const FACE_MODEL_CACHE = 'jsem-smazka-face-model-v1';
const UPDATE_STATE_KEY = './__smazka-update-state-v105';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  './foundation.css?v=104',
  './components.css?v=87',
  './screens.css?v=104',
  './result-poster.css?v=103',
  './app.js?v=104',
  './scanner-runtime.js?v=105',
  './result-runtime.js?v=88',
  './lifecycle-runtime.js?v=105',
  './result-poster-runtime.js?v=100',
  './responses.json',
  './responses-hard.json?v=64',
  './responses-pernik.json?v=64'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const isUpdate = Boolean(self.registration.active);
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await cache.put(UPDATE_STATE_KEY, new Response(isUpdate ? 'reload' : 'first-install'));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const updateState = await cache.match(UPDATE_STATE_KEY);
    const shouldReloadClients = (await updateState?.text()) === 'reload';
    await cache.delete(UPDATE_STATE_KEY);

    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME && key !== FACE_MODEL_CACHE)
        .map((key) => caches.delete(key))
    );

    await self.clients.claim();
    if (!shouldReloadClients) return;

    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    await Promise.all(clients.map(async (client) => {
      try {
        const url = new URL(client.url);
        if (url.origin !== self.location.origin) return;
        await client.navigate(url.href);
      } catch {
        // Safari can close a tab between matchAll() and navigate().
      }
    }));
  })());
});

self.addEventListener('fetch', (event) => {
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

  /* MediaPipe remains in a stable request-driven cache, outside UI releases. */
  if (requestUrl.pathname.includes('/vendor/mediapipe-face-mesh/')) {
    event.respondWith((async () => {
      const cache = await caches.open(FACE_MODEL_CACHE);
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) return cachedResponse;

      const networkResponse = await fetch(event.request);
      if (networkResponse.ok) await cache.put(event.request, networkResponse.clone());
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
      if (networkResponse.ok) await cache.put(event.request, networkResponse.clone());
      return networkResponse;
    } catch {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
