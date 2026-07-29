/* Smažka v81 — real-time thematic HUD drawn over the camera during the 3s scan. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const theme = window.SmazkaJunkieHudTheme;
  const feed = window.SmazkaLandmarkFeed;
  const stage = app?.elements?.cameraStage;
  const video = app?.elements?.video;
  const result = app?.elements?.result;
  if (!app?.state || !theme || !feed || !stage || !video || !result) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'junkieVisionHud';
  wrapper.className = 'junkie-vision-hud';
  wrapper.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'junkie-vision-canvas';
  canvas.dataset.hudCanvas = 'v81';

  const chrome = document.createElement('div');
  chrome.className = 'junkie-vision-chrome';
  chrome.innerHTML = `
    <div class="jvh-corner jvh-corner-tl"></div>
    <div class="jvh-corner jvh-corner-tr"></div>
    <div class="jvh-corner jvh-corner-bl"></div>
    <div class="jvh-corner jvh-corner-br"></div>
    <div class="jvh-system">
      <strong class="jvh-stage-label">${theme.labels.init}</strong>
      <span class="jvh-frame-counter">FRAME 0000 // LOCAL</span>
    </div>
    <div class="jvh-score">
      <small>JUNKIE INDEX</small>
      <strong>00</strong>
      <span>%</span>
    </div>
    <div class="jvh-metrics" role="presentation"></div>
    <div class="jvh-critical"><span>${theme.labels.critical}</span></div>
    <div class="jvh-footer">${theme.labels.footer}</div>
  `;

  wrapper.append(canvas, chrome);
  stage.appendChild(wrapper);

  const context = canvas.getContext('2d', {
    alpha: true,
    desynchronized: true
  });
  if (!context) {
    wrapper.remove();
    return;
  }

  const stageLabel = chrome.querySelector('.jvh-stage-label');
  const frameCounter = chrome.querySelector('.jvh-frame-counter');
  const scoreValue = chrome.querySelector('.jvh-score strong');
  const metricsPanel = chrome.querySelector('.jvh-metrics');

  const metricRows = Array.from({ length: 4 }, () => {
    const row = document.createElement('div');
    row.className = 'jvh-metric-row';
    row.innerHTML = '<span></span><strong></strong>';
    metricsPanel.appendChild(row);
    return row;
  });

  const colors = theme.colors;
  const timing = theme.timing;
  const performanceConfig = theme.performance;
  const zones = theme.zoneIndices;
  const frameInterval = 1000 / Math.max(1, performanceConfig.targetFps);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let latestSnapshot = feed.getSnapshot();
  let previousLandmarks = null;
  let mappedPoints = null;
  let faceBounds = null;
  let landmarkNoise = 0;
  let active = false;
  let exiting = false;
  let startedAt = 0;
  let exitStartedAt = 0;
  let animationFrame = 0;
  let lastDrawAt = 0;
  let metricCursor = -1;
  let metricHistory = [];
  let hapticCursor = 0;
  let frameNumber = 0;
  let lastPhase = '';
  let canvasCssWidth = 0;
  let canvasCssHeight = 0;
  let canvasDpr = 1;

  const jitterIndices = [10, 33, 133, 159, 145, 263, 362, 386, 374, 61, 291, 152];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function seeded(slot, salt = 0) {
    const seed = Math.sin((slot + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return seed - Math.floor(seed);
  }

  function resultIsOpen() {
    return document.body.classList.contains('result-open')
      || !result.classList.contains('hidden');
  }

  function scanIsActive() {
    return document.body.classList.contains('face-scan-active');
  }

  function vibrate(pattern) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Haptics are optional, especially on iOS.
    }
  }

  function syncCanvasSize() {
    const width = Math.max(1, Math.round(stage.clientWidth));
    const height = Math.max(1, Math.round(stage.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, performanceConfig.maxDevicePixelRatio);
    if (width === canvasCssWidth && height === canvasCssHeight && dpr === canvasDpr) return;

    canvasCssWidth = width;
    canvasCssHeight = height;
    canvasDpr = dpr;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function mapLandmarks(landmarks) {
    const sourceWidth = Number(video.videoWidth || 0);
    const sourceHeight = Number(video.videoHeight || 0);
    const targetWidth = canvasCssWidth;
    const targetHeight = canvasCssHeight;
    if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight || !landmarks?.length) return null;

    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const offsetX = (targetWidth - sourceWidth * scale) / 2;
    const offsetY = (targetHeight - sourceHeight * scale) / 2;
    const mirrored = app.state.facingMode === 'user';

    return landmarks.map((landmark) => {
      const renderedX = Number(landmark?.x || 0) * sourceWidth * scale + offsetX;
      return {
        x: mirrored ? targetWidth - renderedX : renderedX,
        y: Number(landmark?.y || 0) * sourceHeight * scale + offsetY,
        z: Number(landmark?.z || 0)
      };
    });
  }

  function calculateFaceBounds(points) {
    const selected = zones.faceOval.map((index) => points?.[index]).filter(Boolean);
    if (!selected.length) return null;
    const xs = selected.map((point) => point.x);
    const ys = selected.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return {
      left,
      right,
      top,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2
    };
  }

  function calculateLandmarkNoise(current, previous) {
    if (!current || !previous || !faceBounds?.width) return 0;
    const distances = jitterIndices
      .map((index) => distance(current[index], previous[index]))
      .filter(Number.isFinite);
    if (!distances.length) return 0;
    const average = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    return clamp(average / Math.max(12, faceBounds.width * 0.018), 0, 1);
  }

  function eyeDroop(points) {
    const rightWidth = distance(points?.[33], points?.[133]);
    const leftWidth = distance(points?.[263], points?.[362]);
    const rightOpen = distance(points?.[159], points?.[145]) / Math.max(1, rightWidth);
    const leftOpen = distance(points?.[386], points?.[374]) / Math.max(1, leftWidth);
    const openness = (rightOpen + leftOpen) / 2;
    return clamp(Math.round((0.31 - openness) / 0.2 * 100), 0, 100);
  }

  function mouthAsymmetry(points) {
    const width = distance(points?.[61], points?.[291]);
    const delta = Math.abs((points?.[61]?.y || 0) - (points?.[291]?.y || 0));
    return clamp(Math.round(delta / Math.max(1, width) * 420), 0, 100);
  }

  function currentSignal(elapsed) {
    const droop = eyeDroop(mappedPoints);
    const mouth = mouthAsymmetry(mappedPoints);
    const noise = Math.round(landmarkNoise * 100);
    const timeline = clamp(elapsed / timing.totalMs, 0, 1);
    const index = clamp(Math.round(34 + droop * 0.28 + mouth * 0.18 + noise * 0.2 + timeline * 31), 8, 99);
    return { droop, mouth, noise, index };
  }

  function phaseFor(elapsed) {
    if (elapsed < timing.initEndMs) return 'init';
    if (elapsed < timing.scanEndMs) return 'scan';
    return 'critical';
  }

  function updateChrome(phase, elapsed, signal) {
    if (phase !== lastPhase) {
      lastPhase = phase;
      wrapper.dataset.phase = phase;
      wrapper.classList.toggle('is-critical', phase === 'critical');
      stageLabel.textContent = phase === 'init'
        ? theme.labels.init
        : phase === 'scan'
          ? theme.labels.scanning
          : theme.labels.critical;
    }

    frameCounter.textContent = `FRAME ${String(frameNumber).padStart(4, '0')} // LOCAL`;
    scoreValue.textContent = String(signal.index).padStart(2, '0');

    if (elapsed >= timing.initEndMs) {
      const nextCursor = Math.floor((elapsed - timing.initEndMs) / timing.metricRotateMs);
      if (nextCursor !== metricCursor) {
        metricCursor = nextCursor;
        const metric = theme.metrics[nextCursor % theme.metrics.length];
        metricHistory = [
          { metric, value: metricValue(metric.kind, signal, nextCursor) },
          ...metricHistory
        ].slice(0, metricRows.length);
      }
    }

    metricRows.forEach((row, index) => {
      const item = metricHistory[index];
      row.classList.toggle('is-hot', index === 0 && phase !== 'init');
      row.classList.toggle('is-empty', !item);
      row.querySelector('span').textContent = item ? `[${item.metric.label}]` : '[ČEKÁM NA BIOLOGICKÝ MATERIÁL]';
      row.querySelector('strong').textContent = item ? `${item.value}${item.metric.suffix ? ` ${item.metric.suffix}` : ''}` : '...';
    });
  }

  function metricValue(kind, signal, cursor) {
    const random = seeded(cursor, signal.index);
    switch (kind) {
      case 'scatter': return clamp(Math.round(67 + signal.noise * 0.24 + random * 24), 0, 99);
      case 'droop': return (9.8 + signal.droop / 68).toFixed(1);
      case 'jaw': return signal.mouth > 48 ? 'ŽVÝKACÍ SVAL: TIKAJÍCÍ BOMBA' : 'ČELIST: PODEZŘELE AKTIVNÍ';
      case 'hydration': return (0.1 + random * 0.8).toFixed(1);
      case 'mouth': return signal.mouth > 45 ? 'ODCHYLKA OD TŘÍZLÍKU: MAX' : `ODCHYLKA ${signal.mouth} %`;
      case 'pernik': return cursor % 2 ? 'PROBÍHÁ PROPOČET...' : `${clamp(signal.index + 7, 0, 99)} % / NEOVĚŘENO`;
      case 'paranoia': return random > 0.45 ? 'DETEKOVÁN SOUSED ZA ZÁVĚSEM' : 'OKNO SLEDUJE SUBJEKT';
      case 'pupils': return `RÁŽE ${clamp(Math.round(6 + signal.droop / 24), 6, 11)} mm (ROZTAŽENO)`;
      case 'reality': return signal.index > 72 ? 'SPOJENÍ PŘERUŠENO' : 'PINGUJE, ALE NEODPOVÍDÁ';
      case 'humanity': return clamp(Math.round(100 - signal.index * 0.93), 0, 91);
      case 'ping': return Math.round(180 + signal.index * 8.6 + random * 230);
      case 'signal': return clamp(Math.round(100 - signal.noise * 0.7 - signal.index * 0.22), 2, 92);
      default: return Math.round(random * 100);
    }
  }

  function drawPolyline(indices, strokeStyle, lineWidth, alpha = 1, close = false) {
    const points = indices.map((index) => mappedPoints?.[index]).filter(Boolean);
    if (points.length < 2) return;
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (close) context.closePath();
    context.stroke();
    context.restore();
  }

  function drawMesh(elapsed, phase) {
    const connections = Array.isArray(window.FACEMESH_TESSELATION)
      ? window.FACEMESH_TESSELATION
      : [];
    const initProgress = clamp(elapsed / timing.initEndMs, 0, 1);
    const maxConnections = Math.min(
      performanceConfig.maxMeshConnections,
      Math.floor(connections.length / Math.max(1, performanceConfig.connectionStride))
    );
    const visibleConnections = phase === 'init'
      ? Math.max(18, Math.floor(maxConnections * initProgress))
      : maxConnections;

    context.save();
    context.globalCompositeOperation = 'lighter';
    context.strokeStyle = colors.toxic;
    context.lineWidth = phase === 'critical' ? 0.72 : 0.58;
    context.globalAlpha = phase === 'init' ? 0.2 + initProgress * 0.55 : 0.48;
    context.beginPath();

    let drawn = 0;
    const stride = Math.max(1, performanceConfig.connectionStride);
    for (let index = 0; index < connections.length && drawn < visibleConnections; index += stride) {
      const [fromIndex, toIndex] = connections[index] || [];
      const from = mappedPoints?.[fromIndex];
      const to = mappedPoints?.[toIndex];
      if (!from || !to) continue;
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      drawn += 1;
    }
    context.stroke();
    context.restore();

    drawPolyline(zones.faceOval, colors.toxic, 1.35, phase === 'critical' ? 0.86 : 0.72, true);
    drawPolyline(zones.rightEye, colors.impact, 1.45, phase === 'scan' ? 0.88 : 0.68, true);
    drawPolyline(zones.leftEye, colors.impact, 1.45, phase === 'scan' ? 0.88 : 0.68, true);
    drawPolyline(zones.mouth, colors.warning, 1.25, phase === 'critical' ? 0.94 : 0.72, true);
  }

  function drawEyeMeters(signal) {
    const right = mappedPoints?.[159];
    const left = mappedPoints?.[386];
    if (!right || !left) return;
    [right, left].forEach((eye, index) => {
      const side = index ? 1 : -1;
      const x = eye.x + side * 26;
      const y = eye.y - 22;
      const height = 44;
      context.save();
      context.strokeStyle = 'rgba(255,255,255,0.42)';
      context.lineWidth = 0.7;
      context.strokeRect(x - 2, y, 4, height);
      context.fillStyle = signal.droop > 55 ? colors.impact : colors.warning;
      const fillHeight = height * signal.droop / 100;
      context.fillRect(x - 1.5, y + height - fillHeight, 3, fillHeight);
      context.font = '600 8px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.fillStyle = colors.white;
      context.textAlign = side > 0 ? 'left' : 'right';
      context.fillText(`DROOP ${signal.droop}`, x + side * 7, y + 8);
      context.restore();
    });
  }

  function drawForeheadCore(elapsed, signal) {
    const valid = zones.forehead.map((index) => mappedPoints?.[index]).filter(Boolean);
    if (!valid.length) return;
    const center = valid.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    center.x /= valid.length;
    center.y /= valid.length;
    const pulse = 9 + Math.sin(elapsed / 85) * 3 + signal.index * 0.05;

    context.save();
    context.globalCompositeOperation = 'lighter';
    [1, 1.65, 2.3].forEach((scale, index) => {
      context.beginPath();
      context.arc(center.x, center.y, pulse * scale, 0, Math.PI * 2);
      context.strokeStyle = index === 2 ? colors.warning : colors.impact;
      context.globalAlpha = 0.48 / (index + 0.8);
      context.lineWidth = index ? 0.65 : 1.2;
      context.stroke();
    });
    context.fillStyle = colors.impact;
    context.globalAlpha = 0.9;
    context.fillRect(center.x - 2, center.y - 2, 4, 4);
    context.restore();
  }

  function drawScanner(elapsed, signal) {
    if (!faceBounds || elapsed < timing.initEndMs) return;
    const scanProgress = clamp((elapsed - timing.initEndMs) / (timing.scanEndMs - timing.initEndMs), 0, 1);
    const y = faceBounds.top + faceBounds.height * scanProgress;
    const left = faceBounds.left - 18;
    const right = faceBounds.right + 18;

    context.save();
    const gradient = context.createLinearGradient(left, y, right, y);
    gradient.addColorStop(0, 'rgba(0,255,102,0)');
    gradient.addColorStop(0.15, 'rgba(0,255,102,0.8)');
    gradient.addColorStop(0.5, 'rgba(244,255,248,1)');
    gradient.addColorStop(0.82, 'rgba(255,0,85,0.84)');
    gradient.addColorStop(1, 'rgba(255,0,85,0)');
    context.strokeStyle = gradient;
    context.lineWidth = 1.4 + signal.noise * 1.2;
    context.shadowColor = signal.index > 72 ? colors.impact : colors.toxic;
    context.shadowBlur = 12 + signal.noise * 9;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();

    context.globalAlpha = 0.14 + signal.noise * 0.18;
    context.fillStyle = colors.toxic;
    context.fillRect(left, y - 9, right - left, 18);
    context.restore();
  }

  function drawGlitches(elapsed, signal, phase) {
    const slot = Math.floor(elapsed / (phase === 'critical' ? 46 : 92));
    const intensity = clamp(0.08 + signal.noise * 0.42 + (phase === 'critical' ? 0.36 : 0), 0, 0.82);
    if (seeded(slot, 3) > intensity || !faceBounds) return;

    const bars = phase === 'critical' ? 4 : 2;
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let index = 0; index < bars; index += 1) {
      const randomY = faceBounds.top + seeded(slot, index + 5) * faceBounds.height;
      const height = 1 + seeded(slot, index + 9) * 5;
      const offset = (seeded(slot, index + 13) - 0.5) * (18 + signal.noise * 34);
      context.globalAlpha = 0.16 + seeded(slot, index + 17) * 0.34;
      context.fillStyle = index % 2 ? colors.impact : colors.warning;
      context.fillRect(faceBounds.left + offset, randomY, faceBounds.width, height);
    }
    context.restore();
  }

  function drawCriticalWash(elapsed, signal) {
    if (!faceBounds) return;
    const blink = 0.08 + Math.max(0, Math.sin(elapsed / 38)) * 0.12;
    context.save();
    const gradient = context.createRadialGradient(
      faceBounds.centerX,
      faceBounds.centerY,
      faceBounds.width * 0.08,
      faceBounds.centerX,
      faceBounds.centerY,
      faceBounds.width * 0.72
    );
    gradient.addColorStop(0, `rgba(255,0,85,${blink + signal.index / 900})`);
    gradient.addColorStop(1, 'rgba(255,0,85,0)');
    context.fillStyle = gradient;
    context.fillRect(faceBounds.left - 36, faceBounds.top - 36, faceBounds.width + 72, faceBounds.height + 72);
    context.restore();
  }

  function drawPowerOn(elapsed) {
    if (elapsed >= timing.initEndMs) return;
    const progress = clamp(elapsed / timing.initEndMs, 0, 1);
    const centerY = canvasCssHeight / 2;
    const lineHeight = Math.max(1, (1 - progress) * 26);
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.fillStyle = colors.white;
    context.globalAlpha = (1 - progress) * 0.6;
    context.fillRect(0, centerY - lineHeight / 2, canvasCssWidth, lineHeight);
    context.restore();
  }

  function clearFrame() {
    context.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    context.clearRect(0, 0, canvasCssWidth, canvasCssHeight);
  }

  function draw(now) {
    if (!active && !exiting) return;
    animationFrame = requestAnimationFrame(draw);
    if (now - lastDrawAt < frameInterval) return;
    lastDrawAt = now;
    frameNumber += 1;

    syncCanvasSize();
    const elapsed = active
      ? Math.max(0, now - startedAt)
      : timing.totalMs + Math.max(0, now - exitStartedAt);
    const phase = phaseFor(Math.min(elapsed, timing.totalMs));

    const landmarks = latestSnapshot?.landmarks;
    if (landmarks?.length >= 468) {
      const nextPoints = mapLandmarks(landmarks);
      if (nextPoints) {
        previousLandmarks = mappedPoints;
        mappedPoints = nextPoints;
        faceBounds = calculateFaceBounds(mappedPoints);
        landmarkNoise = calculateLandmarkNoise(mappedPoints, previousLandmarks);
      }
    }

    const signal = currentSignal(elapsed);
    clearFrame();

    if (mappedPoints && faceBounds) {
      drawMesh(elapsed, phase);
      drawScanner(elapsed, signal);
      drawEyeMeters(signal);
      drawForeheadCore(elapsed, signal);
      drawGlitches(elapsed, signal, phase);
      if (phase === 'critical') drawCriticalWash(elapsed, signal);
    }
    drawPowerOn(elapsed);
    updateChrome(phase, elapsed, signal);

    while (hapticCursor < timing.hapticAtMs.length && elapsed >= timing.hapticAtMs[hapticCursor]) {
      const patterns = [[8], [12, 28, 12], [24, 34, 48]];
      if (!reducedMotion.matches) vibrate(patterns[hapticCursor]);
      hapticCursor += 1;
    }

    if (active && elapsed >= timing.totalMs + 90 && !scanIsActive()) beginExit();
    if (exiting && now - exitStartedAt >= timing.exitMs) deactivate();
  }

  function activate() {
    if (active) return;
    active = true;
    exiting = false;
    startedAt = performance.now();
    exitStartedAt = 0;
    hapticCursor = 0;
    metricCursor = -1;
    metricHistory = [];
    frameNumber = 0;
    lastPhase = '';
    landmarkNoise = 0;
    wrapper.classList.remove('is-exiting');
    wrapper.classList.add('is-active');
    document.body.classList.add('junkie-vision-active');
    syncCanvasSize();
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(draw);
  }

  function beginExit() {
    if (!active || exiting) return;
    active = false;
    exiting = true;
    exitStartedAt = performance.now();
    wrapper.classList.add('is-exiting');
  }

  function deactivate() {
    active = false;
    exiting = false;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    wrapper.classList.remove('is-active', 'is-exiting', 'is-critical');
    wrapper.dataset.phase = 'idle';
    document.body.classList.remove('junkie-vision-active');
    clearFrame();
  }

  function syncLifecycle() {
    if (resultIsOpen()) {
      deactivate();
      return;
    }
    if (scanIsActive()) {
      activate();
      return;
    }
    if (active) {
      const elapsed = performance.now() - startedAt;
      if (elapsed >= timing.scanEndMs - 80) beginExit();
      else deactivate();
    }
  }

  const unsubscribe = feed.subscribe((snapshot) => {
    latestSnapshot = snapshot;
  });

  const lifecycleObserver = new MutationObserver(syncLifecycle);
  lifecycleObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });
  lifecycleObserver.observe(result, {
    attributes: true,
    attributeFilter: ['class', 'open']
  });

  window.addEventListener('resize', syncCanvasSize, { passive: true });
  window.visualViewport?.addEventListener('resize', syncCanvasSize, { passive: true });
  window.addEventListener('pagehide', () => {
    unsubscribe();
    lifecycleObserver.disconnect();
    deactivate();
    canvas.width = 1;
    canvas.height = 1;
  }, { once: true });

  window.SmazkaJunkieVision = Object.freeze({
    start: activate,
    stop: deactivate,
    getState() {
      return {
        active,
        phase: wrapper.dataset.phase || 'idle',
        noise: landmarkNoise,
        frameNumber
      };
    }
  });

  syncCanvasSize();
  syncLifecycle();
})();
