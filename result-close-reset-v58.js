/* Smažka v58 — closing a verdict always returns to a clean, usable scanner. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const result = app?.elements?.result || document.getElementById('result');
  const backdrop = app?.elements?.resultBackdrop || document.getElementById('resultBackdrop');
  if (!result) return;

  let resetting = false;

  async function resetToScanner() {
    if (resetting) return;
    resetting = true;

    try {
      /* Reuse the app's own reset path whenever the rendered button exists. */
      const newScanButton = result.querySelector('.new-scan-button');
      if (newScanButton && !newScanButton.disabled) {
        newScanButton.click();
        return;
      }

      /* Defensive fallback for an incomplete result DOM. */
      app?.hideResult?.();
      window.SmazkaFaceScan?.reset?.();
      app?.clearCurrentImage?.();
      app?.clearErrors?.();
      app?.setBusy?.(false);

      const elements = app?.elements;
      elements?.retakeButton?.classList.add('hidden');
      elements?.analyzeButton?.classList.remove('hidden');
      elements?.uploadButton?.classList.remove('hidden');
      await app?.initCamera?.();
      window.requestAnimationFrame(() => elements?.analyzeButton?.focus({ preventScroll: true }));
    } finally {
      window.setTimeout(() => {
        resetting = false;
      }, 300);
    }
  }

  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest?.('.result-close');
    const clickedBackdrop = backdrop && event.target === backdrop;
    if (!closeButton && !clickedBackdrop) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    resetToScanner();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || result.classList.contains('hidden')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    resetToScanner();
  }, true);
})();