/* Production runtime bundle: scanner-runtime.js | source order preserved. */

/* === legacy-share-bypass-v79.js === */
/* Smažka v79 — neutralize the retired eager share renderer without touching capture canvas work. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const canvas = app?.elements?.canvas;
  const result = app?.elements?.result;
  if (!canvas || !result || canvas.dataset.legacyShareBypass === 'v79') return;

  const canvasPrototype = window.HTMLCanvasElement?.prototype;
  const widthDescriptor = Object.getOwnPropertyDescriptor(canvasPrototype, 'width');
  const heightDescriptor = Object.getOwnPropertyDescriptor(canvasPrototype, 'height');
  const nativeGetContext = canvas.getContext.bind(canvas);
  let bypassActive = false;
  let contextProxy = null;

  function resultIsOpen() {
    return document.body.classList.contains('result-open')
      && !result.classList.contains('hidden');
  }

  function fakeGradient() {
    return { addColorStop() {} };
  }

  function zeroMetrics() {
    return {
      width: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 0
    };
  }

  function shouldSkip(method) {
    return new Set([
      'arc',
      'beginPath',
      'clearRect',
      'closePath',
      'drawImage',
      'fill',
      'fillRect',
      'fillText',
      'lineTo',
      'moveTo',
      'restore',
      'save',
      'stroke',
      'strokeRect',
      'strokeText'
    ]).has(method);
  }

  if (widthDescriptor?.get && widthDescriptor?.set && heightDescriptor?.get && heightDescriptor?.set) {
    Object.defineProperty(canvas, 'width', {
      configurable: true,
      enumerable: true,
      get() {
        return widthDescriptor.get.call(canvas);
      },
      set(value) {
        const numericValue = Number(value);
        if (resultIsOpen() && numericValue === 1080) {
          bypassActive = true;
          widthDescriptor.set.call(canvas, 1);
          canvas.dataset.eagerShareSuppressed = 'v79';
          return;
        }
        bypassActive = false;
        widthDescriptor.set.call(canvas, value);
      }
    });

    Object.defineProperty(canvas, 'height', {
      configurable: true,
      enumerable: true,
      get() {
        return heightDescriptor.get.call(canvas);
      },
      set(value) {
        const numericValue = Number(value);
        if (bypassActive && resultIsOpen() && numericValue === 1350) {
          heightDescriptor.set.call(canvas, 1);
          return;
        }
        if (!resultIsOpen()) bypassActive = false;
        heightDescriptor.set.call(canvas, value);
      }
    });
  }

  canvas.getContext = function getContext(type, ...args) {
    const context = nativeGetContext(type, ...args);
    if (type !== '2d' || !context || typeof Proxy !== 'function') return context;
    if (contextProxy) return contextProxy;

    contextProxy = new Proxy(context, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== 'function') return value;

        return (...methodArgs) => {
          if (bypassActive) {
            if (property === 'createLinearGradient' || property === 'createRadialGradient') {
              return fakeGradient();
            }
            if (property === 'measureText') return zeroMetrics();
            if (property === 'getImageData') {
              return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
            }
            if (shouldSkip(property)) return undefined;
          }
          return Reflect.apply(value, target, methodArgs);
        };
      },
      set(target, property, value) {
        if (!bypassActive) Reflect.set(target, property, value, target);
        return true;
      }
    });

    return contextProxy;
  };

  const resultObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(() => {
    if (!resultIsOpen()) bypassActive = false;
  });
  resultObserver.observe(result, {
    attributes: true,
    attributeFilter: ['class', 'open']
  });

  window.addEventListener('pagehide', () => resultObserver.disconnect(), { once: true });

  canvas.dataset.legacyShareBypass = 'v79';
  window.SmazkaLegacyShareBypass = Object.freeze({
    isActive: () => bypassActive
  });
})();

/* === face-aware-crop.js === */
/* Smažka v72 — shared face-aware crop geometry for renderer, UI and export. */
(() => {
  'use strict';

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function sourceDimensions(image) {
    return {
      width: Math.max(1, finite(image?.naturalWidth || image?.videoWidth || image?.width, 1)),
      height: Math.max(1, finite(image?.naturalHeight || image?.videoHeight || image?.height, 1))
    };
  }

  function validPoint(point) {
    return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
  }

  function normalizedBounds(faceAnalysis) {
    const bounds = faceAnalysis?.faceBounds;
    if (!bounds) return null;

    const x = clamp(finite(bounds.x), 0, 1);
    const y = clamp(finite(bounds.y), 0, 1);
    const width = clamp(finite(bounds.width, 0.24), 0.02, 1 - x);
    const height = clamp(finite(bounds.height, 0.34), 0.02, 1 - y);
    return {
      x,
      y,
      width,
      height,
      center: {
        x: clamp(finite(bounds.center?.x, x + width / 2), 0, 1),
        y: clamp(finite(bounds.center?.y, y + height / 2), 0, 1)
      }
    };
  }

  function eyeCenter(faceAnalysis, bounds) {
    const left = faceAnalysis?.anchors?.leftEye;
    const right = faceAnalysis?.anchors?.rightEye;
    if (validPoint(left) && validPoint(right)) {
      return {
        x: clamp((finite(left.x) + finite(right.x)) / 2, 0, 1),
        y: clamp((finite(left.y) + finite(right.y)) / 2, 0, 1)
      };
    }
    return {
      x: bounds?.center?.x ?? 0.5,
      y: bounds ? clamp(bounds.y + bounds.height * 0.38, 0, 1) : 0.4
    };
  }

  function constrainOffset(desired, cropSize, sourceSize, safeMin, safeMax) {
    const maximum = Math.max(0, sourceSize - cropSize);
    const preferred = clamp(desired, 0, maximum);
    const lower = clamp(safeMax - cropSize, 0, maximum);
    const upper = clamp(safeMin, 0, maximum);
    return lower <= upper ? clamp(preferred, lower, upper) : preferred;
  }

  function calculateCrop({
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    faceAnalysis = null
  } = {}) {
    const width = Math.max(1, finite(sourceWidth, 1));
    const height = Math.max(1, finite(sourceHeight, 1));
    const outputWidth = Math.max(1, finite(targetWidth, 1));
    const outputHeight = Math.max(1, finite(targetHeight, 1));
    const sourceRatio = width / height;
    const targetRatio = outputWidth / outputHeight;

    let cropWidth = width;
    let cropHeight = height;
    if (sourceRatio > targetRatio) cropWidth = height * targetRatio;
    else cropHeight = width / targetRatio;

    const bounds = normalizedBounds(faceAnalysis);
    const eyes = eyeCenter(faceAnalysis, bounds);
    const faceCenterX = bounds?.center?.x ?? eyes.x;
    const eyeTargetY = targetRatio >= 1.05 ? 0.43 : targetRatio >= 0.82 ? 0.39 : 0.36;

    let x = faceCenterX * width - cropWidth * 0.5;
    let y = eyes.y * height - cropHeight * eyeTargetY;

    if (bounds) {
      const faceWidth = bounds.width * width;
      const faceHeight = bounds.height * height;
      const safeMinX = (bounds.x * width) - faceWidth * 0.32;
      const safeMaxX = ((bounds.x + bounds.width) * width) + faceWidth * 0.32;
      const safeMinY = (bounds.y * height) - faceHeight * 0.42;
      const safeMaxY = ((bounds.y + bounds.height) * height) + faceHeight * 0.52;
      x = constrainOffset(x, cropWidth, width, safeMinX, safeMaxX);
      y = constrainOffset(y, cropHeight, height, safeMinY, safeMaxY);
    } else {
      x = clamp(x, 0, Math.max(0, width - cropWidth));
      y = clamp(y, 0, Math.max(0, height - cropHeight));
    }

    const overflowX = Math.max(0, width - cropWidth);
    const overflowY = Math.max(0, height - cropHeight);
    return Object.freeze({
      sx: clamp(x, 0, overflowX),
      sy: clamp(y, 0, overflowY),
      sw: cropWidth,
      sh: cropHeight,
      sourceWidth: width,
      sourceHeight: height,
      targetWidth: outputWidth,
      targetHeight: outputHeight,
      objectPositionX: overflowX > 0 ? clamp(x / overflowX * 100, 0, 100) : 50,
      objectPositionY: overflowY > 0 ? clamp(y / overflowY * 100, 0, 100) : 50,
      hasFace: Boolean(bounds)
    });
  }

  function transformPoint(point, crop) {
    if (!validPoint(point)) return point || null;
    return {
      ...point,
      x: clamp((finite(point.x) * crop.sourceWidth - crop.sx) / crop.sw, 0, 1),
      y: clamp((finite(point.y) * crop.sourceHeight - crop.sy) / crop.sh, 0, 1)
    };
  }

  function transformBounds(bounds, crop) {
    if (!bounds) return null;
    const start = transformPoint({ x: bounds.x, y: bounds.y }, crop);
    const end = transformPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, crop);
    const x = clamp(Math.min(start.x, end.x), 0, 1);
    const y = clamp(Math.min(start.y, end.y), 0, 1);
    const width = clamp(Math.abs(end.x - start.x), 0.01, 1 - x);
    const height = clamp(Math.abs(end.y - start.y), 0.01, 1 - y);
    return {
      x,
      y,
      width,
      height,
      center: { x: x + width / 2, y: y + height / 2 }
    };
  }

  function transformFaceAnalysis(faceAnalysis, crop) {
    if (!faceAnalysis || !crop) return faceAnalysis || null;
    const normalizedLandmarks = Array.isArray(faceAnalysis.normalizedLandmarks)
      ? faceAnalysis.normalizedLandmarks.map((point) => transformPoint(point, crop))
      : faceAnalysis.normalizedLandmarks;
    const anchors = faceAnalysis.anchors
      ? Object.fromEntries(Object.entries(faceAnalysis.anchors).map(([key, point]) => [key, transformPoint(point, crop)]))
      : faceAnalysis.anchors;

    return {
      ...faceAnalysis,
      normalizedLandmarks,
      anchors,
      faceBounds: transformBounds(faceAnalysis.faceBounds, crop),
      crop: {
        version: 72,
        source: {
          width: crop.sourceWidth,
          height: crop.sourceHeight,
          x: crop.sx,
          y: crop.sy,
          width: crop.sw,
          height: crop.sh
        },
        output: { width: crop.targetWidth, height: crop.targetHeight }
      }
    };
  }

  function drawImageCover(context, image, x, y, width, height, faceAnalysis = null) {
    const source = sourceDimensions(image);
    const crop = calculateCrop({
      sourceWidth: source.width,
      sourceHeight: source.height,
      targetWidth: width,
      targetHeight: height,
      faceAnalysis
    });
    context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, x, y, width, height);
    return crop;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Zdroj face-aware výřezu se nepovedlo dekódovat.'));
      image.src = source;
    });
  }

  async function cropImageData(imageData, targetWidth, targetHeight, faceAnalysis = null, options = {}) {
    if (!imageData) throw new Error('Pro face-aware výřez chybí obrázek.');
    const image = await loadImage(imageData);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(finite(targetWidth, 720)));
    canvas.height = Math.max(1, Math.round(finite(targetHeight, 960)));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas pro face-aware výřez není dostupný.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const crop = drawImageCover(context, image, 0, 0, canvas.width, canvas.height, faceAnalysis);
    image.removeAttribute('src');
    const type = options.type || 'image/jpeg';
    const quality = clamp(finite(options.quality, 0.92), 0.5, 1);
    return {
      dataUrl: canvas.toDataURL(type, quality),
      crop,
      faceAnalysis: transformFaceAnalysis(faceAnalysis, crop)
    };
  }

  globalThis.SmazkaFaceCrop = Object.freeze({
    calculateCrop,
    cropImageData,
    drawImageCover,
    sourceDimensions,
    transformFaceAnalysis
  });
})();

