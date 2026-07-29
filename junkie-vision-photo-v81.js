/* Smažka v81 — Junkie Vision for uploaded still photos using the same theme and landmark feed. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const theme = window.SmazkaJunkieHudTheme;
  const feed = window.SmazkaLandmarkFeed;
  const stage = app?.elements?.cameraStage;
  const preview = app?.elements?.preview;
  const previewContainer = app?.elements?.previewContainer;
  const appRoot = app?.elements?.app;
  const result = app?.elements?.result;
  if (!app?.state || !theme || !feed || !stage || !preview || !previewContainer || !appRoot || !result) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'junkieVisionPhotoHud';
  wrapper.className = 'junkie-vision-hud junkie-vision-photo-hud';
  wrapper.dataset.source = 'photo';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.innerHTML = `
    <canvas class="junkie-vision-canvas" data-hud-canvas="v81-photo"></canvas>
    <div class="junkie-vision-chrome">
      <div class="jvh-corner jvh-corner-tl"></div>
      <div class="jvh-corner jvh-corner-tr"></div>
      <div class="jvh-corner jvh-corner-bl"></div>
      <div class="jvh-corner jvh-corner-br"></div>
      <div class="jvh-system">
        <strong class="jvh-stage-label">${theme.labels.init}</strong>
        <span class="jvh-frame-counter">STILL FRAME // LOCAL</span>
      </div>
      <div class="jvh-score"><small>JUNKIE INDEX</small><strong>00</strong><span>%</span></div>
      <div class="jvh-metrics" role="presentation"></div>
      <div class="jvh-critical"><span>${theme.labels.critical}</span></div>
      <div class="jvh-footer">${theme.labels.footer}</div>
    </div>
  `;
  stage.appendChild(wrapper);

  const canvas = wrapper.querySelector('canvas');
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const stageLabel = wrapper.querySelector('.jvh-stage-label');
  const score = wrapper.querySelector('.jvh-score strong');
  const metricsPanel = wrapper.querySelector('.jvh-metrics');
  if (!context) {
    wrapper.remove();
    return;
  }

  const rows = Array.from({ length: 4 }, () => {
    const row = document.createElement('div');
    row.className = 'jvh-metric-row';
    row.innerHTML = '<span></span><strong></strong>';
    metricsPanel.appendChild(row);
    return row;
  });

  const timing = theme.timing;
  const config = theme.performance;
  const colors = theme.colors;
  const zones = theme.zoneIndices;
  const frameInterval = 1000 / Math.max(1, config.targetFps);
  let snapshot = feed.getSnapshot();
  let active = false;
  let startedAt = 0;
  let raf = 0;
  let lastDrawAt = 0;
  let dpr = 1;
  let width = 1;
  let height = 1;
  let metricCursor = -1;
  let metricHistory = [];
  let hapticCursor = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function seeded(slot, salt = 0) {
    const value = Math.sin((slot + 1) * 15.137 + salt * 73.71) * 43821.173;
    return value - Math.floor(value);
  }

  function distance(a, b) {
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function resultIsOpen() {
    return document.body.classList.contains('result-open') || !result.classList.contains('hidden');
  }

  function photoAnalysisActive() {
    return snapshot?.sourceKind === 'still'
      && appRoot.getAttribute('aria-busy') === 'true'
      && !previewContainer.classList.contains('hidden')
      && !resultIsOpen();
  }

  function syncSize() {
    width = Math.max(1, Math.round(stage.clientWidth));
    height = Math.max(1, Math.round(stage.clientHeight));
    dpr = Math.min(window.devicePixelRatio || 1, config.maxDevicePixelRatio);
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function mapPoints(landmarks) {
    const sourceWidth = Number(snapshot?.sourceWidth || preview.naturalWidth || 0);
    const sourceHeight = Number(snapshot?.sourceHeight || preview.naturalHeight || 0);
    if (!sourceWidth || !sourceHeight || !landmarks?.length) return null;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const offsetX = (width - sourceWidth * scale) / 2;
    const offsetY = (height - sourceHeight * scale) / 2;
    return landmarks.map((point) => ({
      x: Number(point?.x || 0) * sourceWidth * scale + offsetX,
      y: Number(point?.y || 0) * sourceHeight * scale + offsetY
    }));
  }

  function boundsFor(points) {
    const face = zones.faceOval.map((index) => points?.[index]).filter(Boolean);
    if (!face.length) return null;
    const xs = face.map((point) => point.x);
    const ys = face.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  function drawPolyline(points, indices, color, lineWidth, alpha = 1, close = false) {
    const line = indices.map((index) => points?.[index]).filter(Boolean);
    if (line.length < 2) return;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalAlpha = alpha;
    context.beginPath();
    context.moveTo(line[0].x, line[0].y);
    line.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (close) context.closePath();
    context.stroke();
    context.restore();
  }

  function signalFor(points, elapsed) {
    const rightWidth = distance(points?.[33], points?.[133]);
    const leftWidth = distance(points?.[263], points?.[362]);
    const openness = (
      distance(points?.[159], points?.[145]) / Math.max(1, rightWidth)
      + distance(points?.[386], points?.[374]) / Math.max(1, leftWidth)
    ) / 2;
    const droop = clamp(Math.round((0.31 - openness) / 0.2 * 100), 0, 100);
    const mouthWidth = distance(points?.[61], points?.[291]);
    const mouth = clamp(Math.round(Math.abs((points?.[61]?.y || 0) - (points?.[291]?.y || 0)) / Math.max(1, mouthWidth) * 420), 0, 100);
    const index = clamp(Math.round(42 + droop * 0.28 + mouth * 0.2 + elapsed / timing.totalMs * 34), 9, 99);
    return { droop, mouth, index };
  }

  function metricValue(metric, signal, cursor) {
    const random = seeded(cursor, signal.index);
    switch (metric.kind) {
      case 'droop': return `${(9.8 + signal.droop / 68).toFixed(1)} ${metric.suffix}`;
      case 'mouth': return signal.mouth > 45 ? 'ODCHYLKA OD TŘÍZLÍKU: MAX' : `ODCHYLKA ${signal.mouth} %`;
      case 'jaw': return signal.mouth > 48 ? 'ŽVÝKACÍ SVAL: TIKAJÍCÍ BOMBA' : 'ČELIST: PODEZŘELE AKTIVNÍ';
      case 'hydration': return `${(0.1 + random * 0.8).toFixed(1)} ${metric.suffix}`;
      case 'paranoia': return 'DETEKOVÁN SOUSED ZA ZÁVĚSEM';
      case 'pupils': return `RÁŽE ${clamp(Math.round(6 + signal.droop / 24), 6, 11)} mm (ROZTAŽENO)`;
      case 'humanity': return `${clamp(Math.round(100 - signal.index * 0.93), 0, 91)} ${metric.suffix}`;
      case 'ping': return `${Math.round(210 + signal.index * 8.4 + random * 190)} ${metric.suffix}`;
      default: return `${clamp(Math.round(68 + random * 29), 0, 99)} ${metric.suffix}`.trim();
    }
  }

  function updateText(elapsed, signal, phase) {
    stageLabel.textContent = phase === 'init' ? theme.labels.init : phase === 'scan' ? theme.labels.scanning : theme.labels.critical;
    score.textContent = String(signal.index).padStart(2, '0');
    wrapper.dataset.phase = phase;
    wrapper.classList.toggle('is-critical', phase === 'critical');

    if (elapsed >= timing.initEndMs) {
      const next = Math.floor((elapsed - timing.initEndMs) / timing.metricRotateMs);
      if (next !== metricCursor) {
        metricCursor = next;
        const metric = theme.metrics[next % theme.metrics.length];
        metricHistory = [{ metric, value: metricValue(metric, signal, next) }, ...metricHistory].slice(0, rows.length);
      }
    }

    rows.forEach((row, index) => {
      const item = metricHistory[index];
      row.classList.toggle('is-hot', index === 0 && Boolean(item));
      row.classList.toggle('is-empty', !item);
      row.querySelector('span').textContent = item ? `[${item.metric.label}]` : '[ČEKÁM NA TKÁŇOVÝ VZOREK]';
      row.querySelector('strong').textContent = item ? item.value : '...';
    });
  }

  function drawFrame(now) {
    if (!active) return;
    raf = requestAnimationFrame(drawFrame);
    if (now - lastDrawAt < frameInterval) return;
    lastDrawAt = now;
    syncSize();

    const elapsed = clamp(now - startedAt, 0, timing.totalMs);
    const phase = elapsed < timing.initEndMs ? 'init' : elapsed < timing.scanEndMs ? 'scan' : 'critical';
    const points = mapPoints(snapshot?.landmarks);
    const bounds = boundsFor(points);
    context.clearRect(0, 0, width, height);
    if (!points || !bounds) return;

    const signal = signalFor(points, elapsed);
    const connections = Array.isArray(window.FACEMESH_TESSELATION) ? window.FACEMESH_TESSELATION : [];
    const maxConnections = Math.min(config.maxMeshConnections, Math.floor(connections.length / config.connectionStride));
    const visible = phase === 'init' ? Math.max(18, Math.floor(maxConnections * elapsed / timing.initEndMs)) : maxConnections;

    context.save();
    context.globalCompositeOperation = 'lighter';
    context.strokeStyle = colors.toxic;
    context.globalAlpha = phase === 'critical' ? 0.62 : 0.46;
    context.lineWidth = 0.62;
    context.beginPath();
    let count = 0;
    for (let index = 0; index < connections.length && count < visible; index += config.connectionStride) {
      const [a, b] = connections[index] || [];
      const from = points[a];
      const to = points[b];
      if (!from || !to) continue;
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      count += 1;
    }
    context.stroke();
    context.restore();

    drawPolyline(points, zones.faceOval, colors.toxic, 1.35, 0.82, true);
    drawPolyline(points, zones.rightEye, colors.impact, 1.45, 0.9, true);
    drawPolyline(points, zones.leftEye, colors.impact, 1.45, 0.9, true);
    drawPolyline(points, zones.mouth, colors.warning, 1.3, 0.86, true);

    if (elapsed >= timing.initEndMs) {
      const progress = clamp((elapsed - timing.initEndMs) / (timing.scanEndMs - timing.initEndMs), 0, 1);
      const y = bounds.top + bounds.height * progress;
      const gradient = context.createLinearGradient(bounds.left, y, bounds.right, y);
      gradient.addColorStop(0, 'rgba(0,255,102,0)');
      gradient.addColorStop(0.5, '#f4fff8');
      gradient.addColorStop(1, 'rgba(255,0,85,0)');
      context.save();
      context.strokeStyle = gradient;
      context.lineWidth = 2;
      context.shadowColor = phase === 'critical' ? colors.impact : colors.toxic;
      context.shadowBlur = 15;
      context.beginPath();
      context.moveTo(bounds.left - 18, y);
      context.lineTo(bounds.right + 18, y);
      context.stroke();
      context.restore();
    }

    if (phase === 'critical') {
      context.save();
      context.fillStyle = `rgba(255,0,85,${0.08 + Math.max(0, Math.sin(elapsed / 42)) * 0.12})`;
      context.fillRect(bounds.left - 20, bounds.top - 20, bounds.width + 40, bounds.height + 40);
      context.restore();
    }

    updateText(elapsed, signal, phase);
    while (hapticCursor < timing.hapticAtMs.length && elapsed >= timing.hapticAtMs[hapticCursor]) {
      try {
        navigator.vibrate?.([[8], [12, 28, 12], [24, 34, 48]][hapticCursor]);
      } catch {
        // Optional on browsers without haptics.
      }
      hapticCursor += 1;
    }
  }

  function start() {
    if (active || !photoAnalysisActive()) return;
    active = true;
    startedAt = performance.now();
    metricCursor = -1;
    metricHistory = [];
    hapticCursor = 0;
    wrapper.classList.add('is-active');
    document.body.classList.add('junkie-vision-photo-active');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawFrame);
  }

  function stop() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    raf = 0;
    wrapper.classList.add('is-exiting');
    document.body.classList.remove('junkie-vision-photo-active');
    window.setTimeout(() => {
      wrapper.classList.remove('is-active', 'is-exiting', 'is-critical');
      context.clearRect(0, 0, width, height);
    }, timing.exitMs);
  }

  function sync() {
    if (photoAnalysisActive()) start();
    else stop();
  }

  const unsubscribe = feed.subscribe((next) => {
    snapshot = next;
    sync();
  });
  const observer = new (window.SmazkaMutationObserver || window.MutationObserver)(sync);
  observer.observe(appRoot, { attributes: true, attributeFilter: ['aria-busy'] });
  observer.observe(previewContainer, { attributes: true, attributeFilter: ['class'] });
  observer.observe(result, { attributes: true, attributeFilter: ['class', 'open'] });

  window.addEventListener('resize', syncSize, { passive: true });
  window.visualViewport?.addEventListener('resize', syncSize, { passive: true });
  window.addEventListener('pagehide', () => {
    unsubscribe();
    observer.disconnect();
    stop();
    canvas.width = 1;
    canvas.height = 1;
  }, { once: true });

  syncSize();
  sync();
})();
