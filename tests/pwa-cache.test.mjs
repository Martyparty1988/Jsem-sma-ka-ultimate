import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { readBundleSection, readRoot } from './bundle-source.mjs';

const root = new URL('../', import.meta.url);

function serviceWorkerContract() {
  const source = `${readRoot('service-worker.js')}
globalThis.__PWA_TEST__ = { CACHE_NAME, FACE_MODEL_CACHE, APP_SHELL };`;
  const context = {
    URL,
    Response,
    fetch() {},
    caches: {},
    self: {
      addEventListener() {},
      skipWaiting() {},
      clients: { claim() {} },
      location: { origin: 'http://localhost' }
    }
  };
  vm.runInNewContext(source, context);
  return context.__PWA_TEST__;
}

test('PWA v89 precaches one compact production shell with no retired entries', () => {
  const { CACHE_NAME, APP_SHELL } = serviceWorkerContract();
  const assets = new Set(APP_SHELL);

  assert.equal(CACHE_NAME, 'jsem-smazka-v89');
  [
    './foundation.css?v=89',
    './components.css?v=89',
    './screens.css?v=89',
    './app.js?v=89',
    './scanner-runtime.js?v=89',
    './result-runtime.js?v=89',
    './lifecycle-runtime.js?v=89',
    './responses.json',
    './responses-hard.json?v=64',
    './responses-pernik.json?v=64'
  ].forEach((asset) => assert.equal(assets.has(asset), true, asset));

  [
    './bundle-base.css?v=60',
    './scan-theme.css?v=65',
    './legacy-share-bypass-v79.js?v=79',
    './face-scan.js?v=64',
    './terminal-readout.js?v=60',
    './share-cover.js?v=72',
    './result-mobile-v70.css?v=70'
  ].forEach((asset) => assert.equal(assets.has(asset), false, asset));

  APP_SHELL.forEach((asset) => {
    const pathname = asset.replace(/^\.\//, '').split('?')[0] || 'index.html';
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
  });
});

test('MediaPipe uses a stable request-driven cache and never install-precaches WASM', () => {
  const { FACE_MODEL_CACHE, APP_SHELL } = serviceWorkerContract();
  const serviceWorker = readRoot('service-worker.js');

  assert.equal(FACE_MODEL_CACHE, 'jsem-smazka-face-model-v1');
  assert.doesNotMatch(serviceWorker, /FACE_MODEL_ASSETS|ensureFaceModelCache/);
  assert.doesNotMatch(serviceWorker, /face_mesh_solution_.*\.(?:wasm|data|js)/);
  assert.doesNotMatch(APP_SHELL.join('\n'), /vendor\/mediapipe-face-mesh/);
  assert.match(serviceWorker, /requestUrl\.pathname\.includes\('\/vendor\/mediapipe-face-mesh\/'\)/);
  assert.match(serviceWorker, /key !== CACHE_NAME && key !== FACE_MODEL_CACHE/);
});

test('HTML entries, bundle sections and dynamic files agree with the v89 cache graph', () => {
  const { APP_SHELL } = serviceWorkerContract();
  const appAssets = new Set(APP_SHELL);
  const index = readRoot('index.html');

  [...index.matchAll(/<script defer src="([^"]+)"/g)]
    .map((match) => `./${match[1]}`)
    .forEach((asset) => assert.equal(appAssets.has(asset), true, asset));

  [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
    .map((match) => `./${match[1]}`)
    .forEach((asset) => assert.equal(appAssets.has(asset), true, asset));

  const scanner = readRoot('scanner-runtime.js');
  const result = readRoot('result-runtime.js');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const dynamicAssets = [
    scanner.match(/METRICS_MODULE_URL = '([^']+)'/)?.[1],
    scanner.match(/photoRuntimeUrl = '([^']+)'/)?.[1],
    scanner.match(/noiseRuntimeUrl = '([^']+)'/)?.[1],
    result.match(/GEOMETRY_MODULE_URL = '([^']+)'/)?.[1],
    result.match(/MATCHER_URL = '([^']+)'/)?.[1],
    result.match(/PACK_URL = '([^']+)'/)?.[1],
    lifecycle.match(/METRICS_MODULE_URL = '([^']+)'/)?.[1]
  ].filter(Boolean);

  dynamicAssets.forEach((asset) => {
    const pathname = asset.replace(/^\.\//, '').split('?')[0];
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
  });
});

