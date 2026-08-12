import assert from 'node:assert/strict';
import test from 'node:test';
import { readBundleSection, readRoot } from './bundle-source.mjs';

test('v83 keeps a recognisable HUD without the duplicated visual noise', () => {
  const runtime = readBundleSection('junkie-vision-balance-v83.js');
  const css = readRoot('screens.css');

  assert.match(runtime, /pathIndex === 1 && pathLines > 120/);
  assert.match(runtime, /foreheadArcCount > 1/);
  assert.match(runtime, /DROOP\|VÍČKA/);
  assert.match(runtime, /jvh-balanced-progress/);
  assert.match(css, /body\.junkie-vision-active #scanOverlay/);
  assert.match(css, /visibility:\s*hidden\s*!important/);
  assert.match(css, /\.jvh-metric-row:nth-child\(n \+ 3\)/);
  assert.match(css, /width:\s*var\(--scan-progress, 0%\)/);
  assert.match(css, /\.junkie-vision-canvas[\s\S]*opacity:\s*0\.72/);
});

test('v83 watchdog finishes a stalled scan from the last real MediaPipe landmarks', () => {
  const runtime = readBundleSection('junkie-vision-balance-v83.js');

  assert.match(runtime, /const WATCHDOG_MS = 4700/);
  assert.match(runtime, /snapshot\?\.landmarks/);
  assert.match(runtime, /landmarks\.length < 468/);
  assert.match(runtime, /faceScan\.reset\?\.\(\)/);
  assert.match(runtime, /app\.captureCurrentFrame\(0\.92\)/);
  assert.match(runtime, /import\(METRICS_MODULE_URL\)/);
  assert.match(runtime, /analyzeFaceImage\(\{/);
  assert.match(runtime, /sourceKind: 'camera'/);
  assert.match(runtime, /app\.runAnalysis\(\{/);
  assert.match(runtime, /smazka:scan-watchdog-recovered/);
  assert.match(runtime, /if \(!fallbackRunning\) scanSequence \+= 1/);
  assert.doesNotMatch(runtime, /Math\.random/);
});

test('v83 loads after the camera HUD inside the cached scanner bundle', () => {
  const scanner = readRoot('scanner-runtime.js');
  const serviceWorker = readRoot('service-worker.js');

  const scan = scanner.indexOf('/* === face-scan.js === */');
  const hud = scanner.indexOf('/* === junkie-vision-hud-v81.js === */');
  const balance = scanner.indexOf('/* === junkie-vision-balance-v83.js === */');

  assert.ok(scan > -1);
  assert.ok(hud > scan);
  assert.ok(balance > hud);
  assert.match(readRoot('screens.css'), /jvh-balanced-progress/);
  assert.match(serviceWorker, /\.\/scanner-runtime\.js\?v=116/);
});
