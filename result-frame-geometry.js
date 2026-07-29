/* Smažka v73 — pure mobile result viewport geometry. */
(() => {
  'use strict';

  const finite = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  function calculateResultFrame({
    offsetTop = 0,
    offsetLeft = 0,
    width = 1,
    height = 1,
    gap = 6,
    minimumSize = 1
  } = {}) {
    const safeGap = Math.max(0, finite(gap, 6));
    const safeMinimum = Math.max(1, finite(minimumSize, 1));
    const viewportWidth = Math.max(safeMinimum, finite(width, safeMinimum));
    const viewportHeight = Math.max(safeMinimum, finite(height, safeMinimum));
    const top = finite(offsetTop, 0) + safeGap;
    const left = finite(offsetLeft, 0) + safeGap;
    const frameWidth = Math.max(safeMinimum, viewportWidth - safeGap * 2);
    const frameHeight = Math.max(safeMinimum, viewportHeight - safeGap * 2);

    return Object.freeze({
      top,
      left,
      width: frameWidth,
      height: frameHeight,
      right: left + frameWidth,
      bottom: top + frameHeight,
      gap: safeGap
    });
  }

  function frameFitsViewport(frame, {
    offsetTop = 0,
    offsetLeft = 0,
    width = 1,
    height = 1
  } = {}, tolerance = 0.5) {
    if (!frame) return false;
    const epsilon = Math.max(0, finite(tolerance, 0.5));
    const viewportTop = finite(offsetTop, 0);
    const viewportLeft = finite(offsetLeft, 0);
    const viewportRight = viewportLeft + Math.max(1, finite(width, 1));
    const viewportBottom = viewportTop + Math.max(1, finite(height, 1));

    return frame.top >= viewportTop - epsilon
      && frame.left >= viewportLeft - epsilon
      && frame.right <= viewportRight + epsilon
      && frame.bottom <= viewportBottom + epsilon
      && frame.width > 0
      && frame.height > 0;
  }

  globalThis.SmazkaResultFrameGeometry = Object.freeze({
    calculateResultFrame,
    frameFitsViewport
  });
})();
