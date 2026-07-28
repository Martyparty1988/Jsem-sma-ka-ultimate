/* Smažka v72 — runtime bridge between face geometry, warp renderer and result UI. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const cropApi = window.SmazkaFaceCrop;
  const faceWarp = window.SmazkaFaceWarp;
  if (!app?.state || !app?.elements?.result || !cropApi || typeof faceWarp?.renderFaceEffect !== 'function') return;

  const { state, elements } = app;
  const originalRenderFaceEffect = faceWarp.renderFaceEffect.bind(faceWarp);
  const MEDIA_SELECTOR = [
    '.result-visual > img:not(.junkie-share-source)',
    '.result-visual > canvas',
    '.result-visual > .junkie-polished-image',
    '.result-visual > .junkie-morph-origin',
    '.result-visual > .junkie-morph-final'
  ].join(', ');
  let focusFrame = 0;

  function alreadyPrepared(faceAnalysis, width, height) {
    const output = faceAnalysis?.crop?.output;
    return faceAnalysis?.crop?.version === 72
      && Number(output?.width) === Number(width)
      && Number(output?.height) === Number(height);
  }

  async function renderFaceEffect(options = {}) {
    const width = Math.max(120, Math.round(Number(options.output?.width) || 720));
    const height = Math.max(160, Math.round(Number(options.output?.height) || 960));
    const sourceAnalysis = options.faceAnalysis || state.faceAnalysis;
    let imageData = options.imageData;
    let faceAnalysis = sourceAnalysis;
    let crop = sourceAnalysis?.crop?.source ? sourceAnalysis.crop : null;

    if (imageData && sourceAnalysis && !alreadyPrepared(sourceAnalysis, width, height)) {
      if (!state.originalImageData || state.currentImageData === imageData) {
        state.originalImageData = imageData;
      }
      const prepared = await cropApi.cropImageData(imageData, width, height, sourceAnalysis, {
        type: 'image/jpeg',
        quality: 0.93
      });
      imageData = prepared.dataUrl;
      faceAnalysis = prepared.faceAnalysis;
      crop = prepared.crop;

      // The legacy observer performs a second animated render from currentImageData.
      // Make the face-aware source canonical so that pass cannot return to a center crop.
      state.currentImageData = imageData;
      state.faceAnalysis = faceAnalysis;
      state.effectFaceAnalysis = faceAnalysis;
      state.faceCrop = crop;
    }

    const rendered = await originalRenderFaceEffect({
      ...options,
      imageData,
      faceAnalysis
    });

    state.effectFaceAnalysis = faceAnalysis || state.faceAnalysis;
    if (crop) state.faceCrop = crop;
    return {
      ...rendered,
      faceAnalysis: state.effectFaceAnalysis,
      faceCrop: crop || state.faceCrop || null
    };
  }

  window.SmazkaFaceWarp = Object.freeze({
    ...faceWarp,
    renderFaceEffect
  });

  function mediaDimensions(media) {
    return {
      width: Number(media?.naturalWidth || media?.width || media?.videoWidth || 0),
      height: Number(media?.naturalHeight || media?.height || media?.videoHeight || 0)
    };
  }

  function applyResultFocus() {
    window.cancelAnimationFrame(focusFrame);
    focusFrame = 0;
    const result = elements.result;
    if (!result || result.classList.contains('hidden')) return;
    const visual = result.querySelector('.result-visual');
    if (!visual?.clientWidth || !visual?.clientHeight) return;
    const faceAnalysis = state.effectFaceAnalysis || state.faceAnalysis;
    if (!faceAnalysis) return;

    result.querySelectorAll(MEDIA_SELECTOR).forEach((media) => {
      const source = mediaDimensions(media);
      if (!source.width || !source.height) {
        if (media instanceof HTMLImageElement && !media.dataset.faceCropLoadBound) {
          media.dataset.faceCropLoadBound = 'true';
          media.addEventListener('load', scheduleResultFocus, { once: true });
        }
        return;
      }

      const crop = cropApi.calculateCrop({
        sourceWidth: source.width,
        sourceHeight: source.height,
        targetWidth: visual.clientWidth,
        targetHeight: visual.clientHeight,
        faceAnalysis
      });
      media.style.setProperty(
        'object-position',
        `${crop.objectPositionX.toFixed(2)}% ${crop.objectPositionY.toFixed(2)}%`,
        'important'
      );
      media.style.setProperty('transform', 'none', 'important');
      visual.style.setProperty('--face-crop-x', `${crop.objectPositionX.toFixed(2)}%`);
      visual.style.setProperty('--face-crop-y', `${crop.objectPositionY.toFixed(2)}%`);
      visual.dataset.faceAwareCrop = 'v72';
    });
  }

  function scheduleResultFocus() {
    window.cancelAnimationFrame(focusFrame);
    focusFrame = window.requestAnimationFrame(applyResultFocus);
  }

  const observer = new MutationObserver(() => {
    scheduleResultFocus();
    window.setTimeout(scheduleResultFocus, 100);
    window.setTimeout(scheduleResultFocus, 460);
    window.setTimeout(scheduleResultFocus, 1350);
  });
  observer.observe(elements.result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src', 'width', 'height']
  });

  window.addEventListener('resize', scheduleResultFocus, { passive: true });
  window.addEventListener('orientationchange', scheduleResultFocus, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleResultFocus, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleResultFocus, { passive: true });
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.cancelAnimationFrame(focusFrame);
  }, { once: true });
})();
