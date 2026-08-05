#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const jsonOutput = args.includes('--json');
const positional = args.filter((argument) => !argument.startsWith('--'));
const root = path.resolve(positional[0] || process.cwd());

const read = (file) => {
  const target = path.join(root, file);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
};

const checks = [];
const add = (id, passed, detail, required = true) => {
  checks.push({ id, passed: Boolean(passed), required, detail });
};

function parseResponsePack(file) {
  const source = read(file);
  if (!source) return { file, entries: [], error: 'missing' };
  try {
    const parsed = JSON.parse(source);
    const entries = Array.isArray(parsed) ? parsed : parsed?.responses;
    return Array.isArray(entries)
      ? { file, entries, error: null }
      : { file, entries: [], error: 'not an array or {responses: []}' };
  } catch (error) {
    return { file, entries: [], error: error.message };
  }
}

function validSeverity(value) {
  return Number.isInteger(value?.min)
    && Number.isInteger(value?.max)
    && value.min >= 0
    && value.max <= 100
    && value.min <= value.max;
}

function section(source, marker) {
  const startMarker = `/* === ${marker} === */`;
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const bodyStart = start + startMarker.length;
  const next = source.indexOf('\n/* === ', bodyStart);
  return source.slice(bodyStart, next < 0 ? source.length : next);
}

const packs = ['responses.json', 'responses-hard.json', 'responses-pernik.json']
  .map(parseResponsePack);
const malformedPacks = packs.filter((pack) => pack.error);
const entries = packs.flatMap((pack) => pack.entries.map((entry, index) => ({
  ...entry,
  __file: pack.file,
  __index: index
})));
add(
  'response-packs',
  entries.length > 0 && malformedPacks.length === 0,
  malformedPacks.length
    ? malformedPacks.map((pack) => `${pack.file}: ${pack.error}`).join('; ')
    : `${entries.length} responses parsed`
);

const supportedSignals = new Set([
  'pose',
  'eyes',
  'mouth',
  'asymmetry',
  'stability',
  'exposure',
  'sharpness'
]);
const missingMetadata = entries.filter((entry) => (
  !validSeverity(entry.severity)
  || typeof entry.effect !== 'string'
  || !entry.effect.trim()
  || !Array.isArray(entry.signals)
  || entry.signals.some((signal) => !supportedSignals.has(signal))
));
add(
  'response-metadata',
  entries.length > 0 && missingMetadata.length === 0,
  missingMetadata.length
    ? `${missingMetadata.length} responses missing valid severity/effect/signals metadata`
    : 'all responses have explicit supported metadata'
);

const duplicates = new Map();
entries.forEach((entry) => {
  const key = `${entry.category || ''}\n${entry.description || ''}`;
  const locations = duplicates.get(key) || [];
  locations.push(`${entry.__file}:${entry.__index + 1}`);
  duplicates.set(key, locations);
});
const duplicateGroups = [...duplicates.values()].filter((locations) => locations.length > 1);
add(
  'response-uniqueness',
  duplicateGroups.length === 0,
  duplicateGroups.length ? `${duplicateGroups.length} duplicate response texts` : 'response texts are unique',
  false
);

const app = read('app.js');
const scanner = read('scanner-runtime.js');
const metrics = read('devastation-metrics.js');
const geometry = read('face-warp-geometry.js');
const result = read('result-runtime.js');
const lifecycle = read('lifecycle-runtime.js');
const matcher = read('verdict-matcher.js');
const serviceWorker = read('service-worker.js');
const productionJs = [app, scanner, metrics, geometry, result, lifecycle, matcher, serviceWorker].join('\n');

add(
  'analysis-contract',
  /schemaVersion:\s*SCHEMA_VERSION/.test(metrics)
    && /normalizedLandmarks/.test(metrics)
    && /faceBounds/.test(metrics)
    && /anchors/.test(metrics)
    && /signals/.test(metrics)
    && /scores/.test(metrics)
    && /selection/.test(result),
  'serializable faceAnalysis flows through scan, selection and render'
);

const missingSignals = [...supportedSignals]
  .filter((signal) => !new RegExp(`\\b${signal}:`).test(metrics));
