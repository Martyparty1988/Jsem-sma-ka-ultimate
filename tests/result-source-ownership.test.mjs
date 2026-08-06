import assert from 'node:assert/strict';
import test from 'node:test';
import { readBundleSection, readRoot } from './bundle-source.mjs';

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

test('v115 share protocol has one lazy owner and uses measured biometric findings', () => {
  const lifecycle = readRoot('lifecycle-runtime.js');
  const share = readBundleSection('share-cover-v77.js');
  const result = readRoot('result-runtime.js');

  assert.match(lifecycle, /const WIDTH = 1080;\s*const HEIGHT = 1350/);
  assert.match(lifecycle, /function collectBiometricFindings\(faceAnalysis\)/);
  assert.match(lifecycle, /const metrics = faceAnalysis\?\.metrics \|\| state\.lastDevastationMetrics/);
  assert.match(share, /result\.querySelector\('\.effect-label strong'\)/);
  assert.doesNotMatch(share, /visual\?\.querySelector\('\.effect-label strong'\)/);
  assert.match(lifecycle, /\.sort\(\(first, second\) => second\.score - first\.score\)\s*\.slice\(0, 3\)/);
  assert.match(lifecycle, /SMAŽKA PROTOKOL/);
  assert.match(lifecycle, /TOXIKOLOGIE Z BENZÍNKY · 0 % DIAGNÓZA/);
  assert.match(lifecycle, /SMAŽKA FAKTOR/);
  assert.match(lifecycle, /STOPOVÉ MNOŽSTVÍ CHAOSU/);
  assert.match(lifecycle, /VZOREK HOŘÍ/);
  assert.match(lifecycle, /PŘÍSTROJ DAL VÝPOVĚĎ/);
  assert.match(lifecycle, /function drawFakeBarcode\(/);
  assert.match(lifecycle, /renderProtocolBlob/);
  assert.doesNotMatch(share, /LOKÁLNÍ PSEUDO AI \/\/ VOID SCAN|VOID VERDIKT/);
  assert.doesNotMatch(result, /function drawShareCard\(|LOKÁLNÍ AI DETEKCE DEVASTACE/);
});
