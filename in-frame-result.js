/* Smažka v67 — compact viewport result composition for mobile Safari and PWA. */
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
  let detailsButton = null;
  let resizeFrame = 0;

  const resultVisible = () => !result.classList.contains('hidden');

  function setInlineFrameProperty(name, value) {
    result.style.setProperty(name, value, 'important');
  }

  function clearCompositionStyles() {
    const content = result.querySelector('.result-content');
    const visual = result.querySelector('.result-visual');
    const actions = result.querySelector('.result-actions');
    const title = result.querySelector('h2');
    const gradient = result.querySelector('.in-frame-result-gradient');

    [
      'position', 'z-index', 'inset', 'top', 'right', 'bottom', 'left',
      'width', 'height', 'min-height', 'max-height', 'flex', 'aspect-ratio',
      'margin', 'border-radius'
    ].forEach((property) => visual?.style.removeProperty(property));

    ['justify-content', 'padding-top', 'gap'].forEach((property) => {
      content?.style.removeProperty(property);
    });

    actions?.style.removeProperty('margin-top');
    title?.style.removeProperty('margin-top');
    gradient?.style.removeProperty('display');
  }

  function clearTopLayerStyles() {
    [
      'position', 'z-index', 'top', 'right', 'bottom', 'left', 'width', 'height',
      'max-width', 'max-height', 'margin', 'pointer-events', 'isolation'
    ].forEach((property) => result.style.removeProperty(property));

    const content = result.querySelector('.result-content');
    content?.style.removeProperty('padding-bottom');
    clearCompositionStyles();

    if (resultBackdrop) {
      ['position', 'z-index', 'inset', 'pointer-events'].forEach((property) => {
        resultBackdrop.style.removeProperty(property);
      });
    }
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

  function syncResultComposition() {
    const content = result.querySelector('.result-content');
    const visual = result.querySelector('.result-visual');
    const actions = result.querySelector('.result-actions');
    const title = result.querySelector('h2');
    const gradient = result.querySelector('.in-frame-result-gradient');
    if (!content || !visual) return;

    const detailsOpen = result.classList.contains('details-open');

    // Older in-frame CSS treated the image as a full-screen absolute background
    // and reserved up to 55 % of the sheet above the copy. Mobile Safari then
    // produced a large dead area between the photo and verdict. Keep every block
    // in normal document flow so the copy always starts directly below the image.
    content.style.setProperty('justify-content', 'flex-start', 'important');
    content.style.setProperty('padding-top', '0', 'important');
    content.style.setProperty('gap', detailsOpen ? '8px' : '9px', 'important');

    visual.style.setProperty('position', 'relative', 'important');
    visual.style.setProperty('z-index', '0', 'important');
    visual.style.setProperty('inset', 'auto', 'important');
    visual.style.setProperty('top', 'auto', 'important');
    visual.style.setProperty('right', 'auto', 'important');
    visual.style.setProperty('bottom', 'auto', 'important');
    visual.style.setProperty('left', 'auto', 'important');
    visual.style.setProperty('width', 'calc(100% + 28px)', 'important');
    visual.style.setProperty(
      'height',
      detailsOpen ? 'clamp(142px, 20dvh, 174px)' : 'clamp(245px, 40dvh, 350px)',
      'important'
    );
    visual.style.setProperty('min-height', '0', 'important');
    visual.style.setProperty('max-height', 'none', 'important');
    visual.style.setProperty('flex', '0 0 auto', 'important');
    visual.style.setProperty('aspect-ratio', 'auto', 'important');
    visual.style.setProperty('margin', '0 -14px 5px', 'important');
    visual.style.setProperty('border-radius', '0', 'important');

    title?.style.setProperty('margin-top', '0', 'important');
    actions?.style.setProperty('margin-top', '0', 'important');
    gradient?.style.setProperty('display', 'none', 'important');
  }

  function viewportMetrics() {
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0;
    const left = viewport?.offsetLeft || 0;
    const height = viewport?.height || window.innerHeight;
    const width = viewport?.width || window.innerWidth;
    return { top, left, height, width };
  }

  function syncFrame() {
    if (!mobileQuery.matches || !resultVisible()) return;

    const viewport = viewportMetrics();
    const top = viewport.top + FRAME_GAP;
    const left = viewport.left + FRAME_GAP;
    const width = Math.max(1, viewport.width - FRAME_GAP * 2);
    const height = Math.max(1, viewport.height - FRAME_GAP * 2);

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

    syncResultComposition();

    if (resultBackdrop) {
      resultBackdrop.style.setProperty('position', 'fixed', 'important');
      resultBackdrop.style.setProperty('z-index', String(TOP_LAYER_Z - 1), 'important');
      resultBackdrop.style.setProperty('inset', '0', 'important');
      resultBackdrop.style.setProperty('pointer-events', 'auto', 'important');
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

    if (open) {
      window.requestAnimationFrame(() => {
        const content = result.querySelector('.result-content');
        const panel = result.querySelector('.diagnostic-panel');
        if (!content || !panel || !detailsButton) return;
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
    window.setTimeout(syncFrame, 90);
    window.setTimeout(syncFrame, 420);
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