const CACHE_VERSION = 'v72';
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
  './bundle-base.css?v=60',
  './bundle-scanner.css?v=60',
  './bundle-results.css?v=60',
  './scan-theme.css?v=65',
  './result-mobile-v71.css?v=71'
];

const SCRIPT_ASSETS = [
  './app.js?v=64',
  './face-aware-crop.js?v=72',
  './vendor/mediapipe-face-mesh/face_mesh.js?v=0.4.1633559619',
  './face-scan.js?v=64',
  './devastation-metrics.js?v=64',
  './face-warp.js?v=64',
  './face-aware-crop-runtime.js?v=72',
  './face-warp-geometry.js?v=63',
  './hard-responses.js?v=64',
  './junky-verdict-engine.js?v=64',
  './verdict-matcher.js?v=64',
  './terminal-readout.js?v=60',
  './experience-upgrades.js?v=60',
  './diagnostic-upgrades.js?v=60',
  './pwa-update-fix.js?v=68',
  './privacy-hardening.js?v=72',
  './ios-one-screen.js?v=60',
  './in-frame-result.js?v=71',
  './scanner-focus.js?v=60',
  './face-guidance.js?v=60',
  './share-cover.js?v=72',
  './result-intensity.js?v=60',
  './junkie-polish-v55.js?v=60',
  './boot-message-v54.js?v=60',
  './result-close-reset-v58.js?v=60'
];

const DATA_ASSETS = [
  './responses.json',
  './responses-hard.json?v=64',
  './responses-pernik.json?v=64'
];

const FACE_MODEL_ASSETS = [
  './vendor/mediapipe-face-mesh/face_mesh.binarypb',
  './vendor/mediapipe-face-mesh/face_mesh_solution_packed_assets_loader.js',
  './vendor/mediapipe-face-mesh/face_mesh_solution_packed_assets.data',
  './vendor/mediapipe-face-mesh/face_mesh_solution_simd_wasm_bin.data',
  './vendor/mediapipe-face-mesh/face_mesh_solution_simd_wasm_bin.js',
  './vendor/mediapipe-face-mesh/face_mesh_solution_simd_wasm_bin.wasm',
  './vendor/mediapipe-face-mesh/face_mesh_solution_wasm_bin.js',
  './vendor/mediapipe-face-mesh/face_mesh_solution_wasm_bin.wasm'
];

const APP_SHELL = [
  ...CORE_ASSETS,
  ...STYLE_ASSETS,
  ...SCRIPT_ASSETS,
  ...DATA_ASSETS,
  ...FACE_MODEL_ASSETS
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Do not activate automatically. The visible update button decides when the
  // new worker takes control, which avoids the iOS race where `waiting`
  // disappears before the tap handler runs.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Navigation: network-first, fallback to cache
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

  // MediaPipe WASM/binary: cache-first (immutable heavy assets)
  if (requestUrl.pathname.includes('/vendor/mediapipe-face-mesh/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        });
      })
    );
    return;
  }

  // Everything else: stale-while-revalidate
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
