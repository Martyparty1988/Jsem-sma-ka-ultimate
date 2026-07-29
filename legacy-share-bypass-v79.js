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

  const resultObserver = new MutationObserver(() => {
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
