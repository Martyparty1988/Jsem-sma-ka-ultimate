import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { readBundleSection } from './bundle-source.mjs';

function createCanvas(created) {
  const gradient = { addColorStop() {} };
  const context = {
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    clip() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    fill() {},
    stroke() {},
    fillRect() {},
    fillText() {},
    drawImage() {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (value) => ({ width: String(value).length * 25 })
  };
  const canvas = {
    width: 1,
    height: 1,
    dataset: {},
    getContext: () => context,
    toBlob(callback, type) {
      this.encodedWidth = this.width;
      this.encodedHeight = this.height;
      callback(new Blob(['protocol'], { type }));
    }
  };
  created.push(canvas);
  return canvas;
}

test('v115 share protocol executes with the result-owned factor and measured metrics', async () => {
  const createdCanvases = [];
  const state = {
    effectSeverity: 61,
    effectSeed: 113,
    effectImageData: 'data:image/png;base64,AAAA',
    shareImagePromise: Promise.resolve(),
    faceAnalysis: {
      metrics: {
        apertura: 50,
        lidskost: 50,
        gravitace: 10,
        asymetrie: 'střední',
        hydratace: 50
      }
    },
    lastAnalysisResult: { severity: 61 }
  };
  const visibleImage = {
    currentSrc: 'data:image/png;base64,AAAA',
    src: 'data:image/png;base64,AAAA'
  };
  const visual = {
    querySelector(selector) {
      return selector === 'img:not(.junkie-share-source)' ? visibleImage : null;
    }
  };
  const result = {
    classList: { contains: () => false },
    querySelector(selector) {
      if (selector === '.result-visual') return visual;
      if (selector === '.effect-label strong') return { textContent: '61%' };
      if (selector === 'h2') return { textContent: 'Testovací rozsudek' };
      if (selector === '.description') return { textContent: 'Satirický popis výsledku.' };
      return null;
    }
  };
  const legacyCanvas = createCanvas(createdCanvases);

  class MockImage {
    naturalWidth = 720;
    naturalHeight = 960;
    width = 720;
    height = 960;

    set src(value) {
      this.currentSrc = value;
      queueMicrotask(() => this.onload?.());
    }

    removeAttribute() {}
  }

  class MockObserver {
    observe() {}
    disconnect() {}
  }

  const window = {
    SmazkaApp: { state, elements: { result, canvas: legacyCanvas } },
    SmazkaFaceCrop: null,
    SmazkaMutationObserver: MockObserver,
    MutationObserver: MockObserver,
    addEventListener() {},
    setTimeout() {}
  };
  const document = {
    createElement(tagName) {
      if (tagName === 'canvas') return createCanvas(createdCanvases);
      throw new Error(`Neočekávaný element: ${tagName}`);
    },
    getElementById: () => null,
    addEventListener() {}
  };

  vm.runInNewContext(readBundleSection('share-cover-v77.js'), {
    Blob,
    Date,
    File: class {},
    Image: MockImage,
    Intl,
    Math,
    Number,
    Object,
    Promise,
    String,
    URL,
    console,
    document,
    navigator: {},
    queueMicrotask,
    window
  });

  const verdict = window.SmazkaShareCover.collectVerdict();
  assert.equal(verdict.severity, 61);
  assert.equal(verdict.stamp, 'VZOREK HOŘÍ');
  assert.match(verdict.caseId, /^[A-Z0-9]{7}$/);
  assert.deepEqual(
    Array.from(verdict.findings, ({ label }) => label),
    ['TVÁŘOVÁ ASYMETRIE', 'ZBYTKOVÁ LIDSKOST', 'HYDRATAČNÍ POPLACH']
  );

  const blob = await window.SmazkaShareCover.renderProtocolBlob(verdict);
  const protocolCanvas = createdCanvases.at(-1);
  assert.equal(protocolCanvas.encodedWidth, 1080);
  assert.equal(protocolCanvas.encodedHeight, 1350);
  assert.equal(protocolCanvas.width, 1, 'export releases the protocol canvas after encoding');
  assert.equal(protocolCanvas.height, 1, 'export releases the protocol canvas after encoding');
  assert.equal(blob.type, 'image/jpeg');
});
