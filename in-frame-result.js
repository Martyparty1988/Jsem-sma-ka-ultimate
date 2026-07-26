(() => {
  'use strict';

  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const app = window.SmazkaApp;
  if (!mobileQuery.matches || !app?.elements?.result || !app?.elements?.cameraStage) return;

  const { result, cameraStage } = app.elements;
  let detailsButton = null;
  let resizeFrame = null;

  function resultVisible() {
    return !result.classList.contains('hidden');
  }

  function syncFrame() {
    if (!resultVisible()) return;
    const rect = cameraStage.getBoundingClientRect();
    result.style.setProperty('--result-frame-top', `${Math.round(rect.top)}px`);
    result.style.setProperty('--result-frame-left', `${Math.round(rect.left)}px`);
    result.style.setProperty('--result-frame-width', `${Math.round(rect.width)}px`);
    result.style.setProperty('--result-frame-height', `${Math.round(rect.height)}px`);
  }

  function setDetailsOpen(open) {
    result.classList.toggle('details-open', open);
    if (detailsButton) {
      detailsButton.setAttribute('aria-expanded', String(open));
      detailsButton.querySelector('span:last-child').textContent = open
        ? 'Skrýt detailní rozbor'
        : 'Zobrazit detailní rozbor';
    }

    if (open) {
      window.requestAnimationFrame(() => {
        result.querySelector('.diagnostic-panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
      detailsButton.innerHTML = '<span aria-hidden="true">⌁</span><span>Zobrazit detailní rozbor</span><i aria-hidden="true">⌄</i>';
      detailsButton.addEventListener('click', () => setDetailsOpen(!result.classList.contains('details-open')));
    }

    if (detailsButton.previousElementSibling !== description) {
      description.insertAdjacentElement('afterend', detailsButton);
    }
  }

  function decorateResult() {
    const visible = resultVisible();
    document.body.classList.toggle('result-in-frame', visible);
    cameraStage.classList.toggle('has-in-frame-result', visible);

    if (!visible) {
      setDetailsOpen(false);
      result.removeAttribute('data-in-frame-ready');
      return;
    }

    result.setAttribute('data-in-frame-ready', 'true');
    result.setAttribute('aria-modal', 'false');
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

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(resizeFrame);
    document.body.classList.remove('result-in-frame');
    cameraStage.classList.remove('has-in-frame-result');
  }, { once: true });

  decorateResult();
})();