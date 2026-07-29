/* Smažka v82 — cinematic bridge from Junkie Vision to the single-pass verdict. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const cropApi = window.SmazkaFaceCrop;
  const feed = window.SmazkaLandmarkFeed;
  const state = app?.state;
  const result = app?.elements?.result || document.getElementById('result');
  if (!state || !result) return;

  const REVEAL_MS = 1540;
  const EXIT_MS = 260;
  const CROP_WIDTH = 480;
  const CROP_HEIGHT = 640;
  const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
  const MOUTH = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];

  let lastToken = '';
  let scheduledFrame = 0;
  let activeRun = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function resultIsVisible() {
    return !result.classList.contains('hidden') && (result.open || result.hasAttribute('open'));
  }

  function severityValue() {
    const fromState = Number(state.lastAnalysisResult?.severity || state.effectSeverity || 0);
    if (Number.isFinite(fromState) && fromState > 0) return clamp(Math.round(fromState), 0, 100);
    const label = result.querySelector('.effect-label strong')?.textContent || '0';
    return clamp(Number.parseInt(label, 10) || 0, 0, 100);
  }

  function resultToken() {
    return [
      state.lastAnalysisResult?.title || result.querySelector('h2')?.textContent || '',
      severityValue(),
      String(state.currentImageData || '').slice(-36),
      String(state.effectImageData || '').slice(-36)
    ].join('|');
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Impact reveal image decode failed'));
      image.src = source;
    });
  }

  async function prepareOriginal() {
    const source = state.currentImageData || '';
    const analysis = state.faceAnalysis || feed?.getSnapshot?.() || null;
    if (!source || typeof cropApi?.cropImageData !== 'function') {
      return { dataUrl: source, faceAnalysis: analysis };
    }

    try {
      const cropped = await Promise.race([
        cropApi.cropImageData(source, CROP_WIDTH, CROP_HEIGHT, analysis, {
          type: 'image/jpeg',
          quality: 0.91
        }),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('crop timeout')), 320))
      ]);
      return {
        dataUrl: cropped?.dataUrl || source,
        faceAnalysis: cropped?.faceAnalysis || analysis
      };
    } catch {
      return { dataUrl: source, faceAnalysis: analysis };
    }
  }

  function effectSource() {
    const visualImage = result.querySelector(
      '.result-visual > img:not(.junkie-share-source), '
      + '.result-visual > .junkie-polished-image, '
      + '.result-visual > .junkie-morph-final'
    );
    return visualImage?.currentSrc || visualImage?.src || state.effectImageData || state.currentImageData || '';
  }

  function drawPolyline(context, points, indices, color, width, alpha = 1, close = false) {
    const line = indices.map((index) => points?.[index]).filter(Boolean);
    if (line.length < 2) return;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = width;
    context.globalAlpha = alpha;
    context.beginPath();
    context.moveTo(line[0].x, line[0].y);
    line.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (close) context.closePath();
    context.stroke();
    context.restore();
  }

  function drawFrozenMesh(canvas, normalizedLandmarks) {
    if (!Array.isArray(normalizedLandmarks) || normalizedLandmarks.length < 468) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sourceRatio = CROP_WIDTH / CROP_HEIGHT;
    const targetRatio = width / height;
    let renderedWidth = width;
    let renderedHeight = height;
    let offsetX = 0;
    let offsetY = 0;
    if (sourceRatio > targetRatio) {
      renderedHeight = height;
      renderedWidth = height * sourceRatio;
      offsetX = (width - renderedWidth) / 2;
    } else {
      renderedWidth = width;
      renderedHeight = width / sourceRatio;
      offsetY = (height - renderedHeight) / 2;
    }

    const points = normalizedLandmarks.map((point) => ({
      x: offsetX + clamp(Number(point?.x || 0), 0, 1) * renderedWidth,
      y: offsetY + clamp(Number(point?.y || 0), 0, 1) * renderedHeight
    }));

    const connections = Array.isArray(window.FACEMESH_TESSELATION)
      ? window.FACEMESH_TESSELATION
      : [];
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.strokeStyle = '#00ff66';
    context.globalAlpha = 0.42;
    context.lineWidth = 0.58;
    context.beginPath();
    let drawn = 0;
    for (let index = 0; index < connections.length && drawn < 360; index += 4) {
      const [fromIndex, toIndex] = connections[index] || [];
      const from = points[fromIndex];
      const to = points[toIndex];
      if (!from || !to) continue;
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      drawn += 1;
    }
    context.stroke();
    context.restore();

    drawPolyline(context, points, FACE_OVAL, '#00ff66', 1.1, 0.76, true);
    drawPolyline(context, points, RIGHT_EYE, '#ff0055', 1.25, 0.82, true);
    drawPolyline(context, points, LEFT_EYE, '#ff0055', 1.25, 0.82, true);
    drawPolyline(context, points, MOUTH, '#ffcc00', 1.15, 0.8, true);
  }

  function createSlice(effect, top, direction, delay) {
    const slice = document.createElement('div');
    slice.className = 'impact-glitch-slice';
    slice.style.setProperty('--impact-slice-top', `${top}%`);
    slice.style.setProperty('--impact-slice-shift', `${direction * (20 + top / 3)}px`);
    slice.style.setProperty('--impact-slice-delay', `${delay}ms`);
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.src = effect;
    image.style.transform = `translateY(-${top}vh)`;
    slice.appendChild(image);
    return slice;
  }

  function createOverlay(original, effect, severity) {
    const overlay = document.createElement('div');
    overlay.className = 'critical-impact-reveal';
    overlay.dataset.severity = severity >= 80 ? 'critical' : severity >= 50 ? 'disturbed' : 'calm';
    overlay.setAttribute('aria-hidden', 'true');

    const originalImage = document.createElement('img');
    originalImage.className = 'impact-image impact-original';
    originalImage.alt = '';
    originalImage.decoding = 'async';
    originalImage.src = original;

    const effectImage = document.createElement('img');
    effectImage.className = 'impact-image impact-effect';
    effectImage.alt = '';
    effectImage.decoding = 'async';
    effectImage.src = effect;

    const mesh = document.createElement('canvas');
    mesh.className = 'impact-mesh';

    const wipe = document.createElement('div');
    wipe.className = 'impact-wipe-line';

    const stamp = document.createElement('div');
    stamp.className = 'impact-stamp';
    stamp.innerHTML = '<span>BIOLOGICKÁ REKLAMACE</span><strong>PŘIJATA</strong><small>VOID LAB // LOKÁLNÍ DŮKAZ</small>';

    const status = document.createElement('div');
    status.className = 'impact-status';
    status.innerHTML = `<span>CRITICAL IMPACT DETECTED</span><strong>${String(severity).padStart(2, '0')}%</strong>`;

    const noise = document.createElement('div');
    noise.className = 'impact-noise';

    overlay.append(
      originalImage,
      effectImage,
      mesh,
      wipe,
      createSlice(effect, 29, -1, 210),
      createSlice(effect, 51, 1, 275),
      createSlice(effect, 69, -1, 340),
      noise,
      status,
      stamp
    );
    return { overlay, mesh };
  }

  function installSeal(severity) {
    const visual = result.querySelector('.result-visual');
    if (!visual) return;
    visual.querySelector('.impact-verdict-seal')?.remove();

    const seal = document.createElement('div');
    seal.className = 'impact-verdict-seal';
    seal.dataset.level = severity >= 80 ? 'critical' : severity >= 50 ? 'disturbed' : 'calm';
    seal.innerHTML = `<span>VOID IMPACT</span><strong>${severity}%</strong><small>REKLAMACE PŘIJATA</small>`;
    visual.appendChild(seal);
    window.requestAnimationFrame(() => seal.classList.add('is-mounted'));
  }

  function vibrate(severity) {
    try {
      navigator.vibrate?.(severity >= 80 ? [18, 28, 45, 34, 68] : [14, 30, 34]);
    } catch {
      // Optional haptics.
    }
  }

  async function runReveal(token) {
    const runId = ++activeRun;
    lastToken = token;
    result.querySelector('.critical-impact-reveal')?.remove();

    const effect = effectSource();
    if (!effect) {
      installSeal(severityValue());
      return;
    }

    const prepared = await prepareOriginal();
    if (runId !== activeRun || !resultIsVisible()) return;
    const original = prepared.dataUrl || state.currentImageData || effect;
    const severity = severityValue();

    await Promise.allSettled([loadImage(original), loadImage(effect)]);
    if (runId !== activeRun || !resultIsVisible()) return;

    const { overlay, mesh } = createOverlay(original, effect, severity);
    result.appendChild(overlay);
    document.body.classList.add('critical-impact-active');
    drawFrozenMesh(mesh, prepared.faceAnalysis?.normalizedLandmarks || state.faceAnalysis?.normalizedLandmarks);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => overlay.classList.add('is-running'));
    });
    vibrate(severity);

    window.setTimeout(() => {
      if (runId !== activeRun) return;
      overlay.classList.add('is-finishing');
      installSeal(severity);
    }, REVEAL_MS);

    window.setTimeout(() => {
      if (runId !== activeRun) return;
      overlay.remove();
      document.body.classList.remove('critical-impact-active');
      window.dispatchEvent(new CustomEvent('smazka:impact-reveal-complete', {
        detail: { severity, token }
      }));
    }, REVEAL_MS + EXIT_MS);
  }

  function schedule() {
    window.cancelAnimationFrame(scheduledFrame);
    scheduledFrame = window.requestAnimationFrame(() => {
      if (!resultIsVisible() || !state.currentImageData) return;
      const token = resultToken();
      if (!token || token === lastToken) {
        if (token) installSeal(severityValue());
        return;
      }
      runReveal(token);
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(result, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'open', 'src']
  });

  window.addEventListener('pagehide', () => {
    activeRun += 1;
    observer.disconnect();
    window.cancelAnimationFrame(scheduledFrame);
    result.querySelector('.critical-impact-reveal')?.remove();
    document.body.classList.remove('critical-impact-active');
  }, { once: true });

  schedule();
})();
