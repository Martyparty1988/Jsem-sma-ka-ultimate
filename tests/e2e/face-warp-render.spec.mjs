import { test, expect } from '@playwright/test';

const faceSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640">',
  '<rect width="480" height="640" fill="#10202d"/>',
  '<ellipse cx="240" cy="320" rx="155" ry="220" fill="#d59779"/>',
  '<ellipse cx="175" cy="265" rx="34" ry="24" fill="#f4f1df"/>',
  '<ellipse cx="305" cy="265" rx="34" ry="24" fill="#f4f1df"/>',
  '<circle cx="175" cy="265" r="13" fill="#12202a"/>',
  '<circle cx="305" cy="265" r="13" fill="#12202a"/>',
  '<path d="M240 285 L210 365 L270 365 Z" fill="#b76f5d"/>',
  '<path d="M155 415 Q240 485 325 415" fill="none" stroke="#571e35" stroke-width="24"/>',
  '<path d="M120 340 L80 365 M360 340 L400 365" stroke="#efbd96" stroke-width="18"/>',
  '</svg>'
].join('');
const facePhoto = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(faceSvg)}`;

function faceAnalysis({ brutal = false } = {}) {
  return {
    schemaVersion: 4,
    sourceKind: 'upload',
    faceBounds: {
      x: 0.18,
      y: 0.14,
      width: 0.64,
      height: 0.72,
      center: { x: 0.5, y: 0.5 }
    },
    anchors: {
      leftEye: { x: 0.635, y: 0.414 },
      rightEye: { x: 0.365, y: 0.414 },
      leftCheek: { x: 0.67, y: 0.54 },
      rightCheek: { x: 0.33, y: 0.54 },
      forehead: { x: 0.5, y: 0.205 },
      leftTemple: { x: 0.76, y: 0.37 },
      rightTemple: { x: 0.24, y: 0.37 },
      leftBrow: { x: 0.63, y: 0.355 },
      rightBrow: { x: 0.37, y: 0.355 },
      noseTip: { x: 0.5, y: 0.52 },
      mouth: { x: 0.5, y: 0.67 },
      mouthLeft: { x: 0.65, y: 0.66 },
      mouthRight: { x: 0.35, y: 0.66 },
      upperLip: { x: 0.5, y: 0.645 },
      lowerLip: { x: 0.5, y: 0.695 },
      chin: { x: 0.5, y: 0.84 },
      jawLeft: { x: 0.72, y: 0.72 },
      jawRight: { x: 0.28, y: 0.72 }
    },
    directions: brutal
      ? { yaw: 0.72, roll: -0.58, pitch: 0.68, eyes: 0.82, cheeks: -0.74, mouth: 0.78, gazeX: 0.76, gazeY: 0.54 }
      : { yaw: 0, roll: 0, pitch: 0, eyes: 0, cheeks: 0, mouth: 0, gazeX: 0, gazeY: 0 },
    signals: brutal
      ? { pose: 0.9, eyes: 0.94, mouth: 0.92, asymmetry: 0.88 }
      : { pose: 0, eyes: 0, mouth: 0, asymmetry: 0 }
  };
}

async function renderAndMeasure(page, forceCanvas, effect, analysis = faceAnalysis({ brutal: true })) {
  return page.evaluate(async ({ imageData, forceCanvasFallback, effectKey, analysisContract }) => {
    const loadImage = (source) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
    const pixels = async (source) => {
      const image = await loadImage(source);
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 640;
      const context = canvas.getContext('2d', { alpha: false });
      context.drawImage(image, 0, 0, 480, 640);
      return context.getImageData(0, 0, 480, 640).data;
    };

    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    if (forceCanvasFallback) {
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
        if (type === 'webgl') return null;
        return nativeGetContext.call(this, type, ...args);
      };
    }

    let rendered;
    try {
      rendered = await window.SmazkaFaceWarp.renderFaceEffect({
        imageData,
        severity: 98,
        effect: effectKey,
        seed: 731,
        faceAnalysis: analysisContract,
        output: { width: 480, height: 640, crop: 'cover' }
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = nativeGetContext;
    }

    const [before, after] = await Promise.all([
      pixels(imageData),
      pixels(rendered.finalDataUrl)
    ]);
    let changedPixels = 0;
    let totalDifference = 0;
    for (let index = 0; index < before.length; index += 4) {
      const difference = Math.abs(before[index] - after[index])
        + Math.abs(before[index + 1] - after[index + 1])
        + Math.abs(before[index + 2] - after[index + 2]);
      totalDifference += difference;
      if (difference >= 18) changedPixels += 1;
    }

    return {
      renderer: rendered.renderer,
      changedRatio: changedPixels / (480 * 640),
      averageDifference: totalDifference / (480 * 640),
      timedOut: Boolean(rendered.timedOut),
      guardOwnsWarp: Boolean(window.SmazkaFaceWarp.__completionGuardV84),
      guardWarpTimeout: window.SmazkaAnalysisCompletionGuard?.warpTimeoutMs ?? null
    };
  }, {
    imageData: facePhoto,
    forceCanvasFallback: forceCanvas,
    effectKey: effect,
    analysisContract: analysis
  });
}

test('v110 produces visibly different pixels instead of timing out to the original photo', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.SmazkaFaceWarp?.renderFaceEffect));

  const profiles = ['liquid-gravity', 'cranial-bloom', 'deep-collapse', 'total-drift', 'kebab-lens'];
  const measurements = {};
  for (const profile of profiles) {
    measurements[profile] = {
      gpu: await renderAndMeasure(page, false, profile),
      canvas: await renderAndMeasure(page, true, profile)
    };
  }

  const report = JSON.stringify(measurements);
  Object.values(measurements).forEach(({ gpu, canvas }) => {
    expect(gpu.renderer, report).toBe('webgl');
    expect(canvas.renderer, report).toBe('canvas');
    expect(gpu.changedRatio, report).toBeGreaterThan(0.015);
    expect(canvas.changedRatio, report).toBeGreaterThan(0.015);
    expect(gpu.averageDifference, report).toBeGreaterThan(1);
    expect(canvas.averageDifference, report).toBeGreaterThan(1);
    expect(gpu.timedOut, report).toBe(false);
    expect(canvas.timedOut, report).toBe(false);
    expect(gpu.guardOwnsWarp, report).toBe(false);
    expect(canvas.guardOwnsWarp, report).toBe(false);
    expect(gpu.guardWarpTimeout, report).toBeNull();
    expect(canvas.guardWarpTimeout, report).toBeNull();
  });
});

test('v113 biometric drive makes all five modes more destructive than neutral geometry', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.SmazkaFaceWarp?.renderFaceEffect));

  const profiles = ['liquid-gravity', 'cranial-bloom', 'deep-collapse', 'total-drift', 'kebab-lens'];
  const report = {};
  for (const profile of profiles) {
    report[profile] = {};
    for (const [label, forceCanvas] of [['gpu', false], ['canvas', true]]) {
      const neutral = await renderAndMeasure(page, forceCanvas, profile, faceAnalysis());
      const brutal = await renderAndMeasure(page, forceCanvas, profile, faceAnalysis({ brutal: true }));
      report[profile][label] = { neutral, brutal };
      expect(brutal.averageDifference, JSON.stringify(report)).toBeGreaterThan(neutral.averageDifference * 1.06);
      expect(brutal.changedRatio, JSON.stringify(report)).toBeGreaterThan(neutral.changedRatio);
    }
  }
});
