/* Smažka v70 — single mobile result composition for Safari and installed PWA. */
(() => {
  'use strict';

  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const app = window.SmazkaApp;
  if (!app?.elements?.result || !app?.elements?.cameraStage) return;

  const { result, cameraStage } = app.elements;
  const resultBackdrop = document.getElementById('resultBackdrop');
  const appRoot = document.getElementById('app');
  const TOP_LAYER_Z = 2147483000;
  const FRAME_GAP = 6;
  const MEDIA_SELECTOR = [
    ':scope > img:not(.junkie-share-source)',
    ':scope > canvas',
    ':scope > .junkie-polished-image',
    ':scope > .junkie-morph-origin',
    ':scope > .junkie-morph-final'
  ].join(', ');

  let detailsButton = null;
  let resizeFrame = 0;

  const resultVisible = () => !result.classList.contains('hidden');

  function setImportant(element, name, value) {
    element?.style.setProperty(name, value, 'important');
  }

  function clearProperties(element, properties) {
    properties.forEach((property) => element?.style.removeProperty(property));
  }

  function syncNativeTopLayer(visible) {
    const supported = typeof result.showPopover === 'function' && typeof result.hidePopover === 'function';
    if (!supported) return;

    try {
      if (visible) {
        result.setAttribute('popover', 'manual');
        if (!result.matches(':popover-open')) result.showPopover();
      } else {
        if (result.matches(':popover-open')) result.hidePopover();
        result.removeAttribute('popover');
      }
    } catch {
      if (!visible) result.removeAttribute('popover');
    }
  }

  function clearCompositionStyles() {
    const content = result.querySelector('.result-content');
    const visual = result.querySelector('.result-visual');
    const meta = result.querySelector('.result-effect-meta');
    const actions = result.querySelector('.result-actions');
    const title = result.querySelector('h2');

    clearProperties(content, [
      'height', 'min-height', 'max-height', 'justify-content', 'align-items',
      'padding-top', 'padding-bottom', 'gap', 'overflow-x', 'overflow-y'
    ]);

    Array.from(content?.children || []).forEach((child) => child.style.removeProperty('flex'));

    clearProperties(visual, [
      'position', 'z-index', 'inset', 'top', 'right', 'bottom', 'left',
      'width', 'height', 'min-height', 'max-height', 'flex', 'aspect-ratio',
      'margin', 'border-radius', 'overflow'
    ]);

    visual?.querySelectorAll(MEDIA_SELECTOR).forEach((media) => {
      clearProperties(media, [
        'position', 'inset', 'top', 'right', 'bottom', 'left', 'width', 'height',
        'min-width', 'min-height', 'max-width', 'max-height', 'display',
        'object-fit', 'object-position', 'transform-origin'
      ]);
    });

    meta?.style.removeProperty('margin-top');
    meta?.style.removeProperty('margin-bottom');
    actions?.style.removeProperty('margin-top');
    title?.style.removeProperty('margin-top');
  }

  function clearTopLayerStyles() {
    clearProperties(result, [
      'position', 'z-index', 'top', 'right', 'bottom', 'left', 'width', 'height',
      'max-width', 'max-height', 'margin', 'overflow', 'pointer-events', 'isolation'
    ]);
    clearCompositionStyles();

    if (resultBackdrop) {
      clearProperties(resultBackdrop, ['position', 'z-index', 'inset', 'pointer-events']);
    }
  }

  function syncResultMedia(visual) {
    visual.querySelectorAll(MEDIA_SELECTOR).forEach((media) => {
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
      setImportant(media, 'object-position', '50% 38%');
      setImportant(media, 'transform-origin', '50% 50%');

      if (media instanceof HTMLImageElement && !media.dataset.resultLayoutLoadBound) {
        media.dataset.resultLayoutLoadBound = 'true';
        media.addEventListener('load', scheduleFrameSync, { once: true });
      }
    });
  }

  function syncResultComposition(viewportHeight) {
    const content = result.querySelector('.result-content');
    const visual = result.querySelector('.result-visual');
    if (!content || !visual) return;

    const detailsOpen = result.classList.contains('details-open');
    const meta = content.querySelector(':scope > .result-effect-meta');
    const title = content.querySelector(':scope > h2');
    const actions = content.querySelector(':scope > .result-actions');

    // The bundled legacy layers alternately make the photo a fullscreen absolute
    // background and then insert auto margins below it. Force one normal-flow
    // composition here so no spacer can split the photo from the verdict.
    setImportant(content, 'height', 'auto');
    setImportant(content, 'min-height', '0');
    setImportant(content, 'max-height', `${Math.max(1, Math.round(viewportHeight))}px`);
    setImportant(content, 'justify-content', 'flex-start');
    setImportant(content, 'align-items', 'stretch');
    setImportant(content, 'padding-top', '0');
    setImportant(content, 'padding-bottom', 'max(14px, env(safe-area-inset-bottom))');
    setImportant(content, 'gap', detailsOpen ? '8px' : '9px');
    setImportant(content, 'overflow-x', 'hidden');
    setImportant(content, 'overflow-y', 'auto');

    Array.from(content.children).forEach((child) => setImportant(child, 'flex', '0 0 auto'));

    setImportant(visual, 'position', 'relative');
    setImportant(visual, 'z-index', '0');
    setImportant(visual, 'inset', 'auto');
    setImportant(visual, 'top', 'auto');
    setImportant(visual, 'right', 'auto');
    setImportant(visual, 'bottom', 'auto');
    setImportant(visual, 'left', 'auto');
    setImportant(visual, 'width', 'calc(100% + 28px)');
    setImportant(
      visual,
      'height',
      detailsOpen ? 'clamp(142px, 20dvh, 174px)' : 'clamp(260px, 40dvh, 380px)'
    );
    setImportant(visual, 'min-height', '0');
    setImportant(visual, 'max-height', 'none');
    setImportant(visual, 'flex', '0 0 auto');
    setImportant(visual, 'aspect-ratio', 'auto');
    setImportant(visual, 'margin', '0 -14px 5px');
    setImportant(visual, 'overflow', 'hidden');
    setImportant(visual, 'border-radius', '0');

    syncResultMedia(visual);

    setImportant(meta, 'margin-top', '0');
    setImportant(meta, 'margin-bottom', '0');
    setImportant(title, 'margin-top', '0');
    setImportant(actions, 'margin-top', '0');

    result.querySelector(':scope > .in-frame-result-gradient')?.remove();
    result.dataset.resultLayout = 'v70';
  }

  function viewportMetrics() {
    const viewport = window.visualViewport;
    return {
      top: viewport?.offsetTop || 0,
      left: viewport?.offsetLeft || 0,
      height: viewport?.height || window.innerHeight,
      width: viewport?.width || window.innerWidth
    };
  }

  function syncFrame() {
    if (!mobileQuery.matches || !resultVisible()) return;

    const viewport = viewportMetrics();
    const top = viewport.top + FRAME_GAP;
    const left = viewport.left + FRAME_GAP;
    const width = Math.max(1, viewport.width - FRAME_GAP * 2);
    const maxHeight = Math.max(1, viewport.height - FRAME_GAP * 2);

    setImportant(result, 'position', 'fixed');
    setImportant(result, 'z-index', String(TOP_LAYER_Z));
    setImportant(result, 'top', `${Math.round(top)}px`);
    setImportant(result, 'right', 'auto');
    setImportant(result, 'bottom', 'auto');
    setImportant(result, 'left', `${Math.round(left)}px`);
    setImportant(result, 'width', `${Math.round(width)}px`);
    setImportant(result, 'height', 'auto');
    setImportant(result, 'max-width', 'none');
    setImportant(result, 'max-height', `${Math.round(maxHeight)}px`);
    setImportant(result, 'margin', '0');
    setImportant(result, 'overflow', 'hidden');
    setImportant(result, 'pointer-events', 'auto');
    setImportant(result, 'isolation', 'isolate');

    syncResultComposition(maxHeight);

    if (resultBackdrop) {
      setImportant(resultBackdrop, 'position', 'fixed');
      setImportant(resultBackdrop, 'z-index', String(TOP_LAYER_Z - 1));
      setImportant(resultBackdrop, 'inset', '0');
      setImportant(resultBackdrop, 'pointer-events', 'auto');
    }
  }

  function setDetailsOpen(open) {
    result.classList.toggle('details-open', open);
    window.requestAnimationFrame(syncFrame);

    if (detailsButton) {
      detailsButton.setAttribute('aria-expanded', String(open));
      const label = detailsButton.querySelector('.in-frame-details-label');
      if (label) label.textContent = open ? 'Skrýt detailní rozbor' : 'Zobrazit detailní rozbor';
    }

    window.requestAnimationFrame(() => {
      const content = result.querySelector('.result-content');
      if (!content) return;

      if (!open) {
        content.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const panel = result.querySelector('.diagnostic-panel');
      if (!panel || !detailsButton) return;
      content.scrollTo({
        top: Math.max(0, panel.offsetTop - detailsButton.offsetHeight - 8),
        behavior: 'smooth'
      });
    });
  }

  function ensureDetailsButton() {
    const description = result.querySelector('.description');
    if (!description) return;

    detailsButton = result.querySelector('.in-frame-details-toggle');
    if (!detailsButton) {
      detailsButton = document.createElement('button');
      detailsButton.type = 'button';
      detailsButton.className = 'in-frame-details-toggle';
      detailsButton.setAttribute('aria-expanded', 'false');
      detailsButton.innerHTML = '<svg class="ui-icon" aria-hidden="true"><use href="#icon-zap"></use></svg><span class="in-frame-details-label">Zobrazit detailní rozbor</span><i aria-hidden="true">⌄</i>';
      detailsButton.addEventListener('click', () => {
        setDetailsOpen(!result.classList.contains('details-open'));
      });
    }

    if (detailsButton.previousElementSibling !== description) {
      description.insertAdjacentElement('afterend', detailsButton);
    }
  }

  function decorateResult() {
    const visible = mobileQuery.matches && resultVisible();
    document.body.classList.toggle('result-in-frame', visible);
    cameraStage.classList.toggle('has-in-frame-result', visible);
    appRoot?.toggleAttribute('inert', visible);
    syncNativeTopLayer(visible);

    if (!visible) {
      setDetailsOpen(false);
      result.removeAttribute('data-in-frame-ready');
      result.removeAttribute('data-result-layout');
      clearTopLayerStyles();
      return;
    }

    result.setAttribute('data-in-frame-ready', 'true');
    result.setAttribute('aria-modal', 'true');
    ensureDetailsButton();
    syncFrame();
    window.requestAnimationFrame(syncFrame);
    window.setTimeout(syncFrame, 90);
    window.setTimeout(syncFrame, 420);
    window.setTimeout(syncFrame, 1200);
  }

  const observer = new MutationObserver(() => window.requestAnimationFrame(decorateResult));
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });

  function scheduleFrameSync() {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(syncFrame);
  }

  window.addEventListener('resize', scheduleFrameSync, { passive: true });
  window.addEventListener('orientationchange', scheduleFrameSync, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleFrameSync, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleFrameSync, { passive: true });
  mobileQuery.addEventListener?.('change', () => window.requestAnimationFrame(decorateResult));

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(resizeFrame);
    syncNativeTopLayer(false);
    clearTopLayerStyles();
    appRoot?.removeAttribute('inert');
    document.body.classList.remove('result-in-frame');
    cameraStage.classList.remove('has-in-frame-result');
  }, { once: true });

  decorateResult();
})();
