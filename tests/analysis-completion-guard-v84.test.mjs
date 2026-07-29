import assert from 'node:assert/strict';
import test from 'node:test';
import { readBundleSection, readRoot } from './bundle-source.mjs';

test('v84 completion guard is valid JavaScript and bounds every blocking stage', () => {
  const runtime = readBundleSection('analysis-completion-guard-v84.js');

  assert.doesNotThrow(() => new Function(runtime));
  assert.match(runtime, /const WARP_TIMEOUT_MS = 2400/);
  assert.match(runtime, /const ANALYSIS_TIMEOUT_MS = 7200/);
  assert.match(runtime, /const REVEAL_TIMEOUT_MS = 1450/);
  assert.match(runtime, /Promise\.race\(\[nativeRender\(options\), fallback\]\)/);
  assert.match(runtime, /renderer: 'timeout-fallback-v84'/);
  assert.match(runtime, /stage\.classList\.remove\(\.\.\.revealClasses\)/);
});

test('v84 recovers the already selected verdict instead of inventing a new result', () => {
  const runtime = readBundleSection('analysis-completion-guard-v84.js');

  assert.match(runtime, /selection\?\.responseId/);
  assert.match(runtime, /item\?\.id === selection\.responseId/);
  assert.match(runtime, /item\?\.category === selection\.category/);
  assert.match(runtime, /state\.effectImageData \|\| state\.currentImageData/);
  assert.match(runtime, /state\.lastAnalysisResult = \{/);
  assert.match(runtime, /visual\.dataset\.analysisRecovery = 'v84'/);
  assert.match(runtime, /shareButton\.id = 'shareResultButton'/);
  assert.match(runtime, /newScanButton\.addEventListener/);
  assert.match(runtime, /smazka:analysis-guard-recovered/);
  assert.doesNotMatch(runtime, /Math\.random/);
});

test('v84 removes the obsolete reveal presentation and keeps v82 as final transition owner', () => {
  const css = readRoot('screens.css');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const serviceWorker = readRoot('service-worker.js');

  assert.match(css, /\.result-reveal-overlay/);
  assert.match(css, /display:\s*none\s*!important/);
  assert.match(css, /\.video-container\.is-revealing-result::before/);
  assert.match(css, /content:\s*none\s*!important/);

  const cropRuntime = lifecycle.indexOf('/* === face-aware-crop-runtime.js === */');
  const guard = lifecycle.indexOf('/* === analysis-completion-guard-v84.js === */');
  const singlePass = lifecycle.indexOf('/* === single-pass-result-v76.js === */');
  const impact = lifecycle.indexOf('/* === critical-impact-reveal-v82.js === */');
  assert.ok(guard > cropRuntime);
  assert.ok(singlePass > guard);
  assert.ok(impact > singlePass);

  assert.match(serviceWorker, /const CACHE_VERSION = 'v86'/);
  assert.match(serviceWorker, /\.\/lifecycle-runtime\.js\?v=86/);
});
