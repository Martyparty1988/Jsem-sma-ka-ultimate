/* Face Scan Mode – real on-device MediaPipe landmarks for eyes, nose, mouth and face contour. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.elements) return;

  const { video, retakeButton, previewContainer, loading, result } = app.elements;
  const videoContainer = app.elements.cameraStage || document.querySelector('.video-container');
  if (!videoContainer) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MODEL_ROOT = 'vendor/mediapipe-face-mesh/';
  const METRICS_MODULE_URL = './devastation-metrics.js?v=62';
  const DETECTION_MAX_AGE = 620;
  const STILL_DETECTION_TIMEOUT = 8000;
  const SCAN_DURATION = 3000;

  const FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
  ];
  const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
  const RIGHT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
  const LEFT_BROW = [336, 296, 334, 293, 300, 285, 295, 282, 283, 276];
  const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2];
  const NOSE_BASE = [98, 97, 2, 326, 327];
  const OUTER_LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
  const INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
  const RIGHT_IRIS = [468, 469, 470, 471, 472];
  const LEFT_IRIS = [473, 474, 475, 476, 477];

  const dotGroups = [
    { className: 'landmark-eye', indices: [33, 133, 159, 145, 263, 362, 386, 374, 468, 473] },
    { className: 'landmark-nose', indices: [168, 6, 4, 1, 2, 98, 327] },
    { className: 'landmark-mouth', indices: [61, 0, 291, 17, 78, 13, 308, 14] },
    { className: 'landmark-jaw', indices: [10, 127, 234, 132, 172, 152, 397, 361, 454, 356] }
  ];

  const overlay = document.createElement('div');
  overlay.id = 'scanOverlay';
  overlay.className = 'is-tracking model-loading';
  overlay.dataset.stage = 'idle';

  const tracker = document.createElement('div');
  tracker.className = 'face-tracker';
  tracker.setAttribute('aria-hidden', 'true');

  const faceFrame = document.createElement('div');
  faceFrame.className = 'face-lock-frame';
  faceFrame.dataset.mode = 'target';

  const mesh = document.createElementNS(SVG_NS, 'svg');
  mesh.setAttribute('class', 'face-landmark-mesh');
  mesh.setAttribute('preserveAspectRatio', 'none');
  mesh.setAttribute('aria-hidden', 'true');

  function createMeshPath(className) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', className);
    mesh.appendChild(path);
    return path;
  }

  const meshPaths = {
    contour: createMeshPath('face-contour'),
    brows: createMeshPath('mesh-line mesh-brow'),
    eyes: createMeshPath('mesh-line mesh-eye'),
    irises: createMeshPath('mesh-line mesh-iris'),
    nose: createMeshPath('mesh-line mesh-nose'),
    mouth: createMeshPath('mesh-line mesh-mouth')
  };

  const landmarkNodes = [];
  dotGroups.forEach((group) => {
    group.indices.forEach((index) => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('class', `landmark ${group.className}`);
      circle.setAttribute('r', '1.85');
      circle.hidden = true;
      circle.dataset.index = String(index);
      mesh.appendChild(circle);
      landmarkNodes.push({ index, circle });
    });
  });

  const lockLabel = document.createElement('span');
  lockLabel.className = 'face-lock-label';
  lockLabel.textContent = 'SUBJECT TARGET';

  const eyeLeftLabel = document.createElement('span');
  eyeLeftLabel.className = 'feature-label feature-eye-left';
  eyeLeftLabel.textContent = 'EYE // L';

  const eyeRightLabel = document.createElement('span');
  eyeRightLabel.className = 'feature-label feature-eye-right';
  eyeRightLabel.textContent = 'EYE // R';

  const mouthLabel = document.createElement('span');
  mouthLabel.className = 'feature-label feature-mouth';
  mouthLabel.textContent = 'MOUTH // TRACE';

  const scanLine = document.createElement('div');
  scanLine.id = 'scanLine';
  scanLine.setAttribute('aria-hidden', 'true');

  faceFrame.append(lockLabel, scanLine);
  tracker.append(faceFrame, mesh, eyeLeftLabel, eyeRightLabel, mouthLabel);

  const status = document.createElement('div');
  status.id = 'scanStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.innerHTML = `
    <span class="scan-state-dot" aria-hidden="true"></span>
    <span class="scan-state-copy">Probouzím VOID engine</span>
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
  let lastAnimationAt = 0;
  let scanElapsed = 0;
  let lostFaceAt = 0;
  let progress = 0;
  let isScanning = false;
  let currentStage = '';
  let faceDetected = false;
  let faceMesh = null;
  let modelState = 'loading';
  let detectorFailures = 0;
  let stableFaceFrames = 0;
  let landmarkCount = 0;
  let lastDetectionAt = 0;
  let lastRawLandmarks = null;
  let metricsModulePromise = null;
  let stillRequest = null;

  const scanStages = [
    [13, 'Zamykám subjekt', 'lock'],
    [31, 'Oči nalezeny • soudnost ne', 'eyes'],
    [48, 'Nos a ústa pod dohledem', 'features'],
    [68, 'Kontura trosek hotová', 'jaw'],
    [89, 'Vážím zbytky důstojnosti', 'analysis'],
    [100, 'Rozpad potvrzen', 'complete']
  ];

  function setStatus(message) {
    if (statusCopy) statusCopy.textContent = message;
  }

  function modelAvailable() {
    return modelState === 'ready' || modelState === 'warming';
  }

  function hasFreshLandmarks(now = performance.now()) {
    return Boolean(
      faceDetected
      && lastRawLandmarks?.length >= 468
      && now - lastDetectionAt <= DETECTION_MAX_AGE
    );
  }

  function loadMetricsModule() {
    metricsModulePromise ||= import(METRICS_MODULE_URL);
    return metricsModulePromise;
  }

  function cloneLandmarks(landmarks) {
    return landmarks.map((point) => ({
      x: Number(point?.x || 0),
      y: Number(point?.y || 0),
      z: Number(point?.z || 0)
    }));
  }

  function setDetected(detected) {
    const next = Boolean(detected);
    const changed = next !== faceDetected;
    faceDetected = next;
    overlay.classList.toggle('face-detected', faceDetected);
    overlay.classList.toggle('face-searching', !faceDetected);
    faceFrame.dataset.mode = faceDetected ? 'landmarks' : 'target';

    if (!isScanning) {
      setStatus(
        faceDetected
          ? `${landmarkCount} bodů subjektu zamčeno`
          : modelState === 'loading' || modelState === 'warming'
            ? 'Probouzím VOID engine'
            : modelState === 'failed'
              ? 'Přesná detekce odmítla svědčit'
              : 'Hledám oči, nos a zbytky tváře'
      );
      lockLabel.textContent = faceDetected ? `${landmarkCount}-POINT VOID LOCK` : 'SUBJECT TARGET';
    }

    if (!changed) return;
    if (faceDetected) {
      app.setHint('Subjekt zamčen. Rozsudek může začít.');
    } else if (modelState === 'ready') {
      app.setHint('Podívej se do portálu a nech v něm celý ksicht.');
    }
  }

  function setGuidedFrame(now = performance.now()) {
    const width = videoContainer.clientWidth;
    const height = videoContainer.clientHeight;
    if (!width || !height) return;

    const pulse = Math.sin(now / 1100) * Math.min(2, width * 0.004);
    const frameWidth = Math.min(width * 0.62, height * 0.5) + pulse;
    const frameHeight = Math.min(height * 0.67, frameWidth * 1.42);
    const left = (width - frameWidth) / 2;
    const top = Math.max(height * 0.075, height * 0.43 - frameHeight * 0.48);
    setFrameRect(left, top, frameWidth, frameHeight, true);
  }

  function setFrameRect(left, top, width, height, target = false) {
    const containerWidth = videoContainer.clientWidth;
    const containerHeight = videoContainer.clientHeight;
    if (!containerWidth || !containerHeight) return;

    const safeWidth = Math.max(
      containerWidth * (target ? 0.38 : 0.24),
      Math.min(containerWidth * 0.92, width)
    );
    const safeHeight = Math.max(
      containerHeight * (target ? 0.4 : 0.24),
      Math.min(containerHeight * 0.9, height)
    );
    const safeLeft = Math.max(6, Math.min(containerWidth - safeWidth - 6, left));
    const safeTop = Math.max(8, Math.min(containerHeight - safeHeight - 56, top));

    faceFrame.style.left = `${safeLeft}px`;
    faceFrame.style.top = `${safeTop}px`;
    faceFrame.style.width = `${safeWidth}px`;
    faceFrame.style.height = `${safeHeight}px`;
  }

  function mapLandmarks(landmarks) {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const targetWidth = videoContainer.clientWidth;
    const targetHeight = videoContainer.clientHeight;
    if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) return null;

    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const offsetX = (targetWidth - sourceWidth * scale) / 2;
    const offsetY = (targetHeight - sourceHeight * scale) / 2;
    const mirrored = app.state?.facingMode === 'user';

    const points = landmarks.map((landmark) => {
      const sourceX = Number(landmark?.x || 0) * sourceWidth;
      const sourceY = Number(landmark?.y || 0) * sourceHeight;
      const renderedX = sourceX * scale + offsetX;
      return {
        x: mirrored ? targetWidth - renderedX : renderedX,
        y: sourceY * scale + offsetY
      };
    });

    return { points, targetWidth, targetHeight };
  }

  function pathFromGroups(points, groups, close = false) {
    return groups.map((indices) => {
      const segment = indices.map((index) => points[index]).filter(Boolean);
      if (segment.length < 2) return '';
      const commands = segment.map((point, index) => (
        `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
      ));
      if (close) commands.push('Z');
      return commands.join(' ');
    }).join(' ');
  }

  function averagePoint(points, indices) {
    const valid = indices.map((index) => points[index]).filter(Boolean);
    if (!valid.length) return null;
    const total = valid.reduce((sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y
    }), { x: 0, y: 0 });
    return { x: total.x / valid.length, y: total.y / valid.length };
  }

  function placeFeatureLabel(label, point, offsetY = -13) {
    if (!point) return;
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y + offsetY}px`;
  }

  function renderLandmarks(landmarks) {
    const mapped = mapLandmarks(landmarks);
    if (!mapped) return false;

    const { points, targetWidth, targetHeight } = mapped;
    mesh.setAttribute('viewBox', `0 0 ${targetWidth} ${targetHeight}`);

    meshPaths.contour.setAttribute('d', pathFromGroups(points, [FACE_OVAL], true));
    meshPaths.brows.setAttribute('d', pathFromGroups(points, [RIGHT_BROW, LEFT_BROW]));
    meshPaths.eyes.setAttribute('d', pathFromGroups(points, [RIGHT_EYE, LEFT_EYE], true));
    meshPaths.irises.setAttribute(
      'd',
      landmarks.length >= 478 ? pathFromGroups(points, [RIGHT_IRIS.slice(1), LEFT_IRIS.slice(1)], true) : ''
    );
    meshPaths.nose.setAttribute('d', pathFromGroups(points, [NOSE_BRIDGE, NOSE_BASE]));
    meshPaths.mouth.setAttribute('d', pathFromGroups(points, [OUTER_LIPS, INNER_LIPS], true));

    landmarkNodes.forEach(({ index, circle }) => {
      const point = points[index];
      if (!point) {
        circle.hidden = true;
        return;
      }
      circle.hidden = false;
      circle.setAttribute('cx', point.x.toFixed(1));
      circle.setAttribute('cy', point.y.toFixed(1));
    });

    const outline = FACE_OVAL.map((index) => points[index]).filter(Boolean);
    if (outline.length) {
      const bounds = outline.reduce((value, point) => ({
        minX: Math.min(value.minX, point.x),
        minY: Math.min(value.minY, point.y),
        maxX: Math.max(value.maxX, point.x),
        maxY: Math.max(value.maxY, point.y)
      }), {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
      });
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      setFrameRect(
        bounds.minX - width * 0.06,
        bounds.minY - height * 0.06,
        width * 1.12,
        height * 1.12
      );
    }

    placeFeatureLabel(eyeLeftLabel, averagePoint(points, LEFT_EYE));
    placeFeatureLabel(eyeRightLabel, averagePoint(points, RIGHT_EYE));
    placeFeatureLabel(mouthLabel, averagePoint(points, OUTER_LIPS), 18);
    overlay.classList.add('has-landmarks');
    return true;
  }

  function clearLandmarks() {
    Object.values(meshPaths).forEach((path) => path.setAttribute('d', ''));
    landmarkNodes.forEach(({ circle }) => {
      circle.hidden = true;
    });
    overlay.classList.remove('has-landmarks');
    landmarkCount = 0;
    lastRawLandmarks = null;
    setGuidedFrame();
  }

  function handleFaceMeshResults(results) {
    modelState = 'ready';
    detectorFailures = 0;
    overlay.classList.remove('model-loading', 'model-failed');

    if (stillRequest) {
      const request = stillRequest;
      stillRequest = null;
      clearTimeout(request.timer);
      request.resolve(results);
      return;
    }

    const landmarks = results?.multiFaceLandmarks?.[0];
    if (landmarks?.length >= 468 && renderLandmarks(landmarks)) {
      landmarkCount = landmarks.length;
      lastRawLandmarks = landmarks;
      lastDetectionAt = performance.now();
      stableFaceFrames = Math.min(3, stableFaceFrames + 1);
      setDetected(stableFaceFrames >= 2);
      return;
    }

    stableFaceFrames = 0;
    if (performance.now() - lastDetectionAt > DETECTION_MAX_AGE) {
      clearLandmarks();
      setDetected(false);
    }
  }

  async function initializeFaceMesh() {
    if (typeof window.FaceMesh !== 'function') {
      modelState = 'failed';
      overlay.classList.remove('model-loading');
      overlay.classList.add('model-failed');
      setDetected(false);
      app.setHint('Přesný model obličeje se nenačetl. Obnov stránku a zkus to znovu.');
      return;
    }

    try {
      faceMesh = new window.FaceMesh({
        locateFile: (file) => new URL(`${MODEL_ROOT}${file}`, document.baseURI).toString()
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        selfieMode: false,
        minDetectionConfidence: 0.62,
        minTrackingConfidence: 0.62
      });
      faceMesh.onResults(handleFaceMeshResults);
      modelState = 'warming';
      app.setHint('VOID engine mapuje skutečné oči, nos, ústa a konturu…');
      scheduleDetection(40);
    } catch (error) {
      console.error('MediaPipe Face Mesh nejde inicializovat:', error);
      modelState = 'failed';
      overlay.classList.remove('model-loading');
      overlay.classList.add('model-failed');
      faceMesh = null;
      setDetected(false);
      app.setHint('Přesná detekce se nespustila. Obnov stránku a zkus to znovu.');
    }
  }

  async function detectFace() {
    if (
      document.hidden
      || !previewContainer.classList.contains('hidden')
      || !result.classList.contains('hidden')
    ) {
      scheduleDetection(280);
      return;
    }

    if (!video.srcObject || video.readyState < 2 || !video.videoWidth) {
      stableFaceFrames = 0;
      if (performance.now() - lastDetectionAt > DETECTION_MAX_AGE) {
        clearLandmarks();
        setDetected(false);
      }
      scheduleDetection(240);
      return;
    }

    if (!faceMesh || !modelAvailable()) {
      setGuidedFrame();
      scheduleDetection(modelState === 'failed' ? 1000 : 220);
      return;
    }

    if (detectionBusy) {
      scheduleDetection(90);
      return;
    }

    detectionBusy = true;
    try {
      await faceMesh.send({ image: video });
    } catch (error) {
      detectorFailures += 1;
      console.warn('MediaPipe frame se nepovedl zpracovat:', error);
      if (detectorFailures >= 3) {
        modelState = 'failed';
        overlay.classList.remove('model-loading');
        overlay.classList.add('model-failed');
        clearLandmarks();
        setDetected(false);
        app.setHint('Přesná detekce se zastavila. Obnov stránku a zkus sken znovu.');
      }
    } finally {
      detectionBusy = false;
      scheduleDetection(isScanning ? 90 : 135);
    }
  }

  function waitForDetectorIdle(timeout = 1200) {
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!detectionBusy && !stillRequest) {
          resolve();
          return;
        }
        if (performance.now() - startedAt >= timeout) {
          reject(new Error('Detektor ještě zpracovává předchozí snímek.'));
          return;
        }
        window.setTimeout(check, 24);
      };
      check();
    });
  }

  function loadStillImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Nahranou fotku se nepovedlo dekódovat pro Face Mesh.'));
      image.src = source;
    });
  }

  function sendStillImage(image) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (stillRequest?.timer !== timer) return;
        stillRequest = null;
        reject(new Error('Face Mesh nestihl nahranou fotku zpracovat.'));
      }, STILL_DETECTION_TIMEOUT);

      stillRequest = { resolve, reject, timer };
      Promise.resolve(faceMesh.send({ image })).catch((error) => {
        if (stillRequest?.timer !== timer) return;
        stillRequest = null;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function analysisError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  async function analyzeStillImage(imageData) {
    if (!imageData) throw analysisError('Nahraná fotka chybí.', 'MISSING_IMAGE');
    if (!faceMesh || modelState === 'failed') {
      throw analysisError(
        'Přesný model obličeje není dostupný. Obnov stránku a zkus fotku znovu.',
        'MODEL_UNAVAILABLE'
      );
    }

    await waitForDetectorIdle();
    const image = await loadStillImage(imageData);
    detectionBusy = true;
    setStatus('Měřím 468 bodů nahrané fotky');
    app.setHint('VOID hledá na fotce přesně jeden obličej…');

    try {
      faceMesh.setOptions({ maxNumFaces: 2 });
      const results = await sendStillImage(image);
      const faces = Array.isArray(results?.multiFaceLandmarks)
        ? results.multiFaceLandmarks.filter((landmarks) => landmarks?.length >= 468)
        : [];

      if (faces.length === 0) {
        throw analysisError(
          'Na fotce jsem nenašel použitelný obličej. Nahraj ostřejší fotku zepředu.',
          'NO_FACE'
        );
      }
      if (faces.length > 1) {
        throw analysisError(
          'Na fotce je víc obličejů. Nahraj jednu trosku po druhé.',
          'MULTIPLE_FACES'
        );
      }

      const { analyzeFaceImage } = await loadMetricsModule();
      return analyzeFaceImage({
        landmarks: cloneLandmarks(faces[0]),
        imageSource: imageData,
        sourceKind: 'upload',
        mirrorX: false
      });
    } finally {
      image.removeAttribute('src');
      faceMesh.setOptions({ maxNumFaces: 1 });
      detectionBusy = false;
      scheduleDetection(180);
    }
  }

  function scheduleDetection(delay = 135) {
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
    lastAnimationAt = 0;
    scanElapsed = 0;
    lostFaceAt = 0;
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
    lockLabel.textContent = hasFreshLandmarks() ? `${landmarkCount}-POINT VOID LOCK` : 'SUBJECT TARGET';
    setStatus(
      hasFreshLandmarks()
        ? `${landmarkCount} bodů subjektu zamčeno`
        : modelState === 'failed'
          ? 'Přesná detekce odmítla svědčit'
          : 'Hledám oči, nos a zbytky tváře'
    );
    scheduleDetection(60);
  }

  function cancelScan(message) {
    reset();
    app.showError(message);
    app.setHint('Vrať celý ksicht do portálu a spusť rozsudek znovu.');
  }

  async function captureAndAnalyze() {
    if (!hasFreshLandmarks()) {
      cancelScan('Obličej se před zachycením ztratil. Sken bez skutečných bodů nebudu předstírat.');
      return;
    }

    const landmarks = cloneLandmarks(lastRawLandmarks);
    const mirrorX = app.state?.facingMode === 'user';
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
    app.setHint('Přepočítávám oči, náklon a zbytky lidskosti…');

    try {
      const { analyzeFaceImage } = await loadMetricsModule();
      const faceAnalysis = await analyzeFaceImage({
        landmarks,
        imageSource: dataUrl,
        sourceKind: 'camera',
        mirrorX
      });
      app.runAnalysis({
        skipImageCheck: true,
        metrics: faceAnalysis.metrics,
        faceAnalysis
      });
    } catch (error) {
      console.error('Biometrické metriky se nepovedlo spočítat:', error);
      app.showError('Body mám, ale biometrický výpis se rozsypal. Zkus nový sken.');
      app.setHint('Meme engine odmítl falšovat chybějící hodnoty.');
    }
  }

  function finishScan() {
    stopAnimation();
    setProgress(100);
    scanLine.classList.remove('active');
    overlay.classList.remove('is-scanning');
    overlay.classList.add('is-complete');
    lockLabel.textContent = 'SUBJECT CAPTURED';

    finishTimer = window.setTimeout(() => {
      finishTimer = null;
      void captureAndAnalyze();
    }, 320);
  }

  function animateScan(now) {
    if (!isScanning) return;
    if (!lastAnimationAt) lastAnimationAt = now;

    const delta = Math.min(80, Math.max(0, now - lastAnimationAt));
    lastAnimationAt = now;

    if (hasFreshLandmarks(now)) {
      if (lostFaceAt) {
        lostFaceAt = 0;
        currentStage = '';
      }
      scanElapsed += delta;
      const linear = Math.min(1, scanElapsed / SCAN_DURATION);
      const eased = 1 - Math.pow(1 - linear, 1.18);
      setProgress(eased * 100);

      if (linear >= 1) {
        finishScan();
        return;
      }
    } else {
      if (!lostFaceAt) lostFaceAt = now;
      currentStage = '';
      setStatus('Subjekt uniká — sken čeká');
      if (now - lostFaceAt > 1500) {
        cancelScan('Obličej zmizel ze záběru. Sken jsem zastavil, místo abych si body vymyslel.');
        return;
      }
    }

    animationFrame = requestAnimationFrame(animateScan);
  }

  function start() {
    if (isScanning || app.state.isAnalyzing) return;

    if (!video.srcObject || !video.videoWidth) {
      app.showError('Kamera ještě není připravená. Povol ji v prohlížeči, nebo použij nahrání fotky.');
      return;
    }

    if (modelState === 'loading' || modelState === 'warming') {
      app.setHint('Ještě chvíli — VOID engine načítá skutečné body obličeje.');
      setStatus('Probouzím VOID engine');
      scheduleDetection(0);
      return;
    }

    if (modelState === 'failed') {
      app.showError('Přesný model obličeje se nenačetl. Obnov stránku a zkus to znovu.');
      return;
    }

    if (!hasFreshLandmarks()) {
      app.showError('Nejdřív potřebuju skutečně zamknout oči, nos, ústa a konturu. Podívej se do kamery.');
      app.setHint('Nech celý ksicht v portálu, dokud se obrys nepřichytí ke skutečným rysům.');
      scheduleDetection(0);
      return;
    }

    reset();
    isScanning = true;
    scanElapsed = 0;
    lastAnimationAt = 0;
    app.hideResult?.();
    previewContainer.classList.add('hidden');
    app.clearErrors();
    app.setHint('Ani hnout. VOID sleduje skutečné oči, nos, ústa a čelist.');
    app.setBusy(true);

    loading.classList.add('hidden');
    document.body.classList.add('face-scan-active');
    overlay.classList.remove('is-tracking', 'is-complete');
    overlay.classList.add('is-scanning');
    lockLabel.textContent = `${landmarkCount}-POINT VOID LOCK`;
    scanLine.classList.add('active');
    barWrap.classList.add('show');
    setProgress(0);
    animationFrame = requestAnimationFrame(animateScan);
  }

  window.SmazkaFaceScan = {
    start,
    reset,
    analyzeStillImage,
    get mode() {
      return modelState === 'ready' ? 'mediapipe-landmarks' : modelState;
    },
    get hasFace() {
      return hasFreshLandmarks();
    }
  };

  const autoStart = () => {
    if (video.srcObject && video.videoWidth) {
      if (lastRawLandmarks?.length >= 468) {
        renderLandmarks(lastRawLandmarks);
      } else {
        setGuidedFrame();
      }
      app.setHint(
        modelState === 'ready'
          ? 'Podívej se do portálu. Obrys se přichytí ke skutečným rysům.'
          : 'VOID engine mapuje skutečné oči, nos, ústa a konturu…'
      );
      scheduleDetection(40);
    }
  };

  if (video.readyState >= 2) autoStart();
  video.addEventListener('loadedmetadata', autoStart);
  window.addEventListener('resize', () => {
    if (lastRawLandmarks?.length >= 468 && hasFreshLandmarks()) {
      renderLandmarks(lastRawLandmarks);
    } else {
      setGuidedFrame();
    }
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isScanning) reset();
    if (!document.hidden) scheduleDetection(80);
  });
  window.addEventListener('pagehide', () => {
    stopAnimation();
    clearTimeout(detectionTimer);
    clearTimeout(finishTimer);
    if (stillRequest) {
      clearTimeout(stillRequest.timer);
      stillRequest.reject(new Error('Stránka byla zavřena během analýzy.'));
      stillRequest = null;
    }
    document.body.classList.remove('face-scan-active');
    const closeResult = faceMesh?.close?.();
    closeResult?.catch?.(() => undefined);
  }, { once: true });

  setGuidedFrame();
  initializeFaceMesh();
})();
