import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('face-aware-crop.js', root), 'utf8');
const context = {};
context.globalThis = context;
vm.runInNewContext(source, context);
const cropApi = context.SmazkaFaceCrop;

function analysisAt(x, y = 0.28) {
  return {
    faceBounds: {
      x,
      y,
      width: 0.22,
      height: 0.42,
      center: { x: x + 0.11, y: y + 0.21 }
    },
    anchors: {
      leftEye: { x: x + 0.145, y: y + 0.15, z: 0 },
      rightEye: { x: x + 0.075, y: y + 0.15, z: 0 },
      mouth: { x: x + 0.11, y: y + 0.31, z: 0 }
    },
    normalizedLandmarks: Array.from({ length: 468 }, (_, index) => ({
      x: x + 0.04 + (index % 12) / 12 * 0.14,
      y: y + 0.04 + (index % 18) / 18 * 0.32,
      z: 0
    }))
  };
}

test('center fallback produces centered cover crop', () => {
  const crop = cropApi.calculateCrop({
    sourceWidth: 1600,
    sourceHeight: 900,
    targetWidth: 720,
    targetHeight: 960
  });

  assert.equal(crop.hasFace, false);
  assert.equal(Math.round(crop.objectPositionX), 50);
  assert.equal(Math.round(crop.objectPositionY), 50);
  assert.equal(Math.round(crop.sw / crop.sh * 1000), 750);
});

test('face near the left edge shifts a portrait crop left instead of cutting it away', () => {
  const crop = cropApi.calculateCrop({
    sourceWidth: 1600,
    sourceHeight: 900,
    targetWidth: 720,
    targetHeight: 960,
    faceAnalysis: analysisAt(0.04)
  });

  assert.equal(crop.hasFace, true);
  assert.ok(crop.objectPositionX < 20, String(crop.objectPositionX));
  assert.ok(crop.sx <= 80, String(crop.sx));
});

test('face near the right edge shifts the same crop right', () => {
  const crop = cropApi.calculateCrop({
    sourceWidth: 1600,
    sourceHeight: 900,
    targetWidth: 720,
    targetHeight: 960,
    faceAnalysis: analysisAt(0.74)
  });

  assert.ok(crop.objectPositionX > 80, String(crop.objectPositionX));
  assert.ok(crop.sx > 800, String(crop.sx));
});

test('landmarks and anchors are transformed into the prepared crop coordinate system', () => {
  const original = analysisAt(0.68, 0.2);
  const crop = cropApi.calculateCrop({
    sourceWidth: 1600,
    sourceHeight: 900,
    targetWidth: 480,
    targetHeight: 640,
    faceAnalysis: original
  });
  const transformed = cropApi.transformFaceAnalysis(original, crop);

  assert.equal(transformed.crop.version, 72);
  assert.equal(transformed.crop.output.width, 480);
  assert.equal(transformed.crop.output.height, 640);
  assert.equal(transformed.normalizedLandmarks.length, 468);
  assert.ok(transformed.faceBounds.center.x > 0.25 && transformed.faceBounds.center.x < 0.75);
  assert.ok(transformed.anchors.leftEye.x >= 0 && transformed.anchors.leftEye.x <= 1);
  assert.ok(transformed.anchors.leftEye.y >= 0 && transformed.anchors.leftEye.y <= 1);
});
