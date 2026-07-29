/* Smažka v81 — tiny image-noise sampler driving CRT/glitch intensity. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const stage = app?.elements?.cameraStage;
  const video = app?.elements?.video;
  const preview = app?.elements?.preview;
  if (!stage || !video || !preview) return;

  const SAMPLE_SIZE = 24;
  const SAMPLE_INTERVAL_MS = 180;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = SAMPLE_SIZE;
  sampleCanvas.height = SAMPLE_SIZE;
  const sampleContext = sampleCanvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true
  });
  if (!sampleContext) return;

  const style = document.createElement('style');
  style.dataset.junkieVisionNoise = 'v81';
  style.textContent = `
    .junkie-vision-hud .junkie-vision-chrome::before {
      opacity: calc(0.045 + var(--jvh-frame-noise, 0) * 0.19) !important;
    }
    .junkie-vision-hud .junkie-vision-canvas {
      filter: saturate(calc(1.12 + var(--jvh-frame-noise, 0) * 0.24))
              contrast(calc(1.02 + var(--jvh-frame-noise, 0) * 0.16));
    }
    .junkie-vision-hud[data-frame-noise="high"] .junkie-vision-chrome {
      transform: translateX(var(--jvh-noise-shift, 0px));
    }
    .junkie-vision-hud[data-frame-noise="high"] .jvh-metric-row.is-hot {
      text-shadow: var(--jvh-noise-shift, 0px) 0 7px rgba(255, 0, 85, 0.58);
    }
  `;
  document.head.appendChild(style);

  let timer = 0;
  let smoothedNoise = 0;
  let sampleCount = 0;

  function activeHuds() {
    return [...stage.querySelectorAll('.junkie-vision-hud.is-active, .junkie-vision-hud.is-exiting')];
  }

  function sourceFor(huds) {
    const photoActive = huds.some((hud) => hud.classList.contains('junkie-vision-photo-hud'));
    if (photoActive && preview.complete && preview.naturalWidth) return preview;
    if (video.readyState >= 2 && video.videoWidth) return video;
    return null;
  }

  function luma(data, offset) {
    return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
  }

  function measure(source) {
    sampleContext.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const pixels = sampleContext.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    let edgeSum = 0;
    let samples = 0;

    for (let y = 1; y < SAMPLE_SIZE; y += 1) {
      for (let x = 1; x < SAMPLE_SIZE; x += 1) {
        const offset = (y * SAMPLE_SIZE + x) * 4;
        const left = offset - 4;
        const above = offset - SAMPLE_SIZE * 4;
        const current = luma(pixels, offset);
        edgeSum += Math.abs(current - luma(pixels, left));
        edgeSum += Math.abs(current - luma(pixels, above));
        samples += 2;
      }
    }

    const localVariation = samples ? edgeSum / samples : 0;
    return Math.max(0, Math.min(1, (localVariation - 5) / 31));
  }

  function apply(huds, level) {
    sampleCount += 1;
    const shift = ((sampleCount % 3) - 1) * level * 1.8;
    const band = level >= 0.62 ? 'high' : level >= 0.28 ? 'medium' : 'low';
    huds.forEach((hud) => {
      hud.style.setProperty('--jvh-frame-noise', level.toFixed(3));
      hud.style.setProperty('--jvh-noise-shift', `${shift.toFixed(2)}px`);
      hud.dataset.frameNoise = band;
    });
  }

  function sample() {
    const huds = activeHuds();
    if (!huds.length) return;
    const source = sourceFor(huds);
    if (!source) return;

    try {
      const measured = measure(source);
      smoothedNoise = smoothedNoise * 0.68 + measured * 0.32;
      apply(huds, smoothedNoise);
    } catch (error) {
      // Cross-origin images are not expected, but a blocked read must never stop scanning.
      console.warn('Junkie Vision noise sampler byl přeskočen:', error);
      clearInterval(timer);
      timer = 0;
    }
  }

  timer = window.setInterval(sample, SAMPLE_INTERVAL_MS);
  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    sampleCanvas.width = 1;
    sampleCanvas.height = 1;
    style.remove();
  }, { once: true });

  window.SmazkaJunkieNoise = Object.freeze({
    getLevel: () => smoothedNoise,
    getSampleCount: () => sampleCount
  });
})();