test('result, crop, recovery, single-pass, impact and share keep authoritative order', () => {
  const index = readRoot('index.html');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const indexOrder = ['app.js?v=89', 'scanner-runtime.js?v=89', 'result-runtime.js?v=89', 'lifecycle-runtime.js?v=89'];
  const lifecycleOrder = [
    'result-frame-geometry.js',
    'in-frame-result.js',
    'face-aware-crop-runtime.js',
    'analysis-state-stability-v84.js',
    'analysis-completion-guard-v84.js',
    'analysis-rescue-v85.js',
    'single-pass-result-v76.js',
    'critical-impact-reveal-v82.js',
    'share-cover-v77.js'
  ];

  let previousIndex = -1;
  indexOrder.forEach((asset) => {
    const current = index.indexOf(asset);
    assert.ok(current > previousIndex, asset);
    previousIndex = current;
  });

  previousIndex = -1;
  lifecycleOrder.forEach((source) => {
    const current = lifecycle.indexOf(`/* === ${source} === */`);
    assert.ok(current > previousIndex, source);
    previousIndex = current;
  });
});

test('camera and Face Mesh initialization are user-gated, idempotent and retryable', () => {
  const app = readRoot('app.js');
  const scanner = readBundleSection('face-scan.js');
  const index = readRoot('index.html');

  assert.match(index, />Vstoupit do portálu</);
  assert.doesNotMatch(index, /vendor\/mediapipe-face-mesh\/face_mesh\.js/);
  assert.match(app, /cameraActivated: false/);
  assert.match(app, /source: 'portal-tap'/);
  assert.match(app, /state\.cameraActivated/);
  assert.doesNotMatch(app.slice(-2600), /\binitCamera\s*\(\s*\)\s*;/);

  assert.match(scanner, /let faceRuntimePromise = null/);
  assert.match(scanner, /let faceMeshInitPromise = null/);
  assert.match(scanner, /if \(faceRuntimePromise\) return faceRuntimePromise/);
  assert.match(scanner, /if \(faceMeshInitPromise\) return faceMeshInitPromise/);
  assert.match(scanner, /faceRuntimePromise = null/);
  assert.match(scanner, /ensureReady: initializeFaceMesh/);
  assert.match(scanner, /Rozhraní je offline připravené/);
});

test('all DOM watchers share one native MutationObserver', () => {
  const app = readRoot('app.js');
  const linkedRuntime = [
    app,
    readRoot('scanner-runtime.js'),
    readRoot('result-runtime.js'),
    readRoot('lifecycle-runtime.js')
  ].join('\n');

  assert.match(app, /new NativeMutationObserver\(dispatchRecords\)/);
  assert.match(app, /window\.SmazkaMutationObserver = SharedMutationObserver/);
  assert.equal((linkedRuntime.match(/\bnew\s+MutationObserver\b/g) || []).length, 0);
});

test('retired source files and the invalid social-card placeholder cannot return', () => {
  [
    'junkie-face-effect.js',
    'share-card.png',
    'bundle-base.css',
    'bundle-scanner.css',
    'bundle-results.css',
    'scan-theme.css',
    'analysis-rescue-v85.js',
    'critical-impact-reveal-v82.css',
    'legacy-share-bypass-v79.js'
  ].forEach((file) => assert.equal(fs.existsSync(new URL(file, root)), false, file));

  const index = readRoot('index.html');
  assert.doesNotMatch(index, /share-card\.png/);
  assert.match(index, /icon-512\.png/);
});

test('v79 and v80 performance guards remain active inside production bundles', () => {
  const bypass = readBundleSection('legacy-share-bypass-v79.js');
  const optimizer = readBundleSection('face-input-optimizer-v80.js');

  assert.match(bypass, /numericValue === 1080/);
  assert.match(bypass, /numericValue === 1350/);
  assert.match(bypass, /canvas\.dataset\.legacyShareBypass = 'v79'/);
  assert.match(optimizer, /const IDLE_MAX_EDGE = 512/);
  assert.match(optimizer, /const SCAN_MAX_EDGE = 640/);
  assert.match(optimizer, /source instanceof HTMLVideoElement/);
  assert.match(optimizer, /key === state\.lastFrameKey/);
});
