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

test('PWA v64 caches every changed runtime and data dependency', () => {
  const { CACHE_NAME, APP_SHELL } = serviceWorkerContract();
  const assets = new Set(APP_SHELL);

  assert.equal(CACHE_NAME, 'jsem-smazka-v64');
  [
    './app.js?v=64',
    './face-scan.js?v=64',
    './devastation-metrics.js?v=64',
    './face-warp.js?v=64',
    './hard-responses.js?v=64',
    './junky-verdict-engine.js?v=64',
    './verdict-matcher.js?v=64',
    './responses.json',
    './responses-hard.json?v=64',
    './responses-pernik.json?v=64'
  ].forEach((asset) => assert.equal(assets.has(asset), true, asset));

  APP_SHELL.forEach((asset) => {
    const pathname = asset.replace(/^\.\//, '').split('?')[0] || 'index.html';
    assert.equal(fs.existsSync(new URL(pathname, root)), true, asset);
  });
});

test('HTML and dynamic module URLs agree with the v64 cache graph', () => {
  const { APP_SHELL } = serviceWorkerContract();
  const assets = new Set(APP_SHELL);
  const index = read('index.html');

  const indexScripts = [...index.matchAll(/<script defer src="([^"]+)"/g)]
    .map((match) => `./${match[1]}`);
  indexScripts.forEach((asset) => assert.equal(assets.has(asset), true, asset));

  const dynamicAssets = [
    read('face-scan.js').match(/METRICS_MODULE_URL = '([^']+)'/)?.[1],
    read('face-warp.js').match(/GEOMETRY_MODULE_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/MATCHER_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/TERMINAL_URL = '([^']+)'/)?.[1],
    read('junky-verdict-engine.js').match(/PACK_URL = '([^']+)'/)?.[1]
  ].filter(Boolean).map((asset) => asset.startsWith('./') ? asset : `./${asset}`);

  dynamicAssets.forEach((asset) => assert.equal(assets.has(asset), true, asset));
});
