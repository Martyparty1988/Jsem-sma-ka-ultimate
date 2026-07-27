const CACHE_VERSION = 'v55';
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
  './diagnostic-upgrades.css?v=33',
  './ios-one-screen.css?v=27',
  './in-frame-result.css?v=24',
  './face-landmarks.css?v=29',
  './visual-system.css?v=29',
  './quiet-scan.css?v=37',
  './scanner-focus.css?v=42',
  './face-guidance.css?v=49',
  './result-transition.css?v=45',
  './result-intensity.css?v=47',
  './junkie-face-effect.css?v=52',
  './result-viewport-v53.css?v=53',
  './pwa-shell-v54.css?v=54',
  './junkie-transition-v55.css?v=55'
];

const SCRIPT_ASSETS = [
  './app.js?v=36',
  './vendor/mediapipe-face-mesh/face_mesh.js?v=0.4.1633559619',
  './face-scan.js?v=31',
  './face-warp.js?v=27',
  './hard-responses.js?v=31',
  './junky-verdict-engine.js?v=40',
  './experience-upgrades.js?v=31',
  './diagnostic-upgrades.js?v=33',
  './privacy-hardening.js?v=20',
  './ios-one-screen.js?v=41',
  './in-frame-result.js?v=53',
  './scanner-focus.js?v=45',
  './face-guidance.js?v=49',
  './share-cover.js?v=52',
  './result-intensity.js?v=47',
  './junkie-face-effect.js?v=52',
  './junkie-polish-v55.js?v=55',
  './boot-message-v54.js?v=54'
];

const DATA_ASSETS = [
  './responses.json',
  './responses-hard.json?v=31',
  './responses-pernik.json?v=40'
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
