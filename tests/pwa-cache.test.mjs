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
globalThis.__PWA_TEST__ = { CACHE_NAME, APP_SHELL };`;
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

test('PWA v72 caches every current runtime, style and data dependency', () => {
  const { CACHE_NAME, APP_SHELL } = serviceWorkerContract();
  const assets = new Set(APP_SHELL);

  assert.equal(CACHE_NAME, 'jsem-smazka-v72');
  [
    './app.js?v=64',
    './face-aware-crop.js?v=72',
    './face-aware-crop-runtime.js?v=72',
    './face-scan.js?v=64',
    './devastation-metrics.js?v=64',
    './face-warp.js?v=64',
    './hard-responses.js?v=64',
    './junky-verdict-engine.js?v=64',
    './verdict-matcher.js?v=64',
    './privacy-hardening.js?v=72',
    './share-cover.js?v=72',
    './in-frame-result.js?v=71',
    './result-mobile-v71.css?v=71',
    './responses.json',
    './responses-hard.json?v=64',
    './responses-pernik.json?v=64'
  ].forEach((asset) => assert.equal(assets.has(asset), true, asset));

  assert.equal(assets.has('./result-mobile-v70.css?v=70'), false);
  assert.equal(assets.has('./result-layout-fix-v69.js?v=69'), false);

  APP_SHELL.forEach((asset) => {
    const pathname = asset.replace(/^\.\//, '').split('?')[0] || 'index.html';
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
  });
});

test('HTML and dynamic module URLs agree with the v72 cache graph', () => {
  const { APP_SHELL } = serviceWorkerContract();
  const assets = new Set(APP_SHELL);
  const index = read('index.html');

  const indexScripts = [...index.matchAll(/<script defer src="([^"]+)"/g)]
    .map((match) => `./${match[1]}`);
  indexScripts.forEach((asset) => assert.equal(assets.has(asset), true, asset));

  const indexStyles = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
    .map((match) => `./${match[1]}`);
  indexStyles.forEach((asset) => assert.equal(assets.has(asset), true, asset));

  const dynamicAssets = [
    read('face-scan.js').match(/METRICS_MODULE_URL = '([^']+)'/)?.[1],
    read('face-warp.js').match(/GEOMETRY_MODULE_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/MATCHER_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/TERMINAL_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/PACK_URL = '([^']+)'/)?.[1]
  ].filter(Boolean).map((asset) => asset.startsWith('./') ? asset : `./${asset}`);

  dynamicAssets.forEach((asset) => assert.equal(assets.has(asset), true, asset));
});

test('mobile result v71 remains the single viewport layout authority', () => {
  const css = read('result-mobile-v71.css');
  const runtime = read('in-frame-result.js');
  const index = read('index.html');

  assert.match(css, /result-effect-meta[\s\S]*margin-top:\s*0\s*!important/);
  assert.match(css, /result-actions[\s\S]*margin-top:\s*0\s*!important/);
  assert.match(css, /result-visual[\s\S]*flex:\s*1 1 auto\s*!important/);
  assert.match(css, /transform:\s*none\s*!important/);
  assert.match(runtime, /setImportant\(media, 'transform', 'none'\)/);
  assert.match(runtime, /setImportant\(result, 'height', `\$\{Math\.round\(maxHeight\)\}px`\)/);
  assert.match(runtime, /result\.dataset\.resultLayout = 'v71'/);
  assert.doesNotMatch(index, /result-mobile-v70/);
  assert.doesNotMatch(index, /result-layout-fix-v69/);
});

test('face-aware crop is loaded before the renderer bridge and shared cover', () => {
  const index = read('index.html');
  const cropIndex = index.indexOf('face-aware-crop.js?v=72');
  const warpIndex = index.indexOf('face-warp.js?v=64');
  const runtimeIndex = index.indexOf('face-aware-crop-runtime.js?v=72');
  const shareIndex = index.indexOf('share-cover.js?v=72');

  assert.ok(cropIndex > -1);
  assert.ok(warpIndex > cropIndex);
  assert.ok(runtimeIndex > warpIndex);
  assert.ok(shareIndex > runtimeIndex);
});
