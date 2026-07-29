import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('Junkie Vision v81 keeps theme copy separate from renderers', () => {
  const appendedScripts = [];
  const document = {
    querySelector() { return null; },
    createElement(tagName) {
      assert.equal(tagName, 'script');
      return { dataset: {} };
    },
    head: {
      appendChild(script) { appendedScripts.push(script); }
    }
  };
  const context = { window: {}, document, Object };
  context.globalThis = context;
  vm.runInNewContext(read('hud-junkie-themes.js'), context);
  const theme = context.window.SmazkaJunkieHudTheme;

  assert.equal(theme.version, 81);
  assert.equal(theme.colors.toxic, '#00FF66');
  assert.equal(theme.colors.impact, '#FF0055');
  assert.equal(theme.colors.warning, '#FFCC00');
  assert.equal(theme.timing.initEndMs, 1000);
  assert.equal(theme.timing.scanEndMs, 2500);
  assert.equal(theme.timing.totalMs, 3000);
  assert.equal(theme.performance.targetFps, 30);
  assert.equal(theme.performance.maxDevicePixelRatio, 1.5);
  assert.equal(theme.performance.noiseSampleSize, 24);
  assert.equal(theme.performance.noiseSampleIntervalMs, 180);
  assert.ok(theme.metrics.length >= 8);
  assert.ok(theme.metrics.some((item) => item.label.includes('POKLESU VÍČEK')));
  assert.ok(theme.metrics.some((item) => item.label.includes('PERNÍKOVÉHO INDEXU')));
  assert.equal(appendedScripts.length, 2);
  assert.deepEqual(
    appendedScripts.map((script) => script.src),
    ['junkie-vision-photo-v81.js?v=81', 'junkie-vision-noise-v81.js?v=81']
  );
});

test('Junkie Vision v81 uses dedicated canvases, real landmarks and throttled animation', () => {
  const runtime = read('junkie-vision-hud-v81.js');
  const photoRuntime = read('junkie-vision-photo-v81.js');
  const noiseRuntime = read('junkie-vision-noise-v81.js');
  const css = read('junkie-vision-hud-v81.css');

  assert.match(runtime, /canvas\.dataset\.hudCanvas = 'v81'/);
  assert.match(runtime, /window\.FACEMESH_TESSELATION/);
  assert.match(runtime, /feed\.subscribe/);
  assert.match(runtime, /requestAnimationFrame\(draw\)/);
  assert.match(runtime, /const frameInterval = 1000/);
  assert.match(runtime, /maxDevicePixelRatio/);
  assert.match(runtime, /navigator\.vibrate\?\./);
  assert.match(runtime, /face-scan-active/);
  assert.match(runtime, /theme\.labels\.critical/);
  assert.match(runtime, /eyeDroop/);
  assert.match(runtime, /mouthAsymmetry/);
  assert.match(runtime, /landmarkNoise/);

  assert.match(photoRuntime, /data-hud-canvas="v81-photo"/);
  assert.match(photoRuntime, /snapshot\?\.sourceKind === 'still'/);
  assert.match(photoRuntime, /snapshot\?\.sourceWidth/);
  assert.match(photoRuntime, /preview\.naturalWidth/);
  assert.match(photoRuntime, /window\.FACEMESH_TESSELATION/);
  assert.match(photoRuntime, /requestAnimationFrame\(drawFrame\)/);

  assert.match(noiseRuntime, /const SAMPLE_SIZE = 24/);
  assert.match(noiseRuntime, /const SAMPLE_INTERVAL_MS = 180/);
  assert.match(noiseRuntime, /drawImage\(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE\)/);
  assert.match(noiseRuntime, /getImageData\(0, 0, SAMPLE_SIZE, SAMPLE_SIZE\)/);
  assert.match(noiseRuntime, /--jvh-frame-noise/);
  assert.match(noiseRuntime, /data-frame-noise/);

  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /junkie-crt-init-v81/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Junkie Vision loads between MediaPipe and the result pipeline and is cached offline', () => {
  const index = read('index.html');
  const serviceWorker = read('service-worker.js');

  const loader = index.indexOf('vendor/mediapipe-face-mesh/face_mesh.js?v=0.4.1633559619');
  const optimizer = index.indexOf('face-input-optimizer-v80.js?v=80');
  const bridge = index.indexOf('face-landmark-bridge-v81.js?v=81');
  const theme = index.indexOf('hud-junkie-themes.js?v=81');
  const scan = index.indexOf('face-scan.js?v=64');
  const hud = index.indexOf('junkie-vision-hud-v81.js?v=81');
  const warp = index.indexOf('face-warp.js?v=64');

  assert.ok(loader > -1);
  assert.ok(optimizer > loader);
  assert.ok(bridge > optimizer);
  assert.ok(theme > bridge);
  assert.ok(scan > theme);
  assert.ok(hud > scan);
  assert.ok(warp > hud);

  [
    './junkie-vision-hud-v81.css?v=81',
    './face-landmark-bridge-v81.js?v=81',
    './hud-junkie-themes.js?v=81',
    './junkie-vision-hud-v81.js?v=81',
    './junkie-vision-photo-v81.js?v=81',
    './junkie-vision-noise-v81.js?v=81'
  ].forEach((asset) => assert.ok(serviceWorker.includes(asset), asset));
});