/* === face-input-optimizer-v80.js === */
/* Smažka v80 — lower-cost live Face Mesh input without changing normalized landmark geometry. */
(() => {
  'use strict';

  function installFaceInputOptimizer() {
    const FaceMesh = window.FaceMesh;
    const prototype = FaceMesh?.prototype;
    const nativeSend = prototype?.send;
    if (typeof nativeSend !== 'function') return false;
    if (prototype.__smazkaInputOptimizerV80) return true;

    const IDLE_MAX_EDGE = 512;
    const SCAN_MAX_EDGE = 640;
    const states = new WeakMap();
    const buffers = new Set();
    let preparedFrames = 0;
    let duplicateFrames = 0;
    let bypassedFrames = 0;
    let preparationTotalMs = 0;

    function isVideoSource(source) {
      return typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
    }

    function frameKey(video) {
      const time = Number(video.currentTime || 0);
      return `${video.videoWidth}x${video.videoHeight}@${time.toFixed(5)}`;
    }

    function createState() {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvas.dataset.faceInputV80 = 'true';
      buffers.add(canvas);
      const context = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
      });
      return {
        canvas,
        context,
        lastFrameKey: '',
        lastWidth: 1,
        lastHeight: 1
      };
    }

    function targetSize(video) {
      const sourceWidth = Math.max(1, Number(video.videoWidth || 0));
      const sourceHeight = Math.max(1, Number(video.videoHeight || 0));
      const maxEdge = document.body.classList.contains('face-scan-active')
        ? SCAN_MAX_EDGE
        : IDLE_MAX_EDGE;
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      return {
        width: Math.max(1, Math.round(sourceWidth * scale)),
        height: Math.max(1, Math.round(sourceHeight * scale))
      };
    }

    function prepareVideoFrame(instance, video) {
      let state = states.get(instance);
      if (!state) {
        state = createState();
        states.set(instance, state);
      }

      const key = frameKey(video);
      if (key === state.lastFrameKey) {
        duplicateFrames += 1;
        return null;
      }

      const { width, height } = targetSize(video);
      if (!state.context || !width || !height) return video;

      const startedAt = performance.now();
      if (state.lastWidth !== width || state.lastHeight !== height) {
        state.canvas.width = width;
        state.canvas.height = height;
        state.lastWidth = width;
        state.lastHeight = height;
      }
      state.context.drawImage(video, 0, 0, width, height);
      state.lastFrameKey = key;
      preparedFrames += 1;
      preparationTotalMs += performance.now() - startedAt;
      return state.canvas;
    }

    function optimizedSend(packet = {}) {
      const source = packet?.image;
      if (!isVideoSource(source)) {
        bypassedFrames += 1;
        return nativeSend.call(this, packet);
      }

      const prepared = prepareVideoFrame(this, source);
      if (!prepared) return Promise.resolve(undefined);
      return nativeSend.call(this, { ...packet, image: prepared });
    }

    try {
      Object.defineProperty(prototype, 'send', {
        configurable: true,
        writable: true,
        value: optimizedSend
      });
    } catch (error) {
      try {
        prototype.send = optimizedSend;
      } catch {
        console.warn('Face Mesh input optimizer se nepodařilo připojit:', error);
        buffers.clear();
        return false;
      }
    }

    Object.defineProperty(prototype, '__smazkaInputOptimizerV80', {
      configurable: false,
      enumerable: false,
      value: true
    });

    window.addEventListener('pagehide', () => {
      buffers.forEach((canvas) => {
        canvas.width = 1;
        canvas.height = 1;
      });
      buffers.clear();
    }, { once: true });

    window.SmazkaFaceInputOptimizer = Object.freeze({
      getStats() {
        return {
          preparedFrames,
          duplicateFrames,
          bypassedFrames,
          averagePreparationMs: preparedFrames ? preparationTotalMs / preparedFrames : 0,
          idleMaxEdge: IDLE_MAX_EDGE,
          scanMaxEdge: SCAN_MAX_EDGE
        };
      }
    });
    return true;
  }

  window.SmazkaInstallFaceInputOptimizer = installFaceInputOptimizer;
  installFaceInputOptimizer();
})();

