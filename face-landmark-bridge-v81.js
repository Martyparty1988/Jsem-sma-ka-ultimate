/* Smažka v81 — non-invasive MediaPipe landmark feed for visual overlays. */
(() => {
  'use strict';

  const FaceMesh = window.FaceMesh;
  const prototype = FaceMesh?.prototype;
  const nativeOnResults = prototype?.onResults;
  if (typeof nativeOnResults !== 'function') return;

  const listeners = new Set();
  const wrappedCallbacks = new WeakMap();
  let snapshot = Object.freeze({
    landmarks: null,
    faceCount: 0,
    capturedAt: 0,
    sequence: 0
  });

  function publish(results) {
    const faces = Array.isArray(results?.multiFaceLandmarks)
      ? results.multiFaceLandmarks.filter((points) => Array.isArray(points) && points.length >= 468)
      : [];

    snapshot = Object.freeze({
      landmarks: faces[0] || null,
      faceCount: faces.length,
      capturedAt: performance.now(),
      sequence: snapshot.sequence + 1
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
    let wrapped = wrappedCallbacks.get(callback);
    if (!wrapped) {
      wrapped = (results) => {
        publish(results);
        return callback(results);
      };
      wrappedCallbacks.set(callback, wrapped);
    }
    return nativeOnResults.call(this, wrapped);
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

  window.SmazkaLandmarkFeed = Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
})();
