import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFaceAnalysis,
  calculateDevastationMetrics,
  normalizeLandmarks
} from '../devastation-metrics.js';

function fixture() {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  Object.assign(points[10], { x: 0.5, y: 0.18 });
  Object.assign(points[152], { x: 0.5, y: 0.84 });

  Object.assign(points[33], { x: 0.34, y: 0.39 });
  Object.assign(points[133], { x: 0.45, y: 0.39 });
  Object.assign(points[159], { x: 0.395, y: 0.375 });
  Object.assign(points[145], { x: 0.395, y: 0.405 });

  Object.assign(points[263], { x: 0.66, y: 0.39 });
  Object.assign(points[362], { x: 0.55, y: 0.39 });
  Object.assign(points[386], { x: 0.605, y: 0.375 });
  Object.assign(points[374], { x: 0.605, y: 0.405 });

  Object.assign(points[61], { x: 0.39, y: 0.64 });
  Object.assign(points[291], { x: 0.61, y: 0.64 });
  return points;
}

function rotate(points, degrees) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return points.map((point) => {
    const x = point.x - 0.5;
    const y = point.y - 0.5;
    return {
      ...point,
      x: 0.5 + x * cosine - y * sine,
      y: 0.5 + x * sine + y * cosine
    };
  });
}

function metrics(points, options = {}) {
  return calculateDevastationMetrics(normalizeLandmarks(points, options), {
    sourceWidth: 1000,
    sourceHeight: 1000,
    hydratace: 22
  }).metrics;
}

test('neutral fixture produces open eyes, low tilt and low asymmetry', () => {
  const result = metrics(fixture());
  assert.equal(result.apertura, 72);
  assert.equal(result.gravitace, 0);
  assert.equal(result.asymetrie, 'nízká');
  assert.equal(result.hydratace, 22);
  assert.ok(result.lidskost >= 70);
});

test('head roll is measured without being mistaken for mouth asymmetry', () => {
  const result = metrics(rotate(fixture(), 18));
  assert.ok(result.gravitace >= 17.5 && result.gravitace <= 18.5);
  assert.equal(result.asymetrie, 'nízká');
});

test('mouth-corner displacement reaches the high asymmetry band', () => {
  const points = fixture();
  points[291] = { ...points[291], y: points[291].y + 0.06 };
  assert.equal(metrics(points).asymetrie, 'vysoká');
});

test('front-camera mirroring flips stored x once and preserves absolute metrics', () => {
  const points = fixture();
  const original = normalizeLandmarks(points);
  const mirrored = normalizeLandmarks(points, { mirrorX: true });
  assert.equal(mirrored[10].x, 1 - original[10].x);
  assert.deepEqual(metrics(points), metrics(points, { mirrorX: true }));
});

test('visual signals increase with effect intensity, not image quality', () => {
  const neutral = calculateDevastationMetrics(normalizeLandmarks(fixture()), {
    sourceWidth: 1000,
    sourceHeight: 1000,
    hydratace: 38
  });
  const closedPoints = fixture();
  closedPoints[159].y = 0.389;
  closedPoints[145].y = 0.391;
  closedPoints[386].y = 0.389;
  closedPoints[374].y = 0.391;
  const closed = calculateDevastationMetrics(normalizeLandmarks(closedPoints), {
    sourceWidth: 1000,
    sourceHeight: 1000,
    hydratace: 5
  });

  assert.equal(neutral.signals.eyes, 0);
  assert.ok(closed.signals.eyes > 0.9);
  assert.equal(neutral.signals.exposure, 0);
  assert.ok(closed.signals.exposure > 0.8);
});

test('faceAnalysis stores the shared contract and explicit 70/30 severity', () => {
  const analysis = buildFaceAnalysis({
    landmarks: fixture(),
    sourceWidth: 1000,
    sourceHeight: 1000,
    exposure: {
      available: true,
      meanLuma: 128,
      contrast: 40,
      clippedRatio: 0.02,
      hydratace: 22
    },
    sharpness: {
      available: true,
      laplacianVariance: 210,
      intensity: 0.28
    },
    stability: {
      available: true,
      value: 0.16,
      sampleCount: 12,
      robustDelta: 0.023
    },
    random: () => 0.5,
    timestamp: '2026-07-28T12:00:00.000Z'
  });

  assert.equal(analysis.schemaVersion, 2);
  assert.equal(analysis.normalizedLandmarks.length, 478);
  assert.equal(analysis.scores.randomScore, 55);
  assert.equal(
    analysis.scores.severity,
    Math.max(12, Math.min(98, Math.round(analysis.scores.signalScore * 0.70 + 55 * 0.30)))
  );
  assert.deepEqual(analysis.scores.mix, { visual: 0.70, random: 0.30 });
  ['pose', 'eyes', 'mouth', 'asymmetry', 'stability', 'exposure', 'sharpness']
    .forEach((signal) => {
      assert.equal(typeof analysis.signals[signal], 'number', signal);
      assert.ok(analysis.signals[signal] >= 0 && analysis.signals[signal] <= 1, signal);
      assert.equal(analysis.signalAvailability[signal], true, signal);
    });
  assert.equal(analysis.metrics.asymetrie, 'nízká');
  assert.ok(analysis.anchors.leftEye);
  assert.ok(analysis.faceBounds);
});

test('uploaded still marks motion stability unavailable instead of fabricating history', () => {
  const analysis = buildFaceAnalysis({
    landmarks: fixture(),
    sourceKind: 'upload',
    sourceWidth: 1000,
    sourceHeight: 1000,
    exposure: { available: true, hydratace: 24, intensity: 0.3 },
    sharpness: { available: true, laplacianVariance: 300, intensity: 0.2 },
    stability: { available: true, value: 0.95, sampleCount: 18 },
    random: () => 0.5
  });

  assert.equal(analysis.sourceKind, 'upload');
  assert.equal(analysis.signals.stability, null);
  assert.equal(analysis.signalAvailability.stability, false);
  assert.equal(analysis.raw.stability.available, false);
  assert.equal(analysis.raw.stability.value, null);
  assert.equal(Object.hasOwn(analysis.scores.contributions, 'stability'), false);
});

test('incomplete Face Mesh data is rejected', () => {
  assert.throws(
    () => normalizeLandmarks(Array.from({ length: 100 }, () => ({ x: 0, y: 0 }))),
    /alespoň 468/
  );
});
