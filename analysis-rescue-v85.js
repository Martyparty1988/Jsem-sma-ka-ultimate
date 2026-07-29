/* Smažka v85 — delayed, user-controlled escape hatch for slow iOS result handoffs. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const guard = window.SmazkaAnalysisCompletionGuard;
  const state = app?.state;
  const elements = app?.elements;
  const appRoot = elements?.app;
  const scanHint = elements?.scanHint;
  const result = elements?.result;
  if (!state || !appRoot || !scanHint || !result || typeof guard?.recoverNow !== 'function') return;

  const SHOW_AFTER_MS = 4300;
  let revealTimer = 0;
  let generation = 0;
  let recoveryRunning = false;

  const panel = document.createElement('div');
  panel.className = 'analysis-rescue-v85';
  panel.hidden = true;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Nouzové dokončení pomalé analýzy');
  panel.innerHTML = `
    <span class="analysis-rescue-copy">
      <strong>Systém se zdržel v předsálí.</strong>
      <small>Použiju už naměřená data.</small>
    </span>
    <button class="analysis-rescue-button" type="button">Vynutit rozsudek</button>
  `;
  scanHint.insertAdjacentElement('afterend', panel);

  const copy = panel.querySelector('.analysis-rescue-copy');
  const button = panel.querySelector('.analysis-rescue-button');

  function resultIsOpen() {
    return document.body.classList.contains('result-open')
      || (!result.classList.contains('hidden') && (result.open || result.hasAttribute('open')));
  }

  function analysisIsDelayed() {
    const busy = state.isAnalyzing || appRoot.getAttribute('aria-busy') === 'true';
    const scannerActive = document.body.classList.contains('face-scan-active');
    return busy && !scannerActive && !resultIsOpen();
  }

  function clearRevealTimer() {
    window.clearTimeout(revealTimer);
    revealTimer = 0;
  }

  function hidePanel() {
    generation += 1;
    clearRevealTimer();
    panel.hidden = true;
    panel.classList.remove('is-recovering');
    panel.setAttribute('aria-hidden', 'true');
    button.disabled = false;
    button.textContent = 'Vynutit rozsudek';
    copy.innerHTML = '<strong>Systém se zdržel v předsálí.</strong><small>Použiju už naměřená data.</small>';
  }

  function showPanel(sequence) {
    if (sequence !== generation || !analysisIsDelayed() || recoveryRunning) return;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    appRoot.dataset.analysisRescue = 'v85';
  }

  function armPanel() {
    if (revealTimer || !analysisIsDelayed() || recoveryRunning) return;
    const sequence = ++generation;
    revealTimer = window.setTimeout(() => {
      revealTimer = 0;
      showPanel(sequence);
    }, SHOW_AFTER_MS);
  }

  function sync() {
    if (analysisIsDelayed()) {
      if (panel.hidden) armPanel();
      return;
    }
    hidePanel();
    delete appRoot.dataset.analysisRescue;
  }

  async function recover() {
    if (recoveryRunning || !analysisIsDelayed()) return;
    recoveryRunning = true;
    clearRevealTimer();
    panel.classList.add('is-recovering');
    button.disabled = true;
    button.textContent = 'Otevírám rozsudek…';
    copy.innerHTML = '<strong>Obcházím zaseknutý mezikrok.</strong><small>Verdikt ani biometriku neměním.</small>';

    try {
      await Promise.resolve(guard.recoverNow());
    } catch (error) {
      console.error('Ruční dokončení analýzy selhalo:', error);
      app.setBusy(false);
      elements.loading?.classList.add('hidden');
      app.showError?.('Nouzové dokončení selhalo. Aplikace je odemčená, zkus sken znovu.');
    } finally {
      recoveryRunning = false;
      sync();
    }
  }

  button.addEventListener('click', () => void recover());

  const observer = new MutationObserver(sync);
  observer.observe(appRoot, { attributes: true, attributeFilter: ['aria-busy'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  observer.observe(result, {
    attributes: true,
    childList: true,
    attributeFilter: ['class', 'open']
  });

  window.addEventListener('smazka:analysis-guard-recovered', hidePanel);
  window.addEventListener('pagehide', () => {
    generation += 1;
    clearRevealTimer();
    observer.disconnect();
    panel.remove();
  }, { once: true });

  window.SmazkaAnalysisRescue = Object.freeze({
    version: 85,
    showAfterMs: SHOW_AFTER_MS,
    isVisible: () => !panel.hidden,
    recoverNow: recover
  });

  sync();
})();
