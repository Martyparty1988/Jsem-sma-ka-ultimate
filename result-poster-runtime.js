/* Smažka v91 — sole mobile result lifecycle and geometry owner. */
(() => {
  'use strict';

  const VERSION = 'v91';
  const POSTER_CLASS = 'result-poster-v91';
  const MEDIA_SELECTOR = 'img, canvas';
  const app = window.SmazkaApp;
  const result = app?.elements?.result;
  if (!result) return;

  const cameraStage = app.elements.cameraStage;
  const appRoot = app.elements.app;
  const Observer = window.SmazkaMutationObserver || window.MutationObserver;
  const mobileQuery = window.matchMedia('(max-width: 640px)');
  let animationFrame = 0;

  function setImportant(element, property, value) {
    element?.style.setProperty(property, value, 'important');
  }

  function clearProperties(element, properties) {
    properties.forEach((property) => element?.style.removeProperty(property));
  }

  function resultVisible() {
    return !result.classList.contains('hidden')
      && (result.open || result.hasAttribute('open') || document.body.classList.contains('result-open'));
  }

  function viewportMetrics() {
    const viewport = window.visualViewport;
    return {
      top: viewport?.offsetTop || 0,
      left: viewport?.offsetLeft || 0,
      width: viewport?.width || window.innerWidth,
      height: viewport?.height || window.innerHeight
    };
  }

  function normalizeBadge() {
    const badge = result.querySelector('.result-badge');
    if (!badge) return;
    const value = String(badge.textContent || '').trim();
    if (!value.includes('//')) return;
    badge.textContent = `SCAN • ${value.split('//').pop().trim().toLocaleUpperCase('cs-CZ')}`;
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
    scheduleSync();

    window.requestAnimationFrame(() => {
      const content = result.querySelector('.result-content');
      if (!content) return;
      if (!open) {
        content.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const panel = result.querySelector('.diagnostic-panel');
      if (!panel || !button) return;
      content.scrollTo({
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

  function syncMedia(visual) {
    visual?.querySelectorAll(MEDIA_SELECTOR).forEach((media) => {
      setImportant(media, 'position', 'absolute');
      setImportant(media, 'inset', '0');
      setImportant(media, 'width', '100%');
      setImportant(media, 'height', '100%');
      setImportant(media, 'min-width', '100%');
      setImportant(media, 'min-height', '100%');
      setImportant(media, 'max-width', 'none');
      setImportant(media, 'max-height', 'none');
      setImportant(media, 'display', 'block');
      setImportant(media, 'object-fit', 'cover');
      setImportant(media, 'object-position', result.classList.contains('details-open') ? '50% 38%' : '50% 34%');
      setImportant(media, 'transform', 'none');
      setImportant(media, 'transform-origin', '50% 50%');
      if (media instanceof HTMLImageElement && !media.dataset.posterLoadBound) {
        media.dataset.posterLoadBound = VERSION;
        media.addEventListener('load', scheduleSync, { once: true });
      }
    });
  }

  function syncClosedComposition(content, visual) {
    setImportant(content, 'display', 'flex');
    setImportant(content, 'flex-direction', 'column');
    setImportant(content, 'align-items', 'stretch');
    setImportant(content, 'justify-content', 'flex-start');
    setImportant(content, 'gap', '8px');
    setImportant(content, 'height', '100%');
    setImportant(content, 'min-height', '100%');
    setImportant(content, 'max-height', '100%');
    setImportant(content, 'padding-top', 'clamp(455px, 62dvh, 630px)');
    setImportant(content, 'padding-right', 'clamp(14px, 4vw, 20px)');
    setImportant(content, 'padding-bottom', 'max(14px, env(safe-area-inset-bottom))');
    setImportant(content, 'padding-left', 'clamp(14px, 4vw, 20px)');
    setImportant(content, 'overflow-x', 'hidden');
    setImportant(content, 'overflow-y', 'auto');
    setImportant(content, 'overscroll-behavior', 'contain');

    Array.from(content.children).forEach((child) => setImportant(child, 'flex', '0 0 auto'));

    setImportant(visual, 'position', 'absolute');
    setImportant(visual, 'z-index', '0');
    setImportant(visual, 'inset', '0');
    setImportant(visual, 'width', '100%');
    setImportant(visual, 'height', '100%');
    setImportant(visual, 'min-height', '100%');
    setImportant(visual, 'max-height', 'none');
    setImportant(visual, 'flex', '0 0 auto');
    setImportant(visual, 'aspect-ratio', 'auto');
    setImportant(visual, 'margin', '0');
    setImportant(visual, 'overflow', 'hidden');
    setImportant(visual, 'border-radius', '0');
  }

  function syncDetailsComposition(content, visual) {
    setImportant(content, 'display', 'flex');
    setImportant(content, 'flex-direction', 'column');
    setImportant(content, 'align-items', 'stretch');
    setImportant(content, 'justify-content', 'flex-start');
    setImportant(content, 'gap', '9px');
    setImportant(content, 'height', '100%');
    setImportant(content, 'min-height', '0');
    setImportant(content, 'max-height', '100%');
    setImportant(content, 'padding-top', '0');
    setImportant(content, 'padding-right', '14px');
    setImportant(content, 'padding-bottom', 'max(14px, env(safe-area-inset-bottom))');
    setImportant(content, 'padding-left', '14px');
    setImportant(content, 'overflow-x', 'hidden');
    setImportant(content, 'overflow-y', 'auto');
    setImportant(content, 'overscroll-behavior', 'contain');

    Array.from(content.children).forEach((child) => setImportant(child, 'flex', '0 0 auto'));

    setImportant(visual, 'position', 'relative');
    setImportant(visual, 'z-index', '0');
    setImportant(visual, 'inset', 'auto');
    setImportant(visual, 'width', 'calc(100% + 28px)');
    setImportant(visual, 'height', 'clamp(190px, 28dvh, 250px)');
    setImportant(visual, 'min-height', '190px');
    setImportant(visual, 'max-height', '250px');
    setImportant(visual, 'flex', '0 0 auto');
    setImportant(visual, 'aspect-ratio', 'auto');
    setImportant(visual, 'margin', '0 -14px 4px');
    setImportant(visual, 'overflow', 'hidden');
    setImportant(visual, 'border-radius', '0 0 24px 24px');
  }

  function syncFrame() {
    if (!mobileQuery.matches || !resultVisible()) {
      clearPosterState();
      return;
    }

    const content = result.querySelector('.result-content');
    const visual = result.querySelector('.result-visual');
    if (!content || !visual) return;

    const viewport = viewportMetrics();
    result.classList.add(POSTER_CLASS);
    result.dataset.resultPoster = VERSION;
    document.body.classList.add('result-in-frame');
    cameraStage?.classList.add('has-in-frame-result');
    appRoot?.toggleAttribute('inert', true);
    ensureDetailsButton();

    setImportant(result, 'position', 'fixed');
    setImportant(result, 'z-index', '2147483000');
    setImportant(result, 'top', `${Math.round(viewport.top)}px`);
    setImportant(result, 'right', 'auto');
    setImportant(result, 'bottom', 'auto');
    setImportant(result, 'left', `${Math.round(viewport.left)}px`);
    setImportant(result, 'width', `${Math.max(1, Math.round(viewport.width))}px`);
    setImportant(result, 'height', `${Math.max(1, Math.round(viewport.height))}px`);
    setImportant(result, 'min-width', '0');
    setImportant(result, 'max-width', 'none');
    setImportant(result, 'max-height', `${Math.max(1, Math.round(viewport.height))}px`);
    setImportant(result, 'margin', '0');
    setImportant(result, 'overflow', 'hidden');
    setImportant(result, 'pointer-events', 'auto');
    setImportant(result, 'isolation', 'isolate');

    if (result.classList.contains('details-open')) syncDetailsComposition(content, visual);
    else syncClosedComposition(content, visual);

    syncMedia(visual);
    normalizeBadge();
  }

  function clearPosterState() {
    result.classList.remove(POSTER_CLASS, 'details-open');
    delete result.dataset.resultPoster;
    document.body.classList.remove('result-in-frame');
    cameraStage?.classList.remove('has-in-frame-result');
    if (!resultVisible()) appRoot?.removeAttribute('inert');

    clearProperties(result, [
      'position', 'z-index', 'top', 'right', 'bottom', 'left', 'width', 'height',
      'min-width', 'max-width', 'max-height', 'margin', 'overflow', 'pointer-events', 'isolation'
    ]);

    const content = result.querySelector('.result-content');
    const visual = result.querySelector('.result-visual');
    clearProperties(content, [
      'display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'height',
      'min-height', 'max-height', 'padding-top', 'padding-right', 'padding-bottom',
      'padding-left', 'overflow-x', 'overflow-y', 'overscroll-behavior'
    ]);
    Array.from(content?.children || []).forEach((child) => child.style.removeProperty('flex'));
    clearProperties(visual, [
      'position', 'z-index', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'height',
      'min-height', 'max-height', 'flex', 'aspect-ratio', 'margin', 'overflow', 'border-radius'
    ]);
  }

  function scheduleSync() {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(syncFrame);
  }

  const observer = new Observer(scheduleSync);
  observer.observe(result, {
    childList: true,
    subtree: true,
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
  window.visualViewport?.addEventListener('scroll', scheduleSync, { passive: true });
  mobileQuery.addEventListener?.('change', scheduleSync);

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(animationFrame);
    clearPosterState();
  }, { once: true });

  window.SmazkaResultPoster = Object.freeze({ version: 91, sync: scheduleSync });
  scheduleSync();
})();