import assert from 'node:assert/strict';
import test from 'node:test';

import { readBundleSection, readRoot } from './bundle-source.mjs';

test('faceAnalysis v3 exposes bounded intensity and signed directional contracts', () => {
  const metrics = readRoot('devastation-metrics.js');

  assert.match(metrics, /const SCHEMA_VERSION = 3/);
  ['pose', 'eyes', 'mouth', 'asymmetry', 'stability', 'exposure', 'sharpness']
    .forEach((signal) => assert.match(metrics, new RegExp(`\\b${signal}:`), signal));
  assert.match(metrics, /signalAvailability/);
  assert.match(metrics, /directions: measurement\.directions/);
  ['yaw', 'roll', 'pitch', 'eyes', 'cheeks', 'mouth']
    .forEach((direction) => assert.match(metrics, new RegExp(`\\b${direction}:`), direction));
  assert.match(metrics, /sourceKind === 'upload'/);
  assert.match(metrics, /signalScore \* 0\.70 \+ randomScore \* 0\.30/);
  assert.match(metrics, /mix: Object\.freeze\(\{ visual: 0\.70, random: 0\.30 \}\)/);
});

test('Face Warp v2 owns five explicit modes, expanded anchors, face masking and organic reveal', () => {
  const metrics = readRoot('devastation-metrics.js');
  const geometry = readRoot('face-warp-geometry.js');
  const faceWarp = readBundleSection('face-warp.js');
  const modes = ['melt', 'bloom', 'collapse', 'shear', 'lens'];
  const profiles = [...faceWarp.matchAll(/\bkey: '([^']+)'/g)].map((match) => match[1]);
  const mappedProfiles = new Map(
    [...faceWarp.matchAll(/^\s+'([^']+)': '(melt|bloom|collapse|shear|lens)',?$/gm)]
      .map((match) => [match[1], match[2]])
  );

  assert.equal(profiles.length, 19);
  assert.deepEqual(new Set(mappedProfiles.keys()), new Set(profiles));
  assert.deepEqual(new Set(mappedProfiles.values()), new Set(modes));
  modes.forEach((mode) => {
    assert.match(faceWarp, new RegExp(`case '${mode}'|${mode.toUpperCase()}:`), mode);
  });
  assert.match(faceWarp, /if \(u_mode < 0\.5\)/);
  assert.match(faceWarp, /else if \(u_mode < 3\.5\)/);
  assert.doesNotMatch(faceWarp, /modeWeight\(/);

  ['noseTip', 'mouthLeft', 'mouthRight', 'upperLip', 'lowerLip', 'leftTemple', 'rightTemple', 'leftBrow', 'rightBrow']
    .forEach((anchor) => {
      assert.match(metrics, new RegExp(`\\b${anchor}:`), anchor);
      assert.match(geometry, new RegExp(`\\b${anchor}`), anchor);
    });
  assert.match(faceWarp, /uniform vec4 u_mask/);
  assert.match(faceWarp, /float softEllipseMask\(/);
  assert.match(faceWarp, /mix\(originalColor, warpedColor/);
  assert.match(faceWarp, /function applySoftFaceMask\(/);
  assert.match(faceWarp, /function applySoftRegionMask\(/);
  assert.match(faceWarp, /function applyFeatheredEllipseMask\(/);
  assert.match(faceWarp, /globalCompositeOperation = 'destination-in'/);
  assert.match(faceWarp, /\{ solidUntil = 0\.72, fadeFrom = 0\.82, fadeTo = 1\.06 \}/);
  assert.match(faceWarp, /function organicRevealProgress\(/);
  assert.match(faceWarp, /return \(1 - Math\.pow\(1 - local, 3\)\) \* 1\.08/);
  assert.match(faceWarp, /return 1\.08 \+ \(0\.96 - 1\.08\)/);
  assert.match(faceWarp, /if \(reducedMotion\(\)\) \{\s*render\(1\)/);
  assert.match(faceWarp, /canvas\.dataset\.warpMode = profile\.mode/);
  assert.match(faceWarp, /mode: profile\.mode/);
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
