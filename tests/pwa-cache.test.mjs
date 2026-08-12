import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { readBundleSection, readRoot } from './bundle-source.mjs';

const root = new URL('../', import.meta.url);

function serviceWorkerContract() {
  const source = `${readRoot('service-worker.js')}\nglobalThis.__PWA_TEST__ = { CACHE_NAME, FACE_MODEL_CACHE, APP_SHELL };`;
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

test('PWA v119 precaches one compact production shell with three CSS authorities', () => {
  const { CACHE_NAME, APP_SHELL } = serviceWorkerContract();
  const assets = new Set(APP_SHELL);

  assert.equal(CACHE_NAME, 'jsem-smazka-v119');
  [
    './foundation.css?v=104',
    './components.css?v=87',
    './screens.css?v=119',
    './kartoteka-runtime.js?v=118',
    './app.js?v=119',
    './scanner-runtime.js?v=117',
    './result-runtime.js?v=115',
    './lifecycle-runtime.js?v=115',
    './result-poster-runtime.js?v=101',
    './devastation-metrics.js?v=113',
    './face-warp-geometry.js?v=113',
    './junkie-vision-photo-v81.js?v=81',
    './junkie-vision-noise-v81.js?v=81',
    './verdict-matcher.js?v=64',
    './responses.json',
    './responses-hard.json?v=64',
    './responses-pernik.json?v=64'
  ].forEach((asset) => assert.equal(assets.has(asset), true, asset));

  [
    './result-layout.css?v=88',
    './result-poster.css?v=103',
    './result-poster.css?v=89',
    './result-poster.css?v=91',
    './result-poster.css?v=92',
    './result-poster.css?v=93',
    './result-poster.css?v=94',
    './result-poster.css?v=101',
    './result-poster.css?v=102',
    './foundation.css?v=87',
    './screens.css?v=100',
    './screens.css?v=106',
    './app.js?v=98',
    './scanner-runtime.js?v=87',
    './scanner-runtime.js?v=113',
    './lifecycle-runtime.js?v=98',
    './result-poster-runtime.js?v=89',
    './result-poster-runtime.js?v=91',
    './result-poster-runtime.js?v=92',
    './result-poster-runtime.js?v=93',
    './result-poster-runtime.js?v=94',
    './result-poster-runtime.js?v=99',
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

test('HTML entries, bundle sections and dynamic files agree with the v119 cache graph', () => {
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
    const appShellAsset = asset.startsWith('./') ? asset : `./${asset}`;
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
    assert.equal(appAssets.has(appShellAsset), true, `${asset} must install before the offline shell activates`);
  });
});

test('v119 shell keeps the consolidated poster rules and v101 runtime authoritative', () => {
  const index = readRoot('index.html');
  const css = readRoot('screens.css');
  const screens = css;
  const runtime = readRoot('result-poster-runtime.js');
  const serviceWorker = readRoot('service-worker.js');

  assert.equal(fs.existsSync(new URL('result-layout.css', root)), false);
  assert.equal(fs.existsSync(new URL('result-poster.css', root)), false);
  assert.doesNotMatch(index, /result-layout\.css/);
  assert.doesNotMatch(index, /result-poster\.css/);
  assert.doesNotMatch(serviceWorker, /result-layout\.css/);
  assert.doesNotMatch(serviceWorker, /result-poster\.css/);
  assert.match(index, /screens\.css\?v=119/);
  assert.deepEqual(
    [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]),
    ['foundation.css?v=104', 'components.css?v=87', 'screens.css?v=119']
  );
  assert.ok(index.indexOf('result-poster-runtime.js?v=101') > index.indexOf('lifecycle-runtime.js?v=115'));
  assert.match(index, /class="result result-poster-v99 hidden"/);
  assert.match(index, /data-result-poster="v99"/);

  assert.doesNotThrow(() => new Function(runtime));
  assert.match(runtime, /const VERSION = 'v101'/);
  assert.match(runtime, /const POSTER_CLASS = 'result-poster-v99'/);
  assert.match(runtime, /badge\.textContent !== 'SMAŽKA FAKTOR'/);
  assert.match(runtime, /replacement\.dataset\.posterOwner = VERSION/);
  assert.match(runtime, /document\.body\.classList\.remove\('result-in-frame'\)/);
  assert.doesNotMatch(runtime, /document\.body\.classList\.add\('result-in-frame'\)/);
  assert.match(runtime, /window\.SmazkaResultPoster = Object\.freeze\(\{ version: 101/);
  assert.doesNotMatch(runtime, /setImportant|viewportMetrics|syncClosedComposition|syncDetailsComposition/);
  assert.doesNotMatch(runtime, /padding-top|object-position|100dvh|visualViewport\?\.width/);

  assert.match(css, /\.result-poster-v99:not\(\.details-open\) \.result-visual\s*\{[\s\S]*position:\s*fixed\s*!important/);
  assert.doesNotMatch(css, /display:\s*contents\s*!important/);
  assert.doesNotMatch(css, /result-badge::after|content:\s*'SMAŽKA FAKTOR'/);
  assert.match(css, /\.result-poster-v99:not\(\.details-open\) \.result-visual img/);
  assert.match(css, /position:\s*fixed\s*!important/);
  assert.match(css, /width:\s*100dvw\s*!important/);
  assert.match(css, /--poster-photo-height:\s*clamp\(320px, 52dvh, 440px\)/);
  assert.match(css, /height:\s*var\(--poster-photo-height\)\s*!important/);
  assert.match(css, /grid-template-rows:\s*var\(--poster-photo-height\) auto auto auto auto auto/);
  assert.doesNotMatch(css, /\.result-poster-v99:not\(\.details-open\) \.result-visual[\s\S]{0,360}height:\s*100dvh/);
  assert.doesNotMatch(screens, /\.result:not\(\.hidden\) \.result-content\s*\{\s*animation:\s*resultContentReveal/);
  assert.doesNotMatch(screens, /\.result:not\(\.hidden\) \.result-visual\s*\{[\s\S]{0,160}animation:\s*(?:resultVisualReveal|professionalResultReveal)/);
  assert.match(screens, /\.result:not\(\.hidden\):not\(\.result-poster-v99\) \.result-content\s*\{\s*animation:\s*resultContentReveal/);
  assert.match(screens, /\.result:not\(\.result-poster-v99\) \.result-visual img\s*\{\s*animation:\s*meltReveal/);
  assert.match(css, /grid-row:\s*2/);
  assert.match(css, /grid-column:\s*1\s*!important/);
  assert.match(css, /\.effect-label\.result-score[\s\S]*position:\s*relative\s*!important/);
  assert.match(css, /grid-row:\s*3/);
  assert.match(css, /grid-row:\s*4/);
  assert.match(css, /grid-row:\s*5/);
  assert.match(css, /grid-row:\s*6/);
  assert.match(css, /width:\s*44px\s*!important/);
  assert.match(css, /min-height:\s*44px\s*!important/);
  assert.match(css, /\.result-poster-v99 \.in-frame-details-toggle\s*\{[\s\S]{0,180}display:\s*inline-flex\s*!important/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/);
  assert.match(css, /\.result-poster-v99:not\(\.details-open\) \.share-button\s*\{[\s\S]{0,120}grid-column:\s*1 \/ -1\s*!important/);
  assert.match(css, /\.result-poster-v99:not\(\.details-open\) \.destroy-more-button\s*\{[\s\S]{0,120}grid-column:\s*1\s*!important/);
  assert.match(css, /\.result-poster-v99:not\(\.details-open\) \.new-scan-button\s*\{[\s\S]{0,120}grid-column:\s*2\s*!important/);
  assert.doesNotMatch(css, /\.result-poster-v99:not\(\.details-open\) \.in-frame-details-toggle\s*\{[\s\S]{0,500}min-height:\s*34px/);
  assert.match(css, /\.result-poster-v99\.details-open \.effect-label,[\s\S]{0,160}position:\s*relative\s*!important/);
  assert.doesNotMatch(css, /\.result-poster-v99\.details-open \.effect-label,[\s\S]{0,180}bottom:\s*12px\s*!important/);
  assert.match(css, /\.result-poster-v99\.details-open \.result-content > \*\s*\{\s*flex:\s*0 0 auto/);
  assert.match(css, /\.result-poster-v99\.details-open \.result-actions\s*\{[\s\S]{0,160}grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/);
  assert.match(css, /\.result-poster-v99\.details-open \.share-button\s*\{[\s\S]{0,120}grid-column:\s*1 \/ -1\s*!important/);
  assert.match(css, /\.result-poster-v99\.details-open \.result-tool-grid\s*\{[\s\S]{0,160}grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/);
  assert.match(css, /\.result-poster-v99\.details-open \.result-tool-button:first-child\s*\{[\s\S]{0,80}grid-column:\s*1 \/ -1\s*!important/);
  assert.match(css, /\.result-poster-v99\.details-open \.diagnostic-row\s*\{[\s\S]{0,100}opacity:\s*1\s*!important/);
  assert.match(css, /grid-template-columns:\s*auto minmax\(0, 1fr\)/);
  assert.match(css, /linear-gradient\(100deg, #2edaf0 0%, #22e8d0 53%, #30f2a0 100%\)/);
  assert.doesNotMatch(css, /bottom:\s*calc\(var\(--result-safe-bottom\) \+ 278px\)/);
  assert.doesNotMatch(css, /top:\s*48%\s*!important/);

  assert.doesNotMatch(index, /result-poster\.css|result-poster-runtime\.js\?v=(?:89|91|92|93|94|95|98|99)/);
  assert.doesNotMatch(css, /result-poster-v(?:89|91|92|93|94|95|98)/);
});

test('result, crop, recovery, single-pass, impact and share keep authoritative order', () => {
  const index = readRoot('index.html');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const stylesheetOrder = [
    'foundation.css?v=104',
    'components.css?v=87',
    'screens.css?v=119'
  ];
  const indexOrder = [
    'kartoteka-runtime.js?v=118',
    'app.js?v=119',
    'scanner-runtime.js?v=117',
    'result-runtime.js?v=115',
    'lifecycle-runtime.js?v=115',
    'result-poster-runtime.js?v=101'
  ];
  const lifecycleOrder = [
    'face-aware-crop-runtime.js',
    'analysis-state-stability-v84.js',
    'analysis-completion-guard-v84.js',
    'analysis-rescue-v85.js',
    'single-pass-result-v76.js',
    'critical-impact-reveal-v82.js',
    'share-cover-v77.js'
  ];

  let previousIndex = -1;
  stylesheetOrder.forEach((asset) => {
    const current = index.indexOf(asset);
    assert.ok(current > previousIndex, asset);
    previousIndex = current;
  });

  previousIndex = -1;
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
    readRoot('lifecycle-runtime.js'),
    readRoot('result-poster-runtime.js')
  ].join('\n');

  assert.match(app, /new NativeMutationObserver\(dispatchRecords\)/);
  assert.match(app, /window\.SmazkaMutationObserver = SharedMutationObserver/);
  assert.equal((linkedRuntime.match(/\bnew\s+MutationObserver\b/g) || []).length, 0);
});

test('retired source files and result layout layers cannot return', () => {
  [
    'result-layout.css',
    'result-poster.css',
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
  assert.doesNotMatch(index, /share-card\.png|result-layout\.css|result-poster\.css/);
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
