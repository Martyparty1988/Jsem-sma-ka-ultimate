/* Smažka v98 — source DOM owns composition; runtime owns identity and detail state only. */
(() => {
  'use strict';

  const VERSION = 'v98';
  const POSTER_CLASS = 'result-poster-v98';
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
    result.classList.add(POSTER_CLASS);
    result.dataset.resultPoster = VERSION;
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
    button.setAttribute('aria-expanded', String(open));
    const label = button.querySelector('.in-frame-details-label');
    if (label) label.textContent = open ? 'Skrýt detailní rozbor' : 'Zobrazit detailní rozbor';
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
      replacement.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-zap"></use></svg><span class="in-frame-details-label">Zobrazit detailní rozbor</span><i aria-hidden="true">⌄</i>';
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

  function syncFrame() {
    installPosterIdentity();
    if (!mobileQuery.matches || !resultVisible()) {
      result.classList.remove('details-open');
      document.body.classList.remove('result-in-frame');
      cameraStage?.classList.remove('has-in-frame-result');
      if (!resultVisible()) appRoot?.removeAttribute('inert');
      return;
    }

    document.body.classList.add('result-in-frame');
    cameraStage?.classList.add('has-in-frame-result');
    appRoot?.toggleAttribute('inert', true);
    normalizeBadge();
    ensureDetailsButton();
  }

  function scheduleSync() {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(syncFrame);
  }

  installPosterIdentity();

  const observer = new Observer(scheduleSync);
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
  }, { once: true });

  window.SmazkaResultPoster = Object.freeze({ version: 98, sync: scheduleSync });
  scheduleSync();
})();
