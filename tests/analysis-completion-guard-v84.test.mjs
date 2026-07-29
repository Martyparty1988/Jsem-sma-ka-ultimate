import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('v84 completion guard is valid JavaScript and bounds every blocking stage', () => {
  const runtime = read('analysis-completion-guard-v84.js');

  assert.doesNotThrow(() => new Function(runtime));
  assert.match(runtime, /const WARP_TIMEOUT_MS = 2400/);
  assert.match(runtime, /const ANALYSIS_TIMEOUT_MS = 7200/);
  assert.match(runtime, /const REVEAL_TIMEOUT_MS = 1450/);
  assert.match(runtime, /Promise\.race\(\[nativeRender\(options\), fallback\]\)/);
  assert.match(runtime, /renderer: 'timeout-fallback-v84'/);
  assert.match(runtime, /stage\.classList\.remove\(\.\.\.revealClasses\)/);
});

test('v84 recovers the already selected verdict instead of inventing a new result', () => {
  const runtime = read('analysis-completion-guard-v84.js');

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
  const css = read('analysis-completion-guard-v84.css');
  const index = read('index.html');
  const serviceWorker = read('service-worker.js');

  assert.match(css, /\.result-reveal-overlay/);
  assert.match(css, /display:\s*none\s*!important/);
  assert.match(css, /\.video-container\.is-revealing-result::before/);
  assert.match(css, /content:\s*none\s*!important/);

  const cropRuntime = index.indexOf('face-aware-crop-runtime.js?v=72');
  const guard = index.indexOf('analysis-completion-guard-v84.js?v=84');
  const singlePass = index.indexOf('single-pass-result-v76.js?v=76');
  const impact = index.indexOf('critical-impact-reveal-v82.js?v=82');
  assert.ok(guard > cropRuntime);
  assert.ok(singlePass > guard);
  assert.ok(impact > singlePass);

  assert.match(index, /analysis-completion-guard-v84\.css\?v=84/);
  assert.match(serviceWorker, /const CACHE_VERSION = 'v84'/);
  assert.match(serviceWorker, /\.\/analysis-completion-guard-v84\.js\?v=84/);
  assert.match(serviceWorker, /\.\/analysis-completion-guard-v84\.css\?v=84/);
});
