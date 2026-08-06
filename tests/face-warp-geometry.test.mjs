import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCoverTransform,
  createWarpGeometry,
  defaultWarpGeometry
} from '../face-warp-geometry.js';

function analysis(offsetX = 0) {
  const shift = (value) => ({ x: value.x + offsetX, y: value.y });
  return {
    faceBounds: {
      x: 0.2 + offsetX,
      y: 0.14,
      width: 0.6,
      height: 0.72,
      center: shift({ x: 0.5, y: 0.5 })
    },
    anchors: {
      leftEye: shift({ x: 0.62, y: 0.38 }),
      rightEye: shift({ x: 0.38, y: 0.38 }),
      leftCheek: shift({ x: 0.66, y: 0.53 }),
      rightCheek: shift({ x: 0.34, y: 0.53 }),
      forehead: shift({ x: 0.5, y: 0.2 }),
      leftTemple: shift({ x: 0.76, y: 0.37 }),
      rightTemple: shift({ x: 0.24, y: 0.37 }),
      leftBrow: shift({ x: 0.61, y: 0.34 }),
      rightBrow: shift({ x: 0.39, y: 0.34 }),
      noseTip: shift({ x: 0.5, y: 0.47 }),
      mouth: shift({ x: 0.5, y: 0.64 }),
      mouthLeft: shift({ x: 0.61, y: 0.64 }),
      mouthRight: shift({ x: 0.39, y: 0.64 }),
      upperLip: shift({ x: 0.5, y: 0.625 }),
      lowerLip: shift({ x: 0.5, y: 0.655 }),
      chin: shift({ x: 0.5, y: 0.82 }),
      jawLeft: shift({ x: 0.74, y: 0.68 }),
      jawRight: shift({ x: 0.26, y: 0.68 })
    },
    directions: {
      yaw: 0.62,
      roll: -0.24,
      pitch: 0.18,
      eyes: 0.42,
      cheeks: -0.36,
      mouth: 0.28,
      gazeX: 0.48,
      gazeY: -0.32
    },
    signals: { pose: 0.66, eyes: 0.74, mouth: 0.44, asymmetry: 0.58 }
  };
}

const WARP_REGIONS = [
  'mask',
  'face',
  'forehead',
  'leftTemple',
  'rightTemple',
  'leftBrow',
  'rightBrow',
  'leftEye',
  'rightEye',
  'leftCheek',
  'rightCheek',
  'nose',
  'mouth',
  'mouthLeft',
  'mouthRight',
  'upperLip',
  'lowerLip',
  'jaw'
];

test('cover transform preserves normalized points when aspect ratios match', () => {
  const transform = createCoverTransform({
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });
  assert.deepEqual(transform.mapPoint({ x: 0.2, y: 0.75 }), { x: 0.2, y: 0.75 });
  assert.equal(transform.offsetX, 0);
  assert.equal(transform.offsetY, 0);
});

test('cover transform applies the same horizontal crop as source pixels', () => {
  const transform = createCoverTransform({
    sourceWidth: 1600,
    sourceHeight: 900,
    targetWidth: 480,
    targetHeight: 640
  });
  const center = transform.mapPoint({ x: 0.5, y: 0.5 });
  const quarter = transform.mapPoint({ x: 0.25, y: 0.5 });
  assert.ok(Math.abs(center.x - 0.5) < 1e-10);
  assert.ok(quarter.x < 0);
  assert.ok(transform.offsetX < 0);
});

test('landmark anchors produce bounded warp regions', () => {
  const geometry = createWarpGeometry({
    faceAnalysis: analysis(),
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });
  assert.equal(geometry.anchored, true);
  assert.ok(Math.abs(geometry.face[0] - 0.5) < 1e-10);
  assert.ok(geometry.leftEye[0] > geometry.rightEye[0]);
  assert.ok(geometry.forehead[1] < geometry.mouth[1]);
  assert.ok(geometry.jaw[1] > geometry.mouth[1]);
  assert.ok(geometry.leftTemple[0] > geometry.rightTemple[0]);
  assert.ok(geometry.leftBrow[1] < geometry.leftEye[1]);
  assert.ok(geometry.upperLip[1] < geometry.lowerLip[1]);
  WARP_REGIONS.forEach((name) => {
      const value = geometry[name];
      assert.equal(value.length, 4);
      assert.ok(value.every(Number.isFinite));
      assert.ok(value[2] > 0 && value[3] > 0);
    });
  assert.deepEqual(geometry.controls, {
    yaw: 0.62,
    roll: -0.24,
    pitch: 0.18,
    eyes: 0.42,
    cheeks: -0.36,
    mouth: 0.28,
    gazeX: 0.48,
    gazeY: -0.32,
    pose: 0.66,
    eyeIntensity: 0.74,
    mouthOpen: 0.44,
    asymmetry: 0.58
  });
});

test('moving the analyzed face moves every deformation anchor', () => {
  const base = createWarpGeometry({
    faceAnalysis: analysis(),
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });
  const moved = createWarpGeometry({
    faceAnalysis: analysis(0.12),
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });
  WARP_REGIONS.forEach((name) => {
    assert.ok(Math.abs((moved[name][0] - base[name][0]) - 0.12) < 1e-10);
  });
});

test('renderer geometry does not mirror or swap stored-image anchors again', () => {
  const geometry = createWarpGeometry({
    faceAnalysis: analysis(),
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });
  assert.ok(Math.abs(geometry.leftEye[0] - 0.62) < 1e-10);
  assert.ok(Math.abs(geometry.rightEye[0] - 0.38) < 1e-10);
});

test('partially cropped faces keep bounded usable regions', () => {
  const geometry = createWarpGeometry({
    faceAnalysis: analysis(0.34),
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });
  assert.equal(geometry.anchored, true);
  WARP_REGIONS.forEach((name) => {
      assert.ok(geometry[name].every(Number.isFinite));
      assert.ok(geometry[name][0] >= -0.2 && geometry[name][0] <= 1.2);
      assert.ok(geometry[name][1] >= -0.2 && geometry[name][1] <= 1.2);
    });
});

test('directional controls are clamped and never inferred by the renderer', () => {
  const input = analysis();
  input.directions = {
    yaw: 4,
    roll: -3,
    pitch: Number.NaN,
    eyes: 2,
    cheeks: -2,
    mouth: 0.4,
    gazeX: 8,
    gazeY: -7
  };
  input.signals = { pose: 3, eyes: -2, mouth: 5, asymmetry: -1 };

  const geometry = createWarpGeometry({
    faceAnalysis: input,
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });

  assert.deepEqual(geometry.controls, {
    yaw: 1,
    roll: -1,
    pitch: 0,
    eyes: 1,
    cheeks: -1,
    mouth: 0.4,
    gazeX: 1,
    gazeY: -1,
    pose: 1,
    eyeIntensity: 0,
    mouthOpen: 1,
    asymmetry: 0
  });
});

test('missing or degenerate analysis uses the documented bounded fallback', () => {
  const expected = defaultWarpGeometry();
  const missing = createWarpGeometry({
    faceAnalysis: null,
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });
  const degenerate = createWarpGeometry({
    faceAnalysis: {
      faceBounds: { x: 0.5, y: 0.5, width: 0.001, height: 0.001 },
      anchors: {}
    },
    sourceWidth: 1200,
    sourceHeight: 1600,
    targetWidth: 480,
    targetHeight: 640
  });
  assert.deepEqual(missing, expected);
  assert.deepEqual(degenerate, expected);
});
