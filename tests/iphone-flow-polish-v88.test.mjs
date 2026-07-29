import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('v88 scanner hides chrome through one explicit busy-state contract', () => {
  const app = readRoot('app.js');
  const screens = readRoot('screens.css');

  assert.match(app, /document\.body\.classList\.toggle\('analysis-active', Boolean\(isBusy\)\)/);
  assert.match(screens, /body\.face-scan-active \.camera-control-dock/);
  assert.match(screens, /body\.analysis-active \.camera-control-dock/);
  assert.match(screens, /body\.analysis-active \.privacy-strip/);
  assert.match(screens, /var\(--visible-viewport-height, 100dvh\)/);
  assert.match(screens, /env\(safe-area-inset-right\)/);
  assert.match(screens, /env\(safe-area-inset-left\)/);
});

test('v88 result keeps verdict above the fold and shrinks for the protocol', () => {
  const lifecycle = readRoot('lifecycle-runtime.js');
  const screens = readRoot('screens.css');

  assert.match(lifecycle, /clamp\(280px, 44dvh, 410px\)/);
  assert.match(lifecycle, /clamp\(128px, 17dvh, 154px\)/);
  assert.match(lifecycle, /setImportant\(visual, 'flex', '0 0 auto'\)/);
  assert.match(lifecycle, /summary\.className = 'result-summary'/);
  assert.match(screens, /\.result:not\(\.details-open\) \.result-summary/);
  assert.match(screens, /position:\s*sticky\s*!important/);
});

test('v88 exposes one Smažka-native protocol and compact result tools', () => {
  const result = readRoot('result-runtime.js');
  const lifecycle = readRoot('lifecycle-runtime.js');

  assert.match(result, /TOXIKOLOGICKÝ PROTOKOL/);
  assert.match(lifecycle, /Otevřít toxikologický protokol/);
  assert.doesNotMatch(`${result}\n${lifecycle}`, /PITEVNÍ|pitevní zprávu|detailní rozbor/);
  assert.match(result, /className = 'effect-reroll-button'/);
  assert.match(result, />Jiný efekt</);
  assert.match(result, /className = 'save-choice-menu'/);
  assert.match(result, />Uložit…</);
  assert.match(result, /panel\.appendChild\(box\)/);
});

test('v88 diagnostics preserve exact scores and four visual severity tiers', () => {
  const result = readRoot('result-runtime.js');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const screens = readRoot('screens.css');

  assert.match(result, /row\.dataset\.score = String\(score\)/);
  assert.match(result, /is-\$\{tier\}/);
  assert.match(lifecycle, /classifyDiagnosticSeverity/);
  ['is-low', 'is-medium', 'is-high', 'is-critical'].forEach((tier) => {
    assert.equal(screens.includes(`.${tier}`), true, tier);
  });
  assert.match(result, /is-long-value/);
});
