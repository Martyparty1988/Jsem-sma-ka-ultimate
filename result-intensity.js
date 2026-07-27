/* Smažka v47 — map verdict severity to calm, disturbed and critical result states. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const result = app?.elements?.result || document.getElementById('result');
  const backdrop = app?.elements?.resultBackdrop || document.getElementById('resultBackdrop');
  if (!result) return;

  let lastToken = '';

  function readSeverity() {
    const stateValue = Number(app?.state?.lastAnalysisResult?.severity || app?.state?.effectSeverity);
    if (Number.isFinite(stateValue) && stateValue > 0) return Math.max(0, Math.min(100, stateValue));

    const label = result.querySelector('.effect-label strong')?.textContent || '';
    const parsed = Number.parseFloat(label.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
  }

  function modeFor(severity) {
    if (severity >= 80) return 'critical';
    if (severity >= 50) return 'disturbed';
    return 'calm';
  }

  function clearIntensity() {
    lastToken = '';
    result.removeAttribute('data-intensity');
    result.style.removeProperty('--verdict-severity');
    backdrop?.removeAttribute('data-intensity');
    document.body.removeAttribute('data-result-intensity');
  }

  function applyIntensity() {
    if (result.classList.contains('hidden')) {
      clearIntensity();
      return;
    }

    const severity = readSeverity();
    const mode = modeFor(severity);
    const token = `${mode}:${Math.round(severity)}`;
    if (token === lastToken) return;
    lastToken = token;

    result.dataset.intensity = mode;
    result.style.setProperty('--verdict-severity', String(severity / 100));
    backdrop?.setAttribute('data-intensity', mode);
    document.body.dataset.resultIntensity = mode;
  }

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(applyIntensity);
  });

  observer.observe(result, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class']
  });

  applyIntensity();

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    clearIntensity();
  }, { once: true });
})();
