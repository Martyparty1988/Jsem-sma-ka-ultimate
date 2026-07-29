/* Smažka v81 — non-invasive MediaPipe landmark feed for visual overlays. */
(() => {
  'use strict';

  const FaceMesh = window.FaceMesh;
  const prototype = FaceMesh?.prototype;
  const nativeOnResults = prototype?.onResults;
  const nativeSend = prototype?.send;
  if (typeof nativeOnResults !== 'function' || typeof nativeSend !== 'function') return;

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

  window.SmazkaLandmarkFeed = Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
})();