/* === face-landmark-bridge-v81.js === */
/* Smažka v81 — non-invasive MediaPipe landmark feed for visual overlays. */
(() => {
  'use strict';

  function installLandmarkBridge() {
    const FaceMesh = window.FaceMesh;
    const prototype = FaceMesh?.prototype;
    const nativeOnResults = prototype?.onResults;
    const nativeSend = prototype?.send;
    if (typeof nativeOnResults !== 'function' || typeof nativeSend !== 'function') return false;
    if (prototype.__smazkaLandmarkBridgeV81) return true;

  const listeners = new Set();
  const wrappedCallbacks = new WeakMap();
  const inputMeta = new WeakMap();
  let snapshot = Object.freeze({
    landmarks: null,
    faceCount: 0,
    capturedAt: 0,
    sequence: 0,
    sourceKind: 'unknown',
    sourceWidth: 0,
    sourceHeight: 0
  });

  function sourceMetadata(source) {
    const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
    const width = Number(
      isVideo ? source?.videoWidth : source?.naturalWidth || source?.width || 0
    );
    const height = Number(
      isVideo ? source?.videoHeight : source?.naturalHeight || source?.height || 0
    );
    return {
      sourceKind: isVideo ? 'video' : 'still',
      sourceWidth: width,
      sourceHeight: height
    };
  }

  function publish(results, instance) {
    const faces = Array.isArray(results?.multiFaceLandmarks)
      ? results.multiFaceLandmarks.filter((points) => Array.isArray(points) && points.length >= 468)
      : [];

    const meta = inputMeta.get(instance) || {};
    snapshot = Object.freeze({
      landmarks: faces[0] || null,
      faceCount: faces.length,
      capturedAt: performance.now(),
      sequence: snapshot.sequence + 1,
      sourceKind: meta.sourceKind || 'unknown',
      sourceWidth: Number(meta.sourceWidth || 0),
      sourceHeight: Number(meta.sourceHeight || 0)
    });

    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn('Junkie Vision landmark subscriber selhal:', error);
      }
    });
  }

  function bridgedOnResults(callback) {
    if (typeof callback !== 'function') return nativeOnResults.call(this, callback);
    const instance = this;
    let wrapped = wrappedCallbacks.get(callback);
    if (!wrapped) {
      wrapped = (results) => {
        publish(results, instance);
        return callback(results);
      };
      wrappedCallbacks.set(callback, wrapped);
    }
    return nativeOnResults.call(this, wrapped);
  }

  function bridgedSend(packet = {}) {
    inputMeta.set(this, sourceMetadata(packet?.image));
    return nativeSend.call(this, packet);
  }

  try {
    Object.defineProperty(prototype, 'onResults', {
      configurable: true,
      writable: true,
      value: bridgedOnResults
    });
  } catch (error) {
    try {
      prototype.onResults = bridgedOnResults;
    } catch {
      console.warn('Landmark bridge se nepodařilo připojit:', error);
      return;
    }
  }

  try {
    Object.defineProperty(prototype, 'send', {
      configurable: true,
      writable: true,
      value: bridgedSend
    });
  } catch (error) {
    try {
      prototype.send = bridgedSend;
    } catch {
      console.warn('Landmark source bridge se nepodařilo připojit:', error);
    }
  }

  Object.defineProperty(prototype, '__smazkaLandmarkBridgeV81', {
    configurable: false,
    enumerable: false,
    value: true
  });

  window.SmazkaLandmarkFeed = Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
    return true;
  }

  window.SmazkaInstallLandmarkBridge = installLandmarkBridge;
  installLandmarkBridge();
})();

