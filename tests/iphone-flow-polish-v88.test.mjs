import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('v90 scanner hides chrome through one explicit busy-state contract', () => {
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

test('v90 result keeps verdict above the fold and shrinks for the protocol', () => {
  const lifecycle = readRoot('lifecycle-runtime.js');
  const screens = readRoot('screens.css');

  assert.match(lifecycle, /clamp\(280px, 44dvh, 410px\)/);
  assert.match(lifecycle, /clamp\(128px, 17dvh, 154px\)/);
  assert.match(lifecycle, /setImportant\(visual, 'flex', '0 0 auto'\)/);
  assert.match(lifecycle, /summary\.className = 'result-summary'/);
  assert.match(screens, /\.result:not\(\.details-open\) \.result-summary/);
  assert.match(screens, /position:\s*sticky\s*!important/);
});

test('v90 exposes one Smažka-native protocol and compact result tools', () => {
  const result = readRoot('result-runtime.js');
  const lifecycle = readRoot('lifecycle-runtime.js');

  assert.match(result, /Toxikologický protokol/);
  assert.match(result, /VOID LAB · 468 BODŮ · 0 % VĚDY/);
  assert.match(result, /diagnostic-count/);
  assert.match(result, /dataset\.marker/);
  assert.match(lifecycle, /Otevřít toxikologický protokol/);
  assert.doesNotMatch(`${result}\n${lifecycle}`, /PITEVNÍ|pitevní zprávu|detailní rozbor/);
  assert.match(result, /className = 'effect-reroll-button'/);
  assert.match(result, />Jiný efekt</);
  assert.match(result, /className = 'save-choice-menu'/);
  assert.match(result, />Uložit…</);
  assert.match(result, /panel\.appendChild\(box\)/);
});

test('v90 diagnostics preserve exact values but colors them by actual risk', () => {
  const result = readRoot('result-runtime.js');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const screens = readRoot('screens.css');

  assert.match(result, /row\.dataset\.score = String\(score\)/);
  assert.match(result, /row\.dataset\.risk = String\(risk\)/);
  assert.match(result, /risk: 100 - pupils/);
  assert.match(result, /risk: keys/);
  assert.match(result, /is-\$\{tier\}/);
  assert.match(lifecycle, /function diagnosticRisk/);
  assert.match(lifecycle, /row\.dataset\.risk/);
  assert.match(lifecycle, /classifyDiagnosticSeverity/);
  ['is-low', 'is-medium', 'is-high', 'is-critical'].forEach((tier) => {
    assert.equal(screens.includes(`.${tier}`), true, tier);
  });
  assert.match(screens, /grid-template-columns:\s*28px minmax\(0,\s*1fr\)/);
  assert.match(screens, /content:\s*attr\(data-marker\)/);
  assert.match(screens, /diagnostic-heading-copy/);
  assert.match(screens, /secondary-diagnosis-heading/);
  assert.match(result, /is-long-value/);
  assert.match(result, /is-status-value/);
});

test('v90 keeps protocol content clear of the isolated action dock', () => {
  const app = readRoot('app.js');
  const result = readRoot('result-runtime.js');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const screens = readRoot('screens.css');

  assert.match(lifecycle, /Zavřít protokol/);
  assert.match(lifecycle, /resultLayout = 'v90'/);
  assert.match(app, /content\.append\(resultVisual, title, text, actions\)/);
  assert.match(lifecycle, /actions\?\.parentElement === content/);
  assert.match(lifecycle, /result\.appendChild\(actions\)/);
  assert.match(lifecycle, /if \(content && actions\) content\.appendChild\(actions\)/);
  assert.match(result, /elements\.result\.querySelector\(':scope > \.result-actions'\)/);
  assert.match(screens, /grid-template-rows:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(screens, /result\.details-open:not\(\.hidden\) \.result-actions[\s\S]*grid-row:\s*2/);
  assert.match(screens, /result\.details-open:not\(\.hidden\) \.result-actions[\s\S]*position:\s*relative/);
  assert.match(screens, /--diagnostic-panel-background/);
  assert.match(screens, /--polish-control-background/);
  assert.match(screens, /\.diagnostic-row\.is-status-value:not\(\.is-long-value\) \.diagnostic-copy/);
  assert.match(screens, /\.diagnostic-panel::before/);
});
