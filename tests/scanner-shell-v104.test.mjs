import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('v104 scanner owns one status overlay with an internal progress bar', () => {
  const scanner = readRoot('scanner-runtime.js');
  const screens = readRoot('screens.css');

  assert.match(scanner, /status\.appendChild\(barWrap\)/);
  assert.match(scanner, /overlay\.append\(tracker, status\)/);
  assert.doesNotMatch(scanner, /overlay\.append\(tracker, status, barWrap\)/);
  assert.doesNotMatch(scanner, /SUBJECT TARGET|EYE \/\/ [LR]|MOUTH \/\/ TRACE/);

  assert.match(screens, /Smažka v104 — Quiet Scan camera-stage and overlay polish/);
  assert.match(screens, /#scanStatus\s*\{[\s\S]{0,220}grid-template-columns:\s*auto minmax\(0, 1fr\) auto\s*!important/);
  assert.match(screens, /#scanBar\s*\{[\s\S]{0,220}position:\s*static\s*!important[\s\S]{0,120}grid-column:\s*1 \/ -1\s*!important/);
  assert.match(screens, /\.video-container::before\s*\{[\s\S]{0,100}display:\s*none\s*!important/);
  assert.match(screens, /\.video-container::after\s*\{[\s\S]{0,100}display:\s*none\s*!important/);
  assert.match(screens, /body\.face-scan-active \.boot-message\s*\{[\s\S]{0,240}max-height:\s*0\s*!important/);
});

test('v104 removes the retired confetti generator and cleanup observer', () => {
  const app = readRoot('app.js');
  const foundation = readRoot('foundation.css');
  const lifecycle = readRoot('lifecycle-runtime.js');

  assert.doesNotMatch(app, /triggerConfetti|confetti-layer|confetti-piece/);
  assert.doesNotMatch(foundation, /confettiFall|confetti-layer|confetti-piece/);
  assert.doesNotMatch(lifecycle, /removeLegacyConfetti|legacyEffectsObserver|confetti-layer|confetti-piece/);
});
