(() => {
  'use strict';

  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const app = window.SmazkaApp;
  if (!app?.elements?.result || !app?.elements?.cameraStage) return;

  const { result, cameraStage } = app.elements;
  const resultBackdrop = document.getElementById('resultBackdrop');
  const appRoot = document.getElementById('app');
  const TOP_LAYER_Z = 2147483000;
  const FRAME_GAP = 8;
  let detailsButton = null;
  let resizeFrame = null;

  function resultVisible() {
    return !result.classList.contains('hidden');
  }

  function setInlineFrameProperty(name, value) {
    result.style.setProperty(name, value, 'important');
  }

  function clearTopLayerStyles() {
    [
      'position',
      'z-index',
      'top',
      'right',
      'bottom',
      'left',
      'width',
      'height',
      'max-width',
      'max-height',
      'margin',
      'pointer-events',
      'isolation'
    ].forEach((property) => result.style.removeProperty(property));

    const content = result.querySelector('.result-content');
    content?.style.removeProperty('padding-bottom');

    if (resultBackdrop) {
      ['position', 'z-index', 'inset', 'pointer-events'].forEach((property) => {
        resultBackdrop.style.removeProperty(property);
      });
    }
  }

  function syncNativeTopLayer(visible) {
    const supportsPopover = typeof result.showPopover === 'function' && typeof result.hidePopover === 'function';
    if (!supportsPopover) return;

    try {
      if (visible) {
        result.setAttribute('popover', 'manual');
        if (!result.matches(':popover-open')) result.showPopover();
      } else {
        if (result.matches(':popover-open')) result.hidePopover();
        result.removeAttribute('popover');
      }
    } catch {
      // z-index + fixed positioning below remain the fallback on older Safari builds.
      if (!visible) result.removeAttribute('popover');
    }
  }

  function syncFrame() {
    if (!mobileQuery.matches || !resultVisible()) return;

    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportWidth = viewport?.width || window.innerWidth;
    const top = viewportTop + FRAME_GAP;
    const left = viewportLeft + FRAME_GAP;
    const width = Math.max(1, viewportWidth - (FRAME_GAP * 2));
    const height = Math.max(1, viewportHeight - (FRAME_GAP * 2));

    result.style.setProperty('--result-frame-top', `${Math.round(top)}px`);
    result.style.setProperty('--result-frame-left', `${Math.round(left)}px`);
    result.style.setProperty('--result-frame-width', `${Math.round(width)}px`);
    result.style.setProperty('--result-frame-height', `${Math.round(height)}px`);

    setInlineFrameProperty('position', 'fixed');
    setInlineFrameProperty('z-index', String(TOP_LAYER_Z));
    setInlineFrameProperty('top', `${Math.round(top)}px`);
    setInlineFrameProperty('right', 'auto');
    setInlineFrameProperty('bottom', 'auto');
    setInlineFrameProperty('left', `${Math.round(left)}px`);
    setInlineFrameProperty('width', `${Math.round(width)}px`);
    setInlineFrameProperty('height', `${Math.round(height)}px`);
    setInlineFrameProperty('max-width', 'none');
    setInlineFrameProperty('max-height', `${Math.round(height)}px`);
    setInlineFrameProperty('margin', '0');
    setInlineFrameProperty('pointer-events', 'auto');
    setInlineFrameProperty('isolation', 'isolate');

    result.querySelector('.result-content')?.style.setProperty(
      'padding-bottom',
      'max(14px, env(safe-area-inset-bottom))',
      'important'
    );

    if (resultBackdrop) {
      resultBackdrop.style.setProperty('position', 'fixed', 'important');
      resultBackdrop.style.setProperty('z-index', String(TOP_LAYER_Z - 1), 'important');
      resultBackdrop.style.setProperty('inset', '0', 'important');
      resultBackdrop.style.setProperty('pointer-events', 'auto', 'important');
    }
  }

  function setDetailsOpen(open) {
    result.classList.toggle('details-open', open);
    if (detailsButton) {
      detailsButton.setAttribute('aria-expanded', String(open));
      const label = detailsButton.querySelector('.in-frame-details-label');
      if (label) {
        label.textContent = open ? 'Skrýt detailní rozbor' : 'Zobrazit detailní rozbor';
      }
    }

    if (open) {
      window.requestAnimationFrame(() => {
        const content = result.querySelector('.result-content');
        const panel = result.querySelector('.diagnostic-panel');
        if (!content || !panel || !detailsButton) return;

        // Scroll the result sheet itself. scrollIntoView may target the locked
        // document on iOS, leaving the freshly revealed panel below the fold.
        content.scrollTo({
          top: Math.max(0, panel.offsetTop - detailsButton.offsetHeight - 8),
          behavior: 'smooth'
        });
      });
    } else {
      result.querySelector('.result-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function ensureGradient() {
    if (result.querySelector(':scope > .in-frame-result-gradient')) return;
    const gradient = document.createElement('div');
    gradient.className = 'in-frame-result-gradient';
    gradient.setAttribute('aria-hidden', 'true');
    const content = result.querySelector(':scope > .result-content');
    result.insertBefore(gradient, content || null);
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
      detailsButton.addEventListener('click', () => setDetailsOpen(!result.classList.contains('details-open')));
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
      clearTopLayerStyles();
      return;
    }

    result.setAttribute('data-in-frame-ready', 'true');
    result.setAttribute('aria-modal', 'true');
    ensureGradient();
    ensureDetailsButton();
    syncFrame();
    window.requestAnimationFrame(syncFrame);
    window.setTimeout(syncFrame, 100);
    window.setTimeout(syncFrame, 480);
  }

  const observer = new MutationObserver(() => window.requestAnimationFrame(decorateResult));
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  const scheduleFrameSync = () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(syncFrame);
  };

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
