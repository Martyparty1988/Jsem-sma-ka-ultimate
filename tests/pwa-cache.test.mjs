import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

function serviceWorkerContract() {
  const source = `${read('service-worker.js')}
globalThis.__PWA_TEST__ = { CACHE_NAME, FACE_MODEL_CACHE, APP_SHELL, FACE_MODEL_ASSETS };`;
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

test('PWA v85 caches every current runtime, style and data dependency', () => {
  const { CACHE_NAME, APP_SHELL } = serviceWorkerContract();
  const assets = new Set(APP_SHELL);

  assert.equal(CACHE_NAME, 'jsem-smazka-v85');
  [
    './app.js?v=64',
    './legacy-share-bypass-v79.js?v=79',
    './face-aware-crop.js?v=72',
    './face-input-optimizer-v80.js?v=80',
    './face-landmark-bridge-v81.js?v=81',
    './hud-junkie-themes.js?v=81',
    './junkie-vision-hud-v81.js?v=81',
    './junkie-vision-balance-v83.js?v=83',
    './junkie-vision-photo-v81.js?v=81',
    './junkie-vision-noise-v81.js?v=81',
    './junkie-vision-hud-v81.css?v=81',
    './junkie-vision-balance-v83.css?v=83',
    './critical-impact-reveal-v82.js?v=82',
    './critical-impact-reveal-v82.css?v=82',
    './analysis-state-stability-v84.js?v=84',
    './analysis-completion-guard-v84.js?v=84',
    './analysis-completion-guard-v84.css?v=84',
    './analysis-rescue-v85.js?v=85',
    './analysis-rescue-v85.css?v=85',
    './face-aware-crop-runtime.js?v=72',
    './face-scan.js?v=64',
    './devastation-metrics.js?v=64',
    './face-warp.js?v=64',
    './hard-responses.js?v=64',
    './junky-verdict-engine.js?v=75',
    './verdict-matcher.js?v=64',
    './privacy-hardening.js?v=72',
    './share-cover-v77.js?v=77',
    './result-frame-geometry.js?v=73',
    './in-frame-result.js?v=73',
    './single-pass-result-v76.js?v=76',
    './result-mobile-v71.css?v=71',
    './responses.json',
    './responses-hard.json?v=64',
    './responses-pernik.json?v=64'
  ].forEach((asset) => assert.equal(assets.has(asset), true, asset));

  [
    './share-cover.js?v=72',
    './terminal-readout.js?v=60',
    './junky-verdict-engine.js?v=64',
    './in-frame-result.js?v=71',
    './result-mobile-v70.css?v=70',
    './result-layout-fix-v69.js?v=69'
  ].forEach((asset) => assert.equal(assets.has(asset), false, asset));

  APP_SHELL.forEach((asset) => {
    const pathname = asset.replace(/^\.\//, '').split('?')[0] || 'index.html';
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
  });
});

test('MediaPipe model files remain in the stable cache across v85 updates', () => {
  const { FACE_MODEL_CACHE, APP_SHELL, FACE_MODEL_ASSETS } = serviceWorkerContract();
  const appAssets = new Set(APP_SHELL);
  const serviceWorker = read('service-worker.js');

  assert.equal(FACE_MODEL_CACHE, 'jsem-smazka-face-model-v1');
  assert.ok(FACE_MODEL_ASSETS.length >= 9);
  FACE_MODEL_ASSETS.forEach((asset) => {
    assert.equal(appAssets.has(asset), false, `${asset} must not be tied to v85`);
    const pathname = asset.replace(/^\.\//, '').split('?')[0];
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
  });
  assert.match(serviceWorker, /async function ensureFaceModelCache\(\)/);
  assert.match(serviceWorker, /key !== CACHE_NAME && key !== FACE_MODEL_CACHE/);
});

test('HTML and dynamic module URLs agree with the v85 cache graph', () => {
  const { APP_SHELL, FACE_MODEL_ASSETS } = serviceWorkerContract();
  const appAssets = new Set(APP_SHELL);
  const allCachedAssets = new Set([...APP_SHELL, ...FACE_MODEL_ASSETS]);
  const index = read('index.html');

  [...index.matchAll(/<script defer src="([^"]+)"/g)]
    .map((match) => `./${match[1]}`)
    .forEach((asset) => assert.equal(allCachedAssets.has(asset), true, asset));

  [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
    .map((match) => `./${match[1]}`)
    .forEach((asset) => assert.equal(appAssets.has(asset), true, asset));

  const theme = read('hud-junkie-themes.js');
  const dynamicAssets = [
    read('face-scan.js').match(/METRICS_MODULE_URL = '([^']+)'/)?.[1],
    read('face-warp.js').match(/GEOMETRY_MODULE_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/MATCHER_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/PACK_URL = '([^']+)'/)?.[1],
    read('analysis-completion-guard-v84.js').match(/METRICS_MODULE_URL = '([^']+)'/)?.[1],
    theme.match(/photoRuntimeUrl = '([^']+)'/)?.[1],
    theme.match(/noiseRuntimeUrl = '([^']+)'/)?.[1]
  ].filter(Boolean).map((asset) => asset.startsWith('./') ? asset : `./${asset}`);

  dynamicAssets.forEach((asset) => assert.equal(appAssets.has(asset), true, asset));
});

