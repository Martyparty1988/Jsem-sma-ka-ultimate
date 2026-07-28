/* Smažka v69 — final mobile result sizing for iOS Safari and installed PWA. */
(() => {
  'use strict';

  const mobileQuery = window.matchMedia('(max-width: 640px)');
  const result = document.getElementById('result');
  if (!result) return;

  let frame = 0;
  let lastHeight = -1;

  const isVisible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const numberValue = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function applyCompactResultLayout() {
    frame = 0;
    if (!mobileQuery.matches || result.classList.contains('hidden')) return;

    const content = result.querySelector('.result-content');
    const visual = result.querySelector('.result-visual');
    if (!content || !visual) return;

    const detailsOpen = result.classList.contains('details-open');
    const meta = content.querySelector(':scope > .result-effect-meta');
    const title = content.querySelector(':scope > h2');
    const actions = content.querySelector(':scope > .result-actions');
    const gradient = result.querySelector(':scope > .in-frame-result-gradient');

    content.style.setProperty('justify-content', 'flex-start', 'important');
    content.style.setProperty('align-items', 'stretch', 'important');
    content.style.setProperty('padding-top', '0', 'important');
    content.style.setProperty('gap', detailsOpen ? '8px' : '9px', 'important');

    Array.from(content.children).forEach((child) => {
      child.style.setProperty('flex', '0 0 auto', 'important');
    });

    if (meta) {
      meta.style.setProperty('margin-top', '0', 'important');
      meta.style.setProperty('margin-bottom', '0', 'important');
      meta.style.setProperty('flex', '0 0 auto', 'important');
    }
    title?.style.setProperty('margin-top', '0', 'important');
    actions?.style.setProperty('margin-top', '0', 'important');
    gradient?.style.setProperty('display', 'none', 'important');

    visual.style.setProperty('position', 'relative', 'important');
    visual.style.setProperty('inset', 'auto', 'important');
    visual.style.setProperty('width', 'calc(100% + 28px)', 'important');
    visual.style.setProperty('margin', '0 -14px 5px', 'important');
    visual.style.setProperty('min-height', '0', 'important');
    visual.style.setProperty('max-height', 'none', 'important');
    visual.style.setProperty('aspect-ratio', 'auto', 'important');
    visual.style.setProperty('border-radius', '0', 'important');

    if (detailsOpen) {
      lastHeight = 160;
      visual.style.setProperty('height', 'clamp(142px, 20dvh, 174px)', 'important');
      return;
    }

    const contentStyle = getComputedStyle(content);
    const gap = numberValue(contentStyle.rowGap || contentStyle.gap);
    const padding = numberValue(contentStyle.paddingTop) + numberValue(contentStyle.paddingBottom);
    const visibleChildren = Array.from(content.children).filter(isVisible);
    const otherHeight = visibleChildren
      .filter((child) => child !== visual)
      .reduce((total, child) => {
        const style = getComputedStyle(child);
        return total
          + child.getBoundingClientRect().height
          + numberValue(style.marginTop)
          + numberValue(style.marginBottom);
      }, 0);
    const gapsHeight = Math.max(0, visibleChildren.length - 1) * gap;
    const hostHeight = Math.max(result.clientHeight, window.visualViewport?.height || window.innerHeight);
    const available = result.clientHeight - padding - otherHeight - gapsHeight - 5;
    const minimum = Math.min(320, Math.max(230, hostHeight * 0.3));
    const maximum = Math.max(minimum, result.clientHeight * 0.74);
    const targetHeight = Math.round(Math.max(minimum, Math.min(maximum, available)));

    if (Math.abs(targetHeight - lastHeight) > 1) {
      lastHeight = targetHeight;
      visual.style.setProperty('height', `${targetHeight}px`, 'important');
    }
  }

  function scheduleLayout() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(applyCompactResultLayout);
  }

  const observer = new MutationObserver(scheduleLayout);
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });

  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('orientationchange', scheduleLayout, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleLayout, { passive: true });

  scheduleLayout();
  window.setTimeout(scheduleLayout, 120);
  window.setTimeout(scheduleLayout, 520);

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  }, { once: true });
})();
