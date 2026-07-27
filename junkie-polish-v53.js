/* Smažka v53 — stronger forensic JUNKIE finishing pass on the existing landmark render. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.state || !app?.elements?.result) return;

  const { state, elements } = app;
  const result = elements.result;
  const WIDTH = 720;
  const HEIGHT = 960;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const tailToken = (value) => String(value || '').slice(-56);
  let activeRun = 0;
  let queued = false;

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('JUNKIE polish image failed to load'));
      image.src = source;
    });
  }

  function drawCover(context, image, width, height) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const imageRatio = sourceWidth / sourceHeight;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (imageRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) / 2;
    }

    context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  }

  function ellipsePath(context, region) {
    context.beginPath();
    context.ellipse(
      region[0] * WIDTH,
      region[1] * HEIGHT,
      Math.max(2, region[2] * WIDTH),
      Math.max(2, region[3] * HEIGHT),
      0,
      0,
      Math.PI * 2
    );
  }

  function drawEllipseGradient(context, region, stops, alpha = 1, operation = 'multiply') {
    const x = region[0] * WIDTH;
    const y = region[1] * HEIGHT;
    const radiusX = Math.max(2, region[2] * WIDTH);
    const radiusY = Math.max(2, region[3] * HEIGHT);
    const radius = Math.max(radiusX, radiusY);

    context.save();
    context.globalCompositeOperation = operation;
    context.globalAlpha = alpha;
    context.translate(x, y);
    context.scale(1, radiusY / radiusX);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function tierIntensity(score) {
    const value = clamp(Number(score) || 0, 0, 100);
    if (value <= 30) {
      const t = value / 30;
      return { pale: 0.18 + t * 0.12, eyes: 0.08 + t * 0.1, cheeks: 0.02 * t, texture: 0.2 + t * 0.12 };
    }
    if (value <= 60) {
      const t = (value - 30) / 30;
      return { pale: 0.38 + t * 0.24, eyes: 0.32 + t * 0.36, cheeks: 0.14 + t * 0.32, texture: 0.38 + t * 0.2 };
    }
    if (value <= 85) {
      const t = (value - 60) / 25;
      return { pale: 0.68 + t * 0.22, eyes: 0.72 + t * 0.22, cheeks: 0.58 + t * 0.3, texture: 0.62 + t * 0.24 };
    }
    const t = (value - 85) / 15;
    return { pale: 0.92 + t * 0.08, eyes: 0.96 + t * 0.04, cheeks: 0.92 + t * 0.08, texture: 0.9 + t * 0.1 };
  }

  function drawSkinTone(context, source, geometry, intensity) {
    context.save();
    ellipsePath(context, geometry.face);
    context.clip();
    context.filter = `grayscale(${Math.round(16 + intensity.pale * 12)}%) saturate(${Math.round(82 - intensity.pale * 13)}%) brightness(${Math.round(97 - intensity.pale * 6)}%)`;
    context.drawImage(source, 0, 0, WIDTH, HEIGHT);
    context.filter = 'none';
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = `rgba(34, 54, 48, ${0.07 + intensity.pale * 0.055})`;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.restore();
  }

  function drawUnderEye(context, eye, faceCenterX, intensity) {
    const direction = eye[0] < faceCenterX ? 1 : -1;
    const broad = [eye[0], eye[1] + eye[3] * 0.08, eye[2] * 1.08, eye[3] * 1.18];
    drawEllipseGradient(context, broad, [
      [0, 'rgba(58,46,62,0.78)'],
      [0.42, 'rgba(52,43,57,0.52)'],
      [1, 'rgba(40,35,44,0)']
    ], 0.26 + intensity.eyes * 0.46, 'multiply');

    const inner = [
      eye[0] + direction * eye[2] * 0.38,
      eye[1] - eye[3] * 0.02,
      eye[2] * 0.5,
      eye[3] * 0.7
    ];
    drawEllipseGradient(context, inner, [
      [0, 'rgba(48,38,52,0.9)'],
      [1, 'rgba(48,38,52,0)']
    ], 0.18 + intensity.eyes * 0.34, 'multiply');

    const upper = [eye[0], eye[1] - eye[3] * 1.5, eye[2] * 0.92, eye[3] * 0.58];
    drawEllipseGradient(context, upper, [
      [0, 'rgba(28,34,36,0.44)'],
      [1, 'rgba(28,34,36,0)']
    ], 0.1 + intensity.eyes * 0.17, 'multiply');
  }

  function drawCheek(context, cheek, intensity) {
    const shadow = [cheek[0], cheek[1] + cheek[3] * 0.2, cheek[2] * 1.12, cheek[3] * 1.08];
    drawEllipseGradient(context, shadow, [
      [0, 'rgba(25,34,35,0.72)'],
      [0.55, 'rgba(31,42,42,0.38)'],
      [1, 'rgba(31,42,42,0)']
    ], 0.13 + intensity.cheeks * 0.42, 'multiply');

    const bone = [cheek[0], cheek[1] - cheek[3] * 0.78, cheek[2] * 0.88, cheek[3] * 0.36];
    drawEllipseGradient(context, bone, [
      [0, 'rgba(159,183,174,0.22)'],
      [1, 'rgba(159,183,174,0)']
    ], intensity.cheeks * 0.34, 'soft-light');
  }

  function drawTexture(context, geometry, intensity, seed) {
    let value = (Number(seed) || 137) % 2147483647;
    const random = () => {
      value = (value * 48271) % 2147483647;
      return value / 2147483647;
    };

    context.save();
    ellipsePath(context, geometry.face);
    context.clip();
    context.globalCompositeOperation = 'multiply';
    const count = Math.round(90 + intensity.texture * 150);
    for (let index = 0; index < count; index += 1) {
      const x = random() * WIDTH;
      const y = random() * HEIGHT;
      const size = 0.6 + random() * 1.5;
      context.fillStyle = `rgba(17, 27, 25, ${0.012 + random() * 0.025 * intensity.texture})`;
      context.fillRect(x, y, size, size);
    }
    context.restore();
  }

  function drawLips(context, mouth, intensity, seed) {
    context.save();
    ellipsePath(context, mouth);
    context.clip();
    context.globalCompositeOperation = 'color';
    context.fillStyle = `rgba(118, 113, 112, ${0.12 + intensity.pale * 0.19})`;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.globalCompositeOperation = 'multiply';
    context.strokeStyle = `rgba(57, 48, 49, ${0.08 + intensity.pale * 0.13})`;
    context.lineWidth = 1;
    const centerX = mouth[0] * WIDTH;
    const centerY = mouth[1] * HEIGHT;
    const radiusX = mouth[2] * WIDTH;
    const radiusY = mouth[3] * HEIGHT;
    const phase = (Number(seed) || 0) % 11;
    for (let index = -3; index <= 3; index += 1) {
      const x = centerX + (index / 4) * radiusX + Math.sin(index + phase) * 2;
      context.beginPath();
      context.moveTo(x, centerY - radiusY * 0.34);
      context.lineTo(x + Math.sin(index * 2.1) * 3, centerY + radiusY * 0.3);
      context.stroke();
    }
    context.restore();
  }

  async function createPolishedImage(sourceData, geometry, severity, seed) {
    const image = await loadImage(sourceData);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('JUNKIE polish canvas unavailable');

    drawCover(context, image, WIDTH, HEIGHT);
    const source = document.createElement('canvas');
    source.width = WIDTH;
    source.height = HEIGHT;
    source.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0);

    const intensity = tierIntensity(severity);
    drawSkinTone(context, source, geometry, intensity);
    drawUnderEye(context, geometry.leftEye, geometry.face[0], intensity);
    drawUnderEye(context, geometry.rightEye, geometry.face[0], intensity);
    drawCheek(context, geometry.leftCheek, intensity);
    drawCheek(context, geometry.rightCheek, intensity);
    drawEllipseGradient(context, geometry.leftTemple, [[0, 'rgba(25,32,34,0.56)'], [1, 'rgba(25,32,34,0)']], intensity.cheeks * 0.22, 'multiply');
    drawEllipseGradient(context, geometry.rightTemple, [[0, 'rgba(25,32,34,0.56)'], [1, 'rgba(25,32,34,0)']], intensity.cheeks * 0.22, 'multiply');
    drawLips(context, geometry.mouth, intensity, seed);
    drawTexture(context, geometry, intensity, seed);

    return canvas.toDataURL('image/png');
  }

  function installImage(visual, source, token) {
    const image = document.createElement('img');
    image.className = 'junkie-polished-image';
    image.alt = `Forenzně deformovaný obličej. JUNKIE efekt ${Math.round(Number(state.effectSeverity) || 0)} procent.`;
    image.decoding = 'async';
    image.src = source;
    image.addEventListener('load', () => {
      if (result.dataset.junkiePolishToken !== token) return;
      visual.querySelectorAll('canvas, img:not(.junkie-polished-image)').forEach((node) => node.remove());
      visual.classList.add('is-junkie-polished');
    }, { once: true });
    visual.appendChild(image);
  }

  function queuePolish() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      polishResult();
    });
  }

  function polishResult() {
    if (result.classList.contains('hidden') || !state.currentImageData) return;
    const snapshot = state.junkieLandmarkSnapshot;
    const visual = result.querySelector('.result-visual.effect-junkie-forensic');
    if (!snapshot || snapshot.token !== tailToken(state.currentImageData) || !visual) return;

    const severity = clamp(Number(state.effectSeverity || state.lastAnalysisResult?.severity || state.visualDamageSeverity || 50), 0, 100);
    const seed = Number(state.effectSeed || state.visualDamageSeverity * 997 || 137);
    const token = `${snapshot.token}|${Math.round(severity)}|${seed}|v53`;
    if (result.dataset.junkiePolishToken === token) return;
    result.dataset.junkiePolishToken = token;
    const runId = ++activeRun;

    const basePromise = Promise.resolve(state.shareImagePromise).catch(() => state.effectImageData);
    const polishedPromise = basePromise
      .then((baseImage) => {
        if (runId !== activeRun) return baseImage;
        const source = baseImage || state.effectImageData;
        if (!source) throw new Error('Base JUNKIE render unavailable');
        return createPolishedImage(source, snapshot.geometry, severity, seed);
      })
      .then((polishedImage) => {
        if (runId !== activeRun || !polishedImage) return polishedImage;
        state.effectImageData = polishedImage;
        installImage(visual, polishedImage, token);
        return polishedImage;
      })
      .catch((error) => {
        console.warn('JUNKIE forensic polish failed:', error);
        return state.effectImageData;
      });

    state.shareImagePromise = polishedPromise;
  }

  const observer = new MutationObserver(queuePolish);
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-junkie-token']
  });

  queuePolish();
  window.addEventListener('pagehide', () => {
    activeRun += 1;
    observer.disconnect();
  }, { once: true });
})();
