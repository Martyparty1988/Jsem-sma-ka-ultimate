/* Smažka v84 — make busy state writes idempotent across result observers. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const state = app?.state;
  const appRoot = app?.elements?.app;
  const nativeSetBusy = app?.setBusy;
  if (!state || !appRoot || typeof nativeSetBusy !== 'function' || app.__stableBusyV84) return;

  function stableSetBusy(value) {
    const next = Boolean(value);
    const attributeValue = String(next);
    if (
      state.isAnalyzing === next
      && appRoot.getAttribute('aria-busy') === attributeValue
    ) return undefined;
    return nativeSetBusy.call(app, next);
  }

  app.setBusy = stableSetBusy;
  Object.defineProperty(app, '__stableBusyV84', {
    configurable: false,
    enumerable: false,
    value: true
  });

  window.SmazkaAnalysisStateStability = Object.freeze({
    version: 84,
    isStable: () => app.setBusy === stableSetBusy
  });
})();
