import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('result semantics and order are owned by app render source', () => {
  const app = readRoot('app.js');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const poster = readRoot('result-poster-runtime.js');
  const css = readRoot('result-poster.css');
  const screens = readRoot('screens.css');

  assert.match(app, /badge\.textContent = 'SMAŽKA FAKTOR'/);
  assert.match(app, /effectLabel\.className = 'effect-label result-score'/);
  assert.match(app, /resultVisual\.append\(effectImage, effectNoise\)/);
  assert.match(app, /content\.append\(resultVisual, badge, effectLabel, title, text, actions\)/);
  assert.doesNotMatch(app, /VOID VERDIKT \/\/ \$\{todayLabel\}/);

  assert.doesNotMatch(lifecycle, /badge\.textContent = 'VOID VERDIKT'/);
  assert.match(lifecycle, /result\.querySelector\('\.effect-label'\)/);
  assert.doesNotMatch(lifecycle, /visual\?\.querySelector\('\.effect-label'\)/);

  assert.doesNotMatch(poster, /promoteScore|settleVisibleResult|settleAttempts/);
  assert.doesNotMatch(css, /result-badge::after|content:\s*'SMAŽKA FAKTOR'/);
  assert.doesNotMatch(screens, /body\.result-in-frame[^,{]*\.effect-label/);
});
