import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('v121 scanner owns one branded local intake and one status overlay', () => {
  const index = readRoot('index.html');
  const scanner = readRoot('scanner-runtime.js');
  const screens = readRoot('screens.css');

  assert.match(index, /<span class="brand-copy"[\s\S]*<strong>SMAŽKA<\/strong>[\s\S]*<small>LOKÁLNÍ FACE LAB<\/small>/);
  assert.match(index, /<span class="idle-protocol">PŘÍJEM VZORKU · LOKÁLNĚ<\/span>/);
  assert.match(index, /<strong class="idle-title">Čekám na obličej<\/strong>/);
  assert.match(index, /<span class="idle-copy">Kamera se otevře až po klepnutí<\/span>/);
  assert.match(index, /<span class="idle-local">[\s\S]*0 % upload[\s\S]*<\/span>/);
  assert.match(scanner, /status\.appendChild\(barWrap\)/);
  assert.match(scanner, /overlay\.append\(tracker, status\)/);
  assert.doesNotMatch(scanner, /overlay\.append\(tracker, status, barWrap\)/);
  assert.doesNotMatch(scanner, /SUBJECT TARGET|EYE \/\/ [LR]|MOUTH \/\/ TRACE/);

  assert.match(screens, /Smažka v121 — Quiet Scan intake, camera-stage and overlay polish/);
  assert.match(screens, /\.brand-copy\s*\{[\s\S]{0,180}display:\s*grid/);
  assert.match(screens, /\.camera-idle\s*\{[\s\S]{0,220}flex-direction:\s*column/);
  assert.match(screens, /\.idle-local\s*\{[\s\S]{0,240}min-height:\s*24px/);
  assert.match(screens, /#analyzeButton\s*\{[\s\S]{0,180}linear-gradient/);
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
