import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('v85 rescue runtime is valid and stays hidden during the normal scan window', () => {
  const runtime = read('analysis-rescue-v85.js');

  assert.doesNotThrow(() => new Function(runtime));
  assert.match(runtime, /const SHOW_AFTER_MS = 4300/);
  assert.match(runtime, /document\.body\.classList\.contains\('face-scan-active'\)/);
  assert.match(runtime, /return busy && !scannerActive && !resultIsOpen\(\)/);
  assert.match(runtime, /panel\.hidden = true/);
  assert.match(runtime, /window\.setTimeout\(\(\) => \{/);
  assert.match(runtime, /}, SHOW_AFTER_MS\)/);
});

test('v85 delegates recovery to the v84 authority without selecting another verdict', () => {
  const runtime = read('analysis-rescue-v85.js');

  assert.match(runtime, /window\.SmazkaAnalysisCompletionGuard/);
  assert.match(runtime, /typeof guard\?\.recoverNow !== 'function'/);
  assert.match(runtime, /await Promise\.resolve\(guard\.recoverNow\(\)\)/);
  assert.match(runtime, /Verdikt ani biometriku neměním/);
  assert.doesNotMatch(runtime, /Math\.random|responseLibrary|selectedVerdict|renderFaceEffect/);
});

test('v85 rescue presentation is restrained, accessible and cached after the completion guard', () => {
  const runtime = read('analysis-rescue-v85.js');
  const css = read('analysis-rescue-v85.css');
  const index = read('index.html');
  const serviceWorker = read('service-worker.js');

  assert.match(runtime, /role', 'group'/);
  assert.match(runtime, /Nouzové dokončení pomalé analýzy/);
  assert.match(runtime, /Vynutit rozsudek/);
  assert.match(css, /width: min\(100%, 360px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(css, /prefers-reduced-motion/);

  const guardIndex = index.indexOf('analysis-completion-guard-v84.js?v=84');
  const rescueIndex = index.indexOf('analysis-rescue-v85.js?v=85');
  const singlePassIndex = index.indexOf('single-pass-result-v76.js?v=76');
  assert.ok(guardIndex > -1);
  assert.ok(rescueIndex > guardIndex);
  assert.ok(singlePassIndex > rescueIndex);

  assert.match(index, /analysis-rescue-v85\.css\?v=85/);
  assert.match(serviceWorker, /const CACHE_VERSION = 'v85'/);
  assert.match(serviceWorker, /\.\/analysis-rescue-v85\.js\?v=85/);
  assert.match(serviceWorker, /\.\/analysis-rescue-v85\.css\?v=85/);
});
