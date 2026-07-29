import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readBundleSection } from './bundle-source.mjs';

const source = readBundleSection('single-pass-result-v76.js');

function loadApi() {
  const context = {};
  context.globalThis = context;
  context.window = context;
  vm.runInNewContext(source, context);
  return context.SmazkaSinglePassResult;
}

test('single-pass token matches legacy face-warp token shape', () => {
  const api = loadApi();
  const imageData = `data:image/png;base64,${'x'.repeat(60)}TAIL`;
  const token = api.createResultToken({
    title: 'Testovací troska',
    severity: 73,
    imageData
  });

  assert.equal(token, `Testovací troska|73|${imageData.slice(-32)}`);
});

test('single-pass runtime locks the prepared result before a second warp', () => {
  assert.match(source, /result\.dataset\.warpToken = token/);
  assert.match(source, /renderStrategy = 'single-pass-v76'/);
  assert.match(source, /state\.effectImageData = imageData/);
  assert.match(source, /state\.shareImagePromise = Promise\.resolve\(imageData\)/);
  assert.doesNotMatch(source, /renderFaceEffect\s*\(/);
  assert.doesNotMatch(source, /createFinalImage\s*\(/);
});