/* === hud-junkie-themes.js === */
/* Smažka v81 — editable Junkie Vision theme, copy and timing. */
(() => {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  const theme = {
    version: 81,
    name: 'Junkie Vision / WARNA',
    colors: {
      toxic: '#00FF66',
      impact: '#FF0055',
      warning: '#FFCC00',
      white: '#F4FFF8',
      void: '#020604',
      panel: 'rgba(2, 8, 6, 0.78)'
    },
    timing: {
      totalMs: 3000,
      initEndMs: 1000,
      scanEndMs: 2500,
      criticalEndMs: 3000,
      exitMs: 320,
      metricRotateMs: 340,
      hapticAtMs: [120, 1040, 2520]
    },
    performance: {
      targetFps: 30,
      maxDevicePixelRatio: 1.5,
      maxMeshConnections: 460,
      connectionStride: 3,
      scanlineStep: 5,
      noiseSampleSize: 24,
      noiseSampleIntervalMs: 180
    },
    labels: {
      init: 'SYSTEM INIT: WARNA READY',
      tracking: 'BIOMETRIC LOCK // 468 POINTS',
      scanning: 'JUNKIE VISION // TISSUE SWEEP',
      critical: 'CRITICAL IMPACT DETECTED',
      footer: 'LOCAL VOID LAB // MEME, NOT DIAGNOSIS'
    },
    metrics: [
      { label: 'ANALÝZA ROZTĚKANOSTI ZRNKA', kind: 'scatter', suffix: '% (KRITICKÁ)' },
      { label: 'DETEKCE POKLESU VÍČEK', kind: 'droop', suffix: 'm/s² (SMRT)' },
      { label: 'SKEN ČELISTNÍHO STISKU', kind: 'jaw', suffix: '' },
      { label: 'HYDRATACE TKÁNĚ', kind: 'hydration', suffix: '% (SUCHÝ JAK VÝPEX)' },
      { label: 'ASOMETRIE KOUTKŮ', kind: 'mouth', suffix: '' },
      { label: 'SYNTÉZA PERNÍKOVÉHO INDEXU', kind: 'pernik', suffix: '' },
      { label: 'HLADINA PARANOI', kind: 'paranoia', suffix: '' },
      { label: 'STAV ZORNIC', kind: 'pupils', suffix: '' },
      { label: 'KONTAKT S REALITOU', kind: 'reality', suffix: '' },
      { label: 'ZBYTKOVÁ LIDSKOST', kind: 'humanity', suffix: '% (NEOVĚŘENO)' },
      { label: 'MOZKOVÝ PING', kind: 'ping', suffix: 'ms+' },
      { label: 'STABILITA SIGNÁLU', kind: 'signal', suffix: '% / KOLAPS' }
    ],
    zoneIndices: {
      rightEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
      leftEye: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
      mouth: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
      faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
      forehead: [10, 151, 9, 8]
    }
  };

  window.SmazkaJunkieHudTheme = deepFreeze(theme);

  const photoRuntimeUrl = 'junkie-vision-photo-v81.js?v=81';
  const noiseRuntimeUrl = 'junkie-vision-noise-v81.js?v=81';

  function loadRuntime(url, datasetKey) {
    if (document.querySelector(`script[src="${url}"]`)) return;
    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    script.dataset[datasetKey] = 'v81';
    document.head.appendChild(script);
  }

  loadRuntime(photoRuntimeUrl, 'junkieVisionPhoto');
  loadRuntime(noiseRuntimeUrl, 'junkieVisionNoise');
})();

