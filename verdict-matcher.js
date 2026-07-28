const NUMERIC_TRIGGERS = Object.freeze({
  lidskost_min: ['lidskost', (value, limit) => value >= limit],
  lidskost_max: ['lidskost', (value, limit) => value <= limit],
  apertura_min: ['apertura', (value, limit) => value >= limit],
  apertura_max: ['apertura', (value, limit) => value <= limit],
  tilt_min: ['gravitace', (value, limit) => value >= limit],
  tilt_max: ['gravitace', (value, limit) => value <= limit]
});

export const SUPPORTED_SIGNALS = Object.freeze([
  'pose',
  'eyes',
  'mouth',
  'asymmetry',
  'stability',
  'exposure',
  'sharpness'
]);

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedAsymmetry(value) {
  return typeof value === 'string'
    ? value.trim().toLocaleLowerCase('cs-CZ')
    : '';
}

function triggerMatches(metrics, key, expected) {
  if (key === 'asymetrie') {
    const actual = normalizedAsymmetry(metrics?.asymetrie);
    const wanted = normalizedAsymmetry(expected);
    return ['nízká', 'střední', 'vysoká'].includes(wanted) && actual === wanted;
  }

  const definition = NUMERIC_TRIGGERS[key];
  if (!definition) return false;

  const [metricKey, compare] = definition;
  const value = finiteNumber(metrics?.[metricKey]);
  const limit = finiteNumber(expected);
  return value !== null && limit !== null && compare(value, limit);
}

export function scoreVerdict(metrics, verdict) {
  const triggers = verdict?.triggers;
  if (!triggers || typeof triggers !== 'object' || Array.isArray(triggers)) return 0;

  return Object.entries(triggers).reduce(
    (score, [key, expected]) => score + Number(triggerMatches(metrics, key, expected)),
    0
  );
}

export function hasValidResponseMetadata(verdict) {
  const minimum = finiteNumber(verdict?.severity?.min);
  const maximum = finiteNumber(verdict?.severity?.max);
  return minimum !== null
    && maximum !== null
    && minimum >= 0
    && maximum <= 100
    && minimum <= maximum
    && typeof verdict?.effect === 'string'
    && verdict.effect.trim().length > 0
    && Array.isArray(verdict?.signals)
    && verdict.signals.every((signal) => SUPPORTED_SIGNALS.includes(signal));
}

function severityDistance(severity, verdict) {
  const minimum = Number(verdict.severity.min);
  const maximum = Number(verdict.severity.max);
  if (severity < minimum) return minimum - severity;
  if (severity > maximum) return severity - maximum;
  return 0;
}

function dominantSignals(signals, limit = 3) {
  return SUPPORTED_SIGNALS
    .map((key) => ({ key, value: finiteNumber(signals?.[key]) }))
    .filter((entry) => entry.value !== null)
    .map((entry) => ({ ...entry, value: clamp(entry.value, 0, 1) }))
    .sort((first, second) => second.value - first.value)
    .slice(0, limit)
    .map((entry) => entry.key);
}

/**
 * Vybere verdikt podle explicitních metadat.
 *
 * 1. Nejdřív se použije rozsah severity (nebo nejbližší rozsah).
 * 2. Kandidáti se seřadí podle průniku s dominantními vizuálními signály.
 * 3. Stávající biometrické triggery slouží pouze jako pomocné tie-breakery.
 * 4. Poslední kategorie dostanou malou penalizaci a z nejlepších se losuje.
 *
 * Funkce nemění žádný vstup. `recentCategories` je předáváno explicitně,
 * takže historie výběru nezavádí skrytý globální stav.
 */
export function selectVerdictByMetadata({
  severity,
  signals,
  metrics,
  responses,
  recentCategories = [],
  random = Math.random
} = {}) {
  if (!Array.isArray(responses) || responses.length === 0) return null;

  const valid = responses.filter(hasValidResponseMetadata);
  if (valid.length === 0) return randomItem(responses.filter(Boolean), random);

  const targetSeverity = clamp(finiteNumber(severity) ?? 50, 0, 100);
  const distances = valid.map((verdict) => ({
    verdict,
    distance: severityDistance(targetSeverity, verdict)
  }));
  const nearestDistance = distances.reduce(
    (nearest, entry) => Math.min(nearest, entry.distance),
    Number.POSITIVE_INFINITY
  );
  const severityCandidates = distances
    .filter((entry) => entry.distance === nearestDistance)
    .map((entry) => entry.verdict);

  const dominant = dominantSignals(signals);
  const dominantSet = new Set(dominant);
  const recent = new Set(recentCategories.filter((category) => typeof category === 'string'));
  const ranked = severityCandidates.map((verdict) => {
    const signalMatches = verdict.signals.reduce(
      (score, signal) => score + Number(dominantSet.has(signal)),
      0
    );
    const triggerScore = scoreVerdict(metrics, verdict);
    const recencyPenalty = recent.has(verdict.category) ? 0.25 : 0;
    return {
      verdict,
      score: signalMatches * 4 + triggerScore * 0.35 - recencyPenalty
    };
  });
  const highestScore = ranked.reduce(
    (highest, candidate) => Math.max(highest, candidate.score),
    Number.NEGATIVE_INFINITY
  );
  const bestMatches = ranked
    .filter((candidate) => Math.abs(candidate.score - highestScore) < 0.000001)
    .map((candidate) => candidate.verdict);

  return randomItem(bestMatches, random);
}

function randomItem(items, random) {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const sample = Number(random());
  const safeSample = Number.isFinite(sample)
    ? Math.max(0, Math.min(0.9999999999999999, sample))
    : 0;

  return items[Math.floor(safeSample * items.length)];
}

/**
 * Vybere verdikt podle počtu splněných triggerů.
 *
 * Třetí parametr je volitelný generátor čísla 0–1. Umožňuje deterministické
 * testy, aniž by funkce měnila vstupní metriky nebo pole verdiktů.
 */
export function matchVerdict(metrics, responses, random = Math.random) {
  if (!Array.isArray(responses) || responses.length === 0) return null;

  const candidates = responses.filter(Boolean);
  if (candidates.length === 0) return null;

  const scored = candidates.map((verdict) => ({
    verdict,
    score: scoreVerdict(metrics, verdict)
  }));
  const highestScore = scored.reduce(
    (highest, candidate) => Math.max(highest, candidate.score),
    0
  );

  if (highestScore === 0) return randomItem(candidates, random);

  const bestMatches = scored
    .filter((candidate) => candidate.score === highestScore)
    .map((candidate) => candidate.verdict);

  return randomItem(bestMatches, random);
}

export default matchVerdict;
