import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('result semantics and order are owned by app render source', () => {
  const app = readRoot('app.js');
  const lifecycle = readRoot('lifecycle-runtime.js');
  const poster = readRoot('result-poster-runtime.js');
  const css = readRoot('screens.css');

  assert.match(app, /badge\.textContent = 'SMAŽKA FAKTOR'/);
  assert.match(app, /effectLabel\.className = 'effect-label result-score'/);
  assert.match(app, /resultVisual\.append\(effectImage, effectNoise\)/);
  assert.match(app, /content\.append\(resultVisual, badge, effectLabel, title, text, actions\)/);
  assert.doesNotMatch(app, /VOID VERDIKT \/\/ \$\{todayLabel\}/);

  assert.doesNotMatch(lifecycle, /badge\.textContent = 'VOID VERDIKT'/);
  assert.match(lifecycle, /result\.querySelector\('\.effect-label'\)/);
  assert.doesNotMatch(lifecycle, /visual\?\.querySelector\('\.effect-label'\)/);

  assert.doesNotMatch(poster, /promoteScore|settleVisibleResult|settleAttempts/);
  assert.match(poster, /classList\.remove\('result-in-frame'\)/);
  assert.doesNotMatch(poster, /classList\.add\('result-in-frame'\)/);
  assert.doesNotMatch(css, /result-badge::after|content:\s*'SMAŽKA FAKTOR'/);
  assert.doesNotMatch(css, /body\.result-in-frame[^,{]*\.effect-label/);
});

test('SMAŽKA protocol copy has one semantic owner and cannot regress to the autopsy theme', () => {
  const result = readRoot('result-runtime.js');
  const poster = readRoot('result-poster-runtime.js');

  assert.match(result, /<strong>SMAŽKA PROTOKOL<\/strong><small>toxikologie z benzínky · 0 % diagnóza<\/small>/);
  assert.match(result, /label: 'Zorničkový nález'/);
  assert.match(result, /label: 'Toxikologický poplach'/);
  assert.match(result, /label: 'Motorika subjektu'/);
  assert.match(result, /label: 'Odezva posledního neuronu'/);
  assert.doesNotMatch(result, /PITEVNÍ AI ROZBOR|pitevní zprávu|Falešný detailní AI rozbor/);
  assert.match(poster, /open \? 'Skrýt protokol smažky' : 'Otevřít protokol smažky'/);
  assert.doesNotMatch(poster, /detailní rozbor/);
});
