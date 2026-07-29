import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('v83 keeps a recognisable HUD without the duplicated visual noise', () => {
  const runtime = read('junkie-vision-balance-v83.js');
  const css = read('junkie-vision-balance-v83.css');

  assert.match(runtime, /pathIndex === 1 && pathLines > 120/);
  assert.match(runtime, /foreheadArcCount > 1/);
  assert.match(runtime, /\^DROOP\\s\/i/);
  assert.match(runtime, /jvh-balanced-progress/);
  assert.match(css, /body\.junkie-vision-active #scanOverlay/);
  assert.match(css, /visibility:\s*hidden\s*!important/);
  assert.match(css, /\.jvh-metric-row:nth-child\(n \+ 3\)/);
  assert.match(css, /width:\s*var\(--scan-progress, 0%\)/);
  assert.match(css, /\.junkie-vision-canvas[\s\S]*opacity:\s*0\.78/);
});

test('v83 watchdog finishes a stalled scan from the last real MediaPipe landmarks', () => {
  const runtime = read('junkie-vision-balance-v83.js');

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

test('v83 loads after the camera HUD and is available offline', () => {
  const index = read('index.html');
  const serviceWorker = read('service-worker.js');

  const scan = index.indexOf('face-scan.js?v=64');
  const hud = index.indexOf('junkie-vision-hud-v81.js?v=81');
  const balance = index.indexOf('junkie-vision-balance-v83.js?v=83');
  const warp = index.indexOf('face-warp.js?v=64');

  assert.ok(scan > -1);
  assert.ok(hud > scan);
  assert.ok(balance > hud);
  assert.ok(warp > balance);
  assert.match(index, /junkie-vision-balance-v83\.css\?v=83/);
  assert.match(serviceWorker, /\.\/junkie-vision-balance-v83\.js\?v=83/);
  assert.match(serviceWorker, /\.\/junkie-vision-balance-v83\.css\?v=83/);
});
