import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

function read(file) {
  return fs.readFileSync(new URL(file, root), 'utf8');
}

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

test('PWA v81 caches every current runtime, style and data dependency', () => {
  const { CACHE_NAME, APP_SHELL } = serviceWorkerContract();
  const assets = new Set(APP_SHELL);

  assert.equal(CACHE_NAME, 'jsem-smazka-v81');
  [
    './app.js?v=64',
    './legacy-share-bypass-v79.js?v=79',
    './face-aware-crop.js?v=72',
    './face-input-optimizer-v80.js?v=80',
    './face-landmark-bridge-v81.js?v=81',
    './hud-junkie-themes.js?v=81',
    './junkie-vision-hud-v81.js?v=81',
    './junkie-vision-photo-v81.js?v=81',
    './junkie-vision-hud-v81.css?v=81',
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

  assert.equal(assets.has('./share-cover.js?v=72'), false);
  assert.equal(assets.has('./terminal-readout.js?v=60'), false);
  assert.equal(assets.has('./junky-verdict-engine.js?v=64'), false);
  assert.equal(assets.has('./in-frame-result.js?v=71'), false);
  assert.equal(assets.has('./result-mobile-v70.css?v=70'), false);
  assert.equal(assets.has('./result-layout-fix-v69.js?v=69'), false);

  APP_SHELL.forEach((asset) => {
    const pathname = asset.replace(/^\.\//, '').split('?')[0] || 'index.html';
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
  });
});

test('MediaPipe model files use one stable cache instead of every app cache version', () => {
  const { FACE_MODEL_CACHE, APP_SHELL, FACE_MODEL_ASSETS } = serviceWorkerContract();
  const appAssets = new Set(APP_SHELL);
  const serviceWorker = read('service-worker.js');

  assert.equal(FACE_MODEL_CACHE, 'jsem-smazka-face-model-v1');
  assert.ok(FACE_MODEL_ASSETS.length >= 9);
  assert.ok(FACE_MODEL_ASSETS.includes('./vendor/mediapipe-face-mesh/face_mesh.js?v=0.4.1633559619'));

  FACE_MODEL_ASSETS.forEach((asset) => {
    assert.equal(appAssets.has(asset), false, `${asset} must not be tied to v81`);
    const pathname = asset.replace(/^\.\//, '').split('?')[0];
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
  });

  assert.match(serviceWorker, /async function ensureFaceModelCache\(\)/);
  assert.match(serviceWorker, /caches\.open\(FACE_MODEL_CACHE\)/);
  assert.match(serviceWorker, /key !== CACHE_NAME && key !== FACE_MODEL_CACHE/);
  assert.doesNotMatch(serviceWorker, /const APP_SHELL = \[[\s\S]*\.\.\.FACE_MODEL_ASSETS/);
});

test('HTML and dynamic module URLs agree with the v81 cache graph', () => {
  const { APP_SHELL, FACE_MODEL_ASSETS } = serviceWorkerContract();
  const appAssets = new Set(APP_SHELL);
  const allCachedAssets = new Set([...APP_SHELL, ...FACE_MODEL_ASSETS]);
  const index = read('index.html');

  const indexScripts = [...index.matchAll(/<script defer src="([^"]+)"/g)]
    .map((match) => `./${match[1]}`);
  indexScripts.forEach((asset) => assert.equal(allCachedAssets.has(asset), true, asset));

  const indexStyles = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
    .map((match) => `./${match[1]}`);
  indexStyles.forEach((asset) => assert.equal(appAssets.has(asset), true, asset));

  const dynamicAssets = [
    read('face-scan.js').match(/METRICS_MODULE_URL = '([^']+)'/)?.[1],
    read('face-warp.js').match(/GEOMETRY_MODULE_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/MATCHER_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/PACK_URL = '([^']+)'/)?.[1],
    read('hud-junkie-themes.js').match(/photoRuntimeUrl = '([^']+)'/)?.[1]
  ].filter(Boolean).map((asset) => asset.startsWith('./') ? asset : `./${asset}`);

  dynamicAssets.forEach((asset) => assert.equal(appAssets.has(asset), true, asset));
});

test('retired biometric terminal cannot return to the result pipeline', () => {
  const engine = read('junky-verdict-engine.js');
  const serviceWorker = read('service-worker.js');

  assert.doesNotMatch(engine, /TERMINAL_URL/);
  assert.doesNotMatch(engine, /scheduleTerminalReadout/);
  assert.doesNotMatch(engine, /animateTerminalReadout/);
  assert.doesNotMatch(serviceWorker, /terminal-readout/);
  assert.equal(fs.existsSync(new URL('terminal-readout.js', root)), false);
});

test('mobile result v73 remains the single viewport runtime authority', () => {
  const css = read('result-mobile-v71.css');
  const runtime = read('in-frame-result.js');
  const geometry = read('result-frame-geometry.js');
  const index = read('index.html');

  assert.match(css, /result-effect-meta[\s\S]*margin-top:\s*0\s*!important/);
  assert.match(css, /result-actions[\s\S]*margin-top:\s*0\s*!important/);
  assert.match(css, /result-visual[\s\S]*flex:\s*1 1 auto\s*!important/);
  assert.match(css, /transform:\s*none\s*!important/);
  assert.match(runtime, /frameGeometry\.calculateResultFrame/);
  assert.match(runtime, /setImportant\(media, 'transform', 'none'\)/);
  assert.match(runtime, /setImportant\(result, 'height', `\$\{Math\.round\(frame\.height\)\}px`\)/);
  assert.match(runtime, /result\.dataset\.resultLayout = 'v73'/);
  assert.match(geometry, /function calculateResultFrame/);
  assert.doesNotMatch(index, /in-frame-result\.js\?v=71/);
  assert.doesNotMatch(index, /result-mobile-v70/);
  assert.doesNotMatch(index, /result-layout-fix-v69/);
});

test('eager share bypass loads immediately after app bootstrap', () => {
  const { APP_SHELL } = serviceWorkerContract();
  const index = read('index.html');
  const appIndex = index.indexOf('app.js?v=64');
  const bypassIndex = index.indexOf('legacy-share-bypass-v79.js?v=79');
  const cropIndex = index.indexOf('face-aware-crop.js?v=72');

  assert.ok(appIndex > -1);
  assert.ok(bypassIndex > appIndex);
  assert.ok(cropIndex > bypassIndex);

  const shellAppIndex = APP_SHELL.indexOf('./app.js?v=64');
  const shellBypassIndex = APP_SHELL.indexOf('./legacy-share-bypass-v79.js?v=79');
  const shellCropIndex = APP_SHELL.indexOf('./face-aware-crop.js?v=72');
  assert.ok(shellBypassIndex > shellAppIndex);
  assert.ok(shellCropIndex > shellBypassIndex);
});

test('Face Mesh input optimizer and Junkie Vision bridge load before face scanning', () => {
  const { APP_SHELL } = serviceWorkerContract();
  const index = read('index.html');
  const loaderIndex = index.indexOf('vendor/mediapipe-face-mesh/face_mesh.js?v=0.4.1633559619');
  const optimizerIndex = index.indexOf('face-input-optimizer-v80.js?v=80');
  const bridgeIndex = index.indexOf('face-landmark-bridge-v81.js?v=81');
  const themeIndex = index.indexOf('hud-junkie-themes.js?v=81');
  const scanIndex = index.indexOf('face-scan.js?v=64');
  const hudIndex = index.indexOf('junkie-vision-hud-v81.js?v=81');

  assert.ok(loaderIndex > -1);
  assert.ok(optimizerIndex > loaderIndex);
  assert.ok(bridgeIndex > optimizerIndex);
  assert.ok(themeIndex > bridgeIndex);
  assert.ok(scanIndex > themeIndex);
  assert.ok(hudIndex > scanIndex);

  const shellOptimizerIndex = APP_SHELL.indexOf('./face-input-optimizer-v80.js?v=80');
  const shellBridgeIndex = APP_SHELL.indexOf('./face-landmark-bridge-v81.js?v=81');
  const shellThemeIndex = APP_SHELL.indexOf('./hud-junkie-themes.js?v=81');
  const shellScanIndex = APP_SHELL.indexOf('./face-scan.js?v=64');
  const shellHudIndex = APP_SHELL.indexOf('./junkie-vision-hud-v81.js?v=81');
  assert.ok(shellOptimizerIndex > -1);
  assert.ok(shellBridgeIndex > shellOptimizerIndex);
  assert.ok(shellThemeIndex > shellBridgeIndex);
  assert.ok(shellScanIndex > shellThemeIndex);
  assert.ok(shellHudIndex > shellScanIndex);
});

test('crop, single-pass and lazy share runtimes load in authoritative order', () => {
  const { APP_SHELL } = serviceWorkerContract();
  const index = read('index.html');
  const cropIndex = index.indexOf('face-aware-crop.js?v=72');
  const warpIndex = index.indexOf('face-warp.js?v=64');
  const frameGeometryIndex = index.indexOf('result-frame-geometry.js?v=73');
  const resultRuntimeIndex = index.indexOf('in-frame-result.js?v=73');
  const cropRuntimeIndex = index.indexOf('face-aware-crop-runtime.js?v=72');
  const singlePassIndex = index.indexOf('single-pass-result-v76.js?v=76');
  const shareIndex = index.indexOf('share-cover-v77.js?v=77');

  assert.ok(cropIndex > -1);
  assert.ok(warpIndex > cropIndex);
  assert.ok(frameGeometryIndex > warpIndex);
  assert.ok(resultRuntimeIndex > frameGeometryIndex);
  assert.ok(cropRuntimeIndex > resultRuntimeIndex);
  assert.ok(singlePassIndex > cropRuntimeIndex);
  assert.ok(shareIndex > singlePassIndex);

  const shellResultRuntimeIndex = APP_SHELL.indexOf('./in-frame-result.js?v=73');
  const shellCropRuntimeIndex = APP_SHELL.indexOf('./face-aware-crop-runtime.js?v=72');
  const shellSinglePassIndex = APP_SHELL.indexOf('./single-pass-result-v76.js?v=76');
  const shellShareIndex = APP_SHELL.indexOf('./share-cover-v77.js?v=77');
  assert.ok(shellCropRuntimeIndex > shellResultRuntimeIndex);
  assert.ok(shellSinglePassIndex > shellCropRuntimeIndex);
  assert.ok(shellShareIndex > shellSinglePassIndex);
});

test('share v77 renders lazily, deduplicates work and releases legacy canvas memory', () => {
  const share = read('share-cover-v77.js');
  const index = read('index.html');
  const serviceWorker = read('service-worker.js');

  assert.match(share, /function getCoverBlob\(verdict\)/);
  assert.match(share, /cachedBlob && cachedToken === token/);
  assert.match(share, /pendingBlob && cachedToken === token/);
  assert.match(share, /function releaseLegacyCanvasBuffer\(\)/);
  assert.match(share, /legacyCanvas\.width = 1/);
  assert.match(share, /legacyCanvas\.height = 1/);
  assert.match(share, /canvas\.toBlob/);
  assert.doesNotMatch(index, /share-cover\.js\?v=72/);
  assert.doesNotMatch(serviceWorker, /share-cover\.js\?v=72/);
});

test('v79 suppresses only the retired 1080 by 1350 eager share canvas', () => {
  const bypass = read('legacy-share-bypass-v79.js');
  const serviceWorker = read('service-worker.js');

  assert.match(bypass, /function resultIsOpen\(\)/);
  assert.match(bypass, /numericValue === 1080/);
  assert.match(bypass, /numericValue === 1350/);
  assert.match(bypass, /widthDescriptor\.set\.call\(canvas, 1\)/);
  assert.match(bypass, /heightDescriptor\.set\.call\(canvas, 1\)/);
  assert.match(bypass, /property === 'createLinearGradient'/);
  assert.match(bypass, /property === 'measureText'/);
  assert.match(bypass, /if \(!bypassActive\) Reflect\.set/);
  assert.match(bypass, /canvas\.dataset\.legacyShareBypass = 'v79'/);
  assert.match(serviceWorker, /\.\/legacy-share-bypass-v79\.js\?v=79/);
});

test('v80 downsizes only live video input and preserves still image analysis', () => {
  const optimizer = read('face-input-optimizer-v80.js');
  const serviceWorker = read('service-worker.js');

  assert.match(optimizer, /const IDLE_MAX_EDGE = 512/);
  assert.match(optimizer, /const SCAN_MAX_EDGE = 640/);
  assert.match(optimizer, /source instanceof HTMLVideoElement/);
  assert.match(optimizer, /if \(!isVideoSource\(source\)\)/);
  assert.match(optimizer, /return nativeSend\.call\(this, packet\)/);
  assert.match(optimizer, /state\.context\.drawImage\(video, 0, 0, width, height\)/);
  assert.match(optimizer, /key === state\.lastFrameKey/);
  assert.match(optimizer, /return Promise\.resolve\(undefined\)/);
  assert.match(optimizer, /buffers\.forEach/);
  assert.match(optimizer, /averagePreparationMs/);
  assert.match(serviceWorker, /\.\/face-input-optimizer-v80\.js\?v=80/);
});