add(
  'visual-signals',
  missingSignals.length === 0,
  missingSignals.length
    ? `missing normalized signals: ${missingSignals.join(', ')}`
    : 'all 7 normalized visual signals are present'
);

add(
  'seventy-thirty',
  /signalScore\s*\*\s*0\.70[\s\S]{0,100}randomScore\s*\*\s*0\.30/.test(metrics)
    && /mix:\s*Object\.freeze\(\{\s*visual:\s*0\.70,\s*random:\s*0\.30\s*\}\)/.test(metrics),
  '70/30 score composition is explicit and stored'
);

add(
  'upload-face-detection',
  /async function analyzeStillImage\(/.test(scanner)
    && /faceMesh\.setOptions\(\{ maxNumFaces: 2 \}\)/.test(scanner)
    && /sendStillImage\(image\)/.test(scanner)
    && /NO_FACE/.test(scanner)
    && /MULTIPLE_FACES/.test(scanner)
    && /sourceKind:\s*'upload'/.test(scanner),
  'upload requires exactly one local Face Mesh subject'
);

add(
  'live-stability',
  /const motionSamples = \[\]/.test(scanner)
    && /function recordMotionSample\(/.test(scanner)
    && /function motionStabilitySnapshot\(/.test(scanner)
    && /stability:\s*motionStabilitySnapshot\(\)/.test(scanner),
  'live scan uses a bounded landmark motion history'
);

add(
  'landmark-warp-anchors',
  /ANCHOR_GROUPS/.test(metrics)
    && /const anchors = faceAnalysis\?\.anchors/.test(geometry)
    && /createCoverTransform/.test(geometry)
    && /geometryFor\([^)]*faceAnalysis/.test(result),
  'stored-image anchors use the same cover transform as pixels'
);

const faceWarp = section(result, 'face-warp.js');
const experience = section(result, 'experience-upgrades.js');
const diagnostics = section(result, 'diagnostic-upgrades.js');
const junkiePolish = section(lifecycle, 'junkie-polish-v55.js');
add(
  'single-deformation-owner',
  /async function renderFaceEffect\(/.test(faceWarp)
    && /async function destroyMore[\s\S]{0,1800}faceWarp\.renderFaceEffect\(/.test(experience)
    && /async function rerollDeformation[\s\S]{0,2200}faceWarp\.renderFaceEffect\(/.test(diagnostics)
    && /retiredBy:\s*'SmazkaFaceWarp'/.test(junkiePolish)
    && !/function computeSeverity\(/.test(result)
    && !/function (?:applyRowWarp|applyColumnWarp|animateExtraWarp|rebuildShareCard)\(/.test(experience)
    && !/function refreshWarp\(/.test(diagnostics),
  'SmazkaFaceWarp owns preview, final, extra damage, reroll and share photo'
);

add(
  'metadata-selection',
  /selectVerdictByMetadata/.test(result)
    && /severityDistance/.test(matcher)
    && /dominantSignals/.test(matcher)
    && !/findIndex[\s\S]{0,500}(?:length\s*-\s*1|position)/i.test(app)
    && !/getEffectProfile[\s\S]{0,1800}(?:RegExp|\.test\s*\(|includes\s*\()/i.test(app),
  'responses are selected by explicit severity/effect/signal metadata'
);

add(
  'local-only-static-check',
  !/(?:fetch|XMLHttpRequest)\s*\(\s*['"`]https?:/i.test(productionJs),
  'no obvious remote image or landmark processing request found'
);

const requiredFailures = checks.filter((check) => check.required && !check.passed);
const report = {
  root,
  passed: requiredFailures.length === 0,
  totals: {
    responses: entries.length,
    checks: checks.length,
    requiredFailures: requiredFailures.length
  },
  checks
};

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`FACE REACTOR audit: ${root}`);
  checks.forEach((check) => {
    const mark = check.passed ? 'PASS' : check.required ? 'FAIL' : 'WARN';
    console.log(`${mark.padEnd(4)} ${check.id}: ${check.detail}`);
  });
  console.log(requiredFailures.length
    ? `\n${requiredFailures.length} required check(s) failed.`
    : '\nAll required checks passed.');
}

if (strict && requiredFailures.length) process.exitCode = 1;
