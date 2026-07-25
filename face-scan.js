/* Face Scan Mode – simulated local scan, no server upload */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.elements) return;

  const { video, retakeButton, previewContainer, loading } = app.elements;
  const videoContainer = document.querySelector('.video-container');
  if (!videoContainer) return;

  const overlay = document.createElement('div');
  overlay.id = 'scanOverlay';

  const scanLine = document.createElement('div');
  scanLine.id = 'scanLine';
  scanLine.setAttribute('aria-hidden', 'true');

  const status = document.createElement('div');
  status.id = 'scanStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Připraveno ke skenu';

  const barWrap = document.createElement('div');
  barWrap.id = 'scanBar';
  barWrap.setAttribute('aria-hidden', 'true');

  const bar = document.createElement('div');
  bar.className = 'scan-bar-fill';
  barWrap.appendChild(bar);

  overlay.append(scanLine, status, barWrap);
  videoContainer.appendChild(overlay);

  let animationFrame = null;
  let finishTimer = null;
  let startedAt = 0;
  let duration = 2800;
  let progress = 0;
  let isScanning = false;
  let currentStage = '';

  const scanStages = [
    [12, 'Kalibruju kameru…'],
    [30, 'Srovnávám obraz…'],
    [49, 'Měřím damage level…'],
    [67, 'Kontroluju chaos v očích…'],
    [85, 'Ověřuju zbytky důstojnosti…'],
    [100, 'Sken dokončen']
  ];

  function setStatusByProgress(value) {
    const stage = scanStages.find(([limit]) => value <= limit) || scanStages.at(-1);
    if (stage[1] !== currentStage) {
      currentStage = stage[1];
      status.textContent = currentStage;
    }
  }

  function setProgress(value) {
    progress = Math.max(0, Math.min(100, value));
    bar.style.width = `${progress}%`;
    document.documentElement.style.setProperty('--scan-progress', `${progress}%`);
    status.dataset.progress = `${Math.round(progress)}%`;
    setStatusByProgress(progress);
  }

  function stopAnimation() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function reset() {
    stopAnimation();
    clearTimeout(finishTimer);
    finishTimer = null;
    startedAt = 0;
    progress = 0;
    isScanning = false;
    currentStage = '';
    bar.style.width = '0%';
    status.dataset.progress = '0%';
    barWrap.classList.remove('show');
    scanLine.classList.remove('active');
    overlay.classList.remove('is-scanning', 'is-complete');
    app.setBusy(false);
    loading.classList.add('hidden');
    status.textContent = 'Připraveno ke skenu';
  }

  function captureAndAnalyze() {
    const dataUrl = app.captureCurrentFrame(0.92);
    if (!dataUrl) {
      reset();
      app.showError('Kamera ještě neposlala obraz. Dej jí vteřinu a zkus to znovu.');
      return;
    }

    barWrap.classList.remove('show');
    overlay.classList.remove('is-scanning', 'is-complete');
    bar.style.width = '0%';
    isScanning = false;
    retakeButton.classList.remove('hidden');
    app.showCapturedFrame();
    app.setBusy(false);
    app.runAnalysis({ skipImageCheck: true });
  }

  function finishScan() {
    stopAnimation();
    setProgress(100);
    scanLine.classList.remove('active');
    overlay.classList.remove('is-scanning');
    overlay.classList.add('is-complete');

    finishTimer = window.setTimeout(() => {
      finishTimer = null;
      captureAndAnalyze();
    }, 220);
  }

  function animateScan(now) {
    if (!isScanning) return;
    if (!startedAt) startedAt = now;

    const elapsed = now - startedAt;
    const linear = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - linear, 1.12);
    setProgress(eased * 100);

    if (linear >= 1) {
      finishScan();
      return;
    }

    animationFrame = requestAnimationFrame(animateScan);
  }

  function start() {
    if (isScanning || app.state.isAnalyzing) return;

    if (!video.srcObject || !video.videoWidth) {
      app.showError('Kamera ještě není připravená. Povol ji v prohlížeči, nebo použij nahrání fotky.');
      return;
    }

    reset();
    isScanning = true;
    duration = 2550 + Math.random() * 450;
    app.hideResult?.();
    previewContainer.classList.add('hidden');
    app.clearErrors();
    app.setHint('Drž obličej přirozeně uprostřed. Sken probíhá pouze v tomto zařízení.');
    app.setBusy(true);

    overlay.classList.add('is-scanning');
    scanLine.classList.add('active');
    barWrap.classList.add('show');
    setProgress(0);
    animationFrame = requestAnimationFrame(animateScan);
  }

  window.SmazkaFaceScan = { start, reset };

  const autoStart = () => {
    if (video.srcObject && video.videoWidth) {
      status.textContent = 'Kamera připravena';
      app.setHint('Dej obličej do středu a klikni na „Spustit sken“.');
    }
  };

  if (video.readyState >= 2) autoStart();
  video.addEventListener('loadedmetadata', autoStart);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isScanning) reset();
  });
})();