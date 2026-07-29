/* Smažka v83 — balanced Junkie Vision presentation + scan deadlock recovery. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const faceScan = window.SmazkaFaceScan;
  const feed = window.SmazkaLandmarkFeed;
  const stage = app?.elements?.cameraStage;
  const result = app?.elements?.result;
  if (!app?.state || !faceScan || !feed || !stage || !result) return;

  const METRICS_MODULE_URL = './devastation-metrics.js?v=64';
  const WATCHDOG_MS = 4700;
  const patchedCanvases = new WeakSet();
  let watchdogTimer = 0;
  let scanSequence = 0;
  let fallbackRunning = false;
  let previousScanActive = false;

  function patchHudCanvas(canvas) {
    if (!canvas || patchedCanvases.has(canvas)) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    patchedCanvases.add(canvas);
    canvas.dataset.balancedV83 = 'true';

    const nativeClearRect = context.clearRect.bind(context);
    const nativeBeginPath = context.beginPath.bind(context);
    const nativeLineTo = context.lineTo.bind(context);
    const nativeArc = context.arc.bind(context);
    const nativeFillText = context.fillText.bind(context);
    let pathIndex = 0;
    let pathLines = 0;
    let foreheadArcCount = 0;

    context.clearRect = (...args) => {
      pathIndex = 0;
      pathLines = 0;
      foreheadArcCount = 0;
      return nativeClearRect(...args);
    };

    context.beginPath = (...args) => {
      pathIndex += 1;
      pathLines = 0;
      return nativeBeginPath(...args);
    };

    context.lineTo = (...args) => {
      pathLines += 1;
      // The first path of each HUD frame is the dense tessellation. Keep a
      // recognisable network, but stop before it buries the face.
      if (pathIndex === 1 && pathLines > 120) return undefined;
      return nativeLineTo(...args);
    };

    context.arc = (...args) => {
      // The forehead core originally used three concentric targets. One ring
      // keeps the visual cue without turning the forehead into a radar dish.
      foreheadArcCount += 1;
      if (foreheadArcCount > 1) return undefined;
      return nativeArc(...args);
    };

    context.fillText = (text, ...args) => {
      // Eye bars remain visible; duplicate DROOP labels were the noisiest part.
      if (/^DROOP\s/i.test(String(text))) return undefined;
      return nativeFillText(text, ...args);
    };
  }

  function balanceHud(wrapper) {
    if (!wrapper || wrapper.dataset.balancedV83 === 'true') return;
    wrapper.dataset.balancedV83 = 'true';
    wrapper.classList.add('is-balanced-v83');

    const chrome = wrapper.querySelector('.junkie-vision-chrome');
    if (chrome && !chrome.querySelector('.jvh-balanced-progress')) {
      const progress = document.createElement('div');
      progress.className = 'jvh-balanced-progress';
      progress.setAttribute('aria-hidden', 'true');
      progress.innerHTML = '<span></span>';
      chrome.appendChild(progress);
    }

    wrapper.querySelectorAll('canvas').forEach(patchHudCanvas);
  }

  function discoverHuds(root = stage) {
    root.querySelectorAll?.('.junkie-vision-hud').forEach(balanceHud);
    root.querySelectorAll?.('.junkie-vision-hud canvas').forEach(patchHudCanvas);
  }

  function scanIsActive() {
    return document.body.classList.contains('face-scan-active');
  }

  function resultIsOpen() {
    return document.body.classList.contains('result-open')
      || !result.classList.contains('hidden');
  }

  function cancelWatchdog() {
    window.clearTimeout(watchdogTimer);
    watchdogTimer = 0;
  }

  function cloneLandmarks(landmarks) {
    return landmarks.map((point) => ({
      x: Number(point?.x || 0),
      y: Number(point?.y || 0),
      z: Number(point?.z || 0)
    }));
  }

  async function recoverStalledScan(sequence) {
    if (
      fallbackRunning
      || sequence !== scanSequence
      || !scanIsActive()
      || resultIsOpen()
    ) return;

    fallbackRunning = true;
    const snapshot = feed.getSnapshot();
    const landmarks = snapshot?.landmarks;

    try {
      faceScan.reset?.();

      if (!Array.isArray(landmarks) || landmarks.length < 468) {
        app.showError('Sken se zastavil a nemám ani poslední skutečné body obličeje. Zkus ho spustit znovu.');
        app.setHint('VOID watchdog sken bezpečně ukončil místo nekonečného čekání.');
        return;
      }

      const imageData = app.captureCurrentFrame(0.92);
      if (!imageData) throw new Error('Kamera neposlala použitelný snímek.');

      app.showCapturedFrame();
      app.setBusy(false);
      app.setHint('iPhone nestíhal živý tracking — dokončuju sken z posledních skutečných 468 bodů.');

      const { analyzeFaceImage } = await import(METRICS_MODULE_URL);
      const faceAnalysis = await analyzeFaceImage({
        landmarks: cloneLandmarks(landmarks),
        imageSource: imageData,
        sourceKind: 'camera',
        mirrorX: app.state.facingMode === 'user'
      });

      if (sequence !== scanSequence || resultIsOpen()) return;
      app.runAnalysis({
        skipImageCheck: true,
        metrics: faceAnalysis.metrics,
        faceAnalysis
      });

      window.dispatchEvent(new CustomEvent('smazka:scan-watchdog-recovered', {
        detail: {
          version: 83,
          landmarkCount: landmarks.length,
          elapsedLimit: WATCHDOG_MS
        }
      }));
    } catch (error) {
      console.error('VOID scan watchdog nedokončil nouzový průchod:', error);
      faceScan.reset?.();
      app.showError('Sken se zasekl a nouzové dokončení selhalo. Zkus nový sken.');
      app.setHint('Watchdog aplikaci odemkl; kamera je připravená na další pokus.');
    } finally {
      fallbackRunning = false;
    }
  }

  function armWatchdog() {
    cancelWatchdog();
    const sequence = ++scanSequence;
    watchdogTimer = window.setTimeout(() => {
      watchdogTimer = 0;
      void recoverStalledScan(sequence);
    }, WATCHDOG_MS);
  }

  function syncLifecycle() {
    const active = scanIsActive();
    if (active && !previousScanActive) armWatchdog();
    if (!active && previousScanActive) {
      scanSequence += 1;
      cancelWatchdog();
    }
    previousScanActive = active;
  }

  discoverHuds();

  const stageObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('.junkie-vision-hud')) balanceHud(node);
        discoverHuds(node);
      });
    });
  });
  stageObserver.observe(stage, { childList: true, subtree: true });

  const lifecycleObserver = new MutationObserver(syncLifecycle);
  lifecycleObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });
  lifecycleObserver.observe(result, {
    attributes: true,
    attributeFilter: ['class', 'open']
  });

  window.addEventListener('pagehide', () => {
    scanSequence += 1;
    cancelWatchdog();
    stageObserver.disconnect();
    lifecycleObserver.disconnect();
  }, { once: true });

  syncLifecycle();

  window.SmazkaJunkieBalance = Object.freeze({
    version: 83,
    watchdogMs: WATCHDOG_MS,
    patchHudCanvas,
    recoverNow() {
      const sequence = ++scanSequence;
      return recoverStalledScan(sequence);
    }
  });
})();
