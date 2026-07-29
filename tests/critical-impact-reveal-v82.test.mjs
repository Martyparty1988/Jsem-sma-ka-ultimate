import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('Critical Impact Reveal reuses the single-pass result without another face warp', () => {
  const runtime = read('critical-impact-reveal-v82.js');

  assert.match(runtime, /cropApi\.cropImageData\(source, CROP_WIDTH, CROP_HEIGHT/);
  assert.match(runtime, /state\.effectImageData \|\| state\.currentImageData/);
  assert.match(runtime, /window\.FACEMESH_TESSELATION/);
  assert.match(runtime, /drawFrozenMesh/);
  assert.match(runtime, /createSlice\(effect, 29, -1, 210\)/);
  assert.match(runtime, /createSlice\(effect, 51, 1, 275\)/);
  assert.match(runtime, /createSlice\(effect, 69, -1, 340\)/);
  assert.match(runtime, /navigator\.vibrate\?\./);
  assert.match(runtime, /smazka:impact-reveal-complete/);
  assert.doesNotMatch(runtime, /renderFaceEffect|createFinalImage/);
});

test('Critical Impact Reveal seal is idempotent and reduced motion is short', () => {
  const runtime = read('critical-impact-reveal-v82.js');

  assert.match(runtime, /existing\.dataset\.level === level/);
  assert.match(runtime, /existing\.dataset\.severity === String\(severity\)/);
  assert.match(runtime, /if \(token && !result\.querySelector\('\.critical-impact-reveal'\)\)/);
  assert.match(runtime, /const revealDuration = reducedMotion\.matches \? 120 : REVEAL_MS/);
  assert.match(runtime, /const exitDuration = reducedMotion\.matches \? 40 : EXIT_MS/);
});

test('Critical Impact Reveal presentation contains the full impact sequence and Safari-safe slices', () => {
  const css = read('critical-impact-reveal-v82.css');

  assert.match(css, /impact-negative-flash-v82/);
  assert.match(css, /impact-wipe-image-v82/);
  assert.match(css, /impact-wipe-line-v82/);
  assert.match(css, /impact-mesh-ghost-v82/);
  assert.match(css, /impact-slice-v82/);
  assert.match(css, /impact-stamp-v82/);
  assert.match(css, /impact-verdict-seal/);
  assert.match(css, /var\(--impact-slice-reverse\)/);
  assert.match(css, /var\(--impact-slice-return\)/);
  assert.doesNotMatch(css, /calc\(var\(--impact-slice-shift\) \*/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Critical Impact Reveal loads after single-pass and before lazy share in PWA v82', () => {
  const index = read('index.html');
  const serviceWorker = read('service-worker.js');

  const singlePass = index.indexOf('single-pass-result-v76.js?v=76');
  const impact = index.indexOf('critical-impact-reveal-v82.js?v=82');
  const share = index.indexOf('share-cover-v77.js?v=77');

  assert.ok(singlePass > -1);
  assert.ok(impact > singlePass);
  assert.ok(share > impact);
  assert.match(index, /critical-impact-reveal-v82\.css\?v=82/);
  assert.match(serviceWorker, /const CACHE_VERSION = 'v82'/);
  assert.match(serviceWorker, /\.\/critical-impact-reveal-v82\.js\?v=82/);
  assert.match(serviceWorker, /\.\/critical-impact-reveal-v82\.css\?v=82/);
});
