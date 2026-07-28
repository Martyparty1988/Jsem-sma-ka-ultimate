import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  SUPPORTED_SIGNALS,
  hasValidResponseMetadata,
  matchVerdict,
  selectVerdictByMetadata
} from '../verdict-matcher.js';

const EFFECT_KEYS = new Set([
  'soft-drift',
  'late-night',
  'micro-asymmetry',
  'facial-drift',
  'cheek-pressure',
  'jaw-offset',
  'lens-bloom',
  'signal-glitch',
  'kebab-lens',
  'gravity-drop',
  'soft-collapse',
  'wide-lens',
  'asymmetric-drag',
  'gravity-loss',
  'eye-sink',
  'liquid-gravity',
  'cranial-bloom',
  'deep-collapse',
  'total-drift'
]);

function loadPack(file) {
  return JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
}

test('all active response packs have explicit, supported metadata', () => {
  const packs = [
    loadPack('responses.json'),
    loadPack('responses-hard.json'),
    loadPack('responses-pernik.json')
  ];
  const responses = packs.flat();

  assert.equal(packs[0].length, 48);
  assert.equal(packs[1].length, 48);
  assert.equal(packs[2].length, 49);
  assert.equal(responses.length, 145);
  assert.equal(new Set(responses.map((item) => item.id)).size, responses.length);

  responses.forEach((response) => {
    assert.equal(hasValidResponseMetadata(response), true, response.id);
    assert.equal(EFFECT_KEYS.has(response.effect), true, response.effect);
    response.signals.forEach((signal) => {
      assert.equal(SUPPORTED_SIGNALS.includes(signal), true, `${response.id}: ${signal}`);
    });
  });
});

test('severity coverage has no blind zones between 12 and 98', () => {
  const responses = [
    ...loadPack('responses.json'),
    ...loadPack('responses-hard.json'),
    ...loadPack('responses-pernik.json')
  ];

  for (let severity = 12; severity <= 98; severity += 1) {
    assert.equal(
      responses.some((response) => (
        severity >= response.severity.min && severity <= response.severity.max
      )),
      true,
      `severity ${severity}`
    );
  }
});

test('metadata selector prefers the best dominant-signal match', () => {
  const candidates = [
    {
      id: 'eyes',
      category: 'Oči',
      severity: { min: 40, max: 60 },
      effect: 'eye-sink',
      signals: ['eyes']
    },
    {
      id: 'pose',
      category: 'Náklon',
      severity: { min: 40, max: 60 },
      effect: 'gravity-drop',
      signals: ['pose']
    }
  ];

  const selected = selectVerdictByMetadata({
    severity: 50,
    signals: { eyes: 0.92, pose: 0.12 },
    responses: candidates,
    random: () => 0
  });

  assert.equal(selected.id, 'eyes');
});

test('metadata selector uses the nearest severity range when no range contains target', () => {
  const candidates = [
    {
      id: 'low',
      category: 'Nízký',
      severity: { min: 10, max: 20 },
      effect: 'soft-drift',
      signals: []
    },
    {
      id: 'high',
      category: 'Vysoký',
      severity: { min: 70, max: 90 },
      effect: 'deep-collapse',
      signals: []
    }
  ];

  const selected = selectVerdictByMetadata({
    severity: 62,
    responses: candidates,
    random: () => 0
  });

  assert.equal(selected.id, 'high');
});

test('recent category receives a small deterministic penalty', () => {
  const candidates = [
    {
      id: 'recent',
      category: 'Poslední',
      severity: { min: 40, max: 60 },
      effect: 'facial-drift',
      signals: ['pose']
    },
    {
      id: 'fresh',
      category: 'Nový',
      severity: { min: 40, max: 60 },
      effect: 'facial-drift',
      signals: ['pose']
    }
  ];

  const selected = selectVerdictByMetadata({
    severity: 50,
    signals: { pose: 1 },
    responses: candidates,
    recentCategories: ['Poslední'],
    random: () => 0
  });

  assert.equal(selected.id, 'fresh');
});

test('legacy trigger matcher remains pure and backward compatible', () => {
  const metrics = Object.freeze({
    apertura: 20,
    lidskost: 25,
    gravitace: 14,
    asymetrie: 'vysoká',
    hydratace: 18
  });
  const responses = Object.freeze([
    Object.freeze({
      id: 'match',
      triggers: Object.freeze({
        lidskost_max: 30,
        apertura_max: 25,
        tilt_min: 12,
        asymetrie: 'vysoká'
      })
    }),
    Object.freeze({
      id: 'miss',
      triggers: Object.freeze({ lidskost_min: 70 })
    })
  ]);

  assert.equal(matchVerdict(metrics, responses, () => 0).id, 'match');
  assert.deepEqual(metrics, {
    apertura: 20,
    lidskost: 25,
    gravitace: 14,
    asymetrie: 'vysoká',
    hydratace: 18
  });
});