/* === face-scan.js === */
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
  const FACE_RUNTIME_URL = `${MODEL_ROOT}face_mesh.js?v=0.4.1633559619`;
  const METRICS_MODULE_URL = './devastation-metrics.js?v=65';
  const DETECTION_MAX_AGE = 620;
  const STILL_DETECTION_TIMEOUT = 8000;
  const SCAN_DURATION = 3000;
  const MOTION_SAMPLE_LIMIT = 18;

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

  const scanLine = document.createElement('div');
  scanLine.id = 'scanLine';
  scanLine.setAttribute('aria-hidden', 'true');

  faceFrame.appendChild(scanLine);
  tracker.append(faceFrame, mesh);

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
  status.appendChild(barWrap);

  overlay.append(tracker, status);
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
  const motionSamples = [];
  let metricsModulePromise = null;
  let faceRuntimePromise = null;
  let faceMeshInitPromise = null;
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

  function meanLandmark(landmarks, indices) {
    const points = indices.map((index) => landmarks[index]).filter(Boolean);
    if (!points.length) return null;
    return points.reduce((value, point) => ({
      x: value.x + Number(point.x || 0) / points.length,
      y: value.y + Number(point.y || 0) / points.length
    }), { x: 0, y: 0 });
  }

  function createMotionSample(landmarks, capturedAt = performance.now()) {
    const outline = FACE_OVAL.map((index) => landmarks[index]).filter(Boolean);
    const rightEye = meanLandmark(landmarks, [33, 133, 159, 145]);
    const leftEye = meanLandmark(landmarks, [263, 362, 386, 374]);
    const nose = landmarks[1];
    if (outline.length < 12 || !rightEye || !leftEye || !nose) return null;

    const bounds = outline.reduce((value, point) => ({
      minX: Math.min(value.minX, Number(point.x || 0)),
      minY: Math.min(value.minY, Number(point.y || 0)),
      maxX: Math.max(value.maxX, Number(point.x || 0)),
      maxY: Math.max(value.maxY, Number(point.y || 0))
    }), { minX: 1, minY: 1, maxX: 0, maxY: 0 });
    const width = Math.max(0.01, bounds.maxX - bounds.minX);
    const height = Math.max(0.01, bounds.maxY - bounds.minY);
    const roll = Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x);
    const yaw = (Number(nose.x || 0) - (bounds.minX + bounds.maxX) / 2) / width;
    return {
      capturedAt,
      centerX: bounds.minX + width / 2,
      centerY: bounds.minY + height / 2,
      scale: Math.hypot(width, height),
      roll,
      yaw
    };
  }

  function recordMotionSample(landmarks, capturedAt = performance.now()) {
    const sample = createMotionSample(landmarks, capturedAt);
    if (!sample) return;
    const previous = motionSamples[motionSamples.length - 1];
    if (previous && sample.capturedAt - previous.capturedAt > DETECTION_MAX_AGE) {
      motionSamples.length = 0;
    }
    motionSamples.push(sample);
    if (motionSamples.length > MOTION_SAMPLE_LIMIT) motionSamples.shift();
  }

  function motionStabilitySnapshot() {
    if (motionSamples.length < 4) {
      return Object.freeze({ available: false, value: null, sampleCount: motionSamples.length });
    }

    const deltas = [];
    for (let index = 1; index < motionSamples.length; index += 1) {
      const previous = motionSamples[index - 1];
      const current = motionSamples[index];
      if (current.capturedAt - previous.capturedAt > DETECTION_MAX_AGE) continue;
      const scale = Math.max(0.02, (previous.scale + current.scale) / 2);
      const centerDelta = Math.hypot(
        current.centerX - previous.centerX,
        current.centerY - previous.centerY
      ) / scale;
      const scaleDelta = Math.abs(Math.log(Math.max(0.01, current.scale / previous.scale)));
      const rollDelta = Math.abs(current.roll - previous.roll) / (Math.PI / 7.2);
      const yawDelta = Math.abs(current.yaw - previous.yaw) / 0.32;
      deltas.push(
        centerDelta * 0.48
          + scaleDelta * 0.2
          + rollDelta * 0.17
          + yawDelta * 0.15
      );
    }

    if (deltas.length < 3) {
      return Object.freeze({ available: false, value: null, sampleCount: motionSamples.length });
    }
    deltas.sort((first, second) => first - second);
    const robust = deltas.slice(0, Math.max(3, Math.ceil(deltas.length * 0.82)));
    const robustDelta = robust.reduce((sum, value) => sum + value, 0) / robust.length;
    return Object.freeze({
      available: true,
      value: Math.max(0, Math.min(1, (robustDelta - 0.008) / 0.095)),
      sampleCount: motionSamples.length,
      robustDelta: Math.round(robustDelta * 10000) / 10000
    });
  }

  function validateFaceAnalysisScores(faceAnalysis) {
    const signalScore = Number(faceAnalysis?.scores?.signalScore);
    const randomScore = Number(faceAnalysis?.scores?.randomScore);
    const severity = Number(faceAnalysis?.scores?.severity);
    const expectedSeverity = Math.max(
      12,
      Math.min(98, Math.round(signalScore * 0.70 + randomScore * 0.30))
    );

    if (
      !Number.isFinite(signalScore)
      || !Number.isFinite(randomScore)
      || !Number.isFinite(severity)
      || severity !== expectedSeverity
    ) {
      throw new Error('Face analysis porušil společný 70/30 score kontrakt.');
    }
    return faceAnalysis;
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
    motionSamples.length = 0;
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
      recordMotionSample(landmarks, lastDetectionAt);
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

  function ensureFaceRuntime() {
    if (typeof window.FaceMesh === 'function') return Promise.resolve(window.FaceMesh);
    if (faceRuntimePromise) return faceRuntimePromise;

    faceRuntimePromise = new Promise((resolve, reject) => {
      const absoluteUrl = new URL(FACE_RUNTIME_URL, document.baseURI).toString();
      const existing = [...document.scripts].find((script) => script.src === absoluteUrl);
      const script = existing || document.createElement('script');

      const cleanup = () => {
        script.removeEventListener('load', handleLoad);
        script.removeEventListener('error', handleError);
      };
      const handleLoad = () => {
        cleanup();
        if (typeof window.FaceMesh === 'function') {
          resolve(window.FaceMesh);
          return;
        }
        script.remove();
        reject(new Error('Face Mesh runtime se načetl bez veřejného API.'));
      };
      const handleError = () => {
        cleanup();
        script.remove();
        reject(new Error('Face Mesh runtime se nepodařilo stáhnout.'));
      };

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      if (!existing) {
        script.src = FACE_RUNTIME_URL;
        script.async = true;
        script.dataset.smazkaFaceRuntime = 'true';
        document.head.appendChild(script);
      }
    }).catch((error) => {
      faceRuntimePromise = null;
      throw error;
    });

    return faceRuntimePromise;
  }

  function markModelFailure(error) {
    console.error('MediaPipe Face Mesh nejde inicializovat:', error);
    modelState = 'failed';
    overlay.classList.remove('model-loading');
    overlay.classList.add('model-failed');
    faceMesh = null;
    setDetected(false);
    app.setHint(
      navigator.onLine === false
        ? 'Rozhraní je offline připravené. Pro první probuzení FACE enginu se jednou připoj k internetu.'
        : 'Přesná detekce se nespustila. Zkus sken znovu.'
    );
  }

  function initializeFaceMesh() {
    if (faceMesh && modelAvailable()) return Promise.resolve(faceMesh);
    if (faceMeshInitPromise) return faceMeshInitPromise;

    modelState = 'loading';
    overlay.classList.add('model-loading');
    overlay.classList.remove('model-failed');

    faceMeshInitPromise = (async () => {
      await ensureFaceRuntime();
      window.SmazkaInstallFaceInputOptimizer?.();
      window.SmazkaInstallLandmarkBridge?.();

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
      return faceMesh;
    })().catch((error) => {
      faceMeshInitPromise = null;
      markModelFailure(error);
      throw error;
    });

    return faceMeshInitPromise;
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
        faceMeshInitPromise = null;
        overlay.classList.remove('model-loading');
        overlay.classList.add('model-failed');
        clearLandmarks();
        setDetected(false);
        const failedFaceMesh = faceMesh;
        faceMesh = null;
        failedFaceMesh?.close?.()?.catch?.(() => undefined);
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
    try {
      await initializeFaceMesh();
    } catch {
      throw analysisError(
        navigator.onLine === false
          ? 'Pro první změření fotky se jednou připoj k internetu a načti FACE engine.'
          : 'Přesný model obličeje není dostupný. Zkus fotku znovu.',
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
      return validateFaceAnalysisScores(await analyzeFaceImage({
        landmarks: cloneLandmarks(faces[0]),
        imageSource: imageData,
        sourceKind: 'upload',
        mirrorX: false
      }));
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
    motionSamples.length = 0;
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
      const faceAnalysis = validateFaceAnalysisScores(await analyzeFaceImage({
        landmarks,
        imageSource: dataUrl,
        sourceKind: 'camera',
        mirrorX,
        stability: motionStabilitySnapshot()
      }));
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
      initializeFaceMesh().catch(() => undefined);
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
    scanLine.classList.add('active');
    barWrap.classList.add('show');
    setProgress(0);
    animationFrame = requestAnimationFrame(animateScan);
  }

  window.SmazkaFaceScan = {
    start,
    reset,
    analyzeStillImage,
    ensureReady: initializeFaceMesh,
    getStability: motionStabilitySnapshot,
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
})();

/* === junkie-vision-hud-v81.js === */
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

  const lifecycleObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(syncLifecycle);
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

/* === junkie-vision-balance-v83.js === */
/* Smažka v83 — balanced Junkie Vision presentation + scan deadlock recovery. */
(() => {
  'use strict';

  const app = window.SmazkaApp;
  const faceScan = window.SmazkaFaceScan;
  const feed = window.SmazkaLandmarkFeed;
  const stage = app?.elements?.cameraStage;
  const result = app?.elements?.result;
  if (!app?.state || !faceScan || !feed || !stage || !result) return;

  const METRICS_MODULE_URL = './devastation-metrics.js?v=65';
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
    const stability = faceScan.getStability?.() || null;

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
        mirrorX: app.state.facingMode === 'user',
        stability
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
      if (!fallbackRunning) scanSequence += 1;
      cancelWatchdog();
    }
    previousScanActive = active;
  }

  discoverHuds();

  const stageObserver = new (window.SmazkaMutationObserver || window.MutationObserver)((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('.junkie-vision-hud')) balanceHud(node);
        discoverHuds(node);
      });
    });
  });
  stageObserver.observe(stage, { childList: true, subtree: true });

  const lifecycleObserver = new (window.SmazkaMutationObserver || window.MutationObserver)(syncLifecycle);
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
