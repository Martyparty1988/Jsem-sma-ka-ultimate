import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoot } from './bundle-source.mjs';

test('Kartotéka UI has one renderer, a native dialog and never reaches for sensitive scan data', () => {
  const app = readRoot('app.js');
  const css = readRoot('screens.css');

  assert.match(app, /function renderKartoteka\(dialog\)/);
  assert.match(app, /function setupKartoteka\(\)/);
  assert.match(app, /dialog\.showModal\(\)/);
  assert.match(app, /saveKartotekaRecord\(category, severity\)/);
  assert.match(app, /Fotky ani body obličeje se sem nikdy nepíšou/);
  assert.doesNotMatch(app.slice(app.indexOf('function saveKartotekaRecord'), app.indexOf('function hideResult')), /currentImageData|faceAnalysis|landmarks/);
  assert.match(css, /\.kartoteka-dialog::backdrop/);
  assert.match(css, /\.kartoteka-close[\s\S]{0,220}width:\s*44px/);
});
