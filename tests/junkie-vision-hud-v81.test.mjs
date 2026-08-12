import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readBundleSection, readRoot } from './bundle-source.mjs';

test('v116 specimen protocol keeps theme copy separate from renderers', () => {
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

  assert.equal(theme.version, 116);
  assert.equal(theme.name, 'SMAŽKA LAB / lokální vzorek');
  assert.equal(theme.colors.toxic, '#58D6C2');
  assert.equal(theme.colors.impact, '#FF6B7D');
  assert.equal(theme.colors.warning, '#F2C96D');
  assert.equal(theme.timing.initEndMs, 1000);
  assert.equal(theme.timing.scanEndMs, 2500);
  assert.equal(theme.timing.totalMs, 3000);
  assert.equal(theme.performance.targetFps, 30);
  assert.equal(theme.performance.maxDevicePixelRatio, 1.5);
  assert.equal(theme.performance.noiseSampleSize, 24);
  assert.equal(theme.performance.noiseSampleIntervalMs, 180);
  assert.ok(theme.metrics.length >= 8);
  assert.equal(theme.labels.init, 'PŘÍJEM VZORKU // LOKÁLNÍ');
  assert.equal(theme.labels.scanning, 'TOXIKOLOGICKÝ PRŮCHOD // 0 % DIAGNÓZA');
  assert.equal(theme.labels.critical, 'VZOREK UZAVŘEN // TISKNU PROTOKOL');
  assert.ok(theme.metrics.some((item) => item.label === 'ZORNIČKOVÝ NÁLEZ'));
  assert.ok(theme.metrics.some((item) => item.label === 'TOXIKOLOGICKÝ POPLACH'));
  assert.ok(theme.metrics.some((item) => item.label === 'MOTORIKA SUBJEKTU'));
  assert.equal(theme.metrics.some((item) => item.label.includes('PERNÍKOVÉHO INDEXU')), false);
  assert.equal(appendedScripts.length, 2);
  assert.deepEqual(
    appendedScripts.map((script) => script.src),
    ['junkie-vision-photo-v81.js?v=81', 'junkie-vision-noise-v81.js?v=81']
  );
});

test('v116 specimen protocol uses dedicated canvases, real landmarks and throttled animation', () => {
  const runtime = readBundleSection('junkie-vision-hud-v81.js');
  const photoRuntime = readRoot('junkie-vision-photo-v81.js');
  const noiseRuntime = readRoot('junkie-vision-noise-v81.js');
  const css = readRoot('screens.css');

  assert.match(runtime, /wrapper\.dataset\.protocolOwner = 'v116'/);
  assert.match(runtime, /canvas\.dataset\.hudCanvas = 'v116'/);
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
  assert.match(runtime, /scoreValue\.textContent = String\(signal\.points\)\.padStart\(3, '0'\)/);
  assert.match(runtime, /drawSampleBands/);
  assert.match(runtime, /version: 116/);
  assert.doesNotMatch(runtime, /JUNKIE INDEX|CRITICAL IMPACT DETECTED/);

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
  assert.match(css, /specimen-protocol-init-v116/);
  assert.match(css, /prefers-reduced-motion/);
});

test('v116 scan stages have one Czech specimen owner and never expose the retired HUD score', () => {
  const scan = readBundleSection('face-scan.js');
  const hud = readBundleSection('junkie-vision-hud-v81.js');
  const theme = readBundleSection('hud-junkie-themes.js');

  assert.match(scan, /Přijímám lokální vzorek/);
  assert.match(scan, /Sestavuju SMAŽKA protokol/);
  assert.match(scan, /Vzorek uzavřen/);
  assert.match(hud, /<small>MAPA TVÁŘE<\/small>/);
  assert.match(hud, /<span>BODŮ<\/span>/);
  assert.match(theme, /0 % DIAGNÓZA/);
  assert.doesNotMatch(`${scan}\n${hud}\n${theme}`, /JUNKIE INDEX|SYSTEM INIT: WARNA READY|CRITICAL IMPACT DETECTED/);
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
  assert.match(serviceWorker, /\.\/scanner-runtime\.js\?v=116/);
  assert.match(serviceWorker, /requestUrl\.pathname\.includes\('\/vendor\/mediapipe-face-mesh\/'\)/);
  assert.doesNotMatch(serviceWorker, /face_mesh_solution_.*\.wasm/);
});