test('result, crop, completion guard, delayed rescue, single-pass, impact reveal and share runtimes keep authoritative order', () => {
  const { APP_SHELL } = serviceWorkerContract();
  const index = read('index.html');
  const ordered = [
    'result-frame-geometry.js?v=73',
    'in-frame-result.js?v=73',
    'face-aware-crop-runtime.js?v=72',
    'analysis-state-stability-v84.js?v=84',
    'analysis-completion-guard-v84.js?v=84',
    'analysis-rescue-v85.js?v=85',
    'single-pass-result-v76.js?v=76',
    'critical-impact-reveal-v82.js?v=82',
    'share-cover-v77.js?v=77'
  ];

  let previousIndex = -1;
  ordered.forEach((asset) => {
    const current = index.indexOf(asset);
    assert.ok(current > previousIndex, asset);
    previousIndex = current;
  });

  previousIndex = -1;
  ordered.forEach((asset) => {
    const current = APP_SHELL.indexOf(`./${asset}`);
    assert.ok(current > previousIndex, asset);
    previousIndex = current;
  });
});

test('retired terminal, legacy share render and old mobile layout cannot return', () => {
  const engine = read('junky-verdict-engine.js');
  const serviceWorker = read('service-worker.js');
  const index = read('index.html');

  assert.doesNotMatch(engine, /TERMINAL_URL|scheduleTerminalReadout|animateTerminalReadout/);
  assert.doesNotMatch(serviceWorker, /terminal-readout|share-cover\.js\?v=72|result-mobile-v70/);
  assert.doesNotMatch(index, /terminal-readout|share-cover\.js\?v=72|result-mobile-v70|result-layout-fix-v69/);
  assert.equal(fs.existsSync(new URL('terminal-readout.js', root)), false);
});

test('v79 and v80 performance guards remain active under v85', () => {
  const bypass = read('legacy-share-bypass-v79.js');
  const optimizer = read('face-input-optimizer-v80.js');

  assert.match(bypass, /numericValue === 1080/);
  assert.match(bypass, /numericValue === 1350/);
  assert.match(bypass, /canvas\.dataset\.legacyShareBypass = 'v79'/);
  assert.match(optimizer, /const IDLE_MAX_EDGE = 512/);
  assert.match(optimizer, /const SCAN_MAX_EDGE = 640/);
  assert.match(optimizer, /source instanceof HTMLVideoElement/);
  assert.match(optimizer, /key === state\.lastFrameKey/);
});
