import assert from 'node:assert/strict';
import test from 'node:test';

import { readBundleSection, readRoot } from './bundle-source.mjs';

test('faceAnalysis v4 exposes bounded intensity, iris gaze and signed directional contracts', () => {
  const metrics = readRoot('devastation-metrics.js');

  assert.match(metrics, /const SCHEMA_VERSION = 4/);
  ['pose', 'eyes', 'mouth', 'asymmetry', 'stability', 'exposure', 'sharpness']
    .forEach((signal) => assert.match(metrics, new RegExp(`\\b${signal}:`), signal));
  assert.match(metrics, /signalAvailability/);
  assert.match(metrics, /directions: measurement\.directions/);
  ['yaw', 'roll', 'pitch', 'eyes', 'cheeks', 'mouth', 'gazeX', 'gazeY']
    .forEach((direction) => assert.match(metrics, new RegExp(`\\b${direction}:`), direction));
  assert.match(metrics, /function gazeSignals\(/);
  assert.match(metrics, /points\.length < 478/);
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

test('Face Warp v108 keeps deliberately stronger power identical across GPU and canvas paths', () => {
  const faceWarp = readBundleSection('face-warp.js');
  const experience = readBundleSection('experience-upgrades.js');

  assert.match(faceWarp, /const WARP_POWER = Object\.freeze\(\{\s*base: 0\.18,\s*severity: 1\.22,\s*curve: 0\.72,\s*maximum: 1\.92/);
  ['melt: 1.16', 'bloom: 1.12', 'collapse: 1.2', 'shear: 1.22', 'lens: 1.16']
    .forEach((power) => assert.match(faceWarp, new RegExp(power.replace('.', '\\.')), power));
  assert.match(faceWarp, /float severityCurve = pow\(clamp\(u_severity, 0\.0, 1\.0\)/);
  assert.match(faceWarp, /uniform float u_modePower/);
  assert.match(faceWarp, /const strength = warpPowerFor\(severity, progress, profile\.mode\)/);
  assert.match(experience, /extraDamage >= EXTRA_DAMAGE_LIMIT\s*\? 100/);
  assert.match(experience, /const EXTRA_DAMAGE_STEP = 12/);
});

test('Face Warp v113 uses measured feature intensity and iris direction in GPU and canvas paths', () => {
  const metrics = readRoot('devastation-metrics.js');
  const geometry = readRoot('face-warp-geometry.js');
  const faceWarp = readBundleSection('face-warp.js');

  assert.match(metrics, /gazeAvailable: gaze\.available/);
  ['gazeX', 'gazeY', 'pose', 'eyeIntensity', 'mouthOpen', 'asymmetry']
    .forEach((control) => assert.match(geometry, new RegExp(`\\b${control}:`), control));
  assert.match(faceWarp, /const BIOMETRIC_POWER = Object\.freeze\(\{\s*pose: 0\.075,\s*eyes: 0\.09,\s*mouth: 0\.105,\s*asymmetry: 0\.085,\s*gaze: 0\.055/);
  assert.match(faceWarp, /uniform vec4 u_biometric/);
  assert.match(faceWarp, /uniform vec2 u_gaze/);
  assert.match(faceWarp, /gl\.uniform4fv\(gl\.getUniformLocation\(program, 'u_biometric'\)/);
  assert.match(faceWarp, /gl\.uniform2fv\(gl\.getUniformLocation\(program, 'u_gaze'\)/);
  assert.match(faceWarp, /const poseDrive = clamp\(controls\.pose/);
  assert.match(faceWarp, /const eyeDrive = clamp\(controls\.eyeIntensity/);
  assert.match(faceWarp, /const mouthDrive = clamp\(controls\.mouthOpen/);
  assert.match(faceWarp, /minimum: 0\.46,\s*maximumX: 1\.82,\s*maximumY: 1\.92/);
  ['MELT', 'BLOOM', 'COLLAPSE', 'SHEAR', 'LENS']
    .forEach((mode) => assert.match(faceWarp, new RegExp(`${mode}:[\\s\\S]{0,6500}BIOMETRIC_POWER|${mode}:[\\s\\S]{0,6500}u_biometric`), mode));
});

test('Face Warp v109 never reuses a failed WebGL canvas for the 2D fallback', () => {
  const faceWarp = readBundleSection('face-warp.js');

  assert.match(faceWarp, /function createFallbackCanvas\(webglCanvas\)/);
  assert.match(faceWarp, /\[\.\.\.webglCanvas\.attributes\]/);
  assert.match(faceWarp, /if \(webglCanvas\.isConnected\) webglCanvas\.replaceWith\(fallbackCanvas\)/);
  assert.equal(
    (faceWarp.match(/canvas = createFallbackCanvas\(canvas\)/g) || []).length,
    2,
    'animated and exported renders must both switch to a fresh 2D canvas'
  );
});

test('Face Warp v110 gives GPU collapse enough negative radial gain to remain visible', () => {
  const faceWarp = readBundleSection('face-warp.js');

  assert.match(faceWarp, /const GPU_COLLAPSE_GAIN = 2\.6/);
  assert.match(faceWarp, /float signedGain = amount < 0\.0 \? \$\{GPU_COLLAPSE_GAIN\.toFixed\(2\)\} : 1\.0/);
  assert.match(faceWarp, /amount \* signedGain \* falloff/);
  assert.match(faceWarp, /u_jaw\.xy,[\s\S]{0,100}u_jaw\.zw,[\s\S]{0,160}strength \* jawStage/);
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
