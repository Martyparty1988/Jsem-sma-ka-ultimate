/* Smažka runtime v101 — source DOM owns composition; runtime owns identity and detail state only. */
(() => {
  'use strict';

  const VERSION = 'v101';
  const POSTER_CLASS = 'result-poster-v99';
  const app = window.SmazkaApp;
  const result = app?.elements?.result;
  if (!result) return;

  const cameraStage = app.elements.cameraStage;
  const appRoot = app.elements.app;
  const Observer = window.SmazkaMutationObserver || window.MutationObserver;
  const mobileQuery = window.matchMedia('(max-width: 640px)');
  let animationFrame = 0;

  function installPosterIdentity() {
    [...result.classList]
      .filter((name) => /^result-poster-v\d+$/.test(name) && name !== POSTER_CLASS)
      .forEach((name) => result.classList.remove(name));
    if (!result.classList.contains(POSTER_CLASS)) result.classList.add(POSTER_CLASS);
    if (result.dataset.resultPoster !== VERSION) result.dataset.resultPoster = VERSION;
  }

  function resultVisible() {
    return !result.classList.contains('hidden')
      && (result.open || result.hasAttribute('open') || document.body.classList.contains('result-open'));
  }

  function normalizeBadge() {
    const badge = result.querySelector('.result-badge');
    if (badge && badge.textContent !== 'SMAŽKA FAKTOR') badge.textContent = 'SMAŽKA FAKTOR';
  }

  function updateDetailsLabel(button) {
    if (!button) return;
    const open = result.classList.contains('details-open');
    const expanded = String(open);
    if (button.getAttribute('aria-expanded') !== expanded) button.setAttribute('aria-expanded', expanded);
    const label = button.querySelector('.in-frame-details-label');
    const text = open ? 'Skrýt protokol smažky' : 'Otevřít protokol smažky';
    if (label && label.textContent !== text) label.textContent = text;
  }

  function setDetailsOpen(open) {
    result.classList.toggle('details-open', open);
    const button = result.querySelector('.in-frame-details-toggle');
    updateDetailsLabel(button);

    window.requestAnimationFrame(() => {
      const content = result.querySelector('.result-content');
      if (!content) return;
      if (!open) {
        content.scrollTo?.({ top: 0, behavior: 'smooth' });
        return;
      }
      const panel = result.querySelector('.diagnostic-panel');
      if (!panel || !button) return;
      content.scrollTo?.({
        top: Math.max(0, panel.offsetTop - button.offsetHeight - 8),
        behavior: 'smooth'
      });
    });
  }

  function ensureDetailsButton() {
    const description = result.querySelector('.description');
    if (!description) return null;

    let button = result.querySelector('.in-frame-details-toggle');
    if (!button || button.dataset.posterOwner !== VERSION) {
      const replacement = document.createElement('button');
      replacement.type = 'button';
      replacement.className = 'in-frame-details-toggle';
      replacement.dataset.posterOwner = VERSION;
      replacement.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-zap"></use></svg><span class="in-frame-details-label">Otevřít protokol smažky</span><i aria-hidden="true">⌄</i>';
      replacement.addEventListener('click', () => {
        setDetailsOpen(!result.classList.contains('details-open'));
      });
      button?.replaceWith(replacement);
      button = replacement;
    }

    if (button.previousElementSibling !== description) description.insertAdjacentElement('afterend', button);
    updateDetailsLabel(button);
    return button;
  }

  function retireLegacyFrameState() {
    // `result-in-frame` belongs to the retired pre-poster layout in screens.css.
    // Only mutate the class attribute when the legacy token is actually present;
    // no-op DOMTokenList writes can otherwise feed MutationObserver loops in WebKit.
    if (document.body.classList.contains('result-in-frame')) {
      document.body.classList.remove('result-in-frame');
    }
  }

  function syncFrame() {
    animationFrame = 0;
    installPosterIdentity();
    retireLegacyFrameState();

    if (!mobileQuery.matches || !resultVisible()) {
      if (result.classList.contains('details-open')) result.classList.remove('details-open');
      cameraStage?.classList.remove('has-in-frame-result');
      if (!resultVisible()) appRoot?.removeAttribute('inert');
      return;
    }

    cameraStage?.classList.add('has-in-frame-result');
    appRoot?.toggleAttribute('inert', true);
    normalizeBadge();
    ensureDetailsButton();
  }

  function scheduleSync() {
    // Coalesce rapid result mutations without cancelling the frame that is already queued.
    // Cancelling/restarting here can starve layout synchronization while diagnostics render.
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(syncFrame);
  }

  installPosterIdentity();
  retireLegacyFrameState();

  const observer = new Observer((records = []) => {
    if (records.some((record) => record.target === document.body)) retireLegacyFrameState();
    scheduleSync();
  });
  observer.observe(result, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'open']
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });

  window.addEventListener('resize', scheduleSync, { passive: true });
  window.addEventListener('orientationchange', scheduleSync, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleSync, { passive: true });
  mobileQuery.addEventListener?.('change', scheduleSync);

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }, { once: true });

  window.SmazkaResultPoster = Object.freeze({ version: 101, sync: scheduleSync });
  scheduleSync();
})();
