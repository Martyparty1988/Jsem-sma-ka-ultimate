import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readBundleSection, readRoot } from './bundle-source.mjs';

const source = readBundleSection('analysis-state-stability-v84.js');

test('v84 busy state wrapper ignores duplicate writes but preserves real transitions', () => {
  const attributes = new Map([['aria-busy', 'false']]);
  const appRoot = {
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); }
  };
  const state = { isAnalyzing: false };
  let nativeCalls = 0;
  const app = {
    state,
    elements: { app: appRoot },
    setBusy(value) {
      nativeCalls += 1;
      state.isAnalyzing = Boolean(value);
      appRoot.setAttribute('aria-busy', String(Boolean(value)));
    }
  };
  const context = { window: { SmazkaApp: app }, Object, Boolean, String };
  context.globalThis = context;

  vm.runInNewContext(source, context);
  assert.equal(context.window.SmazkaAnalysisStateStability.version, 84);

  app.setBusy(false);
  assert.equal(nativeCalls, 0);

  app.setBusy(true);
  assert.equal(nativeCalls, 1);
  assert.equal(state.isAnalyzing, true);

  app.setBusy(true);
  assert.equal(nativeCalls, 1);

  app.setBusy(false);
  assert.equal(nativeCalls, 2);
  assert.equal(state.isAnalyzing, false);
});

test('v84 busy state runtime loads before the completion observer and is cached', () => {
  const lifecycle = readRoot('lifecycle-runtime.js');
  const serviceWorker = readRoot('service-worker.js');

  const stability = lifecycle.indexOf('/* === analysis-state-stability-v84.js === */');
  const guard = lifecycle.indexOf('/* === analysis-completion-guard-v84.js === */');
  assert.ok(stability > -1);
  assert.ok(guard > stability);
  assert.match(serviceWorker, /\.\/lifecycle-runtime\.js\?v=115/);
});
