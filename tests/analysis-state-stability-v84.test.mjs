import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../analysis-state-stability-v84.js', import.meta.url), 'utf8');

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
  const root = new URL('../', import.meta.url);
  const index = fs.readFileSync(new URL('index.html', root), 'utf8');
  const serviceWorker = fs.readFileSync(new URL('service-worker.js', root), 'utf8');

  const stability = index.indexOf('analysis-state-stability-v84.js?v=84');
  const guard = index.indexOf('analysis-completion-guard-v84.js?v=84');
  assert.ok(stability > -1);
  assert.ok(guard > stability);
  assert.match(serviceWorker, /\.\/analysis-state-stability-v84\.js\?v=84/);
});
