/* Smažka v76 — keep one face-warp render and reuse it for result + sharing. */
(() => {
  'use strict';

  function createResultToken({ title = '', severity = 50, imageData = '' } = {}) {
    return `${String(title)}|${Number(severity)}|${String(imageData).slice(-32)}`;
  }

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result) {
    globalThis.SmazkaSinglePassResult = Object.freeze({ createResultToken });
    return;
  }

  const { state, elements } = app;
  const result = elements.result;
  let syncFrame = 0;

  function currentToken() {
    return createResultToken({
      title: state.lastAnalysisResult?.title || '',
      severity: Number(state.lastAnalysisResult?.severity || state.effectSeverity || 50),
      imageData: state.currentImageData || ''
    });
  }

  function preparedImage(visual) {
    const media = visual?.querySelector(
      ':scope > img:not(.junkie-share-source), '
      + ':scope > .junkie-polished-image, '
      + ':scope > .junkie-morph-final'
    );
    return media?.currentSrc || media?.src || state.effectImageData || '';
  }

  function lockCurrentResult() {
    if (result.classList.contains('hidden') || !state.currentImageData) return false;
    const visual = result.querySelector('.result-visual');
    if (!visual) return false;

    const imageData = preparedImage(visual);
    const token = currentToken();
    if (!imageData || !token) return false;

    // face-warp.js uses the same token before starting its legacy second render.
    // Setting it synchronously inside the MutationObserver makes that pass a no-op.
    result.dataset.warpToken = token;
    result.dataset.renderStrategy = 'single-pass-v76';
    visual.dataset.renderSource = 'prepared-face-warp';

    state.effectImageData = imageData;
    state.shareImagePromise = Promise.resolve(imageData);
    return true;
  }

  function scheduleLock() {
    window.cancelAnimationFrame(syncFrame);
    syncFrame = window.requestAnimationFrame(lockCurrentResult);
  }

  const observer = new MutationObserver(() => {
    // Run immediately: the legacy observer only schedules its work for the next frame.
    lockCurrentResult();
    scheduleLock();
  });
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src']
  });

  window.addEventListener('resize', scheduleLock, { passive: true });
  window.addEventListener('orientationchange', scheduleLock, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleLock, { passive: true });
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(syncFrame);
  }, { once: true });

  globalThis.SmazkaSinglePassResult = Object.freeze({
    createResultToken,
    lockCurrentResult
  });

  lockCurrentResult();
})();
