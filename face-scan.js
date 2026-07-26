/* Face Scan Mode – local face lock with native detection when available. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.elements) return;

  const { video, retakeButton, previewContainer, loading, result } = app.elements;
  const videoContainer = app.elements.cameraStage || document.querySelector('.video-container');
  if (!videoContainer) return;

  const overlay = document.createElement('div');
  overlay.id = 'scanOverlay';
  overlay.className = 'is-tracking';
  overlay.dataset.stage = 'idle';

  const tracker = document.createElement('div');
  tracker.className = 'face-tracker';
  tracker.setAttribute('aria-hidden', 'true');

  const faceFrame = document.createElement('div');
  faceFrame.className = 'face-lock-frame';
  faceFrame.dataset.mode = 'guided';

  const mesh = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mesh.setAttribute('class', 'face-landmark-mesh');
  mesh.setAttribute('viewBox', '0 0 100 128');
  mesh.setAttribute('preserveAspectRatio', 'none');
  mesh.innerHTML = `
    <path class="face-contour" d="M50 5 C26 5 15 25 15 55 C15 89 29 118 50 124 C71 118 85 89 85 55 C85 25 74 5 50 5 Z" />
    <path class="mesh-line mesh-brow" d="M25 39 C34 34 42 35 47 39 M53 39 C59 35 68 34 76 39" />
    <path class="mesh-line mesh-eye" d="M25 48 C31 43 41 43 47 48 C40 54 32 54 25 48 Z M53 48 C60 43 69 43 76 48 C69 54 60 54 53 48 Z" />
    <path class="mesh-line mesh-nose" d="M50 49 C47 61 45 70 50 76 C54 75 57 73 59 70" />
    <path class="mesh-line mesh-mouth" d="M34 87 C43 82 57 82 66 87 C58 95 43 95 34 87 Z" />
    <path class="mesh-line mesh-center" d="M50 12 L50 116 M20 63 C34 59 66 59 80 63" />
    <path class="mesh-line mesh-jaw" d="M18 66 L22 79 L28 92 L37 106 L50 116 L63 106 L72 92 L78 79 L82 66" />
    <g class="landmark-points">
      <circle class="landmark landmark-eye" cx="32" cy="48" r="1.45" />
      <circle class="landmark landmark-eye" cx="40" cy="48" r="1.45" />
      <circle class="landmark landmark-eye" cx="60" cy="48" r="1.45" />
      <circle class="landmark landmark-eye" cx="68" cy="48" r="1.45" />
      <circle class="landmark landmark-nose" cx="50" cy="67" r="1.5" />
      <circle class="landmark landmark-nose" cx="46" cy="75" r="1.2" />
      <circle class="landmark landmark-nose" cx="56" cy="74" r="1.2" />
      <circle class="landmark landmark-mouth" cx="39" cy="87" r="1.3" />
      <circle class="landmark landmark-mouth" cx="50" cy="90" r="1.45" />
      <circle class="landmark landmark-mouth" cx="61" cy="87" r="1.3" />
      <circle class="landmark landmark-jaw" cx="22" cy="79" r="1.15" />
      <circle class="landmark landmark-jaw" cx="28" cy="92" r="1.15" />
      <circle class="landmark landmark-jaw" cx="37" cy="106" r="1.15" />
      <circle class="landmark landmark-jaw" cx="50" cy="116" r="1.25" />
      <circle class="landmark landmark-jaw" cx="63" cy="106" r="1.15" />
      <circle class="landmark landmark-jaw" cx="72" cy="92" r="1.15" />
      <circle class="landmark landmark-jaw" cx="78" cy="79" r="1.15" />
    </g>
  `;

  const lockLabel = document.createElement('span');
  lockLabel.className = 'face-lock-label';
  lockLabel.textContent = 'FACE TARGET';

  const eyeLeftLabel = document.createElement('span');
  eyeLeftLabel.className = 'feature-label feature-eye-left';
  eyeLeftLabel.textContent = 'EYE L';

  const eyeRightLabel = document.createElement('span');
  eyeRightLabel.className = 'feature-label feature-eye-right';
  eyeRightLabel.textContent = 'EYE R';

  const mouthLabel = document.createElement('span');
  mouthLabel.className = 'feature-label feature-mouth';
  mouthLabel.textContent = 'MOUTH';

  const scanLine = document.createElement('div');
  scanLine.id = 'scanLine';
  scanLine.setAttribute('aria-hidden', 'true');

  faceFrame.append(mesh, lockLabel, eyeLeftLabel, eyeRightLabel, mouthLabel, scanLine);
  tracker.appendChild(faceFrame);

  const status = document.createElement('div');
  status.id = 'scanStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.innerHTML = `
    <span class="scan-state-dot" aria-hidden="true"></span>
    <span class="scan-state-copy">Zarovnej obličej</span>
    <strong class="scan-state-progress">0%</strong>
  `;

  const statusCopy = status.querySelector('.scan-state-copy');
  const statusProgress = status.querySelector('.scan-state-progress');

  const barWrap = document.createElement('div');
  barWrap.id = 'scanBar';
  barWrap.setAttribute('aria-hidden', 'true');

  const bar = document.createElement('div');
  bar.className = 'scan-bar-fill';
  barWrap.appendChild(bar);

  overlay.append(tracker, status, barWrap);
  videoContainer.appendChild(overlay);

  let animationFrame = null;
  let finishTimer = null;
  let detectionTimer = null;
  let detectionBusy = false;
  let startedAt = 0;
  let duration = 2800;
  let progress = 0;
  let isScanning = false;
  let currentStage = '';
  let faceDetected = false;
  let detector = null;
  let detectorMode = 'guided';
  let lastDetectionAt = 0;

  try {
    if ('FaceDetector' in window) {
      detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      detectorMode = 'native';
      faceFrame.dataset.mode = 'native';
    }
  } catch (error) {
    console.info('Nativní detekce obličeje není dostupná, používám lokální vodicí režim.', error);
    detector = null;
  }

  const scanStages = [
    [13, 'Zamykám obličej', 'lock'],
    [31, 'Oči rozpoznány', 'eyes'],
    [48, 'Nos a ústa zamčeny', 'features'],
    [68, 'Mapuju čelist', 'jaw'],
    [89, 'Vyhodnocuju damage', 'analysis'],
    [100, 'Sken dokončen', 'complete']
  ];

  function setStatus(message) {
    if (statusCopy) statusCopy.textContent = message;
  }

  function setDetected(detected, source = detectorMode) {
    faceDetected = Boolean(detected);
    overlay.classList.toggle('face-detected', faceDetected);
    overlay.classList.toggle('face-searching', !faceDetected);
    faceFrame.dataset.mode = source;

    if (!isScanning) {
      setStatus(faceDetected ? 'Obličej rozpoznán' : detector ? 'Hledám obličej' : 'Zarovnej obličej');
      lockLabel.textContent = faceDetected ? 'FACE LOCK' : 'FACE TARGET';
    }
  }

  function setGuidedFrame(now = performance.now()) {
    const width = videoContainer.clientWidth;
    const height = videoContainer.clientHeight;
    if (!width || !height) return;

    const pulse = Math.sin(now / 1100) * Math.min(3, width * 0.006);
    const frameWidth = Math.min(width * 0.62, height * 0.53) + pulse;
    const frameHeight = Math.min(height * 0.69, frameWidth * 1.42);
    const left = (width - frameWidth) / 2;
    const top = Math.max(height * 0.075, height * 0.43 - frameHeight * 0.48);
    setFrameRect(left, top, frameWidth, frameHeight);
  }

  function setFrameRect(left, top, width, height) {
    const containerWidth = videoContainer.clientWidth;
    const containerHeight = videoContainer.clientHeight;
    if (!containerWidth || !containerHeight) return;

    const minWidth = containerWidth * 0.38;
    const maxWidth = containerWidth * 0.82;
    const safeWidth = Math.max(minWidth, Math.min(maxWidth, width));
    const safeHeight = Math.max(safeWidth * 1.12, Math.min(containerHeight * 0.82, height));
    const safeLeft = Math.max(6, Math.min(containerWidth - safeWidth - 6, left));
    const safeTop = Math.max(8, Math.min(containerHeight - safeHeight - 54, top));

    faceFrame.style.left = `${safeLeft}px`;
    faceFrame.style.top = `${safeTop}px`;
    faceFrame.style.width = `${safeWidth}px`;
    faceFrame.style.height = `${safeHeight}px`;
  }

  function mapNativeFace(box) {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const targetWidth = videoContainer.clientWidth;
    const targetHeight = videoContainer.clientHeight;
    if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) return;

    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const offsetX = (targetWidth - renderedWidth) / 2;
    const offsetY = (targetHeight - renderedHeight) / 2;

    let left = Number(box.x || box.left || 0) * scale + offsetX;
    let top = Number(box.y || box.top || 0) * scale + offsetY;
    let width = Number(box.width || 0) * scale;
    let height = Number(box.height || 0) * scale;

    const expandedWidth = width * 1.2;
    const expandedHeight = height * 1.28;
    left -= (expandedWidth - width) / 2;
    top -= height * 0.17;
    width = expandedWidth;
    height = expandedHeight;

    if (app.state?.facingMode === 'user') {
      left = targetWidth - left - width;
    }

    setFrameRect(left, top, width, height);
  }

  async function detectFace() {
    if (document.hidden || !previewContainer.classList.contains('hidden') || !result.classList.contains('hidden')) {
      scheduleDetection(260);
      return;
    }

    if (!video.srcObject || video.readyState < 2 || !video.videoWidth) {
      setDetected(false, detectorMode);
      setGuidedFrame();
      scheduleDetection(240);
      return;
    }

    if (!detector) {
      setGuidedFrame();
      setDetected(isScanning, 'guided');
      scheduleDetection(180);
      return;
    }

    if (detectionBusy) {
      scheduleDetection(120);
      return;
    }

    detectionBusy = true;
    try {
      const faces = await detector.detect(video);
      const face = faces?.[0];
      if (face?.boundingBox) {
        mapNativeFace(face.boundingBox);
        lastDetectionAt = performance.now();
        setDetected(true, 'native');
      } else if (performance.now() - lastDetectionAt > 520) {
        setDetected(false, 'native');
        setGuidedFrame();
      }
    } catch (error) {
      console.info('Detekce obličeje přešla do vodicího režimu.', error);
      detector = null;
      detectorMode = 'guided';
      setGuidedFrame();
      setDetected(isScanning, 'guided');
    } finally {
      detectionBusy = false;
      scheduleDetection(isScanning ? 110 : 180);
    }
  }

  function scheduleDetection(delay = 180) {
    clearTimeout(detectionTimer);
    detectionTimer = window.setTimeout(detectFace, delay);
  }

  function setStatusByProgress(value) {
    const stage = scanStages.find(([limit]) => value <= limit) || scanStages[scanStages.length - 1];
    if (stage[1] !== currentStage) {
      currentStage = stage[1];
      setStatus(currentStage);
      overlay.dataset.stage = stage[2];
    }
  }

  function setProgress(value) {
    progress = Math.max(0, Math.min(100, value));
    bar.style.width = `${progress}%`;
    document.documentElement.style.setProperty('--scan-progress', `${progress}%`);
    status.dataset.progress = `${Math.round(progress)}%`;
    if (statusProgress) statusProgress.textContent = `${Math.round(progress)}%`;
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
    if (statusProgress) statusProgress.textContent = '0%';
    barWrap.classList.remove('show');
    scanLine.classList.remove('active');
    overlay.classList.remove('is-scanning', 'is-complete');
    overlay.classList.add('is-tracking');
    overlay.dataset.stage = 'idle';
    document.body.classList.remove('face-scan-active');
    app.setBusy(false);
    loading.classList.add('hidden');
    lockLabel.textContent = faceDetected ? 'FACE LOCK' : 'FACE TARGET';
    setStatus(faceDetected ? 'Obličej rozpoznán' : detector ? 'Hledám obličej' : 'Zarovnej obličej');
    scheduleDetection(80);
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
    overlay.dataset.stage = 'idle';
    bar.style.width = '0%';
    isScanning = false;
    document.body.classList.remove('face-scan-active');
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
    lockLabel.textContent = 'FACE CAPTURED';

    finishTimer = window.setTimeout(() => {
      finishTimer = null;
      captureAndAnalyze();
    }, 320);
  }

  function animateScan(now) {
    if (!isScanning) return;
    if (!startedAt) startedAt = now;

    const elapsed = now - startedAt;
    const linear = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - linear, 1.18);
    setProgress(eased * 100);

    if (!detector) setGuidedFrame(now);

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
    duration = 2850 + Math.random() * 350;
    app.hideResult?.();
    previewContainer.classList.add('hidden');
    app.clearErrors();
    app.setHint('Drž obličej v rámečku. Oči, nos, ústa a čelist se mapují pouze v tomto zařízení.');
    app.setBusy(true);

    loading.classList.add('hidden');
    document.body.classList.add('face-scan-active');
    overlay.classList.remove('is-tracking', 'is-complete');
    overlay.classList.add('is-scanning');
    lockLabel.textContent = 'FACE LOCK';
    if (!detector) setDetected(true, 'guided');
    scanLine.classList.add('active');
    barWrap.classList.add('show');
    setProgress(0);
    animationFrame = requestAnimationFrame(animateScan);
  }

  window.SmazkaFaceScan = {
    start,
    reset,
    get mode() {
      return detector ? 'native' : 'guided';
    }
  };

  const autoStart = () => {
    if (video.srcObject && video.videoWidth) {
      setGuidedFrame();
      setStatus(detector ? 'Hledám obličej' : 'Zarovnej obličej');
      app.setHint('Umísti obličej do rámečku a spusť sken.');
      scheduleDetection(60);
    }
  };

  if (video.readyState >= 2) autoStart();
  video.addEventListener('loadedmetadata', autoStart);
  window.addEventListener('resize', () => setGuidedFrame(), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isScanning) reset();
    if (!document.hidden) scheduleDetection(80);
  });
  window.addEventListener('pagehide', () => {
    stopAnimation();
    clearTimeout(detectionTimer);
    clearTimeout(finishTimer);
    document.body.classList.remove('face-scan-active');
  }, { once: true });

  setGuidedFrame();
  scheduleDetection(120);
})();