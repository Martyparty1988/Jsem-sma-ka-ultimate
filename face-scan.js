/* Face Scan Mode – simulated local scan, no server upload */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  if (!app?.elements) return;

  const { video, analyzeButton, retakeButton, result, previewContainer, loading } = app.elements;
  const videoContainer = document.querySelector('.video-container');
  if (!videoContainer) return;

  const overlay = document.createElement('div');
  overlay.id = 'scanOverlay';
  overlay.setAttribute('aria-hidden', 'true');

  const scanLine = document.createElement('div');
  scanLine.id = 'scanLine';

  const faceBox = document.createElement('div');
  faceBox.id = 'faceBox';

  const status = document.createElement('div');
  status.id = 'scanStatus';
  status.textContent = 'Inicializace kamery…';

  const barWrap = document.createElement('div');
  barWrap.id = 'scanBar';
  const bar = document.createElement('div');
  bar.className = 'scan-bar-fill';
  barWrap.appendChild(bar);

  overlay.append(scanLine, faceBox, status, barWrap);
  videoContainer.appendChild(overlay);

  let scanTimer = null;
  let detectTimer = null;
  let progress = 0;
  let isScanning = false;

  const scanStages = [
    [12, 'Hledám obličej…'],
    [28, 'Zamykám pohled podezření…'],
    [46, 'Měřím hladinu včerejška…'],
    [64, 'Kontroluju chaos v očích…'],
    [82, 'Počítám damage level…'],
    [100, 'Dokončeno!']
  ];

  function setStatusByProgress(value) {
    const stage = scanStages.find(([limit]) => value <= limit) || scanStages.at(-1);
    status.textContent = stage[1];
  }

  function setFaceBox() {
    const bounds = videoContainer.getBoundingClientRect();
    const width = Math.min(bounds.width * 0.54, 360);
    const height = Math.min(bounds.height * 0.56, 380);
    const left = (bounds.width - width) / 2;
    const top = Math.max(22, (bounds.height - height) / 2);

    Object.assign(faceBox.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`
    });
    faceBox.classList.add('show');
  }

  function reset() {
    clearTimeout(detectTimer);
    clearInterval(scanTimer);
    detectTimer = null;
    scanTimer = null;
    progress = 0;
    isScanning = false;
    bar.style.width = '0%';
    barWrap.classList.remove('show');
    faceBox.classList.remove('show');
    scanLine.classList.remove('active');
    analyzeButton.disabled = false;
    retakeButton.disabled = false;
    loading.classList.add('hidden');
    status.textContent = 'Připraveno ke skenu';
  }

  function finishScan() {
    clearInterval(scanTimer);
    scanTimer = null;
    progress = 100;
    bar.style.width = '100%';
    setStatusByProgress(progress);
    scanLine.classList.remove('active');

    window.setTimeout(() => {
      app.captureCurrentFrame(0.92);
      faceBox.classList.remove('show');
      barWrap.classList.remove('show');
      bar.style.width = '0%';
      isScanning = false;
      retakeButton.classList.remove('hidden');
      previewContainer.classList.add('hidden');
      app.runAnalysis({ skipImageCheck: true });
    }, 280);
  }

  function start() {
    if (isScanning || app.state.isAnalyzing) return;

    if (!video.srcObject || !video.videoWidth) {
      app.showError('Kamera ještě není připravená. Povol ji v prohlížeči, nebo použij nahrání fotky.');
      return;
    }

    reset();
    isScanning = true;
    result.classList.add('hidden');
    previewContainer.classList.add('hidden');
    app.clearErrors();
    app.setHint('Drž obličej ve středu. Tenhle nesmyslně vážný sken dělá všechno lokálně v prohlížeči.');
    analyzeButton.disabled = true;
    retakeButton.disabled = true;
    scanLine.classList.add('active');
    status.textContent = 'Hledám obličej…';

    detectTimer = window.setTimeout(() => {
      setFaceBox();
      barWrap.classList.add('show');
      progress = 4;

      scanTimer = window.setInterval(() => {
        progress = Math.min(100, progress + 4 + Math.random() * 8);
        bar.style.width = `${progress}%`;
        setStatusByProgress(progress);

        if (progress >= 100) finishScan();
      }, 115);
    }, 450 + Math.random() * 450);
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
  window.addEventListener('resize', () => {
    if (faceBox.classList.contains('show')) setFaceBox();
  });
})();
