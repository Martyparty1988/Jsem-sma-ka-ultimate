import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readBundleSection, readRoot } from './bundle-source.mjs';

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
  vm.runInNewContext(readBundleSection('hud-junkie-themes.js'), context);
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
  const runtime = readBundleSection('junkie-vision-hud-v81.js');
  const photoRuntime = readRoot('junkie-vision-photo-v81.js');
  const noiseRuntime = readRoot('junkie-vision-noise-v81.js');
  const css = readRoot('screens.css');

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

test('Junkie Vision keeps patch order while Face Mesh stays lazy in PWA v87', () => {
  const index = readRoot('index.html');
  const scanner = readRoot('scanner-runtime.js');
  const serviceWorker = readRoot('service-worker.js');

  const optimizer = scanner.indexOf('/* === face-input-optimizer-v80.js === */');
  const bridge = scanner.indexOf('/* === face-landmark-bridge-v81.js === */');
  const theme = scanner.indexOf('/* === hud-junkie-themes.js === */');
  const scan = scanner.indexOf('/* === face-scan.js === */');
  const hud = scanner.indexOf('/* === junkie-vision-hud-v81.js === */');
  const balance = scanner.indexOf('/* === junkie-vision-balance-v83.js === */');

  assert.ok(optimizer > -1);
  assert.ok(bridge > optimizer);
  assert.ok(theme > bridge);
  assert.ok(scan > theme);
  assert.ok(hud > scan);
  assert.ok(balance > hud);

  assert.doesNotMatch(index, /vendor\/mediapipe-face-mesh\/face_mesh\.js/);
  assert.match(scanner, /FACE_RUNTIME_URL = `\$\{MODEL_ROOT\}face_mesh\.js\?v=0\.4\.1633559619`/);
  assert.match(scanner, /photoRuntimeUrl = 'junkie-vision-photo-v81\.js\?v=81'/);
  assert.match(scanner, /noiseRuntimeUrl = 'junkie-vision-noise-v81\.js\?v=81'/);
  assert.match(serviceWorker, /\.\/scanner-runtime\.js\?v=87/);
  assert.match(serviceWorker, /requestUrl\.pathname\.includes\('\/vendor\/mediapipe-face-mesh\/'\)/);
  assert.doesNotMatch(serviceWorker, /face_mesh_solution_.*\.wasm/);
});
