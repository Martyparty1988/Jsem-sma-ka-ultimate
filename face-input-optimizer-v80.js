/* Smažka v80 — lower-cost live Face Mesh input without changing normalized landmark geometry. */
(() => {
  'use strict';

  const FaceMesh = window.FaceMesh;
  const prototype = FaceMesh?.prototype;
  const nativeSend = prototype?.send;
  if (typeof nativeSend !== 'function' || prototype.__smazkaInputOptimizerV80) return;

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
      return;
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
})();
