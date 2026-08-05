import assert from 'node:assert/strict';
import test from 'node:test';

import { readBundleSection, readRoot } from './bundle-source.mjs';

test('faceAnalysis v2 exposes every bounded visual signal and explicit availability', () => {
  const metrics = readRoot('devastation-metrics.js');

  assert.match(metrics, /const SCHEMA_VERSION = 2/);
  ['pose', 'eyes', 'mouth', 'asymmetry', 'stability', 'exposure', 'sharpness']
    .forEach((signal) => assert.match(metrics, new RegExp(`\\b${signal}:`), signal));
  assert.match(metrics, /signalAvailability/);
  assert.match(metrics, /sourceKind === 'upload'/);
  assert.match(metrics, /signalScore \* 0\.70 \+ randomScore \* 0\.30/);
  assert.match(metrics, /mix: Object\.freeze\(\{ visual: 0\.70, random: 0\.30 \}\)/);
});

test('live scan records bounded motion while uploads require exactly one face', () => {
  const scanner = readBundleSection('face-scan.js');

  assert.match(scanner, /const MOTION_SAMPLE_LIMIT = 18/);
  assert.match(scanner, /const motionSamples = \[\]/);
  assert.match(scanner, /function recordMotionSample\(/);
  assert.match(scanner, /function motionStabilitySnapshot\(/);
  assert.match(scanner, /stability: motionStabilitySnapshot\(\)/);
  assert.match(scanner, /async function analyzeStillImage\(/);
  assert.match(scanner, /faceMesh\.setOptions\(\{ maxNumFaces: 2 \}\)/);
  assert.match(scanner, /'NO_FACE'/);
  assert.match(scanner, /'MULTIPLE_FACES'/);
  assert.match(scanner, /sourceKind: 'upload'/);
  assert.match(scanner, /mirrorX: false/);
});

test('one renderer owns normal, extra-damage, reroll and share-photo output', () => {
  const result = readRoot('result-runtime.js');
  const faceWarp = readBundleSection('face-warp.js');
  const experience = readBundleSection('experience-upgrades.js');
  const diagnostics = readBundleSection('diagnostic-upgrades.js');
  const polish = readBundleSection('junkie-polish-v55.js');

  assert.match(faceWarp, /async function renderFaceEffect\(/);
  assert.match(experience, /async function destroyMore[\s\S]{0,1800}faceWarp\.renderFaceEffect\(/);
  assert.match(diagnostics, /async function rerollDeformation[\s\S]{0,2200}faceWarp\.renderFaceEffect\(/);
  assert.match(polish, /retiredBy: 'SmazkaFaceWarp'/);
  assert.doesNotMatch(result, /function computeSeverity\(/);
  assert.doesNotMatch(experience, /function (?:applyRowWarp|applyColumnWarp|animateExtraWarp|rebuildShareCard)\(/);
  assert.doesNotMatch(diagnostics, /function refreshWarp\(/);
});
